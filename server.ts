import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { initGemini, analyzeProblem, getLastAiStatus } from './server/gemini.ts';
import { startProcessGeneration, getJob, upgradeProcess } from './server/processGenerator.ts';
import { storage, isFirestoreConnected, getStorageStatus, checkFirestoreAccess } from './server/storage.ts';
import { Student, Attempt, AnswerEvent, PolyaProcess } from './src/shared/types.ts';

dotenv.config();

// Global resilience handlers as specified in Section 13
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception trapped:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled Rejection trapped:', reason);
});

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || 'thongtran@1234';

// Teacher auth rate limiting
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const validTeacherTokens = new Map<string, number>(); // token -> expiresAt

// Increase body limit for image & PDF uploads (15MB)
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Initialize Gemini SDK
initGemini();

// --- PUBLIC APIS ---

// 1. Analyze problem
app.post('/api/analyze', async (req, res) => {
  try {
    const { text, imageBase64, mimeType } = req.body;
    let imageBuffer: Buffer | undefined;

    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
      imageBuffer = Buffer.from(cleanBase64, 'base64');
    }

    if (!text && !imageBuffer) {
      res.status(400).json({ ok: false, error: { code: 'EMPTY_INPUT', message: 'Vui lòng nhập văn bản đề bài hoặc tải ảnh lên.' } });
      return;
    }

    const result = await analyzeProblem(text || '', imageBuffer, mimeType || 'image/jpeg');
    res.json(result);
  } catch (err: any) {
    console.error('API /api/analyze error:', err);
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err?.message || 'Lỗi xử lý đề bài.' } });
  }
});

// 2. Process Generation Job
app.post('/api/process', async (req, res) => {
  try {
    const { analysis, problemImageUrl } = req.body;
    if (!analysis || !analysis.problemText) {
      res.status(400).json({ ok: false, error: { code: 'INVALID_ANALYSIS', message: 'Thiếu thông tin phân tích đề bài.' } });
      return;
    }

    const result = await startProcessGeneration(analysis, problemImageUrl);
    res.json({ ok: true, data: result });
  } catch (err: any) {
    console.error('API /api/process error:', err);
    res.status(500).json({ ok: false, error: { code: 'PROCESS_ERROR', message: err?.message || 'Lỗi tạo quy trình.' } });
  }
});

// 3. Polling generation job
app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy tiến trình.' } });
    return;
  }
  res.json({ ok: true, data: job });
});

// 4. Get process by ID
app.get('/api/processes/:id', async (req, res) => {
  try {
    const found = await storage.getProcessById(req.params.id);
    if (!found) {
      res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy quy trình.' } });
      return;
    }
    // Quy trình tạo bằng khuôn cũ → tự dựng lại bằng khuôn mới (Bài 22 v3)
    const proc = await upgradeProcess(found);
    res.json({ ok: true, data: proc });
  } catch (err: any) {
    console.error('API /api/processes/:id error:', err);
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err?.message || 'Lỗi máy chủ khi tải quy trình.' } });
  }
});

// 5. List library processes
app.get('/api/processes', async (req, res) => {
  try {
    const list = await storage.listProcesses();
    const upgraded = await Promise.all(list.map((p) => upgradeProcess(p)));
    res.json({ ok: true, data: upgraded });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// 6. Student registration / identification
app.post('/api/students', async (req, res) => {
  try {
    const { name, className, school } = req.body;
    if (!name || !className || !school) {
      res.status(400).json({ ok: false, error: { code: 'MISSING_FIELDS', message: 'Vui lòng điền đủ Họ tên, Lớp và Trường.' } });
      return;
    }

    const normalized = `${name.trim().toLowerCase()}_${className.trim().toLowerCase()}_${school.trim().toLowerCase()}`;
    const studentId = 'stu_' + crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);

    // Không để học sinh chờ Firestore: tra cứu tối đa 4 giây, lưu chạy nền (có hàng đợi tự ghi lại)
    let student = await Promise.race([
      storage.getStudent(studentId).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), 4000)),
    ]);
    if (!student) {
      student = {
        id: studentId,
        name: name.trim(),
        className: className.trim(),
        school: school.trim(),
        createdAt: new Date().toISOString(),
      };
      storage.saveStudent(student).catch((e) => console.warn('[API] Lưu học sinh lỗi (sẽ thử lại):', e));
    }

    res.json({ ok: true, data: student });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// 7. Attempts APIs
app.post('/api/attempts', async (req, res) => {
  try {
    const attemptData: Attempt = req.body;
    if (!attemptData.id || !attemptData.studentId || !attemptData.processId) {
      res.status(400).json({ ok: false, error: { code: 'INVALID_ATTEMPT', message: 'Dữ liệu lượt làm bài không hợp lệ.' } });
      return;
    }
    await storage.saveAttempt(attemptData);
    res.json({ ok: true, data: attemptData });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.get('/api/attempts/:id', async (req, res) => {
  try {
    const attempt = await storage.getAttempt(req.params.id);
    if (!attempt) {
      res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy lượt làm bài.' } });
      return;
    }
    res.json({ ok: true, data: attempt });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.get('/api/attempts/student/:studentId', async (req, res) => {
  try {
    const all = await storage.listAttempts();
    const studentAttempts = all.filter((a) => a.studentId === req.params.studentId);
    res.json({ ok: true, data: studentAttempts });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// 8. Log answer events
app.post('/api/answer-events', async (req, res) => {
  try {
    const event: AnswerEvent = req.body;
    if (!event.id || !event.attemptId) {
      res.status(400).json({ ok: false, error: { code: 'INVALID_EVENT', message: 'Thiếu thông tin sự kiện trả lời.' } });
      return;
    }
    await storage.saveAnswerEvent(event);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// 9. Health & System Status (Zero AI call consumption on open)
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    data: {
      status: 'healthy',
      firestoreConnected: isFirestoreConnected(),
      storage: getStorageStatus(),
      primaryModel: process.env.MODEL_PRIMARY || 'gemini-2.5-flash',
      fallbackModel: process.env.MODEL_FALLBACK || 'gemini-2.5-flash',
      geminiKeySet: !!process.env.GEMINI_API_KEY,
      lastAi: getLastAiStatus(),
      timestamp: new Date().toISOString(),
    },
  });
});

// --- TEACHER PORTAL APIS (/api/teacher/*) ---

// Login endpoint with rate limit (5 attempts lock for 5 minutes)
app.post('/api/teacher/login', (req, res) => {
  const { password } = req.body;
  const clientIp = req.ip || 'local';
  const now = Date.now();

  const record = loginAttempts.get(clientIp) || { count: 0, lockedUntil: 0 };
  if (now < record.lockedUntil) {
    const waitMins = Math.ceil((record.lockedUntil - now) / 60000);
    res.status(429).json({
      ok: false,
      error: { code: 'LOCKED', message: `Bạn đã nhập sai 5 lần. Vui lòng thử lại sau ${waitMins} phút.` },
    });
    return;
  }

  if (password === TEACHER_PASSWORD) {
    loginAttempts.delete(clientIp);
    const token = 'tch_' + crypto.randomUUID();
    const expiresAt = now + 8 * 60 * 60 * 1000; // 8 hours
    validTeacherTokens.set(token, expiresAt);
    res.json({ ok: true, data: { token, expiresAt } });
  } else {
    record.count++;
    if (record.count >= 5) {
      record.lockedUntil = now + 5 * 60 * 1000; // Lock 5 mins
      record.count = 0;
    }
    loginAttempts.set(clientIp, record);
    res.status(401).json({
      ok: false,
      error: { code: 'INVALID_PASSWORD', message: 'Mật khẩu giáo viên không chính xác.' },
    });
  }
});

// Middleware verifying teacher token
function requireTeacherAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Yêu cầu quyền truy cập của giáo viên.' } });
    return;
  }
  const token = authHeader.substring(7);
  const expiresAt = validTeacherTokens.get(token);
  if (!expiresAt || Date.now() > expiresAt) {
    res.status(401).json({ ok: false, error: { code: 'TOKEN_EXPIRED', message: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.' } });
    return;
  }
  next();
}

app.get('/api/teacher/stats', requireTeacherAuth, async (req, res) => {
  try {
    const stats = await storage.getTeacherStats();
    res.json({ ok: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.get('/api/teacher/attempts', requireTeacherAuth, async (req, res) => {
  try {
    const attempts = await storage.listAttempts();
    const students = await storage.listStudents();
    const processes = await storage.listProcesses();

    const studentMap = new Map(students.map((s) => [s.id, s]));
    const processMap = new Map(processes.map((p) => [p.id, p]));

    const enriched = attempts.map((a) => {
      const stu = studentMap.get(a.studentId);
      const proc = processMap.get(a.processId);
      return {
        ...a,
        studentName: stu?.name || 'Ẩn danh',
        studentClass: stu?.className || '9',
        studentSchool: stu?.school || '',
        problemText: proc?.problemText || '',
        dangBai: proc?.parts?.[0]?.dangBai || 'TS1',
      };
    });

    res.json({ ok: true, data: enriched });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.get('/api/teacher/student-detail/:studentId', requireTeacherAuth, async (req, res) => {
  try {
    const student = await storage.getStudent(req.params.studentId);
    const allAttempts = await storage.listAttempts();
    const studentAttempts = allAttempts.filter((a) => a.studentId === req.params.studentId);
    const allEvents = await storage.listAnswerEvents();
    const studentEvents = allEvents.filter((e) => e.studentId === req.params.studentId);

    res.json({
      ok: true,
      data: {
        student,
        attempts: studentAttempts,
        events: studentEvents,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.get('/api/teacher/question-analysis', requireTeacherAuth, async (req, res) => {
  try {
    const events = await storage.listAnswerEvents();
    // Group by dangBai and interaction
    const analysisMap = new Map<string, { total: number; correctFirstTry: number; mistakes: number }>();

    for (const e of events) {
      const key = `${e.dangBai || 'CHUNG'} - B${e.stepNo || 1} - ${e.interactionId}`;
      const curr = analysisMap.get(key) || { total: 0, correctFirstTry: 0, mistakes: 0 };
      curr.total++;
      if (e.tryNo === 1 && e.isCorrect) curr.correctFirstTry++;
      if (!e.isCorrect) curr.mistakes++;
      analysisMap.set(key, curr);
    }

    const result = Array.from(analysisMap.entries()).map(([item, data]) => ({
      item,
      total: data.total,
      firstTryAccuracy: data.total > 0 ? Math.round((data.correctFirstTry / data.total) * 100) : 0,
      mistakes: data.mistakes,
    }));

    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

app.delete('/api/teacher/processes/:id', requireTeacherAuth, async (req, res) => {
  try {
    await storage.deleteProcess(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// Kiểm tra quyền đọc/ghi từng bảng dữ liệu trên Firestore
app.get('/api/teacher/storage-check', requireTeacherAuth, async (req, res) => {
  try {
    res.json({ ok: true, data: await checkFirestoreAccess() });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// Sao lưu toàn bộ thư viện quy trình (tải về máy giáo viên)
app.get('/api/teacher/backup', requireTeacherAuth, async (req, res) => {
  try {
    const processes = await storage.listProcesses();
    res.json({
      ok: true,
      data: {
        kind: 'polya-ai-bai22-library-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        processes,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// Khôi phục thư viện từ file sao lưu
app.post('/api/teacher/restore', requireTeacherAuth, async (req, res) => {
  try {
    const list: PolyaProcess[] = Array.isArray(req.body?.processes) ? req.body.processes : [];
    let restored = 0;
    let pending = 0;
    let skipped = 0;
    for (const p of list) {
      if (!p || typeof p.id !== 'string' || !Array.isArray(p.parts) || !p.textHash || !p.dataHash) {
        skipped++;
        continue;
      }
      const r = await storage.saveProcess(p);
      if (r.persisted) restored++;
      else pending++;
    }
    res.json({ ok: true, data: { restored, pending, skipped, total: list.length } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// Multi-sheet Excel data preparation
app.get('/api/teacher/export-data', requireTeacherAuth, async (req, res) => {
  try {
    const students = await storage.listStudents();
    const attempts = await storage.listAttempts();
    const events = await storage.listAnswerEvents();
    const processes = await storage.listProcesses();

    res.json({
      ok: true,
      data: {
        students,
        attempts,
        events,
        processes,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// Vite Middleware for Fullstack React app
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Polya AI - Bài 22: Bảng và biểu đồ tần số] Server is running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

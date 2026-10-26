import crypto from 'crypto';
import { ComputedData, ProblemAnalysis, PolyaProcess, ProcessPart, ReferenceChart, SkippedPart } from '../src/shared/types.ts';
import { calculateNiceAxis, computeStatistics } from '../src/shared/statEngine.ts';
import { buildPolyaStepsForPart, buildReferenceChart } from '../src/shared/templates/index.ts';
import { buildModuleSteps, fillMissingFrequency, usesLegacyTemplate } from '../src/shared/bai22/appBridge.ts';
import { polishProcessTexts, sanitizeAnalysis } from './gemini.ts';
import { storage } from './storage.ts';

export const TEMPLATE_VERSION = 'v3.0.0-bai22';

export interface JobState {
  id: string;
  status: 'pending' | 'building' | 'polishing' | 'verifying' | 'completed' | 'failed';
  message: string;
  processId?: string;
  error?: string;
  /** Có giá trị khi quy trình đã tạo nhưng CHƯA lưu được vào Firestore (đang chờ ghi lại) */
  storageWarning?: string;
  createdAt: number;
}

const activeJobs = new Map<string, JobState>();
const inFlightHashes = new Map<string, string>(); // dataHash -> jobId

export function getJob(jobId: string): JobState | undefined {
  return activeJobs.get(jobId);
}

/**
 * Standardize text for SHA-256 hash:
 * lowercase, trim, collapse whitespace/newlines, unify decimal commas to dots in numbers.
 */
export function computeTextHash(text: string): string {
  const normalized = text
    .toLowerCase()
    .trim()
    .replace(/(\d+),(\d+)/g, '$1.$2')
    .replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Canonical data hash representation
 */
export function computeDataHash(analysis: ProblemAnalysis): string {
  const sortedRaw = [...(analysis.rawValues || [])].sort();
  const canonicalObj = {
    dauHieu: (analysis.context.dauHieu || '').toLowerCase().trim(),
    valueKind: analysis.valueKind,
    rawValues: sortedRaw,
    sourceKind: analysis.sourceKind,
    sourceChartKind: analysis.sourceChartKind || '',
    categories: analysis.categories || [],
    frequencies: analysis.frequencies || [],
    parts: (analysis.parts || []).map((p) => ({
      label: p.label,
      question: p.question,
      dangBai: p.dangBai,
      chartKind: p.chartKind,
      askKind: p.askKind || '',
      targetValue: p.targetValue || '',
    })),
    claimed: analysis.claimedFrequencies || [],
    statedSampleSize: analysis.statedSampleSize,
    version: TEMPLATE_VERSION,
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonicalObj)).digest('hex');
}

/**
 * Start or join process generation job
 */
export async function startProcessGeneration(rawAnalysis: ProblemAnalysis, problemImageUrl?: string): Promise<{ jobId: string; cached: boolean; processId?: string }> {
  // Chuẩn hóa lại phía server (đề có thể đã được sửa ở trang xác nhận)
  const analysis = sanitizeAnalysis(rawAnalysis);
  if (!analysis.inScope) {
    throw new Error(analysis.outOfScopeReason || 'Đề bài nằm ngoài phạm vi Bài 22.');
  }
  const textHash = computeTextHash(analysis.problemText);
  const dataHash = computeDataHash(analysis);

  // 1. Check cache first
  const existing = await storage.findProcessByHashes(textHash, dataHash, TEMPLATE_VERSION);
  if (existing) {
    console.log('[ProcessGenerator] CACHE HIT for process:', existing.id);
    return { jobId: '', cached: true, processId: existing.id };
  }

  // 2. Check in-flight job for the same dataHash
  if (inFlightHashes.has(dataHash)) {
    const existingJobId = inFlightHashes.get(dataHash)!;
    console.log('[ProcessGenerator] In-flight job reuse:', existingJobId);
    return { jobId: existingJobId, cached: false };
  }

  console.log('[ProcessGenerator] GENERATE NEW for problem');
  const jobId = crypto.randomUUID();
  const jobState: JobState = {
    id: jobId,
    status: 'pending',
    message: 'Khởi tạo quy trình giải...',
    createdAt: Date.now(),
  };

  activeJobs.set(jobId, jobState);
  inFlightHashes.set(dataHash, jobId);

  // Execute job asynchronously
  runGenerationJob(jobId, analysis, textHash, dataHash, problemImageUrl).catch((err) => {
    console.error(`[ProcessGenerator] Job ${jobId} failed unhandled:`, err);
    jobState.status = 'failed';
    jobState.error = err?.message || 'Có lỗi xảy ra khi tạo quy trình.';
    inFlightHashes.delete(dataHash);
  });

  return { jobId, cached: false };
}

async function runGenerationJob(
  jobId: string,
  analysis: ProblemAnalysis,
  textHash: string,
  dataHash: string,
  problemImageUrl?: string
) {
  const job = activeJobs.get(jobId);
  if (!job) return;

  try {
    // Stage 1: Build logic with statEngine
    job.status = 'building';
    job.message = 'Đang dựng quy trình giải toán với Polya 4 bước...';

    const built = buildProcessParts(analysis);
    const { parts, skippedParts, computed, sourceChart } = built;

    // Stage 2: Polish texts with AI Call #2
    job.status = 'polishing';
    job.message = 'Đang viết lời hướng dẫn sư phạm cho từng bước...';

    let aiPolished = false;
    try {
      // Gather intros and hints to polish
      const itemsToPolish: { id: string; text: string; allowedNumbers: number[] }[] = [];
      const numericCats = computed.categories
        .map((c) => parseFloat(String(c).replace(',', '.')))
        .filter((n) => !isNaN(n));
      const allowedNumbers = [
        computed.sampleSize,
        ...computed.frequencies,
        ...numericCats,
        ...(computed.niceAxis ? [computed.niceAxis.max, computed.niceAxis.step] : []),
        0,
        1,
        2,
        3,
        4,
        9,
        22,
      ];

      for (const part of parts) {
        for (const step of part.steps) {
          itemsToPolish.push({
            id: `${part.label}-s${step.stepNo}-intro`,
            text: step.intro,
            allowedNumbers,
          });
          itemsToPolish.push({
            id: `${part.label}-s${step.stepNo}-hintCard`,
            text: step.hintCard,
            allowedNumbers,
          });
        }
      }

      // Call AI polish with 40s timeout
      const polishPromise = polishProcessTexts(analysis.problemText, analysis.context, itemsToPolish.slice(0, 8));
      const timeoutPromise = new Promise<{ id: string; text: string }[]>((_, reject) =>
        setTimeout(() => reject(new Error('Polish timeout')), 40000)
      );

      const polishedItems = await Promise.race([polishPromise, timeoutPromise]);
      if (polishedItems && polishedItems.length > 0) {
        aiPolished = true;
        const textMap = new Map(polishedItems.map((i) => [i.id, i.text]));
        for (const part of parts) {
          for (const step of part.steps) {
            const introKey = `${part.label}-s${step.stepNo}-intro`;
            if (textMap.has(introKey)) step.intro = textMap.get(introKey)!;
            const hintKey = `${part.label}-s${step.stepNo}-hintCard`;
            if (textMap.has(hintKey)) step.hintCard = textMap.get(hintKey)!;
          }
        }
      }
    } catch (polishErr) {
      console.warn('[ProcessGenerator] AI text polish skipped, using default wording:', polishErr);
      aiPolished = false;
    }

    // Stage 3: Verification (Section 5.9)
    job.status = 'verifying';
    job.message = 'Đang kiểm tra tính nhất quán toán học...';

    verifyProcessConsistency(computed, parts);

    // Stage 4: Completed & Save
    const processId = 'proc_' + crypto.randomUUID().substring(0, 12);
    const newProcess: PolyaProcess = {
      id: processId,
      textHash,
      dataHash,
      templateVersion: TEMPLATE_VERSION,
      problemText: analysis.problemText,
      // Không lưu ảnh/PDF gốc: dữ liệu base64 rất lớn làm Firestore từ chối lưu cả quy trình.
      analysis,
      computed,
      ...(sourceChart ? { sourceChart } : {}),
      parts,
      ...(skippedParts.length ? { skippedParts } : {}),
      aiPolished,
      status: 'ready',
      usageCount: 0,
      createdAt: new Date().toISOString(),
    };

    const saved = await storage.saveProcess(newProcess);
    if (!saved.persisted) {
      job.storageWarning =
        'Quy trình đã tạo xong nhưng chưa lưu được vào thư viện (máy chủ sẽ tự thử lưu lại). ' +
        'Thầy/cô xem mục "Tình trạng hệ thống" ở trang Giáo viên.';
    }

    job.status = 'completed';
    job.message = 'Quy trình giải hoàn tất!';
    job.processId = processId;
    inFlightHashes.delete(dataHash);
  } catch (err: any) {
    console.error(`[ProcessGenerator] Error building process:`, err);
    job.status = 'failed';
    job.error = err?.message || 'Có lỗi xảy ra khi tạo quy trình giải.';
    inFlightHashes.delete(dataHash);

    // Save failure record
    await storage.saveFailure({
      id: crypto.randomUUID(),
      problemText: analysis.problemText,
      reason: err?.message || 'Unknown error',
      createdAt: new Date().toISOString(),
    });
  }
}

/**
 * 5.9 Machine verification of mathematical consistency before saving
 */
function verifyProcessConsistency(computed: any, parts: ProcessPart[]) {
  if (!computed.categories || computed.categories.length === 0) {
    throw new Error('Chưa đọc được dữ liệu của đề để lập bảng tần số.');
  }

  // Check total frequencies if present
  if (computed.frequencies && computed.frequencies.length > 0) {
    const sumFreq = computed.frequencies.reduce((a: number, b: number) => a + b, 0);
    if (computed.sampleSize > 0 && Math.abs(sumFreq - computed.sampleSize) > 0.001) {
      throw new Error(`Tổng tần số (${sumFreq}) không khớp với cỡ mẫu N (${computed.sampleSize})`);
    }
  }

  // Check table fill interactions have expected values
  for (const p of parts) {
    for (const s of p.steps) {
      for (const task of s.mainTasks) {
        if (task.type === 'table_fill') {
          for (const row of task.matrix) {
            for (const cell of row) {
              if (cell.isEditable && !cell.expectedValue) {
                throw new Error(`Ô bảng (${cell.row}, ${cell.col}) thiếu đáp án kiểm tra!`);
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Dựng toàn bộ các ý của đề.
 *  - TS1, TS2, TS3 và TS4 kiểu nhiều nhất / ít nhất / tần số một giá trị: khuôn sẵn có (đang chạy đúng).
 *  - Các kiểu đọc – phân tích còn lại, TS5, TS6: module Bài 22 (code phân loại, code tính, có chốt kiểm tra).
 *  - Ý không nhận ra / ngoài phạm vi / số liệu mâu thuẫn: BỎ QUA và ghi lý do (không sinh quy trình sai).
 */
export function buildProcessParts(analysis: ProblemAnalysis): {
  parts: ProcessPart[];
  skippedParts: SkippedPart[];
  computed: ComputedData;
  sourceChart?: ReferenceChart;
} {
  const raw = computeStatistics(analysis);
  const filled = fillMissingFrequency(analysis, raw);
  const computed: ComputedData = filled ? { ...filled, niceAxis: calculateNiceAxis(Math.max(...filled.frequencies, 1)) } : raw;

  // Biểu đồ của đề (nếu đề cho sẵn biểu đồ) – lồng vào thẻ đề bài và các bước
  const sourceChart =
    analysis.sourceKind === 'freq_chart' && computed.categories.length > 0
      ? buildReferenceChart(analysis.sourceChartKind === 'line' ? 'line' : 'bar', computed, {
          title: analysis.chartTitle || `${analysis.context?.dauHieu || 'Biểu đồ tần số'}`,
          xAxisLabel: analysis.valueLabel || 'Giá trị',
          yAxisLabel: analysis.freqLabel || 'Tần số',
          caption: 'Biểu đồ trong đề bài (dựng lại từ số liệu đã đọc).',
        })
      : undefined;

  const parts: ProcessPart[] = [];
  const skippedParts: SkippedPart[] = [];
  for (const p of analysis.parts) {
    if (p.codeStatus === 'unsupported') {
      skippedParts.push({ label: p.label, question: p.question, reason: p.codeNote || 'Chưa hỗ trợ dạng câu hỏi này.' });
      continue;
    }
    if (usesLegacyTemplate(p)) {
      let steps;
      try {
        steps = buildPolyaStepsForPart(analysis, computed, p);
      } catch (err: any) {
        skippedParts.push({ label: p.label, question: p.question, reason: err?.message || 'Không dựng được quy trình.' });
        continue;
      }
      parts.push({
        label: p.label,
        question: p.question,
        dangBai: p.dangBai,
        chartKind: p.chartKind,
        ...(p.askKind ? { askKind: p.askKind } : {}),
        ...(p.codeStatus === 'needs_review' ? { needsReview: true } : {}),
        ...(p.codeNote ? { reviewNotes: [p.codeNote] } : {}),
        steps,
      });
      continue;
    }
    const results = buildModuleSteps(p, analysis, raw, filled, { ...(sourceChart ? { sourceChart } : {}) });
    for (const r of results) {
      if ((r.status === 'ok' || r.status === 'needs_review') && r.steps) {
        parts.push({
          label: r.label,
          question: r.spec.question,
          dangBai: r.spec.dang as ProcessPart['dangBai'],
          chartKind: 'none',
          ...(r.spec.askKind ? { askKind: r.spec.askKind } : {}),
          ...(r.status === 'needs_review' || p.codeStatus === 'needs_review' ? { needsReview: true } : {}),
          reviewNotes: r.notes,
          steps: r.steps,
        });
      } else {
        skippedParts.push({ label: r.label, question: r.spec.question || p.question, reason: r.notes.join(' ') });
      }
    }
  }
  if (parts.length === 0) {
    throw new Error(
      skippedParts.length
        ? `Chưa tạo được quy trình cho ý nào: ${skippedParts.map((s) => `ý ${s.label} – ${s.reason}`).join('; ')}`
        : 'Đề bài chưa có ý nào để giải.'
    );
  }
  return { parts, skippedParts, computed, ...(sourceChart ? { sourceChart } : {}) };
}

/**
 * Quy trình lưu bằng phiên bản khuôn cũ → dựng lại bằng khuôn mới (không gọi AI), giữ nguyên mã quy trình.
 * Nhờ vậy các đề cũ trong Thư viện (VD bài y tá) tự được sửa khi mở lại.
 */
export async function upgradeProcess(proc: PolyaProcess): Promise<PolyaProcess> {
  if (!proc || proc.templateVersion === TEMPLATE_VERSION || !proc.analysis) return proc;
  try {
    const analysis = sanitizeAnalysis(proc.analysis);
    if (!analysis.inScope) return proc;
    const { parts, skippedParts, computed, sourceChart } = buildProcessParts(analysis);
    verifyProcessConsistency(computed, parts);
    const upgraded: PolyaProcess = {
      ...proc,
      analysis,
      computed,
      ...(sourceChart ? { sourceChart } : {}),
      parts,
      dataHash: computeDataHash(analysis),
      templateVersion: TEMPLATE_VERSION,
      aiPolished: false,
    };
    if (skippedParts.length) upgraded.skippedParts = skippedParts;
    else delete upgraded.skippedParts;
    storage.saveProcess(upgraded).catch((e) => console.warn('[ProcessGenerator] Lưu bản nâng cấp lỗi:', e));
    console.log(`[ProcessGenerator] Đã nâng cấp quy trình ${proc.id} lên ${TEMPLATE_VERSION}`);
    return upgraded;
  } catch (err) {
    console.warn(`[ProcessGenerator] Không nâng cấp được quy trình ${proc.id}:`, err);
    return proc;
  }
}

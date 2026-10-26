import { GoogleGenAI } from '@google/genai';
import { ProblemAnalysis, ProblemContext } from '../src/shared/types.ts';
import { computeStatistics, extractDataSeries } from '../src/shared/statEngine.ts';
import { reclassifyParts } from '../src/shared/bai22/appBridge.ts';
import { BAI22_EXTRACTION_RULES, BAI22_HINT_SCHEMA } from '../src/shared/bai22/gemini.ts';
import { normalizeProblemText } from '../src/shared/problemText.ts';

const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

let primaryModel = process.env.MODEL_PRIMARY || 'gemini-2.5-flash';
let fallbackModel = process.env.MODEL_FALLBACK || 'gemini-2.5-flash';

const pausedModels = new Map<string, number>(); // model -> unpauseTimestamp

// Check model availability on boot
export async function initGemini() {
  if (!apiKey) {
    console.warn('[Gemini] GEMINI_API_KEY is not set.');
    return;
  }
  try {
    const listRes = await ai.models.list();
    const available = new Set<string>();
    // list returns an async iterable or array
    if (listRes && typeof (listRes as any)[Symbol.asyncIterator] === 'function') {
      for await (const m of listRes) {
        if (m.name) available.add(m.name.replace('models/', ''));
      }
    }
    console.log('[Gemini] Connected. Primary model:', primaryModel, 'Fallback:', fallbackModel);
  } catch (err: any) {
    console.warn('[Gemini] Could not list models (will proceed with defaults):', err?.message || err);
  }
}

function getActiveModel(): string {
  const now = Date.now();
  if (pausedModels.has(primaryModel)) {
    if (now < pausedModels.get(primaryModel)!) {
      return fallbackModel;
    } else {
      pausedModels.delete(primaryModel);
    }
  }
  return primaryModel;
}

export interface GeminiResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Robust central callGemini wrapper with retries, fallback switching, and simulation
 */
export async function callGemini(
  prompt: string,
  systemInstruction?: string,
  contentsParts: any[] = [],
  schema?: any
): Promise<GeminiResponse<string>> {
  // Check test simulation
  const sim = process.env.SIMULATE_AI_ERROR;
  if (sim === 'overloaded') {
    return {
      ok: false,
      error: { code: 'OVERLOADED', message: 'Hệ thống AI hiện đang quá tải. Vui lòng thử lại sau giây lát.' },
    };
  }
  if (sim === 'quota') {
    return {
      ok: false,
      error: {
        code: 'QUOTA_EXCEEDED',
        message: 'Hệ thống đã hết lượt dùng AI hôm nay, lượt mới được cấp lại lúc khoảng 14:00–15:00 (giờ Việt Nam).',
      },
    };
  }

  let currentModel = getActiveModel();
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const parts: any[] = [];
      if (prompt) parts.push({ text: prompt });
      for (const p of contentsParts) parts.push(p);

      const config: any = {
        systemInstruction,
        temperature: 0.1,
        maxOutputTokens: 4096,
      };

      if (schema) {
        config.responseMimeType = 'application/json';
        config.responseSchema = schema;
      }

      const response = await ai.models.generateContent({
        model: currentModel,
        contents: [{ role: 'user', parts }],
        config,
      });

      const text = response.text || '';
      return { ok: true, data: text };
    } catch (err: any) {
      const errMsg = String(err?.message || err);
      console.warn(`[Gemini] Call attempt ${attempt} with model ${currentModel} failed:`, errMsg);

      // Check 429 limit: 0 -> pause model 24h
      if (errMsg.includes('limit: 0') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        pausedModels.set(currentModel, Date.now() + 24 * 60 * 60 * 1000);
        if (currentModel !== fallbackModel) {
          console.warn(`[Gemini] Pausing ${currentModel} due to limit: 0, switching to ${fallbackModel}`);
          currentModel = fallbackModel;
          continue;
        } else {
          return {
            ok: false,
            error: {
              code: 'QUOTA_EXCEEDED',
              message: 'Hệ thống đã hết lượt dùng AI hôm nay, lượt mới được cấp lại lúc khoảng 14:00–15:00 (giờ Việt Nam).',
            },
          };
        }
      }

      // Check 503 / UNAVAILABLE / Overloaded -> wait 2s then 5s
      if (errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('overloaded')) {
        if (attempt === 1) await sleep(2000);
        else if (attempt === 2) await sleep(5000);
        else if (currentModel !== fallbackModel) {
          currentModel = fallbackModel;
        }
        continue;
      }

      // 400 schema error -> retry without schema
      if (errMsg.includes('400') && schema) {
        try {
          const fallbackRes = await ai.models.generateContent({
            model: currentModel,
            contents: [{ role: 'user', parts: [{ text: `${prompt}\n\nIMPORTANT: OUTPUT STRICTLY RAW VALID JSON ONLY.` }, ...contentsParts] }],
            config: { systemInstruction, temperature: 0.1, maxOutputTokens: 2500 },
          });
          return { ok: true, data: fallbackRes.text || '' };
        } catch (innerErr) {
          console.warn('[Gemini] Fallback without schema failed:', innerErr);
        }
      }

      if (attempt === maxAttempts) {
        return {
          ok: false,
          error: {
            code: 'AI_CALL_FAILED',
            message: `Không thể kết nối với dịch vụ AI: ${errMsg.substring(0, 150)}`,
          },
        };
      }
    }
  }

  return {
    ok: false,
    error: { code: 'UNKNOWN', message: 'Lỗi không xác định khi gọi AI.' },
  };
}

/**
 * AI CALL #1: Problem Analysis (Phân tích đề bài)
 * Phạm vi: Bài 22 – Bảng tần số và biểu đồ tần số (Toán 9, KNTT)
 */
export async function analyzeProblem(
  textInput: string,
  imageBuffer?: Buffer,
  mimeType: string = 'image/jpeg'
): Promise<GeminiResponse<ProblemAnalysis>> {
  const systemPrompt = `Em là trợ lý số hóa đề Toán 9 (Chương trình GDPT 2018, SGK Kết nối tri thức) – CHỈ cho Bài 22 "Bảng tần số và biểu đồ tần số".
NHIỆM VỤ:
1. CHÉP lại đề bài NGUYÊN VĂN vào problemText (Markdown + LaTeX; bảng số liệu viết thành bảng Markdown; giữ nguyên các ý a, b, c). Nếu đề có biểu đồ thì ghi một dòng mô tả "(Biểu đồ: ...)".
2. Trích xuất dữ liệu theo JSON. CHỈ CHÉP, KHÔNG GIẢI, KHÔNG ĐẾM, KHÔNG TÍNH – code sẽ tự đếm.

PHẠM VI HỖ TRỢ (6 dạng):
- TS1: Lập bảng tần số (từ dãy dữ liệu, từ bảng ghi dữ liệu thô, đọc biểu đồ hoặc biểu đồ tranh để lập bảng). Câu kiểu "cần mua các cỡ nào, mỗi loại bao nhiêu" cũng là TS1.
- TS2: Vẽ biểu đồ tần số dạng cột (chartKind = "bar").
- TS3: Vẽ biểu đồ tần số dạng đoạn thẳng / đa giác tần số (chartKind = "line").
- TS4: Đọc – phân tích bảng/biểu đồ tần số (nhiều nhất, ít nhất, tần số của một giá trị, tổng số đối tượng, đếm theo điều kiện "ít nhất/trên/dưới/từ...đến...", so sánh, nhận xét...).
- TS5: Tìm tần số còn thiếu trong bảng khi biết cỡ mẫu.
- TS6: Kiểm tra bảng tần số do một bạn lập là đúng hay sai, sửa lại.
NGOÀI PHẠM VI (đặt inScope = false): tần số tương đối, biểu đồ hình quạt tròn, ghép nhóm, tần số tương đối ghép nhóm, số trung bình/trung vị/mốt, xác suất; và biểu đồ/bảng mà số liệu KHÔNG phải tần số (ví dụ nhiệt độ, sản lượng, doanh thu).
Khi ngoài phạm vi: outOfScopeReason = "Ứng dụng hiện chỉ hỗ trợ Bài 22: Bảng tần số và biểu đồ tần số (lập bảng tần số, vẽ biểu đồ tần số dạng cột/đoạn thẳng, đọc bảng và biểu đồ tần số). Em thử nhập một đề thuộc nội dung này nhé."

QUY TẮC TRÍCH XUẤT:
- sourceKind: "raw_list" (dãy dữ liệu liệt kê), "raw_table" (bảng ghi dữ liệu thô, ví dụ bảng tên bạn đạt điểm tốt theo từng ngày), "freq_table" (đề cho sẵn bảng tần số), "freq_chart" (đề cho sẵn biểu đồ tần số).
- raw_list / raw_table: chép ĐỦ TỪNG GIÁ TRỊ vào rawValues theo thứ tự xuất hiện, KHÔNG bỏ sót, KHÔNG gộp. Ô bảng chứa nhiều giá trị (ví dụ "Bình, Nam") phải tách thành từng giá trị riêng. Số thập phân dùng dấu phẩy (6,5).
- freq_table / freq_chart: ghi categories (các giá trị) và frequencies (tần số tương ứng, đọc chiều cao cột hoặc nhãn số trên biểu đồ). Với freq_chart ghi sourceChartKind = "bar" hoặc "line" và chartTitle là tiêu đề biểu đồ.
- Nếu đề liệt kê sẵn các lựa chọn/mức (ví dụ A, B, C, D hoặc Tốt, Khá, Trung bình, Kém) thì ghi đúng thứ tự đó vào categories (kể cả khi sourceKind là raw_list).
- valueKind = "numeric" nếu các giá trị là số, ngược lại "categorical".
- valueLabel: tên ngắn của dòng giá trị như trong đề/SGK (ví dụ "Cỡ giày", "Điểm", "Đội bóng", "Số anh, chị, em ruột"); freqLabel: tên dòng tần số nếu đề đặt khác "Tần số" (ví dụ "Số bạn", "Số học sinh"), nếu không thì để "Tần số".
- statedSampleSize: cỡ mẫu nếu đề nêu rõ (ví dụ "của 20 học sinh"), không nêu thì -1.
- context: doiTuong (danh từ ngắn chỉ đối tượng được đếm, ví dụ "bạn nam", "y tá", "trận đấu"), dauHieu (ví dụ "cỡ giày"), donVi (đơn vị của giá trị, ví dụ "năm", "điểm"; không có thì ""), tenMau.
- parts: mỗi ý một phần tử {label, question (chép NGUYÊN VĂN câu hỏi), dangBai, chartKind, hint}. Nếu một câu yêu cầu vẽ CẢ biểu đồ cột VÀ biểu đồ đoạn thẳng thì tách thành 2 phần tử: label "a.1" (TS2) và "a.2" (TS3) (thay a bằng nhãn của ý). Nếu một ý vừa yêu cầu lập bảng vừa hỏi giá trị nhiều nhất thì tách thành TS1 (label "b.1") và TS4 (label "b.2"). Đề không đánh nhãn ý thì dùng label "a".
- chartKind = "none" cho TS1, TS4, TS5, TS6.

${BAI22_EXTRACTION_RULES}`;

  const prompt = `Phân tích đề bài sau đây và trả về JSON:
${textInput}`;

  const contentsParts: any[] = [];
  if (imageBuffer) {
    contentsParts.push({
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType,
      },
    });
  }

  const analysisSchema = {
    type: 'OBJECT',
    properties: {
      readable: { type: 'BOOLEAN' },
      inScope: { type: 'BOOLEAN' },
      outOfScopeReason: { type: 'STRING' },
      problemText: { type: 'STRING' },
      context: {
        type: 'OBJECT',
        properties: {
          doiTuong: { type: 'STRING' },
          dauHieu: { type: 'STRING' },
          donVi: { type: 'STRING' },
          tenMau: { type: 'STRING' },
        },
        required: ['doiTuong', 'dauHieu', 'donVi', 'tenMau'],
      },
      sourceKind: { type: 'STRING', enum: ['raw_list', 'raw_table', 'freq_table', 'freq_chart'] },
      sourceChartKind: { type: 'STRING' },
      valueKind: { type: 'STRING', enum: ['numeric', 'categorical'] },
      rawValues: { type: 'ARRAY', items: { type: 'STRING' } },
      categories: { type: 'ARRAY', items: { type: 'STRING' } },
      frequencies: { type: 'ARRAY', items: { type: 'NUMBER', nullable: true } },
      claimedFrequencies: { type: 'ARRAY', nullable: true, items: { type: 'NUMBER', nullable: true } },
      claimedBy: { type: 'STRING', nullable: true },
      statedSampleSize: { type: 'NUMBER' },
      valueLabel: { type: 'STRING' },
      freqLabel: { type: 'STRING' },
      chartTitle: { type: 'STRING' },
      parts: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            label: { type: 'STRING' },
            question: { type: 'STRING' },
            dangBai: { type: 'STRING', enum: ['TS1', 'TS2', 'TS3', 'TS4', 'TS5', 'TS6'] },
            chartKind: { type: 'STRING', enum: ['none', 'bar', 'line'] },
            hint: BAI22_HINT_SCHEMA,
          },
          required: ['label', 'question', 'dangBai', 'chartKind'],
        },
      },
      notes: { type: 'STRING' },
    },
    required: ['readable', 'inScope', 'problemText', 'context', 'sourceKind', 'valueKind', 'parts'],
  };

  const response = await callGemini(prompt, systemPrompt, contentsParts, analysisSchema);
  if (!response.ok || !response.data) {
    // If AI failed on typed text, try code fallback
    if (textInput && !imageBuffer) {
      console.warn('[Gemini] AI analyze failed, trying fallback extractDataSeries...');
      const fallbackAnalysis = tryCodeBasedAnalysis(textInput);
      if (fallbackAnalysis) {
        return { ok: true, data: sanitizeAnalysis(fallbackAnalysis) };
      }
    }
    return { ok: false, error: response.error };
  }

  try {
    let cleanJson = response.data.trim();
    if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json/, '').replace(/```$/, '');
    else if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```/, '').replace(/```$/, '');
    const parsed = sanitizeAnalysis(JSON.parse(cleanJson));
    return { ok: true, data: parsed };
  } catch (err: any) {
    console.warn('[Gemini] JSON parse error in analyzeProblem:', err);
    if (textInput && !imageBuffer) {
      const fallbackAnalysis = tryCodeBasedAnalysis(textInput);
      if (fallbackAnalysis) return { ok: true, data: sanitizeAnalysis(fallbackAnalysis) };
    }
    return {
      ok: false,
      error: { code: 'PARSE_ERROR', message: 'Máy chưa đọc đủ số liệu của đề. Vui lòng kiểm tra lại văn bản hoặc ảnh.' },
    };
  }
}

const OUT_OF_SCOPE_MSG =
  'Ứng dụng hiện chỉ hỗ trợ Bài 22: Bảng tần số và biểu đồ tần số (lập bảng tần số, vẽ biểu đồ tần số dạng cột/đoạn thẳng, đọc bảng và biểu đồ tần số). Em thử nhập một đề thuộc nội dung này nhé.';

/**
 * Chuẩn hóa kết quả AI về đúng phạm vi Bài 22 (code kiểm soát, không tin hoàn toàn AI).
 */
export function sanitizeAnalysis(raw: any): ProblemAnalysis {
  const a: any = { ...raw };
  a.readable = a.readable !== false;
  a.inScope = a.inScope !== false;
  a.outOfScopeReason = a.outOfScopeReason || '';
  // Tách lại bảng bị dồn trên một dòng, đưa ý a), b) và phương án A. B. C. D. xuống dòng
  a.problemText = normalizeProblemText(String(a.problemText || ''));
  a.context = {
    doiTuong: a.context?.doiTuong || '',
    dauHieu: a.context?.dauHieu || '',
    donVi: a.context?.donVi || '',
    tenMau: a.context?.tenMau || '',
  };
  a.rawValues = Array.isArray(a.rawValues) ? a.rawValues.map((v: any) => String(v).trim()).filter(Boolean) : [];
  a.categories = Array.isArray(a.categories) ? a.categories.map((v: any) => String(v).trim()).filter(Boolean) : [];
  // null = ô tần số đề để trống (dạng TS5) – giữ nguyên để code nhận ra
  const toFreq = (v: any) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  a.frequencies = Array.isArray(a.frequencies) ? a.frequencies.map(toFreq) : [];
  if (Array.isArray(a.claimedFrequencies) && a.claimedFrequencies.length) {
    a.claimedFrequencies = a.claimedFrequencies.map(toFreq);
    a.claimedBy = String(a.claimedBy || '').trim();
  } else {
    delete a.claimedFrequencies;
    delete a.claimedBy;
  }
  a.statedSampleSize = typeof a.statedSampleSize === 'number' ? a.statedSampleSize : -1;
  a.valueKind = a.valueKind === 'categorical' ? 'categorical' : 'numeric';

  const validSources = ['raw_list', 'raw_table', 'freq_table', 'freq_chart'];
  if (!validSources.includes(a.sourceKind)) {
    a.sourceKind = a.frequencies.length > 0 && a.frequencies.length === a.categories.length ? 'freq_table' : 'raw_list';
  }
  a.sourceChartKind = a.sourceChartKind === 'line' ? 'line' : 'bar';

  // Bảng tần số có giá trị không nguyên → không phải tần số (VD nhiệt độ)
  if ((a.sourceKind === 'freq_table' || a.sourceKind === 'freq_chart') && a.frequencies.some((f: number | null) => f !== null && (!Number.isInteger(f) || f < 0))) {
    a.inScope = false;
  }

  const parts: any[] = Array.isArray(a.parts) ? a.parts : [];
  const validDang = ['TS1', 'TS2', 'TS3', 'TS4', 'TS5', 'TS6'];
  if (parts.some((p) => !validDang.includes(p?.dangBai))) {
    a.inScope = false;
  }
  a.parts = parts
    .filter((p) => validDang.includes(p?.dangBai))
    .map((p, i) => {
      const dangBai = p.dangBai;
      const chartKind = dangBai === 'TS2' ? 'bar' : dangBai === 'TS3' ? 'line' : 'none';
      // KHÔNG còn tự gán "max" cho câu đọc – phân tích: gợi ý của AI chỉ được giữ lại để code đối chiếu
      const out: any = {
        label: String(p.label || String.fromCharCode(97 + i)).replace(/\)$/, ''),
        question: String(p.question || ''),
        dangBai,
        chartKind,
      };
      const hint = p.hint && typeof p.hint === 'object' ? { ...p.hint } : p.askKind ? { dangBai, askKind: p.askKind, targets: p.targetValue ? [String(p.targetValue)] : [] } : null;
      if (hint) {
        if (!hint.dangBai) hint.dangBai = dangBai;
        out.hint = JSON.parse(JSON.stringify(hint));
      }
      return out;
    });

  if (a.inScope && a.parts.length === 0) {
    a.parts = [{ label: 'a', question: 'Lập bảng tần số', dangBai: 'TS1', chartKind: 'none' }];
  }

  // CODE xác định lại dạng của từng ý (module Bài 22). Ý ngoài phạm vi / chưa nhận ra được đánh dấu "chưa hỗ trợ".
  if (a.inScope) {
    try {
      a.parts = reclassifyParts(a as ProblemAnalysis, computeStatistics(a as ProblemAnalysis));
      if (a.parts.length > 0 && a.parts.every((p: any) => p.codeStatus === 'unsupported')) {
        a.inScope = false;
        a.outOfScopeReason = a.parts[0].codeNote || OUT_OF_SCOPE_MSG;
      }
    } catch (err) {
      console.warn('[sanitizeAnalysis] Phân loại bằng code lỗi, giữ phân loại của AI:', err);
    }
  }
  if (!a.inScope && !a.outOfScopeReason) a.outOfScopeReason = OUT_OF_SCOPE_MSG;

  // Loại bỏ các trường cũ (tần số tương đối, ghép nhóm)
  delete a.relFrequencies;
  delete a.groups;
  delete a.groupingInstruction;
  delete a.roundingDecimals;

  return a as ProblemAnalysis;
}

/**
 * Fallback code parser (khi AI lỗi, chỉ áp dụng cho đề gõ chữ dạng dãy dữ liệu)
 */
function tryCodeBasedAnalysis(text: string): ProblemAnalysis | null {
  const lower = text.toLowerCase();
  if (/tương đối|ghép nhóm|quạt tròn/.test(lower)) return null;

  const extracted = extractDataSeries(text);
  if (extracted.sampleSize === 0) return null;

  const parts: any[] = [];
  const partRegex = /(?:^|\n|\s)([a-d])\)\s*([^\n]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = partRegex.exec(text)) !== null) {
    const label = m[1].toLowerCase();
    const q = m[2].trim();
    const ql = q.toLowerCase();
    if (/biểu đồ/.test(ql)) {
      const wantBar = /cột/.test(ql);
      const wantLine = /đoạn thẳng|đa giác/.test(ql);
      if (wantBar && wantLine) {
        parts.push({ label: `${label}.1`, question: q, dangBai: 'TS2', chartKind: 'bar' });
        parts.push({ label: `${label}.2`, question: q, dangBai: 'TS3', chartKind: 'line' });
      } else if (wantLine) {
        parts.push({ label, question: q, dangBai: 'TS3', chartKind: 'line' });
      } else {
        parts.push({ label, question: q, dangBai: 'TS2', chartKind: 'bar' });
      }
    } else if (/nhiều nhất|ít nhất|ưu thế|phù hợp/.test(ql) && !/lập bảng/.test(ql)) {
      parts.push({ label, question: q, dangBai: 'TS4', chartKind: 'none', askKind: /ít nhất/.test(ql) ? 'min' : 'max' });
    } else {
      parts.push({ label, question: q || 'Lập bảng tần số', dangBai: 'TS1', chartKind: 'none' });
    }
  }
  if (parts.length === 0) {
    parts.push({ label: 'a', question: 'Lập bảng tần số cho dãy dữ liệu', dangBai: 'TS1', chartKind: 'none' });
  }

  return {
    readable: true,
    inScope: true,
    outOfScopeReason: '',
    problemText: text,
    context: {
      doiTuong: 'đối tượng khảo sát',
      dauHieu: 'dữ liệu thống kê',
      donVi: '',
      tenMau: 'mẫu dữ liệu',
    },
    sourceKind: 'raw_list',
    valueKind: extracted.isNumeric ? 'numeric' : 'categorical',
    rawValues: extracted.values,
    categories: [],
    frequencies: [],
    statedSampleSize: -1,
    parts,
    notes: 'Phân tích tự động bằng mô-đun code dự phòng.',
  };
}

/**
 * AI CALL #2: Polish Process Texts (Viết lời dẫn sư phạm)
 * Polishes phrasing without touching any math or numbers!
 */
export async function polishProcessTexts(
  problemText: string,
  context: ProblemContext,
  itemsToPolish: { id: string; text: string; allowedNumbers: number[] }[]
): Promise<{ id: string; text: string }[]> {
  if (itemsToPolish.length === 0) return [];

  const systemInstruction = `Em là giáo viên Toán THCS thân thiện, sư phạm (xưng "thầy/cô" hoặc dùng ngôi "em").
NHIỆM VỤ: Viết lại các đoạn lời dẫn, gợi ý và giải thích sư phạm cho học sinh lớp 9 giải toán thống kê.
NGUYÊN TẮC TUYỆT ĐỐI:
- KHÔNG THAY ĐỔI, KHÔNG THÊM VÀ KHÔNG SỬA BẤT KỲ CON SỐ NÀO trong câu! Mọi con số nếu xuất hiện phải nằm trong danh sách số cho phép của từng mục.
- Dùng thuật ngữ SGK chuẩn của Bài 22: "mẫu dữ liệu", "cỡ mẫu", "giá trị", "tần số", "bảng tần số", "biểu đồ tần số dạng cột", "biểu đồ tần số dạng đoạn thẳng".
- KHÔNG nhắc tới tần số tương đối, ghép nhóm hay biểu đồ quạt tròn.
- Dấu phẩy thập phân kiểu Việt Nam (ví dụ 0,5; 25%).
- Công thức toán kẹp trong dấu $...$ (ví dụ: $N = 20$, $m_1 + m_2 + \\dots + m_k = N$).`;

  const prompt = `Đề bài:
${problemText}

Ngữ cảnh:
- Đối tượng: ${context.doiTuong}
- Dấu hiệu: ${context.dauHieu}
- Đơn vị: ${context.donVi}

Danh sách các đoạn văn cần trau chuốt (giữ nguyên id, trau chuốt nội dung text):
${JSON.stringify(itemsToPolish.map((i) => ({ id: i.id, originalText: i.text, allowedNumbers: i.allowedNumbers })))}`;

  const schema = {
    type: 'OBJECT',
    properties: {
      items: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING' },
            text: { type: 'STRING' },
          },
          required: ['id', 'text'],
        },
      },
    },
    required: ['items'],
  };

  try {
    const res = await callGemini(prompt, systemInstruction, [], schema);
    if (!res.ok || !res.data) return [];

    let clean = res.data.trim();
    if (clean.startsWith('```json')) clean = clean.replace(/^```json/, '').replace(/```$/, '');
    else if (clean.startsWith('```')) clean = clean.replace(/^```/, '').replace(/```$/, '');

    const parsed = JSON.parse(clean);
    if (parsed && Array.isArray(parsed.items)) {
      // Validate that numbers in each item are allowed
      const validItems: { id: string; text: string }[] = [];
      for (const item of parsed.items) {
        const orig = itemsToPolish.find((i) => i.id === item.id);
        if (!orig) continue;

        // Extract numbers from polished text
        const matches = (item.text || '').match(/\d+(?:[.,]\d+)?/g) || [];
        const polishedNums = matches.map((m: string) => parseFloat(m.replace(',', '.')));
        const isSafe = polishedNums.every((n: number) => orig.allowedNumbers.some((allowed) => Math.abs(allowed - n) < 0.001));

        if (isSafe && item.text) {
          validItems.push({ id: item.id, text: item.text });
        } else {
          // Fall back to original if unallowed numbers were injected
          validItems.push({ id: item.id, text: orig.text });
        }
      }
      return validItems;
    }
  } catch (err) {
    console.warn('[Gemini] polishProcessTexts error, falling back to default text:', err);
  }

  return [];
}

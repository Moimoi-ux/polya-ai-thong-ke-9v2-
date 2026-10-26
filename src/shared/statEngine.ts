import { ComputedData, ProblemAnalysis } from './types.ts';

/**
 * Bộ tính toán cho Bài 22 – Bảng tần số và biểu đồ tần số (Toán 9, KNTT).
 * Code tự đếm, tự tính; AI chỉ chép đề.
 */

/**
 * Standardize numeric string with either comma or dot decimal.
 * e.g. "6,5" -> 6.5, "10" -> 10
 */
export function parseVietnameseNumber(val: string | number): number | null {
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (!val) return null;
  const cleaned = String(val).trim().replace(/%/g, '').replace(/°/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function formatVietnameseNumber(num: number, decimals: number = 1): string {
  if (Number.isInteger(num)) return num.toString();
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(num * factor) / factor;
  return rounded.toString().replace('.', ',');
}

/**
 * Clean and normalize a string item.
 * Preserves original display casing while allowing case-insensitive matching.
 */
export function normalizeCategory(cat: string): string {
  return cat.trim().replace(/\s+/g, ' ');
}

/**
 * Fix broken Vietnamese words split across line breaks:
 * e.g. "Trung" then "bình" -> "Trung bình"
 */
export function fixHyphenatedVietnameseWords(tokens: string[]): string[] {
  const result: string[] = [];
  const compoundPrefixes = ['trung'];
  const compoundSuffixes = ['bình'];

  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i].trim();
    if (!current) continue;
    const lower = current.toLowerCase();

    if (i < tokens.length - 1 && compoundPrefixes.includes(lower)) {
      const next = tokens[i + 1].trim().toLowerCase();
      if (compoundSuffixes.includes(next)) {
        result.push('Trung bình');
        i++;
        continue;
      }
    }
    result.push(current);
  }
  return result;
}

/**
 * Trục đứng (tần số) đẹp: bước chia 1, 2, 5, 10... cho 4–10 vạch,
 * và luôn chừa khoảng trống phía trên cột cao nhất để dễ kéo thả.
 */
export function calculateNiceAxis(maxValue: number): {
  step: number;
  max: number;
  min: number;
  ticks: number[];
} {
  if (!(maxValue > 0)) maxValue = 5;

  const stepsPool = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
  let chosenStep = stepsPool[stepsPool.length - 1];
  for (const s of stepsPool) {
    const tickCount = Math.ceil(maxValue / s);
    if (tickCount <= 10) {
      chosenStep = s;
      break;
    }
  }

  // Strictly above the largest value (headroom), at least 5 for tiny data
  let max = (Math.floor(maxValue / chosenStep) + 1) * chosenStep;
  if (max < 5 && chosenStep === 1) max = 5;

  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += chosenStep) ticks.push(t);

  return { step: chosenStep, max, min: 0, ticks };
}

/**
 * Core computation engine.
 * Pure TypeScript, deterministic, follows SGK Toán 9 (KNTT) – Bài 22.
 */
export function computeStatistics(analysis: ProblemAnalysis): ComputedData {
  const warnings: string[] = [];

  let rawValues = analysis.rawValues || [];
  if (analysis.valueKind === 'categorical') {
    rawValues = fixHyphenatedVietnameseWords(rawValues);
  }

  let categories: string[] = [];
  let frequencies: number[] = [];
  let sampleSize = 0;

  const givenTable =
    analysis.frequencies &&
    analysis.frequencies.length > 0 &&
    analysis.categories &&
    analysis.categories.length === analysis.frequencies.length;

  if (givenTable && (analysis.sourceKind === 'freq_table' || analysis.sourceKind === 'freq_chart' || rawValues.length === 0)) {
    // Đề cho sẵn bảng tần số hoặc biểu đồ tần số
    categories = analysis.categories.map((c) => normalizeCategory(String(c)));
    frequencies = analysis.frequencies.map((n) => Math.round(Number(n) || 0));
    sampleSize = frequencies.reduce((a, b) => a + b, 0);
  } else if (rawValues.length > 0) {
    // Đếm từ dãy dữ liệu thô
    const allNumeric = rawValues.every((v) => parseVietnameseNumber(v) !== null);

    if (analysis.valueKind === 'numeric' && allNumeric) {
      const numMap = new Map<number, number>();
      for (const val of rawValues) {
        const num = parseVietnameseNumber(val)!;
        numMap.set(num, (numMap.get(num) || 0) + 1);
      }
      const sortedKeys = Array.from(numMap.keys()).sort((a, b) => a - b);
      categories = sortedKeys.map((k) => formatVietnameseNumber(k, 2));
      frequencies = sortedKeys.map((k) => numMap.get(k)!);
      sampleSize = rawValues.length;
    } else {
      // Dữ liệu không phải số (tên bạn, mức đánh giá, lựa chọn...)
      const freqMap = new Map<string, { count: number; originalDisplay: string }>();
      for (const val of rawValues) {
        const cleaned = normalizeCategory(val);
        if (!cleaned) continue;
        const lower = cleaned.toLowerCase();
        const entry = freqMap.get(lower);
        if (entry) entry.count++;
        else freqMap.set(lower, { count: 1, originalDisplay: cleaned });
      }
      sampleSize = Array.from(freqMap.values()).reduce((a, b) => a + b.count, 0);

      if (analysis.categories && analysis.categories.length > 0) {
        // Giữ thứ tự đề nêu (VD: Tốt, Khá, Trung bình, Kém)
        const used = new Set<string>();
        for (const cat of analysis.categories) {
          const lower = normalizeCategory(cat).toLowerCase();
          if (used.has(lower)) continue;
          used.add(lower);
          categories.push(normalizeCategory(cat));
          frequencies.push(freqMap.get(lower)?.count || 0);
        }
        // Giá trị có trong dữ liệu nhưng đề không liệt kê → nối thêm cuối
        for (const [lower, v] of freqMap.entries()) {
          if (!used.has(lower)) {
            categories.push(v.originalDisplay);
            frequencies.push(v.count);
          }
        }
      } else {
        // Thứ tự xuất hiện lần đầu
        categories = Array.from(freqMap.values()).map((v) => v.originalDisplay);
        frequencies = Array.from(freqMap.values()).map((v) => v.count);
      }
    }
  }

  if (analysis.statedSampleSize > 0 && sampleSize > 0 && analysis.statedSampleSize !== sampleSize) {
    warnings.push(`Có thể máy đọc sai số liệu: đề nêu ${analysis.statedSampleSize} nhưng đếm được ${sampleSize} giá trị.`);
  }

  const maxFreq = frequencies.length > 0 ? Math.max(...frequencies) : 5;
  const niceAxis = calculateNiceAxis(maxFreq);

  return {
    valueKind: analysis.valueKind,
    categories,
    frequencies,
    sampleSize,
    niceAxis,
    warnings,
  };
}

/** Phân họ dạng bài */
export function getDangBaiFamily(dangBai: string): 'table' | 'chart' | 'reading' {
  if (dangBai === 'TS1') return 'table';
  if (dangBai === 'TS2' || dangBai === 'TS3') return 'chart';
  return 'reading';
}

/**
 * Code-based fallback parser for typed text (extractDataSeries).
 * Tách dãy dữ liệu sau dấu ":" kéo dài nhiều dòng, tách theo dấu phẩy, chấm phẩy, xuống dòng.
 * Ghép lại từ bị ngắt dòng ("Trung" + "bình").
 */
export function extractDataSeries(text: string): {
  values: string[];
  isNumeric: boolean;
  sampleSize: number;
} {
  let targetText = text;
  const colonIndex = text.indexOf(':');
  if (colonIndex !== -1) {
    targetText = text.substring(colonIndex + 1);
  }

  // Remove subsequent part questions like a) b)
  const partCut = targetText.search(/(?:\n|\.\s*|\s+)[a-d]\)/i);
  if (partCut !== -1) {
    targetText = targetText.substring(0, partCut);
  }

  const rawTokens = targetText
    .split(/[,;\n\r\t]+/)
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter((s) => s.length > 0 && !s.match(/^[a-d]\)$/i));

  const tokens = fixHyphenatedVietnameseWords(rawTokens);

  let numericCount = 0;
  for (const t of tokens) {
    if (parseVietnameseNumber(t) !== null) numericCount++;
  }

  const isNumeric = tokens.length > 0 && numericCount / tokens.length >= 0.7;

  const values = isNumeric ? tokens.filter((t) => parseVietnameseNumber(t) !== null) : tokens;
  return {
    values,
    isNumeric,
    sampleSize: values.length,
  };
}

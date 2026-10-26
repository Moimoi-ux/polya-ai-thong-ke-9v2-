/**
 * CẦU NỐI GIỮA APP VÀ MODULE BÀI 22.
 *
 *  - reclassifyParts(): chạy sau khi AI phân tích đề – CODE xác định lại dạng của từng ý
 *    (tách ý có nhiều yêu cầu, gắn cờ "GV nên duyệt" / "chưa hỗ trợ").
 *  - buildModuleSteps(): sinh quy trình cho các kiểu câu hỏi do module phụ trách.
 *  - fillMissingFrequency(): khi đề thiếu đúng một tần số và cho cỡ mẫu, điền vào để các ý khác dùng.
 */
import type { ComputedData, ProblemAnalysis, ProblemPartAnalysis } from '../types.ts';
import type { PartResult } from './types.ts';
import { classifyPart } from './classify.ts';
import { buildPart } from './index.ts';
import { hintFromPart, toFreqTable } from './gemini.ts';
import { fold } from './textVi.ts';
import type { TemplateHooks } from './templates.ts';

/**
 * Các kiểu TS4 vẫn dùng khuôn cũ của app (đang chạy đúng, có hỗ trợ đề trắc nghiệm A–D).
 * Các kiểu còn lại của TS4 và TS5, TS6 dùng module mới.
 */
export const LEGACY_ASK_KINDS = ['max', 'min', 'value_freq'];

export function usesLegacyTemplate(p: { dangBai: string; askKind?: string }): boolean {
  return p.dangBai === 'TS1' || p.dangBai === 'TS2' || p.dangBai === 'TS3' || (p.dangBai === 'TS4' && LEGACY_ASK_KINDS.includes(p.askKind || ''));
}

/** CODE phân loại lại các ý của đề. */
export function reclassifyParts(analysis: ProblemAnalysis, computed: ComputedData): ProblemPartAnalysis[] {
  const table = toFreqTable(analysis, computed);
  type Item = ProblemPartAnalysis & { base: string; key: string };
  const items: Item[] = [];

  for (const p of analysis.parts || []) {
    const hint = hintFromPart(p);
    const base = String(p.label || 'a').split('.')[0];
    const specs = classifyPart(p.question || '', table, hint);
    for (const s of specs) {
      const key = [s.dang, s.askKind || '', s.chartKind || '', JSON.stringify(s.condition || ''), (s.targets || []).join('|'), fold(s.question)].join('#');
      const common = { base, key, question: s.question, ...(specs.length === 1 && hint ? { hint } : {}) };
      if (s.dang === 'OUT' || s.dang === 'UNKNOWN') {
        items.push({
          ...common,
          label: base,
          dangBai: 'TS4',
          chartKind: 'none',
          codeStatus: 'unsupported',
          codeNote: s.dang === 'OUT' ? `Ngoài phạm vi Bài 22: ${s.reason}` : 'Chưa nhận ra dạng câu hỏi – không tự sinh quy trình để tránh hướng dẫn sai.',
        });
        continue;
      }
      items.push({
        ...common,
        label: base,
        dangBai: s.dang,
        chartKind: s.dang === 'TS2' ? 'bar' : s.dang === 'TS3' ? 'line' : 'none',
        ...(s.askKind ? { askKind: s.askKind } : {}),
        ...(s.askKind === 'value_freq' && s.targets?.[0] ? { targetValue: s.targets[0] } : {}),
        codeStatus: s.source === 'ai' || s.confidence === 'low' ? 'needs_review' : 'ok',
        codeNote: s.reason,
      });
    }
  }

  // Bỏ yêu cầu trùng (AI đã tách ý rồi, code tách thêm lần nữa)
  const seen = new Set<string>();
  const uniq = items.filter((it) => (seen.has(it.key) ? false : (seen.add(it.key), true)));

  // Đánh nhãn lại: một yêu cầu → "b"; nhiều yêu cầu cùng ý → "b.1", "b.2"
  const count = new Map<string, number>();
  uniq.forEach((it) => count.set(it.base, (count.get(it.base) || 0) + 1));
  const idx = new Map<string, number>();
  return uniq.map(({ base, key: _k, ...rest }) => {
    const n = (idx.get(base) || 0) + 1;
    idx.set(base, n);
    return { ...rest, label: (count.get(base) || 0) > 1 ? `${base}.${n}` : base };
  });
}

/** Đề thiếu đúng một tần số và có cỡ mẫu → điền tần số đó (để các ý vẽ biểu đồ, đọc bảng... dùng đúng số liệu). */
export function fillMissingFrequency(analysis: ProblemAnalysis, computed: ComputedData): ComputedData | null {
  const t = toFreqTable(analysis, computed);
  const miss = t.frequencies.map((f, i) => (f === null ? i : -1)).filter((i) => i >= 0);
  if (miss.length !== 1 || t.statedSampleSize <= 0) return null;
  const known = t.frequencies.reduce<number>((a, f) => a + (f ?? 0), 0);
  const x = t.statedSampleSize - known;
  if (x < 0) return null;
  const frequencies = computed.frequencies.map((f, i) => (i === miss[0] ? x : f));
  return { ...computed, frequencies, sampleSize: frequencies.reduce((a, b) => a + b, 0) };
}

/** Sinh quy trình cho một ý do module phụ trách. */
export function buildModuleSteps(
  part: ProblemPartAnalysis,
  analysis: ProblemAnalysis,
  computed: ComputedData,
  filled: ComputedData | null,
  hooks: TemplateHooks
): PartResult[] {
  // Ý TS5 cần thấy ô trống; các ý khác dùng bảng đã điền
  const table = part.dangBai === 'TS5' || !filled ? toFreqTable(analysis, computed) : { ...toFreqTable(analysis, filled), frequencies: filled.frequencies };
  return buildPart(part.label, part.question, table, { aiHint: part.hint ? hintFromPart(part) : null, hooks });
}

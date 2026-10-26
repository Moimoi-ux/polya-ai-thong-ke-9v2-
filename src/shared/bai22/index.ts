/**
 * ĐIỂM VÀO CỦA MODULE BÀI 22.
 *
 *   AI (Gemini)  → chỉ CHÉP đề: số liệu, đối tượng, đơn vị, câu hỏi từng ý (+ gợi ý phân loại)
 *   classify.ts  → CODE xác định dạng bài và tham số
 *   solve.ts     → CODE tính đáp án
 *   templates.ts → CODE dựng quy trình 4 bước Pólya
 *   validate.ts  → CODE kiểm tra; quy trình sai thì không lưu, báo giáo viên
 */
import type { AiHint, FreqTable, PartResult, QuestionSpec } from './types.ts';
import { classifyPart } from './classify.ts';
import { makeData, solve } from './solve.ts';
import { buildSteps, type TemplateHooks } from './templates.ts';
import { validateSteps } from './validate.ts';
import { askLabel, dangLabel } from './catalog.ts';

export * from './types.ts';
export { classifyPart } from './classify.ts';
export { solve } from './solve.ts';
export { DANG_BAI, ASK_KINDS, dangLabel, askLabel } from './catalog.ts';

export interface BuildOptions {
  aiHint?: AiHint | null;
  hooks?: TemplateHooks;
}

function describe(s: QuestionSpec): string {
  return s.dang === 'TS4' && s.askKind ? `${dangLabel(s.dang)} – ${askLabel(s.askKind)}` : dangLabel(s.dang);
}

/** Sinh quy trình cho một ý của đề. Một ý có thể tách thành nhiều yêu cầu (a1, a2...). */
export function buildPart(label: string, question: string, table: FreqTable, opts: BuildOptions = {}): PartResult[] {
  const specs = classifyPart(question, table, opts.aiHint);
  const N = makeData(table).N;

  return specs.map((spec, i) => {
    const L = specs.length > 1 ? `${label}${i + 1}` : label;
    const notes: string[] = [`Dạng: ${describe(spec)}. ${spec.reason}`];

    if (spec.dang === 'OUT') return { label: L, spec, status: 'out_of_scope', notes: [`Ngoài phạm vi Bài 22: ${spec.reason}`] };
    if (spec.dang === 'UNKNOWN') {
      return { label: L, spec, status: 'unsupported', notes: ['Chưa nhận ra dạng câu hỏi – không tự sinh quy trình để tránh hướng dẫn sai. Giáo viên kiểm tra lại đề.'] };
    }
    if (spec.dang === 'TS1' || spec.dang === 'TS2' || spec.dang === 'TS3') {
      return { label: L, spec, status: 'delegate', notes };
    }

    const r = solve(spec, table);
    if (!r.ok) return { label: L, spec, status: 'invalid_data', notes: [...notes, r.error] };

    let steps;
    try {
      steps = buildSteps(L, spec, r.answer, table, opts.hooks);
    } catch (err) {
      return { label: L, spec, status: 'unsupported', answer: r.answer, notes: [...notes, `Lỗi dựng quy trình: ${(err as Error).message}`] };
    }
    const errs = validateSteps(steps, spec, r.answer, N);
    if (errs.length) {
      return { label: L, spec, status: 'unsupported', answer: r.answer, notes: [...notes, 'Quy trình không qua bước kiểm tra:', ...errs] };
    }
    const review = spec.source === 'ai' || spec.confidence === 'low';
    if (spec.confidence === 'medium') notes.push('Độ tin cậy trung bình – nên xem lại cách hiểu đề.');
    return { label: L, spec, status: review ? 'needs_review' : 'ok', answer: r.answer, steps, notes };
  });
}

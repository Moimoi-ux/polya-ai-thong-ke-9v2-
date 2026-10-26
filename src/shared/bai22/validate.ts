/**
 * CHỐT KIỂM TRA trước khi lưu quy trình vào Thư viện.
 * Quy trình nào không qua được thì KHÔNG lưu và báo cho giáo viên (thay vì lưu một quy trình sai).
 */
import type { Answer, Interaction, PolyaStep, QuestionSpec } from './types.ts';

export function validateSteps(steps: PolyaStep[], spec: QuestionSpec, answer: Answer, N: number): string[] {
  const errs: string[] = [];
  const e = (m: string) => errs.push(m);

  if (steps.length !== 4) e(`Phải có 4 bước (đang có ${steps.length}).`);
  steps.forEach((s, i) => {
    if (s.stepNo !== i + 1) e(`Bước ${i + 1} đánh số sai.`);
    if (!s.mainTasks.length) e(`Bước ${i + 1} không có nhiệm vụ.`);
    if (!s.preHintQuiz) e(`Bước ${i + 1} thiếu câu hỏi gợi mở.`);
  });

  const ids = new Set<string>();
  const all: Interaction[] = steps.flatMap((s) => [...s.mainTasks, s.preHintQuiz]);
  for (const t of all) {
    if (ids.has(t.id)) e(`Trùng id nhiệm vụ: ${t.id}`);
    ids.add(t.id);
    if (!t.prompt?.trim()) e(`${t.id}: thiếu câu hỏi.`);
    if (t.type === 'mcq') {
      if (t.options.length < 2) e(`${t.id}: trắc nghiệm cần ít nhất 2 lựa chọn.`);
      if (!t.options.some((o) => o.id === t.correctOptionId)) e(`${t.id}: không có đáp án đúng.`);
      const texts = t.options.map((o) => o.text.trim().toLowerCase());
      if (new Set(texts).size !== texts.length) e(`${t.id}: có lựa chọn trùng nhau.`);
      if (texts.some((x) => !x)) e(`${t.id}: có lựa chọn rỗng.`);
    }
    if (t.type === 'ordering') {
      const a = new Set(t.items.map((i) => i.id));
      if (t.correctOrder.length !== a.size || !t.correctOrder.every((id) => a.has(id))) e(`${t.id}: thứ tự đúng không khớp các bước.`);
    }
    if (t.type === 'numeric' && !Number.isFinite(t.correctValue)) e(`${t.id}: đáp số không hợp lệ.`);
    if (t.type === 'table_fill') {
      t.matrix.flat().forEach((c) => {
        if (c.isEditable && (!c.expectedValue || !Number.isFinite(Number(String(c.expectedValue).replace(',', '.'))))) e(`${t.id}: ô (${c.row},${c.col}) thiếu đáp án.`);
      });
    }
  }

  // Bước 3 phải có đúng một nhiệm vụ chứa đáp án cuối và đáp án đó khớp với code tính
  const finals = steps[2]?.mainTasks.filter((t) => t.isFinalAnswer) || [];
  if (finals.length !== 1) e(`Bước 3 phải có đúng 1 nhiệm vụ đáp án cuối (đang có ${finals.length}).`);
  const f = finals[0];
  if (f) {
    if (f.type === 'numeric') {
      if (answer.number === undefined || Math.abs(f.correctValue - answer.number) > (f.tolerance || 0) + 1e-9) {
        e(`Đáp số ở Bước 3 (${f.correctValue}) không khớp kết quả code tính (${answer.number}).`);
      }
    } else if (f.type === 'mcq' && answer.categories?.length && spec.askKind !== 'remark') {
      const txt = f.options.find((o) => o.id === f.correctOptionId)?.text.toLowerCase() || '';
      for (const c of answer.categories) if (!txt.includes(c.toLowerCase())) e(`Đáp án trắc nghiệm ở Bước 3 thiếu "${c}".`);
    }
  }

  // Chống lặp lại lỗi cũ: câu "đề hỏi gì" không được là "tần số lớn/nhỏ nhất" nếu không phải dạng đó
  const goal = steps[0]?.mainTasks.find((t) => t.id.endsWith('-s1-goal'));
  if (goal && goal.type === 'mcq' && spec.dang === 'TS4' && spec.askKind !== 'max' && spec.askKind !== 'min') {
    const g = goal.options.find((o) => o.id === goal.correctOptionId)?.text || '';
    if (/tần số (lớn|nhỏ) nhất/.test(g)) e('Câu "đề hỏi gì" bị gán sai thành "tần số lớn/nhỏ nhất".');
  }

  // Số liệu hợp lý
  if (answer.number !== undefined) {
    if (answer.number < 0) e('Đáp số âm.');
    const countKinds = ['count_condition', 'count_set', 'value_freq', 'sample_size'];
    if (spec.askKind && countKinds.includes(spec.askKind) && answer.number > N) e(`Đáp số ${answer.number} lớn hơn cỡ mẫu ${N}.`);
  }

  const json = JSON.stringify(steps);
  if (/undefined|NaN|null|Infinity/.test(json)) e('Có "undefined"/"NaN"/"null" lọt vào nội dung.');
  return errs;
}

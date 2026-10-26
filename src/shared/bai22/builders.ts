/** Hàm dựng nhiệm vụ (khớp cấu trúc dữ liệu của app). */
import type {
  HintSet,
  McqInteraction,
  NumericInteraction,
  OrderingInteraction,
  TableCell,
  TableFillInteraction,
} from './types.ts';
import { fmtNum } from './textVi.ts';

/** Băm chuỗi → số (để xáo trộn cố định theo id, mỗi lần sinh ra giống nhau) */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(arr: T[], seed: string): T[] {
  const a = [...arr];
  let x = hash(seed) || 1;
  for (let i = a.length - 1; i > 0; i--) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Choice {
  text: string;
  feedback: string;
}

export function mcq(o: {
  id: string;
  prompt: string;
  correct: Choice;
  wrongs: Choice[];
  hints: HintSet;
  successMsg?: string;
  weight?: number;
  isFinalAnswer?: boolean;
  maxOptions?: number;
}): McqInteraction {
  const norm = (s: string) => s.trim().toLowerCase();
  const seen = new Set([norm(o.correct.text)]);
  const wrongs: Choice[] = [];
  for (const w of o.wrongs) {
    if (!w.text || seen.has(norm(w.text))) continue;
    seen.add(norm(w.text));
    wrongs.push(w);
    if (wrongs.length >= (o.maxOptions ?? 4) - 1) break;
  }
  const all = shuffle([{ ...o.correct, ok: true }, ...wrongs.map((w) => ({ ...w, ok: false }))], o.id);
  const options = all.map((c, i) => ({ id: `opt${i + 1}`, text: c.text, feedback: c.feedback }));
  const correctOptionId = options[all.findIndex((c) => c.ok)].id;
  return {
    id: o.id,
    type: 'mcq',
    prompt: o.prompt,
    options,
    correctOptionId,
    hints: o.hints,
    successMsg: o.successMsg ?? 'Chính xác!',
    weight: o.weight ?? 1,
    ...(o.isFinalAnswer ? { isFinalAnswer: true } : {}),
  };
}

export function numeric(o: {
  id: string;
  prompt: string;
  value: number;
  hints: HintSet;
  unit?: string;
  placeholder?: string;
  successMsg?: string;
  weight?: number;
  tolerance?: number;
  isFinalAnswer?: boolean;
  commonErrors?: { value: number; feedback: string }[];
}): NumericInteraction {
  const errs = (o.commonErrors || []).filter(
    (e, i, arr) => isFinite(e.value) && e.value !== o.value && arr.findIndex((x) => x.value === e.value) === i
  );
  return {
    id: o.id,
    type: 'numeric',
    prompt: o.prompt,
    correctValue: o.value,
    tolerance: o.tolerance ?? 0,
    unit: o.unit ?? '',
    placeholder: o.placeholder ?? 'Nhập kết quả...',
    hints: o.hints,
    successMsg: o.successMsg ?? `Chính xác! Kết quả là ${fmtNum(o.value)}.`,
    weight: o.weight ?? 1,
    ...(errs.length ? { commonErrors: errs } : {}),
    ...(o.isFinalAnswer ? { isFinalAnswer: true } : {}),
  };
}

export function ordering(o: {
  id: string;
  prompt: string;
  steps: string[];
  hints: HintSet;
  successMsg?: string;
}): OrderingInteraction {
  const items = o.steps.map((text, i) => ({ id: `p${i + 1}`, text }));
  let shown = shuffle(items, o.id);
  if (shown.every((it, i) => it.id === items[i].id)) shown = [...items].reverse();
  return {
    id: o.id,
    type: 'ordering',
    prompt: o.prompt,
    items: shown,
    correctOrder: items.map((i) => i.id),
    hints: o.hints,
    successMsg: o.successMsg ?? 'Rất tốt! Kế hoạch giải hợp lý.',
    weight: 1,
  };
}

/** Bảng điền số: mỗi hàng là một giá trị; cột "given" cho sẵn, cột "fill" học sinh điền */
export function tableFill(o: {
  id: string;
  prompt: string;
  headers: string[];
  rows: { cells: (string | { expect: number })[] }[];
  hints: HintSet;
  successMsg?: string;
  weight?: number;
  isFinalAnswer?: boolean;
}): TableFillInteraction {
  const matrix: TableCell[][] = o.rows.map((r, row) =>
    r.cells.map((c, col) =>
      typeof c === 'string'
        ? { row, col, value: c, isEditable: false }
        : { row, col, value: '', isEditable: true, expectedValue: fmtNum(c.expect) }
    )
  );
  return {
    id: o.id,
    type: 'table_fill',
    prompt: o.prompt,
    headers: o.headers,
    matrix,
    orientation: 'horizontal',
    hints: o.hints,
    successMsg: o.successMsg ?? 'Tuyệt vời! Em đã điền đúng.',
    weight: o.weight ?? 2,
    ...(o.isFinalAnswer ? { isFinalAnswer: true } : {}),
  };
}

/** Sinh các đáp số sai "hợp lý" cho trắc nghiệm số */
export function numberDistractors(correct: number, candidates: number[], min = 0): number[] {
  const out: number[] = [];
  for (const c of candidates) {
    if (isFinite(c) && c >= min && c !== correct && !out.includes(c)) out.push(c);
  }
  let k = 1;
  while (out.length < 3 && k < 50) {
    for (const c of [correct + k, correct - k]) {
      if (c >= min && c !== correct && !out.includes(c) && out.length < 3) out.push(c);
    }
    k++;
  }
  return out;
}

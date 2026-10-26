/**
 * BỘ TÍNH ĐÁP ÁN – mọi con số trong quy trình đều lấy từ đây, không lấy từ AI.
 */
import type { Answer, Condition, FreqTable, QuestionSpec } from './types.ts';
import { answerFromQuestion, capitalize, fmtNum, fold, joinVi, parseNum, withUnit } from './textVi.ts';

export interface Data {
  t: FreqTable;
  cats: string[];
  freqs: number[]; // tần số đã biết (ô thiếu = 0, xem `missing`)
  missing: number[]; // chỉ số các ô thiếu
  nums: number[]; // giá trị số (NaN nếu không phải số)
  numeric: boolean;
  N: number; // tổng các tần số đã biết
}

export function makeData(t: FreqTable): Data {
  const nums = t.categories.map((c) => {
    const v = parseNum(fold(c));
    return v === null ? NaN : v;
  });
  const missing = t.frequencies.map((f, i) => (f === null ? i : -1)).filter((i) => i >= 0);
  const freqs = t.frequencies.map((f) => (f === null ? 0 : f));
  return {
    t,
    cats: t.categories,
    freqs,
    missing,
    nums,
    numeric: t.valueKind === 'numeric' && nums.every((n) => !isNaN(n)),
    N: freqs.reduce((a, b) => a + b, 0),
  };
}

// ───────────────────────── Điều kiện ─────────────────────────

export function testCond(x: number, c: Condition): boolean {
  const base = testOne(x, c);
  if (!c.join) return base;
  return c.join.type === 'and' ? base && testCond(x, c.join.cond) : base || testCond(x, c.join.cond);
}

function testOne(x: number, c: Condition): boolean {
  switch (c.op) {
    case 'gte': return x >= c.a;
    case 'gt': return x > c.a;
    case 'lte': return x <= c.a;
    case 'lt': return x < c.a;
    case 'eq': return x === c.a;
    case 'between': return x >= c.a && x <= (c.b ?? c.a);
  }
}

/** "≥ 3" */
export function condSymbol(c: Condition, unit = ''): string {
  const u = unit ? ` ${unit}` : '';
  const sym = { gte: '≥', gt: '>', lte: '≤', lt: '<', eq: '=' } as const;
  const one = c.op === 'between' ? `${fmtNum(c.a)} ≤ … ≤ ${fmtNum(c.b ?? c.a)}${u}` : `${sym[c.op]} ${fmtNum(c.a)}${u}`;
  if (!c.join) return one;
  return `${one} ${c.join.type === 'and' ? 'và' : 'hoặc'} ${condSymbol(c.join.cond, unit)}`;
}

/** "từ 3 năm trở lên" – diễn đạt lại điều kiện bằng lời */
export function condWords(c: Condition, unit = ''): string {
  if (c.join) {
    const strip = (w: string) => w.replace(/ \(.*\)$/, '');
    return `${strip(condWords({ ...c, join: undefined }, unit))} ${c.join.type === 'and' ? 'và' : 'hoặc'} ${strip(condWords(c.join.cond, unit))}`;
  }
  const u = unit ? ` ${unit}` : '';
  const a = fmtNum(c.a);
  switch (c.op) {
    case 'gte': return `từ ${a}${u} trở lên (lấy cả ${a})`;
    case 'gt': return `lớn hơn ${a}${u} (không lấy ${a})`;
    case 'lte': return `từ ${a}${u} trở xuống (lấy cả ${a})`;
    case 'lt': return `nhỏ hơn ${a}${u} (không lấy ${a})`;
    case 'eq': return `đúng bằng ${a}${u}`;
    case 'between': return `từ ${a} đến ${fmtNum(c.b ?? c.a)}${u} (lấy cả hai đầu)`;
  }
}

/** Điều kiện ngược lại (dùng ở Bước 4: kiểm tra bằng phần bù) */
export function complement(c: Condition): Condition | null {
  const inv = { gte: 'lt', gt: 'lte', lte: 'gt', lt: 'gte' } as const;
  if (c.op === 'between' || c.op === 'eq' || c.join) return null;
  return { ...c, op: inv[c.op], phrase: '' };
}

const sumText = (xs: number[]) => (xs.length ? xs.map(fmtNum).join(' + ') : '0');

// ───────────────────────── Tính đáp án ─────────────────────────

export type SolveResult = { ok: true; answer: Answer } | { ok: false; error: string };

export function solve(s: QuestionSpec, t: FreqTable): SolveResult {
  const d = makeData(t);
  const u = t.donVi;
  const name = (c: string) => withUnit(c, u);
  const doi = t.doiTuong || 'đối tượng';
  const q = s.question;
  const err = (e: string): SolveResult => ({ ok: false, error: e });
  const ok = (a: Answer): SolveResult => ({ ok: true, answer: a });

  if (s.dang === 'TS5') {
    if (d.missing.length !== 1) return err(`Cần đúng một tần số chưa biết (đang có ${d.missing.length}).`);
    if (t.statedSampleSize < 0) return err('Đề không cho cỡ mẫu N nên không tìm được tần số còn thiếu.');
    const known = d.freqs.filter((_, i) => i !== d.missing[0]);
    const x = t.statedSampleSize - d.N;
    if (x < 0) return err(`Tổng các tần số đã biết (${d.N}) lớn hơn cỡ mẫu (${t.statedSampleSize}): số liệu mâu thuẫn.`);
    const cat = d.cats[d.missing[0]];
    return ok({
      number: x,
      categories: [cat],
      working: `${t.statedSampleSize} − (${sumText(known)}) = ${t.statedSampleSize} − ${d.N} = ${x}`,
      sentence: `Tần số của giá trị ${name(cat)} là ${x}.`,
    });
  }
  if (d.missing.length) return err('Bảng còn tần số chưa biết – cần tìm trước (dạng TS5).');

  if (s.dang === 'TS6') {
    const cl = t.claimedFrequencies || [];
    const wrong = d.cats.map((_, i) => i).filter((i) => cl[i] !== d.freqs[i]);
    const who = t.claimedBy ? `bạn ${t.claimedBy}` : 'bạn';
    if (!wrong.length) {
      return ok({ number: 0, categories: [], working: 'Mọi tần số đều khớp.', sentence: `Bảng tần số của ${who} lập đúng.` });
    }
    return ok({
      number: wrong.length,
      categories: wrong.map((i) => d.cats[i]),
      working: wrong.map((i) => `${name(d.cats[i])}: ${who} ghi ${cl[i] ?? '(bỏ trống)'}, đúng là ${d.freqs[i]}`).join('; '),
      sentence: `Bảng của ${who} sai ở ${joinVi(wrong.map((i) => name(d.cats[i])))}. Sửa lại: ${wrong.map((i) => `${name(d.cats[i])} có tần số ${d.freqs[i]}`).join(', ')}.`,
    });
  }

  if (s.dang !== 'TS4' || !s.askKind) return err('Không phải câu hỏi đọc – phân tích.');

  const idxOf = (cat: string) => d.cats.indexOf(cat);

  switch (s.askKind) {
    case 'max':
    case 'min': {
      const isMax = s.askKind === 'max';
      const ext = isMax ? Math.max(...d.freqs) : Math.min(...d.freqs);
      const cats = d.cats.filter((_, i) => d.freqs[i] === ext);
      const list = joinVi(cats.map(name));
      return ok({
        number: ext,
        categories: cats,
        working: `Tần số ${isMax ? 'lớn' : 'nhỏ'} nhất là ${ext}, ứng với ${list}.`,
        sentence: answerFromQuestion(q, list, `${capitalize(list)} xuất hiện ${isMax ? 'nhiều' : 'ít'} nhất (tần số ${ext}).`),
      });
    }
    case 'value_freq': {
      const i = idxOf(s.targets?.[0] ?? '');
      if (i < 0) return err('Không tìm thấy giá trị được hỏi trong bảng.');
      return ok({
        number: d.freqs[i],
        categories: [d.cats[i]],
        working: `Tần số của ${name(d.cats[i])} là ${d.freqs[i]}.`,
        sentence: answerFromQuestion(q, String(d.freqs[i]), `Có ${d.freqs[i]} ${doi} ứng với giá trị ${name(d.cats[i])}.`),
      });
    }
    case 'sample_size': {
      return ok({
        number: d.N,
        working: `N = ${sumText(d.freqs)} = ${d.N}`,
        sentence: answerFromQuestion(q, String(d.N), `Có tất cả ${d.N} ${doi}.`),
      });
    }
    case 'count_condition': {
      const c = s.condition!;
      if (!d.numeric) return err('Điều kiện so sánh chỉ dùng được với dữ liệu là số.');
      const idx = d.cats.map((_, i) => i).filter((i) => testCond(d.nums[i], c));
      const parts = idx.map((i) => d.freqs[i]);
      const S = parts.reduce((a, b) => a + b, 0);
      return ok({
        number: S,
        usedCategories: idx.map((i) => d.cats[i]),
        working: idx.length ? `${sumText(parts)} = ${S}` : `Không có giá trị nào thỏa điều kiện, nên kết quả là 0.`,
        sentence: answerFromQuestion(q, String(S), `Có ${S} ${doi} có giá trị ${condWords(c, u)}.`),
      });
    }
    case 'count_set': {
      const idx = (s.targets || []).map(idxOf).filter((i) => i >= 0);
      if (idx.length < 2) return err('Cần ít nhất hai giá trị để cộng.');
      const parts = idx.map((i) => d.freqs[i]);
      const S = parts.reduce((a, b) => a + b, 0);
      return ok({
        number: S,
        usedCategories: idx.map((i) => d.cats[i]),
        working: `${sumText(parts)} = ${S}`,
        sentence: answerFromQuestion(q, String(S), `Có ${S} ${doi}.`),
      });
    }
    case 'values_by_freq': {
      const c = s.condition!;
      const idx = d.cats.map((_, i) => i).filter((i) => testCond(d.freqs[i], c));
      const cats = idx.map((i) => d.cats[i]);
      const list = cats.length ? joinVi(cats.map(name)) : 'không có giá trị nào';
      if (s.answerStyle === 'count') {
        return ok({
          number: cats.length,
          categories: cats,
          working: `Các giá trị có tần số ${condSymbol(c)}: ${list}. Đếm được ${cats.length} giá trị.`,
          sentence: answerFromQuestion(q, String(cats.length), `Có ${cats.length} giá trị (${list}).`),
        });
      }
      return ok({
        categories: cats,
        working: `Các giá trị có tần số ${condSymbol(c)}: ${list}.`,
        sentence: answerFromQuestion(q, list, `${capitalize(list)}.`),
      });
    }
    case 'compare': {
      const [a, b] = (s.targets || []).map(idxOf);
      if (a === undefined || b === undefined || a < 0 || b < 0) return err('Cần hai giá trị để so sánh.');
      const fa = d.freqs[a];
      const fb = d.freqs[b];
      const A = name(d.cats[a]);
      const Bn = name(d.cats[b]);
      if (s.compareMode === 'ratio') {
        if (fb === 0) return err(`Tần số của ${Bn} bằng 0, không so sánh "gấp mấy lần" được.`);
        const r = fa / fb;
        return ok({
          number: Math.round(r * 100) / 100,
          categories: [d.cats[a], d.cats[b]],
          working: `${fa} : ${fb} = ${fmtNum(r)}`,
          sentence: answerFromQuestion(q, fmtNum(r), `Số ${doi} ứng với ${A} gấp ${fmtNum(r)} lần số ${doi} ứng với ${Bn}.`),
        });
      }
      if (s.compareMode === 'which_more') {
        const more = fa === fb ? null : fa > fb ? A : Bn;
        return ok({
          categories: more ? [fa > fb ? d.cats[a] : d.cats[b]] : [d.cats[a], d.cats[b]],
          number: Math.abs(fa - fb),
          working: `${A}: ${fa}; ${Bn}: ${fb}.`,
          sentence: more ? `${capitalize(more)} có nhiều ${doi} hơn (${Math.max(fa, fb)} so với ${Math.min(fa, fb)}).` : `Hai giá trị có số ${doi} bằng nhau (${fa}).`,
        });
      }
      const diff = Math.abs(fa - fb);
      return ok({
        number: diff,
        categories: [d.cats[a], d.cats[b]],
        working: `${Math.max(fa, fb)} − ${Math.min(fa, fb)} = ${diff}`,
        sentence: answerFromQuestion(q, String(diff), `Hai giá trị chênh lệch nhau ${diff} ${doi}.`),
      });
    }
    case 'distinct_count':
      return ok({
        number: d.cats.length,
        categories: d.cats,
        working: `Các giá trị khác nhau: ${joinVi(d.cats.map(name))} → ${d.cats.length} giá trị.`,
        sentence: answerFromQuestion(q, String(d.cats.length), `Có ${d.cats.length} giá trị khác nhau.`),
      });
    case 'list_values':
      return ok({
        categories: d.cats,
        working: `Các giá trị: ${joinVi(d.cats.map(name))}.`,
        sentence: `Các giá trị là ${joinVi(d.cats.map(name))}.`,
      });
    case 'value_max':
    case 'value_min': {
      if (!d.numeric) return err('Dữ liệu không phải số, không có giá trị lớn nhất/nhỏ nhất.');
      const present = d.cats.map((_, i) => i).filter((i) => d.freqs[i] > 0);
      const vals = present.map((i) => d.nums[i]);
      const v = s.askKind === 'value_max' ? Math.max(...vals) : Math.min(...vals);
      const cat = d.cats[present[vals.indexOf(v)]];
      return ok({
        number: v,
        categories: [cat],
        working: `So sánh các giá trị ${joinVi(present.map((i) => d.cats[i]))} → ${s.askKind === 'value_max' ? 'lớn' : 'nhỏ'} nhất là ${cat}.`,
        sentence: answerFromQuestion(q, fmtNum(v), `Giá trị ${s.askKind === 'value_max' ? 'lớn' : 'nhỏ'} nhất là ${name(cat)}.`),
      });
    }
    case 'sum_values': {
      if (!d.numeric) return err('Dữ liệu không phải số, không tính tổng các giá trị được.');
      const prods = d.cats.map((_, i) => d.nums[i] * d.freqs[i]);
      const S = prods.reduce((a, b) => a + b, 0);
      return ok({
        number: S,
        working: `${d.cats.map((c, i) => `${c}·${d.freqs[i]}`).join(' + ')} = ${sumText(prods)} = ${fmtNum(S)}`,
        sentence: answerFromQuestion(q, fmtNum(S), `Tổng cộng là ${fmtNum(S)} ${u}.`),
      });
    }
    case 'remark': {
      const mx = Math.max(...d.freqs);
      const mn = Math.min(...d.freqs);
      const maxCats = d.cats.filter((_, i) => d.freqs[i] === mx).map(name);
      const minCats = d.cats.filter((_, i) => d.freqs[i] === mn).map(name);
      return ok({
        categories: d.cats.filter((_, i) => d.freqs[i] === mx),
        working: `N = ${d.N}; tần số lớn nhất ${mx} (${joinVi(maxCats)}); nhỏ nhất ${mn} (${joinVi(minCats)}).`,
        sentence: `Trong ${d.N} ${doi}, ${joinVi(maxCats)} chiếm nhiều nhất (${mx}), ${joinVi(minCats)} ít nhất (${mn}).`,
      });
    }
  }
  return err('Chưa hỗ trợ kiểu câu hỏi này.');
}

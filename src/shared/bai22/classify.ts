/**
 * BỘ PHÂN LOẠI CÂU HỎI BẰNG CODE (không để AI quyết định dạng bài / đáp án).
 *
 * Đầu vào: câu hỏi của một ý + thông tin bảng tần số (đã được AI chép lại và code chuẩn hóa).
 * Đầu ra: QuestionSpec – dạng bài, kiểu câu hỏi và tham số (điều kiện, giá trị được hỏi...).
 *
 * Nguyên tắc:
 *  1. Luật bằng code chạy trước, theo thứ tự ưu tiên cố định.
 *  2. "ít nhất / nhiều nhất" KÈM SỐ là điều kiện (≥ / ≤), KHÔNG phải tần số lớn/nhỏ nhất.
 *  3. Gợi ý của AI chỉ dùng khi luật không nhận ra, và khi đó quy trình bị gắn cờ "GV cần duyệt".
 *  4. Không nhận ra thì trả về UNKNOWN – tuyệt đối không "đoán" thành dạng max như trước.
 */
import type { AiHint, AskKind, Condition, CondOp, FreqTable, QuestionSpec } from './types.ts';
import { NUM_RE, fold, origPhrase, parseNum } from './textVi.ts';
import { OUT_OF_SCOPE } from './catalog.ts';

const ASK_KINDS: AskKind[] = [
  'max', 'min', 'value_freq', 'sample_size', 'count_condition', 'count_set', 'values_by_freq',
  'compare', 'distinct_count', 'list_values', 'value_max', 'value_min', 'sum_values', 'remark',
];

// ───────────────────────── Chuẩn bị ngữ cảnh ─────────────────────────

interface Ctx {
  t: FreqTable;
  numeric: boolean;
  /** giá trị số của từng category (NaN nếu không phải số) */
  nums: number[];
  doi: string; //   đối tượng – cụm danh từ chính (bỏ dấu), VD "ban nam"
  /** các cách gọi ngắn của đối tượng, dài trước: ["ban nam", "ban"] */
  doiHeads: string[];
  donVi: string; // đơn vị giá trị (bỏ dấu)
}

/** "các bạn nam trong lớp" → ["ban nam trong lop"?, "ban nam", "ban"] (bỏ lượng từ, bỏ phần bổ nghĩa) */
export function doiHeads(doiTuong: string): string[] {
  let f = fold(doiTuong).replace(/^(cac|nhung|moi|tat ca|toan bo|so)\s+/, '');
  f = f.split(/\s+(?:trong|cua|o|tai|thuoc|duoc|da|lop|truong|khoi|nam hoc|tham gia)\b/)[0].trim();
  const w = f.split(' ').filter(Boolean);
  const weak = ['gia', 'hoc', 'so', 'con', 'nam', 'diem', 'nhan', 'tre', 'ngay'];
  const heads = [f, w.slice(0, 2).join(' '), w[0] && w[0].length >= 3 && !weak.includes(w[0]) ? w[0] : ''];
  return [...new Set(heads.filter(Boolean))];
}

function startsWithAny(u: string, heads: string[]): string {
  return heads.find((h) => u.startsWith(` ${h} `)) || '';
}

function makeCtx(t: FreqTable): Ctx {
  const nums = t.categories.map((c) => {
    const v = parseNum(fold(c));
    return v === null ? NaN : v;
  });
  const heads = doiHeads(t.doiTuong);
  return {
    t,
    numeric: t.valueKind === 'numeric' && nums.every((n) => !isNaN(n)),
    nums,
    doi: heads[0] || '',
    doiHeads: heads,
    donVi: fold(t.donVi),
  };
}

/** Thay tên các giá trị không phải số bằng ký hiệu @c0, @c1... để không bị đọc nhầm
 *  (VD "Thứ năm" chứa chữ "năm", "Trung bình" chứa "trung bình"). */
function maskCategories(f: string, c: Ctx): string {
  if (c.numeric) return f;
  const order = c.t.categories
    .map((cat, i) => ({ k: fold(cat), i }))
    .filter((x) => x.k)
    .sort((a, b) => b.k.length - a.k.length);
  let s = ` ${f} `;
  for (const { k, i } of order) {
    const p = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`(^|[^a-z0-9@])${p}(?=$|[^a-z0-9])`, 'g'), `$1@c${i}`);
  }
  return s.trim();
}

// ───────────────────────── Tách ý có nhiều yêu cầu ─────────────────────────

const VERB = String.raw`(?:hãy\s+)?(?:cho biết|tìm|tính|vẽ|nêu|xác định|nhận xét|lập|trả lời|so sánh|kiểm tra|liệt kê|đếm)`;

/** "Lập bảng tần số và cho biết cỡ giày nào..." → ["Lập bảng tần số", "cho biết cỡ giày nào..."] */
export function splitCompound(question: string): string[] {
  const q = question.trim().replace(/^\(?[a-hA-H]\)\s*/, '');
  const sentences = q
    .split(/(?<=[?.!])\s+(?=\p{Lu}|\p{Ll})/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const s of sentences) {
    const pieces = s.split(new RegExp(`\\s*[,;]?\\s+(?:và|rồi|sau đó|từ đó)\\s+(?=${VERB}\\b)`, 'iu'));
    for (const p of pieces) if (p.trim()) out.push(p.trim());
  }
  // Câu phụ kiểu "Vì sao?", "Giải thích." gộp vào câu trước
  const merged: string[] = [];
  for (const p of out) {
    if (merged.length && (/^(vì sao|tại sao|giải thích|hãy giải thích)[\s?.!]*$/iu.test(p) || /^nếu\s/iu.test(p))) {
      merged[merged.length - 1] += ` ${p}`;
    } else merged.push(p);
  }
  return merged.length ? merged : [q];
}

// ───────────────────────── Đọc điều kiện "ít nhất 3 năm"... ─────────────────────────

const B = '(?:^|[^a-z0-9@])';
const COND_PATTERNS: { re: RegExp; op: CondOp; two?: boolean }[] = [
  { re: new RegExp(`${B}tu ${NUM_RE}((?: [a-z]+){0,2}) (?:den|toi) ${NUM_RE}`), op: 'between', two: true },
  { re: new RegExp(`${B}(?:trong )?khoang ${NUM_RE}((?: [a-z]+){0,2}) (?:den|toi|-) ${NUM_RE}`), op: 'between', two: true },
  { re: new RegExp(`${B}(?:lon|cao|nhieu|lau|dai|tren) hon hoac bang ${NUM_RE}`), op: 'gte' },
  { re: new RegExp(`${B}(?:nho|thap|it|ngan|duoi) hon hoac bang ${NUM_RE}`), op: 'lte' },
  { re: new RegExp(`${B}(?:tu )?${NUM_RE}((?: [a-z]+){0,2}) tro len`), op: 'gte' },
  { re: new RegExp(`${B}(?:tu )?${NUM_RE}((?: [a-z]+){0,2}) tro xuong`), op: 'lte' },
  { re: new RegExp(`${B}(?:it nhat|toi thieu|khong it hon|khong duoi|khong thap hon|khong kem hon|khong ngan hon|>=|≥) ?${NUM_RE}`), op: 'gte' },
  { re: new RegExp(`${B}(?:nhieu nhat|toi da|khong qua|khong vuot qua|khong nhieu hon|khong tren|khong cao hon|khong lon hon|khong hon|<=|≤) ?${NUM_RE}`), op: 'lte' },
  { re: new RegExp(`${B}(?:dung|bang|vua dung) ${NUM_RE}`), op: 'eq' },
  { re: new RegExp(`${B}(?:it hon|nho hon|thap hon|ngan hon|kem hon|duoi|chua den|chua toi|chua du|chua qua|<) ?${NUM_RE}`), op: 'lt' },
  { re: new RegExp(`${B}(?:nhieu hon|lon hon|cao hon|lau hon|dai hon|tren|vuot qua|hon|>) ?${NUM_RE}`), op: 'gt' },
];

const COUNT_NOUNS = ['lan', 'luot', 'nguoi', 'ban', 'hoc sinh', 'em', 'nhan vien', 'gia dinh', 'ho'];

function wordsAfter(f: string, endIdx: number, n = 3): string {
  return f.slice(endIdx).trim().split(' ').slice(0, n).join(' ');
}

/** Ngưỡng đặt lên giá trị hay lên tần số? */
function decideOn(unit: string, c: Ctx): { on: 'value' | 'freq'; sure: boolean; unitWord: string } {
  const u = ` ${unit} `;
  const cn = COUNT_NOUNS.find((w) => u.startsWith(` ${w} `) && w !== c.donVi);
  if (c.donVi && u.startsWith(` ${c.donVi} `)) return { on: c.numeric ? 'value' : 'freq', sure: c.numeric, unitWord: c.donVi };
  const dh = startsWithAny(u, c.doiHeads.filter((h) => h !== c.donVi));
  if (dh) return { on: 'freq', sure: true, unitWord: dh };
  if (cn) return { on: 'freq', sure: true, unitWord: cn };
  if (!c.numeric) return { on: 'freq', sure: true, unitWord: '' };
  return { on: 'value', sure: false, unitWord: '' };
}

type CondHit = { cond: Condition; span: [number, number]; sure: boolean };

function hitFrom(p: (typeof COND_PATTERNS)[number], m: RegExpExecArray, fMasked: string, c: Ctx): CondHit | null {
  let a: number | null;
  let b: number | null = null;
  let midUnit = '';
  if (p.two) {
    a = parseNum(m[1]);
    midUnit = (m[2] || '').trim();
    b = parseNum(m[3]);
    if (a === null || b === null) return null;
    if (a > b) [a, b] = [b, a];
  } else if ((p.op === 'gte' && /tro len/.test(m[0])) || (p.op === 'lte' && /tro xuong/.test(m[0]))) {
    a = parseNum(m[1]);
    midUnit = (m[2] || '').trim();
  } else {
    a = parseNum(m[1]);
  }
  if (a === null) return null;
  const end = m.index + m[0].length;
  const unit = midUnit || wordsAfter(fMasked, end);
  const { on, sure, unitWord } = decideOn(unit, c);
  const start = m.index + (m[0].match(/^[^a-z0-9@<>≤≥]*/)?.[0].length || 0);
  let phrase = fMasked.slice(start, end);
  if (!midUnit && unitWord) phrase += ` ${unitWord}`;
  return { cond: { on, op: p.op, a, ...(b !== null ? { b } : {}), phrase }, span: [start, end], sure };
}

/**
 * Đọc điều kiện. Hỗ trợ cả điều kiện ghép: "trên 3 năm và dưới 6 năm", "dưới 2 hoặc trên 6".
 */
export function parseCondition(fMasked: string, c: Ctx): CondHit | null {
  const hits: CondHit[] = [];
  for (const p of COND_PATTERNS) {
    const re = new RegExp(p.re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(fMasked))) {
      const h = hitFrom(p, m, fMasked, c);
      if (h && !hits.some((x) => h.span[0] < x.span[1] && x.span[0] < h.span[1])) hits.push(h);
      re.lastIndex = m.index + 1;
    }
  }
  if (!hits.length) return null;
  hits.sort((x, y) => x.span[0] - y.span[0]);
  const [h1, h2] = hits;
  if (h2 && h1.cond.on === h2.cond.on) {
    const between = fMasked.slice(h1.span[1], h2.span[0]);
    const type = /(^|[^a-z])hoac([^a-z]|$)/.test(between) ? 'or' : /(^|[^a-z])(va|nhung|dong thoi|ma)([^a-z]|$)|,/.test(between) ? 'and' : null;
    if (type) {
      return {
        cond: { ...h1.cond, join: { type, cond: h2.cond }, phrase: fMasked.slice(h1.span[0], h2.span[1]) },
        span: [h1.span[0], h2.span[1]],
        sure: h1.sure && h2.sure,
      };
    }
  }
  return h1;
}

// ───────────────────────── Tìm các giá trị được nhắc trong câu hỏi ─────────────────────────

export function findTargets(fMasked: string, c: Ctx, skip?: [number, number]): string[] {
  const found: string[] = [];
  if (!c.numeric) {
    const re = /@c(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fMasked))) {
      const cat = c.t.categories[+m[1]];
      if (cat && !found.includes(cat)) found.push(cat);
    }
    return found;
  }
  const re = /(^|[^a-z0-9.,@])(\d+(?:[.,]\d+)?)(?![a-z0-9]|[.,]\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fMasked))) {
    const idx = m.index + m[1].length;
    if (skip && idx >= skip[0] && idx < skip[1]) continue;
    const before = fMasked.slice(Math.max(0, idx - 6), idx);
    if (/(lop|cau|bai|so) $/.test(before)) continue;
    const after = ` ${wordsAfter(fMasked, idx + m[2].length, 2)} `;
    if (startsWithAny(after, c.doiHeads.filter((h) => h !== c.donVi))) continue; // "5 y tá" là số lượng
    const v = parseFloat(m[2].replace(',', '.'));
    const i = c.nums.findIndex((n) => Math.abs(n - v) < 1e-9);
    if (i >= 0 && !found.includes(c.t.categories[i])) found.push(c.t.categories[i]);
  }
  return found;
}

// ───────────────────────── Phân loại một câu ─────────────────────────

function spec(question: string, partial: Partial<QuestionSpec>): QuestionSpec {
  return { question, dang: 'UNKNOWN', source: 'rule', confidence: 'high', reason: '', ...partial };
}

function classifyOne(question: string, c: Ctx): QuestionSpec[] {
  const f0 = fold(question);
  const f = maskCategories(f0, c);

  // 1. Ngoài phạm vi
  for (const o of OUT_OF_SCOPE) {
    if (o.re.test(f)) return [spec(question, { dang: 'OUT', reason: o.why })];
  }

  // 2. Kiểm tra – sửa bảng (TS6)
  if (
    c.t.claimedFrequencies &&
    /dung hay sai|co dung khong|dung chua|dung khong|sai o dau|chi ra .*sai|sua lai|sua cho dung|kiem tra (lai )?bang|nham|bi sai|chinh xac khong/.test(f)
  ) {
    return [spec(question, { dang: 'TS6', reason: 'Có bảng do bạn khác lập + yêu cầu kiểm tra/sửa.' })];
  }

  // 3. Tìm tần số chưa biết (TS5)
  const hasUnknown = c.t.frequencies.some((x) => x === null);
  if (
    hasUnknown &&
    /(^|[^a-z])tim (x|y|m|n|a|b)([^a-z]|$)|gia tri cua (x|y|m|n)|con thieu|bi thieu|bi mat|bi nhoe|bi rach|bi che|dien (so|vao|tiep)|o trong|chua biet|tim tan so/.test(f)
  ) {
    return [spec(question, { dang: 'TS5', reason: 'Bảng có tần số bị thiếu + yêu cầu tìm.' })];
  }

  // 4. Vẽ biểu đồ (TS2 / TS3)
  if (/(^|[^a-z])ve( lai)? (mot )?bieu do|bieu dien .* bang bieu do/.test(f)) {
    const line = /doan thang/.test(f);
    const bar = /(^|[^a-z])cot([^a-z]|$)/.test(f);
    if (line && bar) {
      return [
        spec(question, { dang: 'TS2', chartKind: 'bar', reason: 'Vẽ biểu đồ cột (ý yêu cầu vẽ cả hai dạng).' }),
        spec(question, { dang: 'TS3', chartKind: 'line', reason: 'Vẽ biểu đồ đoạn thẳng (ý yêu cầu vẽ cả hai dạng).' }),
      ];
    }
    if (line) return [spec(question, { dang: 'TS3', chartKind: 'line', reason: 'Vẽ biểu đồ đoạn thẳng.' })];
    return [
      spec(question, {
        dang: 'TS2',
        chartKind: 'bar',
        confidence: bar ? 'high' : 'medium',
        reason: bar ? 'Vẽ biểu đồ cột.' : 'Đề không nói rõ dạng biểu đồ, mặc định dạng cột.',
      }),
    ];
  }

  // 5. Lập bảng tần số (TS1)
  if (
    /lap (mot )?bang|hoan (thanh|thien) bang|ghi (lai )?bang tan so|(bang|duoi dang|thanh) bang tan so/.test(f) ||
    (/(gia tri nao|nhung gia tri|cac gia tri)/.test(f) && /tan so (cua )?(moi|tung|cac|tuong ung)|va tan so|tim tan so/.test(f)) ||
    /tim tan so (cua )?(moi|tung|cac) gia tri|xac dinh (cac )?gia tri va tan so/.test(f)
  ) {
    return [spec(question, { dang: 'TS1', reason: 'Yêu cầu lập bảng tần số / tìm tần số của mỗi giá trị.' })];
  }

  // 6. Đọc – phân tích (TS4)
  const R = (askKind: AskKind, reason: string, extra: Partial<QuestionSpec> = {}) => [
    spec(question, { dang: 'TS4', askKind, reason, ...extra }),
  ];

  if (/(bao nhieu|may) gia tri khac nhau|so (cac )?gia tri khac nhau/.test(f)) {
    return R('distinct_count', 'Hỏi số giá trị khác nhau.');
  }
  if (/(nhung|cac) gia tri nao|nhan (nhung |cac )?gia tri nao|gom (nhung|cac) gia tri|la nhung gia tri nao/.test(f)) {
    return R('list_values', 'Hỏi các giá trị (không hỏi tần số).');
  }

  const pc = parseCondition(f, c);
  if (pc) {
    pc.cond.phrase = origPhrase(question, pc.cond.phrase);
    const conf = pc.sure ? 'high' : 'medium';
    if (pc.cond.on === 'freq') {
      const style = /(^|[^a-z])nao([^a-z]|$)/.test(f) ? 'list' : 'count';
      return R('values_by_freq', `Điều kiện đặt lên tần số ("${pc.cond.phrase}").`, {
        condition: pc.cond,
        answerStyle: style,
        confidence: conf,
      });
    }
    return R('count_condition', `Điều kiện đặt lên giá trị ("${pc.cond.phrase}") → cộng tần số các giá trị thỏa.`, {
      condition: pc.cond,
      confidence: conf,
    });
  }

  const targets = findTargets(f, c);

  if (targets.length >= 2) {
    if (/gap .*lan|gap (bao nhieu|may)/.test(f)) {
      return R('compare', 'So sánh: gấp mấy lần.', { targets: targets.slice(0, 2), compareMode: 'ratio' });
    }
    if (/(nhieu|it) hon .*bao nhieu|bao nhieu .*(nhieu|it) hon|chenh lech|hon kem|kem .*bao nhieu/.test(f)) {
      return R('compare', 'So sánh: hơn/kém bao nhiêu.', { targets: targets.slice(0, 2), compareMode: 'diff' });
    }
    if (/(nhieu|it) hon hay|so sanh|nao (nhieu|it) hon|hay (it|nhieu) hon|nhieu hon( |$).*nao/.test(f)) {
      return R('compare', 'So sánh: giá trị nào nhiều hơn.', { targets: targets.slice(0, 2), compareMode: 'which_more' });
    }
    if (/bao nhieu|tong (so|cong)|co may|tat ca/.test(f)) {
      return R('count_set', `Cộng tần số của các giá trị ${targets.join(', ')}.`, { targets });
    }
  }

  // Tổng các giá trị Σ x·m (VD "tổng số bàn thắng")
  if (
    c.numeric &&
    c.donVi &&
    !c.doiHeads.includes(c.donVi) &&
    targets.length === 0 &&
    /tong (so|cong)|tat ca|ca (giai|lop|doi|nhom|truong)|cong lai/.test(f) &&
    (new RegExp(`bao nhieu ${c.donVi}`).test(f) || new RegExp(`tong (so|cong)( cac| tat ca)? ${c.donVi}`).test(f))
  ) {
    return R('sum_values', `Tổng các giá trị (đơn vị "${c.t.donVi}") = Σ giá trị × tần số.`);
  }

  if (targets.length === 1 && /bao nhieu|may lan|tan so|so lan|co may|la bao nhieu|xuat hien/.test(f)) {
    return R('value_freq', `Hỏi tần số của giá trị ${targets[0]}.`, { targets });
  }

  // Lớn nhất / nhỏ nhất: phân biệt tần số và độ lớn giá trị
  const W = '(?: [a-z0-9@]+){0,6}';
  const freqMax = new RegExp(
    `nhieu nhat|nhieu${W} nhat|pho bien nhat|chiem uu the|uu the nhat|dong nhat|thuong gap nhat|hay gap nhat|(yeu thich|ua chuong|ua thich) nhat|tan so lon nhat|cot cao nhat`
  ).test(f);
  const freqMin = new RegExp(`it nhat|(^| )it${W} nhat|it pho bien nhat|hiem nhat|tan so nho nhat|cot thap nhat`).test(f);
  const aboutCount =
    /tan so|so lan|(^| )cot( |$)/.test(f) ||
    c.doiHeads.some((h) => new RegExp(`(so|nhieu|it|luong) (luong )?${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(f));
  const vMax = /(lon|cao|lau|dai|xa|nang|gia|nhieu tuoi|muon) nhat/.test(f);
  const vMin = /(nho|thap|ngan|gan|nhe|re|it tuoi|som) nhat/.test(f);

  if (freqMax && !freqMin) return R('max', 'Hỏi giá trị xuất hiện nhiều nhất.');
  if (freqMin && !freqMax) return R('min', 'Hỏi giá trị xuất hiện ít nhất.');
  if (vMax || vMin) {
    if (aboutCount || !c.numeric) {
      return R(vMax ? 'max' : 'min', `Hỏi giá trị có tần số ${vMax ? 'lớn' : 'nhỏ'} nhất (nói về số lượng).`);
    }
    return R(vMax ? 'value_max' : 'value_min', `Hỏi giá trị ${vMax ? 'lớn' : 'nhỏ'} nhất (độ lớn của giá trị).`);
  }

  if (targets.length === 0) {
    const strong = /tong (so|cong)|tat ca|co mau|bao nhieu .*(khao sat|dieu tra|thong ke|tham gia|tham du|duoc hoi|ghi lai|lua chon|du doan|tra loi|danh gia)/.test(f);
    const weak = /(co|gom|la) bao nhieu/.test(f);
    if (strong || weak) {
      return R('sample_size', 'Hỏi tổng số đối tượng (cỡ mẫu N).', strong ? {} : { confidence: 'medium' });
    }
  }

  if (/nhan xet|rut ra|ket luan|em co suy nghi|giai thich|nhu the nao/.test(f)) {
    return R('remark', 'Yêu cầu nhận xét.', { confidence: 'medium' });
  }

  return [spec(question, { dang: 'UNKNOWN', confidence: 'low', reason: 'Không khớp dạng nào trong danh mục Bài 22.' })];
}

// ───────────────────────── Đối chiếu với gợi ý của AI ─────────────────────────

function hintToSpec(question: string, h: AiHint, c: Ctx): QuestionSpec | null {
  const dang = (h.dangBai || '').toUpperCase();
  if (['TS1', 'TS2', 'TS3', 'TS5', 'TS6'].includes(dang)) {
    if (dang === 'TS5' && !c.t.frequencies.some((x) => x === null)) return null;
    if (dang === 'TS6' && !c.t.claimedFrequencies) return null;
    return spec(question, {
      dang: dang as QuestionSpec['dang'],
      ...(dang === 'TS2' ? { chartKind: 'bar' } : dang === 'TS3' ? { chartKind: 'line' } : {}),
      source: 'ai',
      confidence: 'low',
      reason: 'Luật chưa nhận ra; dùng phân loại của AI.',
    });
  }
  const k = h.askKind as AskKind;
  if (!ASK_KINDS.includes(k)) return null;
  const targets = (h.targets || [])
    .map((t) => c.t.categories.find((cat) => fold(cat) === fold(String(t))))
    .filter((x): x is string => !!x);
  const base = { question, dang: 'TS4' as const, askKind: k, source: 'ai' as const, confidence: 'low' as const, reason: 'Luật chưa nhận ra; dùng phân loại của AI.' };
  const ops: CondOp[] = ['gte', 'gt', 'lte', 'lt', 'between', 'eq'];
  if (k === 'count_condition' || k === 'values_by_freq') {
    const cd = h.condition;
    if (!cd || !ops.includes(cd.op as CondOp) || typeof cd.a !== 'number' || !isFinite(cd.a)) return null;
    if (cd.op === 'between' && (typeof cd.b !== 'number' || !isFinite(cd.b))) return null;
    if (k === 'count_condition' && !c.numeric) return null;
    return {
      ...base,
      condition: { on: k === 'count_condition' ? 'value' : 'freq', op: cd.op as CondOp, a: cd.a, ...(cd.op === 'between' ? { b: cd.b } : {}), phrase: cd.phrase || '' },
      ...(k === 'values_by_freq' ? { answerStyle: /(^|[^a-z])nao([^a-z]|$)/.test(fold(question)) ? 'list' : 'count' } : {}),
    } as QuestionSpec;
  }
  if (k === 'value_freq' && targets.length !== 1) return null;
  if (k === 'count_set' && targets.length < 2) return null;
  if (k === 'compare') {
    if (targets.length < 2) return null;
    const mode = (['diff', 'ratio', 'which_more'] as const).find((m) => m === h.compareMode) || 'diff';
    return { ...base, targets: targets.slice(0, 2), compareMode: mode };
  }
  if ((k === 'value_max' || k === 'value_min' || k === 'sum_values') && !c.numeric) return null;
  return { ...base, ...(targets.length ? { targets } : {}) };
}

function sameMeaning(a: QuestionSpec, b: QuestionSpec): boolean {
  if (a.dang !== b.dang) return false;
  if (a.dang !== 'TS4') return true;
  if (a.askKind !== b.askKind) return false;
  if (a.condition && b.condition) {
    return a.condition.op === b.condition.op && a.condition.a === b.condition.a && (a.condition.b ?? null) === (b.condition.b ?? null);
  }
  return true;
}

// ───────────────────────── Hàm chính ─────────────────────────

/**
 * Phân loại một ý của đề. Trả về MẢNG vì một ý có thể gồm nhiều yêu cầu
 * (VD "Lập bảng tần số và cho biết..."; "Vẽ biểu đồ cột và đoạn thẳng").
 */
export function classifyPart(question: string, table: FreqTable, aiHint?: AiHint | null): QuestionSpec[] {
  const c = makeCtx(table);
  const pieces = splitCompound(question);
  let specs = pieces.flatMap((p) => classifyOne(p, c));
  // "nhận những giá trị nào? Tìm tần số của mỗi giá trị" → một yêu cầu lập bảng (TS1)
  // Gộp các yêu cầu liền nhau giống hệt nhau (VD "Đúng hay sai? Nếu sai hãy sửa lại.")
  specs = specs.filter((s, i) => {
    const p = specs[i - 1];
    if (!p || p.dang !== s.dang || p.askKind !== s.askKind || p.chartKind !== s.chartKind) return true;
    if (JSON.stringify(p.condition) !== JSON.stringify(s.condition) || JSON.stringify(p.targets) !== JSON.stringify(s.targets)) return true;
    p.question = `${p.question} ${s.question}`;
    return false;
  });
  const ts1 = specs.find((s) => s.dang === 'TS1');
  if (ts1) {
    const lists = specs.filter((s) => s.dang === 'TS4' && s.askKind === 'list_values');
    if (lists.length) {
      ts1.question = [...lists.map((s) => s.question), ts1.question].join(' ');
      specs = specs.filter((s) => !lists.includes(s));
    }
  }

  // Gợi ý của AI chỉ đối chiếu được khi ý chỉ có một yêu cầu
  if (aiHint && specs.length === 1) {
    const s = specs[0];
    const h = hintToSpec(s.question, aiHint, c);
    if (s.dang === 'UNKNOWN') {
      return [h ?? s];
    }
    if (h) {
      if (sameMeaning(s, h)) return [{ ...s, source: 'rule+ai' }];
      // Code và AI hiểu khác nhau. Nếu code đọc được bằng chứng cụ thể (điều kiện kèm số, giá trị được nhắc)
      // với độ tin cậy cao thì giữ kết quả code (đây chính là lỗi cũ: AI gán "max" cho câu "ít nhất 3 năm").
      // Ngược lại → dùng kết quả code nhưng bắt buộc GV duyệt.
      const specific = s.confidence === 'high' && (!!s.condition || !!s.targets?.length || s.dang !== 'TS4');
      return [
        {
          ...s,
          confidence: specific ? 'high' : 'low',
          reason: `${s.reason} (AI hiểu là ${h.dang}${h.askKind ? '/' + h.askKind : ''} – không khớp; ${specific ? 'giữ kết quả của code vì có căn cứ rõ trong câu hỏi' : 'cần giáo viên duyệt'}.)`,
        },
      ];
    }
  }
  return specs;
}

export const __test = { makeCtx, maskCategories, classifyOne };

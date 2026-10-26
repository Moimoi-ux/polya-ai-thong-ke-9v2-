/** Tiện ích xử lý tiếng Việt cho bộ phân loại câu hỏi. */

/** Bỏ dấu, chữ thường, gộp khoảng trắng: "Ít nhất 3 năm" → "it nhat 3 nam" */
export function fold(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[“”"'‘’?!;:()[\]{}…]/g, ' ')
    // giữ dấu phẩy/chấm thập phân "3,5"; các dấu phẩy/chấm khác thành khoảng trắng
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Số đọc bằng chữ (đã bỏ dấu). "nam" (năm = 5) chỉ được dùng khi đứng ngay sau từ so sánh. */
const NUM_WORDS: Record<string, number> = {
  khong: 0,
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  nam: 5,
  sau: 6,
  bay: 7,
  tam: 8,
  chin: 9,
  muoi: 10,
};

/** Mẫu số trong văn bản đã bỏ dấu (chữ số hoặc số đọc bằng chữ) */
export const NUM_RE = String.raw`(\d+(?:[.,]\d+)?|muoi(?:\s+(?:mot|hai|ba|bon|lam|nam|sau|bay|tam|chin))?|mot|hai|ba|bon|nam|sau|bay|tam|chin)`;

export function parseNum(tok: string): number | null {
  const t = tok.trim();
  if (/^\d+(?:[.,]\d+)?$/.test(t)) return parseFloat(t.replace(',', '.'));
  const m = t.match(/^muoi(?:\s+(\w+))?$/);
  if (m) {
    if (!m[1]) return 10;
    const u = m[1] === 'lam' ? 5 : NUM_WORDS[m[1]];
    return u === undefined ? null : 10 + u;
  }
  return t in NUM_WORDS ? NUM_WORDS[t] : null;
}

/** Số theo cách viết Việt Nam: 1.8 → "1,8" */
export function fmtNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** ["a","b","c"] → "a, b và c" */
export function joinVi(items: string[], last = 'và'): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${last} ${items[items.length - 1]}`;
}

/** Kiểm tra cụm từ (đã bỏ dấu) xuất hiện như một từ trọn vẹn */
export function hasWord(folded: string, phrase: string): boolean {
  if (!phrase) return false;
  const p = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${p}(?=$|[^a-z0-9])`).test(folded);
}

/** Vị trí xuất hiện (như từ trọn vẹn) của cụm từ, -1 nếu không có */
export function wordIndex(folded: string, phrase: string): number {
  const p = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(^|[^a-z0-9])${p}(?=$|[^a-z0-9])`).exec(folded);
  return m ? m.index + m[1].length : -1;
}

/** Gọi tên giá trị kèm đơn vị: ("3","năm") → "3 năm"; ("Giỏi","") → "Giỏi" */
export function withUnit(cat: string, donVi: string): string {
  return donVi && /^\d/.test(cat) ? `${cat} ${donVi}` : cat;
}

/** Lấy cụm từ gốc (có dấu) trong câu hỏi ứng với cụm đã bỏ dấu. */
export function origPhrase(original: string, foldedPhrase: string): string {
  const words = original.split(/\s+/).filter(Boolean);
  const target = foldedPhrase.trim();
  for (let i = 0; i < words.length; i++) {
    let acc = '';
    for (let j = i; j < words.length && j < i + 12; j++) {
      acc = fold(words.slice(i, j + 1).join(' '));
      if (acc === target) return words.slice(i, j + 1).join(' ').replace(/[?.!,;:]+$/, '');
      if (!target.startsWith(acc)) break;
    }
  }
  return foldedPhrase;
}

/** Viết câu trả lời từ câu hỏi: "Phòng khám có tổng số bao nhiêu y tá?" + "39" → "Phòng khám có tổng số 39 y tá." */
export function answerFromQuestion(question: string, answer: string, fallback: string): string {
  let q = (question || '').trim().replace(/^\(?[a-hA-H]\)\s*/, '');
  q = q.replace(/^.*?(?:hãy\s+)?cho biết\s+/iu, '');
  q = q.replace(/\s*(vì sao|tại sao|giải thích)[^?]*[?.]?\s*$/iu, '');
  q = q.replace(/\s*[?？.]\s*$/u, '');
  const keys = [/(^|\s)bao nhiêu(?=\s|$)/iu, /(^|\s)mấy(?=\s|$)/iu, /(^|\s)nào(?=\s|$)/iu];
  for (const re of keys) {
    const all = q.match(new RegExp(re.source, 'giu')) || [];
    if (all.length === 1) {
      return capitalize(q.replace(re, `$1${answer}`)) + '.';
    }
  }
  return fallback;
}

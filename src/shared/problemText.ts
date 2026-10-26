/**
 * Chuẩn hóa văn bản đề bài để hiển thị đúng.
 *
 * Lỗi gặp phải: khi AI chép đề (đặc biệt đề chụp ảnh), bảng Markdown thường bị dồn
 * thành MỘT dòng, ví dụ:
 *   "... sau: | Xếp hạng | Vàng | Bạc | | :--- | :--- | :--- | | Tần số | 5 | 10 | Học sinh ..."
 * Trình hiển thị chỉ nhận bảng khi mỗi hàng nằm trên một dòng riêng, nên học sinh thấy
 * nguyên chuỗi ký tự "|" và ":---". Các hàm dưới đây tách lại bảng thành từng dòng,
 * đưa các ý a), b), c) và các phương án A. B. C. D. xuống dòng riêng.
 */

const SEP_RE = /\|(?:[ \t]*:?-{3,}:?[ \t]*\|)+/;

function pipePositions(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) if (s[i] === '|') out.push(i);
  return out;
}

/** Tách một dòng có bảng bị dồn thành nhiều dòng; trả về null nếu không có gì để tách */
function splitInlineTable(line: string): string[] | null {
  const m = SEP_RE.exec(line);
  if (!m) return null;
  const k = (m[0].match(/-{3,}/g) || []).length;
  const before = line.slice(0, m.index);
  const after = line.slice(m.index + m[0].length);
  if (!before.trim() && !after.trim()) return null; // dòng phân cách đã đứng riêng

  const out: string[] = [];

  // Hàng tiêu đề nằm ngay trước dòng phân cách (k ô ⇒ k+1 dấu "|")
  const b = before.trimEnd();
  if (b) {
    const pos = pipePositions(b);
    if (b.endsWith('|') && pos.length >= k + 1) {
      const start = pos[pos.length - 1 - k];
      const prefix = b.slice(0, start).trim();
      if (prefix) out.push(prefix);
      out.push(b.slice(start).trim());
    } else {
      // Không nhận ra được hàng tiêu đề → giữ nguyên dòng
      return null;
    }
  }

  out.push('| ' + Array.from({ length: k }, () => '---').join(' | ') + ' |');

  // Các hàng dữ liệu ngay sau dòng phân cách
  let rest = after;
  while (true) {
    const t = rest.trimStart();
    if (!t.startsWith('|')) break;
    const pos = pipePositions(t);
    if (pos.length >= k + 1) {
      out.push(t.slice(0, pos[k] + 1).trim());
      rest = t.slice(pos[k] + 1);
    } else if (pos.length === k && !t.slice(pos[k - 1] + 1).includes('|')) {
      // hàng cuối thiếu dấu "|" đóng
      out.push(t.trim() + ' |');
      rest = '';
    } else {
      break;
    }
  }
  const suffix = rest.trim();
  if (suffix) {
    const more = splitInlineTable(suffix);
    if (more) out.push(...more);
    else out.push(suffix);
  }
  return out;
}

export function isTableLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.endsWith('|');
}

/** Chỉ tách bảng bị dồn (an toàn cho mọi nội dung) */
export function normalizeTables(text: string): string {
  if (!text || !text.includes('|')) return text || '';
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    // Dòng phân cách đứng đầu dòng nhưng hàng tiêu đề lại dính vào cuối dòng trước ("Bảng: | A | B |")
    const sepAtStart = SEP_RE.exec(line.trimStart());
    if (sepAtStart && sepAtStart.index === 0 && out.length > 0) {
      const prev = out[out.length - 1].trimEnd();
      if (!isTableLine(prev) && prev.endsWith('|')) {
        const k = (sepAtStart[0].match(/-{3,}/g) || []).length;
        const pos = pipePositions(prev);
        if (pos.length >= k + 1) {
          const start = pos[pos.length - 1 - k];
          out.pop();
          const prefix = prev.slice(0, start).trim();
          if (prefix) out.push(prefix);
          out.push(prev.slice(start).trim());
        }
      }
    }
    const split = splitInlineTable(line);
    if (split) out.push(...split);
    else out.push(line);
  }
  return out.join('\n');
}

/** Đưa "a) ...", "b) ..." đang nằm giữa dòng xuống dòng riêng */
function splitPartLabels(line: string): string {
  if (isTableLine(line)) return line;
  return line.replace(/([.?!:;…])\s+(\(?[a-d]\))\s+/g, '$1\n$2 ');
}

const CHOICE_RE = /(^|\s)A\.\s+(.+?)\s+B\.\s+(.+?)\s+C\.\s+(.+?)(?:\s+D\.\s+(.+?))?\s*$/;

/** Đưa các phương án trắc nghiệm A. B. C. D. xuống dòng riêng */
function splitChoices(line: string): string {
  if (isTableLine(line)) return line;
  const m = CHOICE_RE.exec(line);
  if (!m) return line;
  const head = line.slice(0, m.index + m[1].length).trimEnd();
  const opts = [`A. ${m[2]}`, `B. ${m[3]}`, `C. ${m[4]}`];
  if (m[5]) opts.push(`D. ${m[5]}`);
  return [head, ...opts].filter((x) => x.trim()).join('\n');
}

/** Chuẩn hóa đầy đủ văn bản đề bài */
export function normalizeProblemText(text: string): string {
  const withTables = normalizeTables(text || '');
  return withTables
    .split('\n')
    .map((l) => splitPartLabels(l))
    .join('\n')
    .split('\n')
    .map((l) => splitChoices(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface ChoiceOption {
  letter: string;
  text: string;
}

/** Lấy các phương án trắc nghiệm A, B, C, (D) của đề (nếu có) */
export function extractChoiceOptions(text: string): ChoiceOption[] | null {
  const lines = normalizeProblemText(text).split('\n');
  const found: ChoiceOption[] = [];
  for (const raw of lines) {
    const m = /^\s*([A-D])\.\s+(.+?)\s*$/.exec(raw);
    if (m) found.push({ letter: m[1], text: m[2].replace(/[.;]\s*$/, '').trim() });
  }
  const letters = found.map((f) => f.letter).join('');
  if (letters === 'ABCD' || letters === 'ABC') return found;
  return null;
}

/** Bản xem trước dạng chữ thường (dùng cho thẻ thư viện, danh sách) */
export function problemPreview(text: string, maxLen = 260): string {
  const lines = normalizeProblemText(text).split('\n');
  const parts: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (isTableLine(t)) {
      if (SEP_RE.test(t) && !t.replace(/[|\s:-]/g, '')) continue;
      const cells = t.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.length === 0) continue;
      parts.push(`${cells[0]}: ${cells.slice(1).join(', ')};`);
    } else {
      parts.push(t);
    }
  }
  const s = parts
    .join(' ')
    .replace(/\*\*/g, '')
    .replace(/\$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > maxLen ? s.slice(0, maxLen - 1).trimEnd() + '…' : s;
}

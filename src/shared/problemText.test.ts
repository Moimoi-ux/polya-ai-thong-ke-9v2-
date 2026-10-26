import { normalizeProblemText, extractChoiceOptions, problemPreview } from './problemText.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('✗ ' + msg);
    process.exit(1);
  }
  console.log('✓ ' + msg);
}

// Bảng bị AI dồn thành một dòng (lỗi thực tế trong thư viện)
const flat =
  'Câu 9. Kết quả của 24 học sinh Quận A được thống kê ở bảng tần số sau: | Xếp hạng | Vàng | Bạc | Đồng | Không đạt giải | | :--- | :--- | :--- | :--- | :--- | | Tần số | 5 | 10 | 7 | 5 | Học sinh Quận A đạt giải nào nhiều nhất? A. Giải Vàng. B. Giải Bạc. C. Giải Đồng. D. Không đạt giải.';
const lines = normalizeProblemText(flat).split('\n');
assert(lines[1] === '| Xếp hạng | Vàng | Bạc | Đồng | Không đạt giải |', 'Tách hàng tiêu đề của bảng');
assert(lines[2] === '| --- | --- | --- | --- | --- |', 'Tách dòng phân cách');
assert(lines[3] === '| Tần số | 5 | 10 | 7 | 5 |', 'Tách hàng tần số');
assert(lines.includes('B. Giải Bạc.'), 'Đưa phương án trắc nghiệm xuống dòng');
const ch = extractChoiceOptions(flat);
assert(!!ch && ch.length === 4 && ch[1].text === 'Giải Bạc', 'Đọc được 4 phương án A–D');

// Ý a), b) nằm giữa dòng
const parts = normalizeProblemText('Dữ liệu: | Ngày | T2 | | --- | --- | | Tên | Bình | a) Lập bảng tần số. b) Bạn nào nhiều nhất?');
assert(parts.includes('\na) Lập bảng tần số.\nb) Bạn nào nhiều nhất?'), 'Tách ý a), b) xuống dòng');

// Đề đã đúng định dạng thì giữ nguyên
const ok = 'Điểm: 7, 8.\na) Lập bảng.\n| X | 1 | 2 |\n| --- | --- | --- |\n| Tần số | 3 | 4 |';
assert(normalizeProblemText(ok) === ok, 'Không làm hỏng đề đã đúng định dạng');

assert(problemPreview(flat).includes('Xếp hạng: Vàng, Bạc, Đồng, Không đạt giải;'), 'Bản xem trước không còn ký tự bảng');
console.log('--- KIỂM THỬ HIỂN THỊ ĐỀ ĐẠT ---');

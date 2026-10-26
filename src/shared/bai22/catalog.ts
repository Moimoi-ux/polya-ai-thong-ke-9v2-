/**
 * DANH MỤC DẠNG TOÁN – Bài "Bảng tần số và biểu đồ tần số" (Toán 9, CT GDPT 2018).
 * Tổng hợp từ SGK Kết nối tri thức (Bài 22), Chân trời sáng tạo (Chương 7 Bài 1),
 * SBT và các dạng bài thường gặp trong đề kiểm tra.
 *
 * Đây là "nguồn sự thật" duy nhất: nhãn hiển thị, dấu hiệu nhận biết và phương pháp giải
 * của từng dạng đều lấy từ đây.
 */
import type { AskKind, DangBaiCode } from './types.ts';

export interface DangInfo {
  code: DangBaiCode;
  label: string;
  group: string;
  description: string;
}

export const DANG_BAI: DangInfo[] = [
  {
    code: 'TS1',
    label: 'Lập bảng tần số',
    group: 'I. Thu gọn dữ liệu',
    description:
      'Từ dãy số liệu, bảng dữ liệu ban đầu (kể cả dữ liệu không là số), biểu đồ tần số hoặc biểu đồ tranh: xác định các giá trị khác nhau, tần số của mỗi giá trị, lập bảng tần số.',
  },
  {
    code: 'TS2',
    label: 'Vẽ biểu đồ tần số dạng cột',
    group: 'II. Biểu diễn dữ liệu',
    description: 'Từ bảng tần số (hoặc từ dữ liệu thô: lập bảng trước) vẽ biểu đồ cột.',
  },
  {
    code: 'TS3',
    label: 'Vẽ biểu đồ tần số dạng đoạn thẳng',
    group: 'II. Biểu diễn dữ liệu',
    description: 'Từ bảng tần số (hoặc từ dữ liệu thô: lập bảng trước) vẽ biểu đồ đoạn thẳng.',
  },
  {
    code: 'TS4',
    label: 'Đọc – phân tích bảng/biểu đồ tần số',
    group: 'III. Đọc và phân tích',
    description: 'Trả lời câu hỏi dựa trên bảng hoặc biểu đồ tần số (13 kiểu câu hỏi, xem ASK_KINDS).',
  },
  {
    code: 'TS5',
    label: 'Tìm tần số chưa biết',
    group: 'IV. Tìm số liệu chưa biết',
    description: 'Bảng/biểu đồ bị thiếu (hoặc nhòe) một tần số, đề cho cỡ mẫu N: tìm tần số còn thiếu.',
  },
  {
    code: 'TS6',
    label: 'Kiểm tra – sửa bảng tần số',
    group: 'V. Kiểm tra, phát hiện sai sót',
    description: 'Cho dữ liệu và một bảng tần số do bạn khác lập: kiểm tra đúng/sai, chỉ ra chỗ sai và sửa lại.',
  },
];

export interface AskInfo {
  kind: AskKind;
  label: string;
  signs: string;
  method: string;
  example: string;
}

/** 13 kiểu câu hỏi đọc – phân tích (dạng TS4) */
export const ASK_KINDS: AskInfo[] = [
  {
    kind: 'max',
    label: 'Giá trị xuất hiện nhiều nhất',
    signs: '"nhiều nhất", "phổ biến nhất", "chiếm ưu thế", "cột cao nhất" (không kèm số)',
    method: 'So sánh các tần số, chọn giá trị có tần số lớn nhất (kể đủ nếu có nhiều giá trị bằng nhau).',
    example: 'Cỡ giày nào phù hợp với nhiều bạn nam nhất?',
  },
  {
    kind: 'min',
    label: 'Giá trị xuất hiện ít nhất',
    signs: '"ít nhất", "ít ... nhất", "cột thấp nhất" (không kèm số)',
    method: 'So sánh các tần số, chọn giá trị có tần số nhỏ nhất.',
    example: 'Thời gian công tác nào có ít y tá nhất?',
  },
  {
    kind: 'value_freq',
    label: 'Tần số của một giá trị',
    signs: 'Nhắc đúng một giá trị + "bao nhiêu", "mấy lần", "tần số"',
    method: 'Tra đúng cột của giá trị đó trong bảng (hoặc gióng đỉnh cột sang trục đứng).',
    example: 'Có bao nhiêu y tá công tác 4 năm?',
  },
  {
    kind: 'sample_size',
    label: 'Cỡ mẫu (tổng số đối tượng)',
    signs: '"tổng số", "có tất cả bao nhiêu", "bao nhiêu ... được khảo sát" (không kèm điều kiện)',
    method: 'N = tổng các tần số.',
    example: 'Phòng khám có tổng số bao nhiêu y tá?',
  },
  {
    kind: 'count_condition',
    label: 'Số đối tượng thỏa một điều kiện về giá trị',
    signs:
      '"ít nhất k", "từ k trở lên", "không ít hơn k" (≥); "nhiều nhất k", "không quá k" (≤); "trên k", "hơn k" (>); "dưới k", "chưa đến k" (<); "từ a đến b"',
    method: 'Chọn các giá trị thỏa điều kiện → cộng tần số của chúng. Kiểm tra: N − (tổng phần còn lại).',
    example: 'Có bao nhiêu y tá đã công tác ít nhất 3 năm?',
  },
  {
    kind: 'count_set',
    label: 'Số đối tượng thuộc một nhóm giá trị',
    signs: 'Nhắc từ hai giá trị trở lên nối bằng "hoặc", "và" + "bao nhiêu"',
    method: 'Cộng tần số của các giá trị được nhắc.',
    example: 'Có bao nhiêu học sinh xếp loại Giỏi hoặc Khá?',
  },
  {
    kind: 'values_by_freq',
    label: 'Các giá trị có tần số thỏa điều kiện',
    signs: '"... nào có trên 20 học sinh", "bao nhiêu ngày có ít hơn 5 bạn" (số đi kèm tên đối tượng hoặc "lần")',
    method: 'So sánh từng tần số với ngưỡng, liệt kê (hoặc đếm) các giá trị thỏa.',
    example: 'Những ngày nào có ít hơn 25 học sinh đến mượn sách?',
  },
  {
    kind: 'compare',
    label: 'So sánh tần số của hai giá trị',
    signs: '"nhiều hơn ... bao nhiêu", "gấp mấy lần", "chênh lệch", "nhiều hơn hay ít hơn"',
    method: 'Tra hai tần số → lấy hiệu (hơn/kém bao nhiêu) hoặc thương (gấp mấy lần).',
    example: 'Số y tá công tác 5 năm nhiều hơn số y tá công tác 7 năm bao nhiêu người?',
  },
  {
    kind: 'distinct_count',
    label: 'Số giá trị khác nhau',
    signs: '"bao nhiêu giá trị khác nhau"',
    method: 'Đếm số cột của bảng tần số (k), không nhầm với cỡ mẫu N.',
    example: 'Dãy dữ liệu có bao nhiêu giá trị khác nhau?',
  },
  {
    kind: 'list_values',
    label: 'Liệt kê các giá trị',
    signs: '"nhận những giá trị nào", "gồm những giá trị nào" (không hỏi tần số)',
    method: 'Đọc dòng giá trị của bảng (trục ngang của biểu đồ).',
    example: 'Số năm công tác của các y tá nhận những giá trị nào?',
  },
  {
    kind: 'value_max',
    label: 'Giá trị lớn nhất (độ lớn)',
    signs: '"lớn nhất", "cao nhất", "lâu nhất" khi nói về giá trị, không nói về tần số',
    method: 'Chọn giá trị lớn nhất trên dòng giá trị (không xét tần số).',
    example: 'Thời gian công tác lâu nhất là bao nhiêu năm?',
  },
  {
    kind: 'value_min',
    label: 'Giá trị nhỏ nhất (độ lớn)',
    signs: '"nhỏ nhất", "thấp nhất", "ngắn nhất" khi nói về giá trị',
    method: 'Chọn giá trị nhỏ nhất trên dòng giá trị.',
    example: 'Điểm thấp nhất của lớp là bao nhiêu?',
  },
  {
    kind: 'sum_values',
    label: 'Tổng các giá trị (Σ x·m)',
    signs: '"tổng số <đơn vị của giá trị>", VD "tổng số bàn thắng", "tổng số con"',
    method: 'Nhân mỗi giá trị với tần số của nó rồi cộng lại.',
    example: 'Cả giải có tổng cộng bao nhiêu bàn thắng?',
  },
  {
    kind: 'remark',
    label: 'Nhận xét chung',
    signs: '"nhận xét", "rút ra kết luận", "giải thích"',
    method: 'Dựa vào tần số lớn nhất/nhỏ nhất, so sánh với cỡ mẫu để nêu nhận xét đúng.',
    example: 'Em có nhận xét gì về thời gian công tác của các y tá?',
  },
];

/** Các nội dung KHÔNG thuộc Bài 22 → không sinh quy trình, báo GV */
export const OUT_OF_SCOPE = [
  { re: /tan so tuong doi|ti le|ty le|phan tram|%/, why: 'Tần số tương đối / tỉ lệ phần trăm (bài sau).' },
  { re: /ghep nhom|nhom \[|khoang \[/, why: 'Bảng/biểu đồ tần số ghép nhóm (bài sau).' },
  { re: /bieu do (hinh )?(tron|quat)/, why: 'Biểu đồ hình quạt tròn.' },
  { re: /trung binh|trung vi|so mot|phuong sai|do lech|khoang bien thien/, why: 'Số đặc trưng (trung bình, trung vị...) không thuộc bài này.' },
  { re: /xac suat|bien co/, why: 'Xác suất.' },
];

export function dangLabel(code: string): string {
  return DANG_BAI.find((d) => d.code === code)?.label || code;
}
export function askLabel(kind: string): string {
  return ASK_KINDS.find((a) => a.kind === kind)?.label || kind;
}

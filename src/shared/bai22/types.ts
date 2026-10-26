/**
 * Kiểu dữ liệu của module Bài 22.
 *
 * Các kiểu của quy trình (Interaction, PolyaStep...) dùng chung với app (src/shared/types.ts).
 */

// ───────────────────────── Dữ liệu bài toán ─────────────────────────

export type SourceKind = 'raw_list' | 'raw_table' | 'freq_table' | 'freq_chart';
export type ValueKind = 'numeric' | 'categorical';

/** Bảng tần số đã được code chuẩn hóa (do statEngine của app tính ra) */
export interface FreqTable {
  sourceKind: SourceKind;
  sourceChartKind?: 'bar' | 'line';
  valueKind: ValueKind;
  /** Các giá trị khác nhau, theo thứ tự trong đề */
  categories: string[];
  /** Tần số tương ứng; null = ô còn thiếu (dạng TS5) */
  frequencies: (number | null)[];
  /** Cỡ mẫu do đề nêu (-1 nếu đề không nêu) */
  statedSampleSize: number;
  /** Đối tượng khảo sát, VD "y tá", "học sinh", "trận đấu" */
  doiTuong: string;
  /** Nội dung dữ liệu (dấu hiệu), VD "thời gian công tác" */
  dauHieu: string;
  /** Đơn vị của giá trị, VD "năm", "điểm", "bàn thắng" ('' nếu không có) */
  donVi: string;
  /** Tên dòng giá trị trong bảng, VD "Số năm công tác" */
  valueLabel: string;
  /** Bảng tần số "của bạn An" mà đề yêu cầu kiểm tra (dạng TS6) */
  claimedFrequencies?: (number | null)[];
  /** Tên người lập bảng cần kiểm tra (TS6), VD "An" */
  claimedBy?: string;
}

// ───────────────────────── Phân loại câu hỏi ─────────────────────────

export type { DangBaiCode } from '../types.ts';
import type { DangBaiCode } from '../types.ts';

export type Bai22AskKind =
  | 'max' //            giá trị có tần số lớn nhất
  | 'min' //            giá trị có tần số nhỏ nhất
  | 'value_freq' //     tần số của một giá trị
  | 'sample_size' //    cỡ mẫu N (tổng số đối tượng)
  | 'count_condition' //số đối tượng có giá trị thỏa điều kiện (≥, >, ≤, <, từ a đến b)
  | 'count_set' //      số đối tượng có giá trị thuộc một nhóm giá trị (A hoặc B)
  | 'values_by_freq' // các giá trị có tần số thỏa điều kiện (VD "ngày nào có trên 20 HS")
  | 'compare' //        so sánh tần số của hai giá trị
  | 'distinct_count' // số giá trị khác nhau
  | 'list_values' //    liệt kê các giá trị
  | 'value_max' //      giá trị lớn nhất (độ lớn, không phải tần số)
  | 'value_min' //      giá trị nhỏ nhất
  | 'sum_values' //     tổng các giá trị Σ x·m (VD tổng số bàn thắng)
  | 'remark'; //        nhận xét chung

export type AskKind = Bai22AskKind;

export type CondOp = 'gte' | 'gt' | 'lte' | 'lt' | 'between' | 'eq';

export interface Condition {
  /** Điều kiện đặt lên giá trị (số năm ≥ 3) hay lên tần số (ngày có > 20 HS) */
  on: 'value' | 'freq';
  op: CondOp;
  a: number;
  /** cận trên khi op = between */
  b?: number;
  /** Cụm từ gốc trong đề, VD "ít nhất 3 năm" */
  phrase: string;
  /** Điều kiện ghép: "trên 3 năm VÀ dưới 6 năm", "dưới 2 năm HOẶC trên 6 năm" */
  join?: { type: 'and' | 'or'; cond: Condition };
}

export interface QuestionSpec {
  /** Câu hỏi (đã tách nếu một ý có nhiều yêu cầu) */
  question: string;
  dang: DangBaiCode | 'OUT' | 'UNKNOWN';
  askKind?: Bai22AskKind;
  condition?: Condition;
  /** Các giá trị được nhắc trong câu hỏi (khớp đúng với categories) */
  targets?: string[];
  compareMode?: 'diff' | 'ratio' | 'which_more';
  /** values_by_freq: hỏi "giá trị nào" (list) hay "bao nhiêu giá trị" (count) */
  answerStyle?: 'list' | 'count';
  chartKind?: 'bar' | 'line';
  /** Nguồn của kết luận: luật bằng code, gợi ý của AI, hay cả hai khớp nhau */
  source: 'rule' | 'ai' | 'rule+ai';
  confidence: 'high' | 'medium' | 'low';
  /** Giải thích ngắn (hiện cho giáo viên) */
  reason: string;
}

/** Gợi ý phân loại do Gemini trả về (chỉ dùng khi luật không nhận ra) */
export interface AiHint {
  dangBai?: string;
  askKind?: string;
  condition?: { on?: string; op?: string; a?: number; b?: number; phrase?: string } | null;
  targets?: string[];
  compareMode?: string;
}

// ───────────────────────── Đáp án do code tính ─────────────────────────

export interface Answer {
  /** Đáp án dạng số (nếu có) */
  number?: number;
  /** Đáp án là một hoặc nhiều giá trị */
  categories?: string[];
  /** Các giá trị được dùng để tính (VD các giá trị ≥ 3) */
  usedCategories?: string[];
  /** Phép tính trình bày trong lời giải, VD "5 + 7 + 9 + 5 + 2 = 28" */
  working: string;
  /** Câu trả lời hoàn chỉnh */
  sentence: string;
}

// ───────────────────────── Cấu trúc quy trình: dùng chung kiểu của app ─────────────────────────

export type {
  HintSet,
  McqOption,
  McqInteraction,
  OrderingInteraction,
  NumericInteraction,
  TableCell,
  TableFillInteraction,
  Interaction,
  DifficultyItem,
  ReferenceChart,
  PolyaStep,
} from '../types.ts';
import type { PolyaStep } from '../types.ts';

export type PartStatus =
  | 'ok' //               sinh quy trình bằng khuôn, đáp án do code tính
  | 'delegate' //         TS1/TS2/TS3: dùng khuôn sẵn có của app (đang chạy đúng)
  | 'needs_review' //     sinh được nhưng phân loại dựa vào AI → GV nên duyệt
  | 'out_of_scope' //     ngoài Bài 22
  | 'unsupported' //      không nhận ra dạng → không sinh, báo GV
  | 'invalid_data'; //    số liệu mâu thuẫn (VD tổng tần số đã biết > N)

export interface PartResult {
  label: string;
  spec: QuestionSpec;
  status: PartStatus;
  answer?: Answer;
  steps?: PolyaStep[];
  /** Ghi chú cho giáo viên */
  notes: string[];
}

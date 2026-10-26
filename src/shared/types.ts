/**
 * Phạm vi: Bài 22 (KNTT) – Bảng tần số và biểu đồ tần số.
 * TS1: Lập bảng tần số
 * TS2: Vẽ biểu đồ tần số dạng cột
 * TS3: Vẽ biểu đồ tần số dạng đoạn thẳng
 * TS4: Đọc – phân tích bảng/biểu đồ tần số (13 kiểu câu hỏi – xem AskKind)
 * TS5: Tìm tần số chưa biết (biết cỡ mẫu N)
 * TS6: Kiểm tra – sửa bảng tần số do bạn khác lập
 * Danh mục đầy đủ: src/shared/bai22/catalog.ts
 */
export type DangBaiCode = "TS1" | "TS2" | "TS3" | "TS4" | "TS5" | "TS6";

export type ChartKind = "none" | "bar" | "line";

/** Kiểu câu hỏi đọc – phân tích (TS4). "general" chỉ còn để đọc dữ liệu cũ. */
export type AskKind =
  | "max"
  | "min"
  | "value_freq"
  | "sample_size"
  | "count_condition"
  | "count_set"
  | "values_by_freq"
  | "compare"
  | "distinct_count"
  | "list_values"
  | "value_max"
  | "value_min"
  | "sum_values"
  | "remark"
  | "general";

/** Gợi ý phân loại do AI trả về (code kiểm tra lại, xem src/shared/bai22/classify.ts) */
export interface PartHint {
  dangBai?: string;
  askKind?: string;
  condition?: { on?: string; op?: string; a?: number; b?: number; phrase?: string } | null;
  targets?: string[];
  compareMode?: string;
}

export interface ProblemContext {
  doiTuong: string; // e.g. "học sinh lớp 9B"
  dauHieu: string;  // e.g. "điểm kiểm tra môn Toán"
  donVi: string;    // e.g. "điểm"
  tenMau: string;   // e.g. "điểm kiểm tra của 20 học sinh"
}

export interface ProblemPartAnalysis {
  label: string; // "a", "b", "c"
  question: string;
  dangBai: DangBaiCode;
  chartKind: ChartKind;
  askKind?: AskKind;       // chỉ dùng cho TS4
  targetValue?: string;    // TS4 + askKind = value_freq: giá trị được hỏi
  /** Gợi ý phân loại ban đầu của AI (giữ lại để code đối chiếu) */
  hint?: PartHint;
  /** Kết quả phân loại bằng code: ok | needs_review (GV nên duyệt) | unsupported (không sinh quy trình) */
  codeStatus?: "ok" | "needs_review" | "unsupported";
  /** Giải thích cách code hiểu câu hỏi (hiện cho giáo viên) */
  codeNote?: string;
}

export interface ProblemAnalysis {
  readable: boolean;
  inScope: boolean;
  outOfScopeReason: string;
  problemText: string;
  context: ProblemContext;
  /**
   * raw_list  : dãy dữ liệu liệt kê (VD1 cỡ giày)
   * raw_table : bảng ghi dữ liệu thô (Luyện tập 1: tên bạn đạt điểm tốt theo ngày)
   * freq_table: đề cho sẵn bảng tần số (VD2, Luyện tập 2)
   * freq_chart: đề cho sẵn biểu đồ tần số cột/đoạn thẳng (HĐ2)
   */
  sourceKind: "raw_list" | "raw_table" | "freq_table" | "freq_chart";
  sourceChartKind?: ChartKind; // khi sourceKind = freq_chart: dạng biểu đồ đề cho
  valueKind: "categorical" | "numeric";
  rawValues: string[];
  categories: string[];
  /** null = ô tần số bị thiếu trong đề (dạng TS5) */
  frequencies: (number | null)[];
  statedSampleSize: number; // -1 if not stated
  /** TS6: bảng tần số do một bạn lập, đề yêu cầu kiểm tra (cùng thứ tự categories) */
  claimedFrequencies?: (number | null)[];
  claimedBy?: string;
  valueLabel?: string;      // tên dòng giá trị trong bảng (VD "Cỡ giày")
  freqLabel?: string;       // tên dòng tần số (VD "Số bạn")
  chartTitle?: string;      // tiêu đề biểu đồ nếu đề cho
  parts: ProblemPartAnalysis[];
  notes: string;
}

export interface ComputedData {
  valueKind: "categorical" | "numeric";
  categories: string[];
  frequencies: number[];
  sampleSize: number;       // N
  niceAxis?: {
    step: number;
    max: number;
    min: number;
    ticks: number[];
  };
  warnings: string[];
}

export interface HintSet {
  level1: string;
  level2: string;
  level3: string;
  fullExplanation: string;
}

export type InteractionType =
  | "mcq"
  | "dropdown_match"
  | "numeric"
  | "table_fill"
  | "ordering"
  | "chart_plot";

export interface McqOption {
  id: string;
  text: string;
  feedback?: string;
}

export interface BaseInteraction {
  id: string;
  type: InteractionType;
  prompt: string;
  hints: HintSet;
  successMsg: string;
  weight: number;
  /** Nhiệm vụ chứa đáp án cuối cùng của ý (bộ kiểm tra đối chiếu với kết quả code tính) */
  isFinalAnswer?: boolean;
}

export interface McqInteraction extends BaseInteraction {
  type: "mcq";
  options: McqOption[];
  correctOptionId: string;
}

export interface DropdownMatchItem {
  id: string;
  leftText: string;
  correctTargetId: string;
}

export interface DropdownMatchInteraction extends BaseInteraction {
  type: "dropdown_match";
  items: DropdownMatchItem[];
  availableOptions: { id: string; label: string }[];
}

export interface NumericInteraction extends BaseInteraction {
  type: "numeric";
  correctValue: number;
  tolerance: number; // e.g. 0.05
  unit?: string;
  placeholder?: string;
  /** Phản hồi riêng cho các đáp số sai hay gặp */
  commonErrors?: { value: number; feedback: string }[];
}

export interface TableCell {
  row: number;
  col: number;
  value: string;
  isEditable: boolean;
  expectedValue?: string;
}

export interface TableFillInteraction extends BaseInteraction {
  type: "table_fill";
  headers: string[];
  rowHeaders?: string[];
  matrix: TableCell[][];
  /** horizontal = bảng ngang giống SGK (dòng Giá trị / dòng Tần số) */
  orientation?: "vertical" | "horizontal";
}

export interface OrderingItem {
  id: string;
  text: string;
}

export interface OrderingInteraction extends BaseInteraction {
  type: "ordering";
  items: OrderingItem[];
  correctOrder: string[]; // array of ids
}

export interface ChartPlotInteraction extends BaseInteraction {
  type: "chart_plot";
  chartKind: "bar" | "line";
  title: string;
  xAxisLabel: string;
  yAxisLabel: string;
  categories: string[];
  expectedValues: number[];
  unit?: string;
  axisConfig: {
    min: number;
    max: number;
    step: number;
    ticks: number[];
  };
  /** Hiện bảng tần số tham chiếu cạnh biểu đồ (khi bảng đã có trong đề hoặc đã lập ở ý trước) */
  showSourceTable?: boolean;
  tableValueLabel?: string;
  tableFreqLabel?: string;
}

/** Biểu đồ chỉ để xem (lồng vào bước của quy trình) */
export interface ReferenceChart {
  kind: "bar" | "line";
  title: string;
  xAxisLabel: string;
  yAxisLabel: string;
  categories: string[];
  values: number[];
  axisConfig: { min: number; max: number; step: number; ticks: number[] };
  caption?: string;
}

export type Interaction =
  | McqInteraction
  | DropdownMatchInteraction
  | NumericInteraction
  | TableFillInteraction
  | OrderingInteraction
  | ChartPlotInteraction;

export interface DifficultyItem {
  id: string;
  title: string;
  detail: string;
}

export interface PolyaStep {
  stepNo: 1 | 2 | 3 | 4;
  title: string;
  intro: string;
  mainTasks: Interaction[];
  difficulties: DifficultyItem[];
  reflectionPrompt: string;
  preHintQuiz: McqInteraction;
  hintCard: string;
  modelSolution?: string;
  /** Biểu đồ minh họa hiển thị ngay trong bước (nếu có) */
  referenceChart?: ReferenceChart;
}

export interface ProcessPart {
  label: string; // e.g. "a", "b"
  question: string;
  dangBai: DangBaiCode;
  chartKind: ChartKind;
  askKind?: AskKind;
  /** Phân loại dựa vào AI hoặc AI và code hiểu khác nhau → giáo viên nên duyệt */
  needsReview?: boolean;
  /** Ghi chú cho giáo viên: code đã hiểu câu hỏi thế nào */
  reviewNotes?: string[];
  steps: PolyaStep[];
}

/** Ý không sinh được quy trình (ngoài phạm vi / chưa nhận ra dạng / số liệu mâu thuẫn) */
export interface SkippedPart {
  label: string;
  question: string;
  reason: string;
}

export interface PolyaProcess {
  id: string;
  textHash: string;
  dataHash: string;
  templateVersion: string;
  problemText: string;
  problemImageUrl?: string;
  analysis: ProblemAnalysis;
  computed: ComputedData;
  /** Biểu đồ của đề bài (khi đề cho sẵn biểu đồ) – hiển thị trong thẻ đề */
  sourceChart?: ReferenceChart;
  parts: ProcessPart[];
  /** Các ý bị bỏ qua (không tự sinh để tránh hướng dẫn sai) */
  skippedParts?: SkippedPart[];
  aiPolished: boolean;
  status: "generating" | "ready" | "failed";
  usageCount: number;
  createdAt: string;
}

export interface Student {
  id: string;
  name: string;
  className: string;
  school: string;
  createdAt: string;
}

export interface Attempt {
  id: string;
  studentId: string;
  processId: string;
  attemptNo: number;
  startedAt: string;
  finishedAt?: string;
  status: "in_progress" | "completed";
  score: number;
  wrongTotal: number;
  wrongByStep: Record<string, number>;
  timeByStep: Record<string, number>; // seconds
  reflections: Record<string, string>; // stepId -> reflection text
  progress: {
    currentPartIndex: number;
    currentStepNo: 1 | 2 | 3 | 4;
    completedInteractions: string[];
    completedPreHints: string[];
    currentPhase: "main" | "reflection" | "prehint" | "hintcard";
  };
  assignmentId?: string;
}

export interface AnswerEvent {
  id: string;
  attemptId: string;
  studentId: string;
  processId: string;
  dangBai: DangBaiCode;
  partLabel: string;
  stepNo: number;
  phase: "main" | "prehint";
  interactionId: string;
  answer: string;
  isCorrect: boolean;
  tryNo: number;
  hintLevelShown: number;
  usedModelSolution: boolean;
  timestamp: string;
}

export interface TeacherStats {
  totalStudents: number;
  totalAttempts: number;
  avgScore: number;
  totalProcesses: number;
  failedCount: number;
  attemptsByDate: { date: string; count: number }[];
}

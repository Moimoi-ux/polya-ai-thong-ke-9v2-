/**
 * PHẦN DÀNH CHO GEMINI (server/gemini.ts của app).
 *
 * Gemini chỉ làm 2 việc: (1) CHÉP ĐỀ thành dữ liệu có cấu trúc, (2) GỢI Ý dạng câu hỏi.
 * Gemini KHÔNG tính đáp án, KHÔNG quyết định dạng bài cuối cùng – code làm việc đó.
 */
import type { AiHint, FreqTable } from './types.ts';
import type { ComputedData, ProblemAnalysis, ProblemPartAnalysis } from '../types.ts';

/** Đoạn hướng dẫn ghép thêm vào prompt phân tích đề hiện có */
export const BAI22_EXTRACTION_RULES = `
QUY TẮC BẮT BUỘC (Bài 22 – Bảng tần số và biểu đồ tần số):
1. Em chỉ CHÉP lại đề. Không tự tính đáp án, không làm tròn, không sửa số liệu của đề.
2. Mỗi ý (a, b, c...) chép NGUYÊN VĂN câu hỏi vào "question" (giữ đủ các cụm như "ít nhất 3 năm", "từ 2 đến 4", "hoặc").
3. "doiTuong": đối tượng được đếm – chính là thứ mà TẦN SỐ đếm (VD "y tá", "học sinh", "trận đấu").
   "donVi": đơn vị của GIÁ TRỊ (VD "năm", "điểm", "bàn thắng"); để "" nếu giá trị không có đơn vị (cỡ giày, tên, xếp loại).
4. Đề cho biểu đồ: đọc chiều cao từng cột/điểm thành "categories" + "frequencies" theo đúng thứ tự trục ngang.
   Biểu đồ tranh: quy đổi mỗi biểu tượng theo chú thích rồi ghi như bảng tần số.
5. Ô tần số bị thiếu/nhòe/ghi bằng chữ (x, m, ?) → ghi -1 vào vị trí đó trong "frequencies". Nếu đề nêu cỡ mẫu thì ghi vào "statedSampleSize".
6. Đề cho bảng tần số do một bạn lập để kiểm tra đúng/sai → ghi bảng đó vào "claimedFrequencies" (cùng thứ tự categories) và tên bạn vào "claimedBy"; dữ liệu gốc vẫn ghi vào "rawValues". Đề không có thì bỏ qua hai trường này.
7. Các trường askKind, condOn, condOp, condA, condB, targets, compareMode của mỗi ý là GỢI Ý phân loại (code sẽ kiểm tra lại; không chắc thì bỏ qua):
   - askKind = "count_condition" khi hỏi SỐ ĐỐI TƯỢNG có giá trị thỏa điều kiện kèm số:
       "ít nhất k", "không ít hơn k", "từ k trở lên" → op "gte";  "nhiều nhất k", "không quá k" → "lte";
       "trên k", "hơn k" → "gt";  "dưới k", "chưa đến k" → "lt";  "từ a đến b" → "between" (a, b).
     Ghi điều kiện vào condOp (gte/gt/lte/lt/between/eq), condA (số k hoặc a), condB (số b nếu "between"), condOn = "value".
     CHÚ Ý: "ít nhất 3 năm" KHÔNG phải "giá trị có tần số nhỏ nhất". Khi sau "ít nhất / nhiều nhất" có số, đó là điều kiện.
   - "values_by_freq" khi điều kiện đặt lên SỐ LƯỢNG (VD "ngày nào có trên 20 học sinh") – condOn = "freq".
   - "sample_size" (tổng số đối tượng), "value_freq" (tần số của 1 giá trị – ghi giá trị vào targets),
     "count_set" (cộng tần số nhiều giá trị – ghi các giá trị vào targets), "compare" (2 giá trị, compareMode "diff" | "ratio" | "which_more"),
     "max", "min" (giá trị xuất hiện nhiều/ít nhất – KHÔNG kèm số), "value_max", "value_min" (độ lớn giá trị),
     "distinct_count", "list_values", "sum_values" (tổng Σ giá trị × tần số), "remark" (nhận xét).
   - Ý lập bảng / vẽ biểu đồ / tìm tần số thiếu / kiểm tra bảng của bạn: dangBai "TS1" / "TS2" (cột) / "TS3" (đoạn thẳng) / "TS5" / "TS6".
   - Không chắc thì KHÔNG ghi trường askKind (bỏ qua trường đó). KHÔNG được đoán "max" cho mọi câu.
`.trim();

/*
 * Khuôn trả lời (responseSchema) gửi Gemini nằm ở server/gemini.ts (ANALYSIS_SCHEMA).
 * Các trường gợi ý được để PHẲNG, chỉ dùng STRING/NUMBER/ARRAY – không dùng enum rỗng, không dùng "nullable"
 * (bản v3–v5 dùng enum có giá trị rỗng "" nên Gemini báo lỗi 400). server/geminiSchema.test.ts kiểm tra tự động.
 */

/** Khóa so khớp giá trị: "6,5" ≡ "6.5", không phân biệt hoa thường */
function catKey(c: string): string {
  const t = String(c ?? '').trim().toLowerCase();
  const n = parseFloat(t.replace(',', '.'));
  return /^-?\d+([.,]\d+)?$/.test(t) && !isNaN(n) ? `#${n}` : t.replace(/\s+/g, ' ');
}

/**
 * Chuyển kết quả phân tích (ProblemAnalysis) + số liệu code đã tính (ComputedData) sang FreqTable.
 * - Ô tần số đề để trống (null) được giữ là null (dạng TS5).
 * - Bảng "của bạn An" (TS6) được sắp lại theo đúng thứ tự giá trị mà code đã tính.
 */
export function toFreqTable(analysis: ProblemAnalysis, computed: ComputedData): FreqTable {
  const cats = computed.categories;
  let freqs: (number | null)[] = [...computed.frequencies];
  const given = analysis.frequencies || [];
  if (
    (analysis.sourceKind === 'freq_table' || analysis.sourceKind === 'freq_chart') &&
    given.length === cats.length &&
    given.some((f) => f === null || f === undefined)
  ) {
    freqs = freqs.map((f, i) => (given[i] === null || given[i] === undefined ? null : f));
  }
  let claimed: (number | null)[] | undefined;
  if (Array.isArray(analysis.claimedFrequencies) && analysis.claimedFrequencies.length) {
    const src = analysis.categories || [];
    if (src.length === analysis.claimedFrequencies.length) {
      const m = new Map(src.map((c, i) => [catKey(c), analysis.claimedFrequencies![i]]));
      claimed = cats.map((c) => (m.has(catKey(c)) ? (m.get(catKey(c)) ?? null) : null));
    } else if (analysis.claimedFrequencies.length === cats.length) {
      claimed = analysis.claimedFrequencies;
    }
  }
  return {
    sourceKind: analysis.sourceKind,
    ...(analysis.sourceChartKind === 'line' || analysis.sourceChartKind === 'bar' ? { sourceChartKind: analysis.sourceChartKind } : {}),
    valueKind: computed.valueKind,
    categories: cats,
    frequencies: freqs,
    statedSampleSize: analysis.statedSampleSize > 0 ? analysis.statedSampleSize : -1,
    doiTuong: (analysis.context?.doiTuong || '').trim().replace(/^(các|những|mỗi)\s+/iu, ''),
    dauHieu: (analysis.context?.dauHieu || '').trim(),
    donVi: (analysis.context?.donVi || '').trim(),
    valueLabel: (analysis.valueLabel || '').trim(),
    ...(claimed ? { claimedFrequencies: claimed, claimedBy: analysis.claimedBy || '' } : {}),
  };
}

/** Gợi ý của AI cho một ý (hiểu cả trường cũ askKind/targetValue) */
export function hintFromPart(part: ProblemPartAnalysis): AiHint | null {
  if (part.hint && (part.hint.askKind || part.hint.dangBai)) return part.hint as AiHint;
  if (part.askKind && part.askKind !== 'general') {
    return { dangBai: part.dangBai, askKind: part.askKind, targets: part.targetValue ? [String(part.targetValue)] : [] };
  }
  return part.dangBai && part.dangBai !== 'TS4' ? { dangBai: part.dangBai } : null;
}

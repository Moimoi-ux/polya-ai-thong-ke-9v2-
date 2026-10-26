/**
 * Bộ test: mỗi câu hỏi có dạng mong đợi và đáp án mong đợi.
 * Chạy: npx tsx test/run.ts
 */
import { buildPart } from './index.ts';
import type { FreqTable } from './types.ts';

const T = (o: Partial<FreqTable> & Pick<FreqTable, 'categories' | 'frequencies'>): FreqTable => ({
  sourceKind: 'freq_table',
  valueKind: 'numeric',
  statedSampleSize: -1,
  doiTuong: 'học sinh',
  dauHieu: 'dữ liệu',
  donVi: '',
  valueLabel: 'Giá trị',
  ...o,
});

// CTST Toán 9 – Chương 7 Bài 1, Bài tập 1 (đề thầy kiểm tra)
const YTA = T({
  sourceKind: 'freq_chart', sourceChartKind: 'bar',
  categories: ['1', '2', '3', '4', '5', '6', '7'], frequencies: [6, 5, 5, 7, 9, 5, 2],
  doiTuong: 'y tá', dauHieu: 'thời gian công tác', donVi: 'năm', valueLabel: 'Số năm công tác',
});
// KNTT Bài 22 – VD1 cỡ giày (đề cho dãy số liệu)
const shoes = '40, 36, 37, 36, 40, 38, 39, 38, 37, 36, 40, 39, 36, 38, 37, 38, 38, 37, 38, 38, 38, 36'.split(', ');
const sizes = ['36', '37', '38', '39', '40'];
const GIAY = T({
  sourceKind: 'raw_list', categories: sizes, frequencies: sizes.map((s) => shoes.filter((x) => x === s).length),
  doiTuong: 'bạn nam', dauHieu: 'cỡ giày', donVi: '', valueLabel: 'Cỡ giày',
});
// Dữ liệu không là số
const HOCLUC = T({
  valueKind: 'categorical', categories: ['Giỏi', 'Khá', 'Trung bình'], frequencies: [8, 12, 5],
  doiTuong: 'học sinh', dauHieu: 'kết quả học tập', valueLabel: 'Mức đánh giá',
});
const THUVIEN = T({
  sourceKind: 'freq_chart', valueKind: 'categorical',
  categories: ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu'], frequencies: [30, 15, 20, 25, 35],
  doiTuong: 'học sinh', dauHieu: 'ngày đến thư viện mượn sách', valueLabel: 'Ngày',
});
const BONG = T({
  categories: ['0', '1', '2', '3', '4'], frequencies: [3, 5, 6, 4, 2],
  doiTuong: 'trận', dauHieu: 'số bàn thắng mỗi trận', donVi: 'bàn thắng', valueLabel: 'Số bàn thắng',
});
const DIEM_THIEU = T({
  categories: ['5', '6', '7', '8', '9', '10'], frequencies: [2, 4, null, 8, 3, 1], statedSampleSize: 25,
  doiTuong: 'học sinh', dauHieu: 'điểm kiểm tra', donVi: 'điểm', valueLabel: 'Điểm',
});
const DIEM_SUA = T({
  sourceKind: 'raw_list', categories: ['6', '7', '8', '9'], frequencies: [3, 5, 4, 2],
  claimedFrequencies: [3, 4, 5, 2], claimedBy: 'An',
  doiTuong: 'học sinh', dauHieu: 'điểm kiểm tra', donVi: 'điểm', valueLabel: 'Điểm',
});

type Exp = { dang: string; kind?: string; ans?: number | string[]; status?: string };
const cases: [FreqTable, string, Exp | Exp[]][] = [
  [YTA, 'Các y tá của phòng khám có thời gian công tác nhận những giá trị nào? Tìm tần số của mỗi giá trị đó.', { dang: 'TS1' }],
  [YTA, 'Phòng khám có tổng số bao nhiêu y tá?', { dang: 'TS4', kind: 'sample_size', ans: 39 }],
  [YTA, 'Có bao nhiêu y tá đã công tác ở phòng khám ít nhất 3 năm?', { dang: 'TS4', kind: 'count_condition', ans: 28 }],
  [YTA, 'Có bao nhiêu y tá công tác dưới 3 năm?', { dang: 'TS4', kind: 'count_condition', ans: 11 }],
  [YTA, 'Có bao nhiêu y tá công tác trên 5 năm?', { dang: 'TS4', kind: 'count_condition', ans: 7 }],
  [YTA, 'Có bao nhiêu y tá công tác từ 2 đến 4 năm?', { dang: 'TS4', kind: 'count_condition', ans: 17 }],
  [YTA, 'Có bao nhiêu y tá công tác nhiều nhất 2 năm?', { dang: 'TS4', kind: 'count_condition', ans: 11 }],
  [YTA, 'Có bao nhiêu y tá công tác không quá 4 năm?', { dang: 'TS4', kind: 'count_condition', ans: 23 }],
  [YTA, 'Số y tá công tác từ 5 năm trở lên là bao nhiêu?', { dang: 'TS4', kind: 'count_condition', ans: 16 }],
  [YTA, 'Có bao nhiêu y tá công tác hơn 6 năm?', { dang: 'TS4', kind: 'count_condition', ans: 2 }],
  [YTA, 'Có bao nhiêu y tá đã công tác ít nhất ba năm?', { dang: 'TS4', kind: 'count_condition', ans: 28 }],
  [YTA, 'Có bao nhiêu y tá công tác 4 năm?', { dang: 'TS4', kind: 'value_freq', ans: 7 }],
  [YTA, 'Số y tá công tác 5 năm nhiều hơn số y tá công tác 7 năm bao nhiêu người?', { dang: 'TS4', kind: 'compare', ans: 7 }],
  [YTA, 'Số y tá công tác 5 năm gấp mấy lần số y tá công tác 3 năm?', { dang: 'TS4', kind: 'compare', ans: 1.8 }],
  [YTA, 'Thời gian công tác nào có nhiều y tá nhất?', { dang: 'TS4', kind: 'max', ans: ['5'] }],
  [YTA, 'Thời gian công tác nào có ít y tá nhất?', { dang: 'TS4', kind: 'min', ans: ['7'] }],
  [YTA, 'Có bao nhiêu y tá công tác 1 năm hoặc 2 năm?', { dang: 'TS4', kind: 'count_set', ans: 11 }],
  [YTA, 'Thời gian công tác lâu nhất của các y tá là bao nhiêu năm?', { dang: 'TS4', kind: 'value_max', ans: 7 }],
  [YTA, 'Có bao nhiêu giá trị khác nhau?', { dang: 'TS4', kind: 'distinct_count', ans: 7 }],
  [YTA, 'Những thời gian công tác nào có đúng 5 y tá?', { dang: 'TS4', kind: 'values_by_freq', ans: ['2', '3', '6'] }],
  [YTA, 'Có bao nhiêu mức thời gian công tác có nhiều hơn 6 y tá?', { dang: 'TS4', kind: 'values_by_freq', ans: 2 }],
  [YTA, 'Em có nhận xét gì về thời gian công tác của các y tá?', { dang: 'TS4', kind: 'remark' }],
  [YTA, 'Tính tỉ lệ phần trăm y tá công tác 5 năm.', { dang: 'OUT', status: 'out_of_scope' }],
  [YTA, 'Vẽ biểu đồ tần số dạng cột và dạng đoạn thẳng.', [{ dang: 'TS2' }, { dang: 'TS3' }]],

  [GIAY, 'Lập bảng tần số cho dãy dữ liệu trên.', { dang: 'TS1' }],
  [GIAY, 'Từ bảng tần số, cho biết cỡ giày nào phù hợp với nhiều bạn nam trong lớp nhất.', { dang: 'TS4', kind: 'max', ans: ['38'] }],
  [GIAY, 'Lập bảng tần số và cho biết cỡ giày nào có ít bạn đi nhất.', [{ dang: 'TS1' }, { dang: 'TS4', kind: 'min', ans: ['39'] }]],
  [GIAY, 'Có bao nhiêu bạn nam đi giày cỡ từ 38 trở lên?', { dang: 'TS4', kind: 'count_condition', ans: 13 }],

  [HOCLUC, 'Mức đánh giá nào chiếm ưu thế nhất? Vì sao?', { dang: 'TS4', kind: 'max', ans: ['Khá'] }],
  [HOCLUC, 'Có bao nhiêu học sinh xếp loại Giỏi hoặc Khá?', { dang: 'TS4', kind: 'count_set', ans: 20 }],
  [HOCLUC, 'Số học sinh Khá nhiều hơn số học sinh Giỏi bao nhiêu em?', { dang: 'TS4', kind: 'compare', ans: 4 }],
  [HOCLUC, 'Có bao nhiêu học sinh được đánh giá?', { dang: 'TS4', kind: 'sample_size', ans: 25 }],
  [HOCLUC, 'Có bao nhiêu học sinh xếp loại Trung bình?', { dang: 'TS4', kind: 'value_freq', ans: 5 }],

  [THUVIEN, 'Ngày nào có nhiều học sinh đến mượn sách nhất?', { dang: 'TS4', kind: 'max', ans: ['Thứ sáu'] }],
  [THUVIEN, 'Những ngày nào có ít hơn 25 học sinh đến mượn sách?', { dang: 'TS4', kind: 'values_by_freq', ans: ['Thứ ba', 'Thứ tư'] }],
  [THUVIEN, 'Có bao nhiêu học sinh đến mượn sách vào thứ Năm?', { dang: 'TS4', kind: 'value_freq', ans: 25 }],
  [THUVIEN, 'Trong tuần có tất cả bao nhiêu lượt học sinh mượn sách?', { dang: 'TS4', kind: 'sample_size', ans: 125 }],

  [BONG, 'Cả giải có tổng cộng bao nhiêu bàn thắng?', { dang: 'TS4', kind: 'sum_values', ans: 37 }],
  [BONG, 'Có bao nhiêu trận có ít nhất 2 bàn thắng?', { dang: 'TS4', kind: 'count_condition', ans: 12 }],
  [BONG, 'Có bao nhiêu trận đấu?', { dang: 'TS4', kind: 'sample_size', ans: 20 }],
  [BONG, 'Có bao nhiêu trận có 2 bàn thắng?', { dang: 'TS4', kind: 'value_freq', ans: 6 }],

  [DIEM_THIEU, 'Tìm tần số còn thiếu của điểm 7.', { dang: 'TS5', ans: 7 }],
  [DIEM_SUA, 'Bảng tần số bạn An lập đúng hay sai? Nếu sai hãy sửa lại.', { dang: 'TS6', ans: ['7', '8'] }],
  [YTA, 'Hãy kể tên các y tá.', { dang: 'UNKNOWN', status: 'unsupported' }],
  [YTA, 'Có bao nhiêu y tá công tác trên 3 năm và dưới 6 năm?', { dang: 'TS4', kind: 'count_condition', ans: 16 }],
  [YTA, 'Có bao nhiêu y tá công tác dưới 2 năm hoặc trên 6 năm?', { dang: 'TS4', kind: 'count_condition', ans: 8 }],
  [YTA, 'Có bao nhiêu y tá có thâm niên không dưới 3 năm?', { dang: 'TS4', kind: 'count_condition', ans: 28 }],
  [YTA, 'Có bao nhiêu y tá công tác chưa đến 2 năm?', { dang: 'TS4', kind: 'count_condition', ans: 6 }],
  [YTA, 'Thời gian công tác nào có từ 7 y tá trở lên?', { dang: 'TS4', kind: 'values_by_freq', ans: ['4', '5'] }],
  [YTA, 'Giá trị 5 xuất hiện mấy lần?', { dang: 'TS4', kind: 'value_freq', ans: 9 }],
  [YTA, 'Có bao nhiêu y tá công tác ít nhất 3 năm nhưng không quá 5 năm?', { dang: 'TS4', kind: 'count_condition', ans: 21 }],
  [GIAY, 'Cỡ giày 38 có bao nhiêu bạn đi?', { dang: 'TS4', kind: 'value_freq', ans: 8 }],
  [GIAY, 'Dãy dữ liệu có bao nhiêu giá trị khác nhau?', { dang: 'TS4', kind: 'distinct_count', ans: 5 }],
  [GIAY, 'Cỡ giày lớn nhất mà các bạn nam đi là cỡ nào?', { dang: 'TS4', kind: 'value_max', ans: 40 }],
];

// Gợi ý của AI chỉ dùng khi luật không nhận ra → gắn cờ GV duyệt
{
  const r = buildPart('x', 'Hãy cho biết số y tá có kinh nghiệm lâu năm (từ ba năm) là bao nhiêu.', YTA, {
    aiHint: { askKind: 'count_condition', condition: { op: 'gte', a: 3 } },
  });
  console.log('AI-hint:', r[0].spec.dang, r[0].spec.askKind, r[0].spec.source, r[0].status, r[0].answer?.number);
}

{
  // Tình huống lỗi cũ: AI gán "max" cho ý c → code vẫn ra đúng 28, không cần duyệt
  const r = buildPart('c', 'Có bao nhiêu y tá đã công tác ở phòng khám ít nhất 3 năm?', YTA, { aiHint: { dangBai: 'TS4', askKind: 'max' } });
  console.log('Lỗi cũ (AI nói max):', r[0].spec.askKind, r[0].status, r[0].answer?.number);
  if (r[0].answer?.number !== 28 || r[0].status !== 'ok') { console.log('✗ hồi quy lỗi cũ'); process.exit(1); }
}

let pass = 0;
let fail = 0;
for (const [table, q, expRaw] of cases) {
  const exps = Array.isArray(expRaw) ? expRaw : [expRaw];
  const res = buildPart('x', q, table);
  const problems: string[] = [];
  if (res.length !== exps.length) problems.push(`số yêu cầu ${res.length} ≠ ${exps.length}`);
  exps.forEach((exp, i) => {
    const r = res[i];
    if (!r) return;
    if (r.spec.dang !== exp.dang) problems.push(`dạng ${r.spec.dang} ≠ ${exp.dang}`);
    if (exp.kind && r.spec.askKind !== exp.kind) problems.push(`kiểu ${r.spec.askKind} ≠ ${exp.kind}`);
    if (exp.status && r.status !== exp.status) problems.push(`trạng thái ${r.status} ≠ ${exp.status}`);
    if (!exp.status && !['ok', 'delegate'].includes(r.status)) problems.push(`trạng thái ${r.status}: ${r.notes.join(' | ')}`);
    if (exp.ans !== undefined) {
      if (typeof exp.ans === 'number' && r.answer?.number !== exp.ans) problems.push(`đáp số ${r.answer?.number} ≠ ${exp.ans}`);
      if (Array.isArray(exp.ans) && JSON.stringify(r.answer?.categories) !== JSON.stringify(exp.ans)) problems.push(`đáp án ${JSON.stringify(r.answer?.categories)} ≠ ${JSON.stringify(exp.ans)}`);
    }
  });
  if (problems.length) {
    fail++;
    console.log(`✗ ${q}\n    ${problems.join('\n    ')}`);
  } else {
    pass++;
    const r = res[res.length - 1];
    console.log(`✓ ${q.slice(0, 70).padEnd(72)} ${r.spec.dang}${r.spec.askKind ? '/' + r.spec.askKind : ''}${r.answer ? ' → ' + r.answer.sentence : ''}`);
  }
}
console.log(`\n${pass} đạt, ${fail} lỗi / ${cases.length} ca`);
if (fail) process.exit(1);

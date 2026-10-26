/**
 * Kiểm thử đầu-cuối: kết quả AI (giả lập, kể cả AI phân loại SAI như trước) → code phân loại lại
 * → dựng quy trình → kiểm tra đáp án ở Bước 3. Chạy: npx tsx server/processGenerator.test.ts
 */
import { sanitizeAnalysis } from './gemini.ts';
import { buildProcessParts, upgradeProcess, TEMPLATE_VERSION } from './processGenerator.ts';
import { storage } from './storage.ts';
import type { Interaction, PolyaProcess, ProcessPart } from '../src/shared/types.ts';

// Kiểm thử KHÔNG được ghi vào Firestore thật của thầy
(storage as any).saveProcess = async () => ({ persisted: true });

let failed = 0;
function check(cond: boolean, msg: string) {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failed++;
}

function finalAnswer(part: ProcessPart): string {
  const t = part.steps[2].mainTasks.find((x: Interaction) => x.isFinalAnswer || x.id.endsWith('-s3-answer'));
  if (!t) return '';
  if (t.type === 'numeric') return String(t.correctValue);
  if (t.type === 'mcq') return t.options.find((o) => o.id === t.correctOptionId)?.text || '';
  return t.type;
}

const base = (o: any) =>
  sanitizeAnalysis({
    readable: true,
    inScope: true,
    problemText: o.problemText || 'Đề',
    context: { doiTuong: '', dauHieu: '', donVi: '', tenMau: '', ...(o.context || {}) },
    rawValues: [],
    categories: [],
    frequencies: [],
    statedSampleSize: -1,
    valueKind: 'numeric',
    notes: '',
    ...o,
  });

// 1. Bài y tá – AI phân loại như bản cũ (b: max, c: general)
const yta = base({
  problemText:
    '1. Biểu đồ bên thống kê thời gian công tác (theo năm) của các y tá ở một phòng khám.\na) Các y tá của phòng khám có thời gian công tác nhận những giá trị nào? Tìm tần số của mỗi giá trị đó.\nb) Phòng khám có tổng số bao nhiêu y tá?\nc) Có bao nhiêu y tá đã công tác ở phòng khám ít nhất 3 năm?',
  context: { doiTuong: 'các y tá ở một phòng khám', dauHieu: 'thời gian công tác', donVi: 'năm', tenMau: '' },
  sourceKind: 'freq_chart',
  sourceChartKind: 'bar',
  categories: ['1', '2', '3', '4', '5', '6', '7'],
  frequencies: [6, 5, 5, 7, 9, 5, 2],
  valueLabel: 'Số năm công tác',
  parts: [
    { label: 'a', question: 'Các y tá của phòng khám có thời gian công tác nhận những giá trị nào? Tìm tần số của mỗi giá trị đó.', dangBai: 'TS1', chartKind: 'none' },
    { label: 'b', question: 'Phòng khám có tổng số bao nhiêu y tá?', dangBai: 'TS4', chartKind: 'none', askKind: 'max' },
    { label: 'c', question: 'Có bao nhiêu y tá đã công tác ở phòng khám ít nhất 3 năm?', dangBai: 'TS4', chartKind: 'none', askKind: 'general' },
  ],
});
check(yta.parts.map((p) => `${p.label}:${p.dangBai}/${p.askKind || ''}`).join(' ') === 'a:TS1/ b:TS4/sample_size c:TS4/count_condition', `Y tá – phân loại lại: ${yta.parts.map((p) => `${p.label}:${p.dangBai}/${p.askKind || ''}`).join(' ')}`);
const r1 = buildProcessParts(yta);
check(r1.parts.length === 3 && r1.skippedParts.length === 0, 'Y tá – đủ 3 ý, không ý nào bị bỏ');
check(finalAnswer(r1.parts[1]) === '39', `Y tá b) = ${finalAnswer(r1.parts[1])} (mong đợi 39)`);
check(finalAnswer(r1.parts[2]) === '28', `Y tá c) = ${finalAnswer(r1.parts[2])} (mong đợi 28)`);
check(!!r1.parts[2].steps[0].referenceChart, 'Y tá c) – Bước 1 có biểu đồ của đề');
check(!r1.parts[2].needsReview, 'Y tá c) – không cần GV duyệt (code có căn cứ rõ)');

// 2. Quy trình cũ trong Thư viện → tự nâng cấp khi mở
const oldProc: PolyaProcess = {
  id: 'proc_old',
  textHash: 'x',
  dataHash: 'y',
  templateVersion: 'v2.1.0-bai22',
  problemText: yta.problemText,
  analysis: { ...yta, parts: yta.parts.map((p) => ({ label: p.label, question: p.question, dangBai: p.label === 'a' ? 'TS1' : 'TS4', chartKind: 'none', askKind: 'max' })) } as any,
  computed: r1.computed,
  parts: [],
  aiPolished: true,
  status: 'ready',
  usageCount: 3,
  createdAt: '2026-10-01T00:00:00Z',
};
const up = await upgradeProcess(oldProc);
check(up.templateVersion === TEMPLATE_VERSION && up.id === 'proc_old' && up.usageCount === 3, `Nâng cấp đề cũ: ${up.templateVersion}, giữ mã quy trình`);
check(finalAnswer(up.parts[2]) === '28', `Đề cũ sau nâng cấp – ý c) = ${finalAnswer(up.parts[2])}`);

// 3. Thiếu một tần số (TS5) + vẽ biểu đồ dùng tần số vừa tìm
const ts5 = base({
  context: { doiTuong: 'học sinh', dauHieu: 'điểm kiểm tra', donVi: 'điểm', tenMau: '' },
  sourceKind: 'freq_table',
  categories: ['5', '6', '7', '8', '9', '10'],
  frequencies: [2, 4, null, 8, 3, 1],
  statedSampleSize: 25,
  valueLabel: 'Điểm',
  parts: [
    { label: 'a', question: 'Tìm tần số còn thiếu của điểm 7.', dangBai: 'TS4', chartKind: 'none' },
    { label: 'b', question: 'Vẽ biểu đồ tần số dạng cột.', dangBai: 'TS2', chartKind: 'bar' },
  ],
});
const r3 = buildProcessParts(ts5);
check(r3.parts[0].dangBai === 'TS5' && finalAnswer(r3.parts[0]) === '7', `TS5: x = ${finalAnswer(r3.parts[0])}`);
const plot = r3.parts[1].steps[2].mainTasks.find((t) => t.type === 'chart_plot');
check(!!plot && plot.type === 'chart_plot' && plot.expectedValues.join(',') === '2,4,7,8,3,1', 'TS5: biểu đồ ở ý b) dùng tần số vừa tìm (7)');

// 4. AI đã tự tách ý "lập bảng và cho biết…" thành b.1, b.2 (chép cùng câu) → không bị nhân đôi
const shoes = '40, 36, 37, 36, 40, 38, 39, 38, 37, 36, 40, 39, 36, 38, 37, 38, 38, 37, 38, 38, 38, 36'.split(', ');
const giay = base({
  context: { doiTuong: 'các bạn nam trong lớp', dauHieu: 'cỡ giày', donVi: '', tenMau: '' },
  sourceKind: 'raw_list',
  rawValues: shoes,
  valueLabel: 'Cỡ giày',
  parts: [
    { label: 'a', question: 'Lập bảng tần số và cho biết cỡ giày nào có nhiều bạn đi nhất.', dangBai: 'TS1', chartKind: 'none' },
    { label: 'a.2', question: 'Lập bảng tần số và cho biết cỡ giày nào có nhiều bạn đi nhất.', dangBai: 'TS4', chartKind: 'none', askKind: 'max' },
    { label: 'b', question: 'Có bao nhiêu bạn nam đi giày cỡ từ 38 trở lên?', dangBai: 'TS4', chartKind: 'none', askKind: 'max' },
    { label: 'c', question: 'Vẽ biểu đồ tần số dạng cột và dạng đoạn thẳng.', dangBai: 'TS2', chartKind: 'bar' },
  ],
});
check(giay.parts.map((p) => `${p.label}:${p.dangBai}`).join(' ') === 'a.1:TS1 a.2:TS4 b:TS4 c.1:TS2 c.2:TS3', `Cỡ giày – tách/gộp ý: ${giay.parts.map((p) => `${p.label}:${p.dangBai}`).join(' ')}`);
const r4 = buildProcessParts(giay);
check(finalAnswer(r4.parts[1]) === '38', `Cỡ giày a.2) = ${finalAnswer(r4.parts[1])}`);
check(finalAnswer(r4.parts[2]) === '13', `Cỡ giày b) = ${finalAnswer(r4.parts[2])} (đề cho dãy số → có bước lập bảng trước)`);
check(r4.parts[2].steps[2].mainTasks[0].type === 'table_fill', 'Cỡ giày b) – Bước 3 lập bảng tần số trước');

// 5. Câu không nhận ra → bỏ qua, các ý khác vẫn sinh
const unk = base({
  context: { doiTuong: 'y tá', dauHieu: 'thời gian công tác', donVi: 'năm', tenMau: '' },
  sourceKind: 'freq_table',
  categories: ['1', '2', '3'],
  frequencies: [4, 5, 6],
  parts: [
    { label: 'a', question: 'Hãy kể tên các y tá.', dangBai: 'TS4', chartKind: 'none' },
    { label: 'b', question: 'Thời gian công tác nào có nhiều y tá nhất?', dangBai: 'TS4', chartKind: 'none', askKind: 'max' },
  ],
});
const r5 = buildProcessParts(unk);
check(r5.parts.length === 1 && r5.skippedParts.length === 1 && r5.skippedParts[0].label === 'a', 'Câu không nhận ra: bỏ qua ý a, vẫn sinh ý b');

// 6. Đề trắc nghiệm A–D (khuôn cũ vẫn giữ phương án của đề)
const tn = base({
  problemText: 'Câu 8. Biểu đồ tần số cho số học sinh mượn sách. Ngày nào có nhiều học sinh mượn sách nhất?\nA. Thứ hai\nB. Thứ ba\nC. Thứ tư\nD. Thứ năm',
  context: { doiTuong: 'học sinh', dauHieu: 'ngày mượn sách', donVi: '', tenMau: '' },
  sourceKind: 'freq_chart',
  valueKind: 'categorical',
  categories: ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm'],
  frequencies: [30, 15, 20, 25],
  parts: [{ label: 'a', question: 'Ngày nào có nhiều học sinh mượn sách nhất?', dangBai: 'TS4', chartKind: 'none', askKind: 'max' }],
});
const r6 = buildProcessParts(tn);
check(finalAnswer(r6.parts[0]).startsWith('A.'), `Trắc nghiệm A–D: đáp án ${finalAnswer(r6.parts[0])}`);

// 7. Kiểm tra bảng của bạn (TS6), AI ghi các giá trị theo thứ tự khác
const ts6 = base({
  context: { doiTuong: 'học sinh', dauHieu: 'điểm kiểm tra', donVi: 'điểm', tenMau: '' },
  sourceKind: 'raw_list',
  rawValues: '7 6 8 7 9 6 7 8 6 7 8 9 7 8'.split(' '),
  categories: ['9', '8', '7', '6'],
  claimedFrequencies: [2, 5, 4, 3],
  claimedBy: 'An',
  parts: [{ label: 'a', question: 'Bảng tần số bạn An lập đúng hay sai? Nếu sai hãy sửa lại.', dangBai: 'TS6', chartKind: 'none' }],
});
const r7 = buildProcessParts(ts6);
check(r7.parts[0].dangBai === 'TS6' && finalAnswer(r7.parts[0]) === '7 điểm và 8 điểm', `TS6: sai ở ${finalAnswer(r7.parts[0])}`);

console.log(failed ? `\n${failed} kiểm thử lỗi` : '\n--- KIỂM THỬ ĐẦU-CUỐI ĐỀU ĐẠT ---');
process.exit(failed ? 1 : 0);

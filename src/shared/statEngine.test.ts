import {
  computeStatistics,
  parseVietnameseNumber,
  formatVietnameseNumber,
  fixHyphenatedVietnameseWords,
  extractDataSeries,
  calculateNiceAxis,
} from './statEngine.ts';
import { buildPolyaStepsForPart } from './templates/index.ts';
import { ProblemAnalysis, Interaction } from './types.ts';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`TEST FAILED: ${msg}`);
}

function base(overrides: Partial<ProblemAnalysis>): ProblemAnalysis {
  return {
    readable: true,
    inScope: true,
    outOfScopeReason: '',
    problemText: '',
    context: { doiTuong: 'học sinh', dauHieu: 'dữ liệu', donVi: '', tenMau: 'mẫu' },
    sourceKind: 'raw_list',
    valueKind: 'numeric',
    rawValues: [],
    categories: [],
    frequencies: [],
    statedSampleSize: -1,
    parts: [],
    notes: '',
    ...overrides,
  };
}

/** Kiểm tra tính hợp lệ của toàn bộ quy trình sinh ra */
function validateProcess(name: string, analysis: ProblemAnalysis) {
  const computed = computeStatistics(analysis);
  for (const part of analysis.parts) {
    const steps = buildPolyaStepsForPart(analysis, computed, part);
    assert(steps.length === 4, `${name}/${part.label}: phải có 4 bước`);
    const ids = new Set<string>();
    for (const step of steps) {
      const all: Interaction[] = [...step.mainTasks, step.preHintQuiz];
      assert(step.mainTasks.length > 0, `${name}/${part.label}/B${step.stepNo}: không có nhiệm vụ`);
      for (const t of all) {
        assert(!ids.has(t.id) || t === step.preHintQuiz, `${name}: trùng id ${t.id}`);
        ids.add(t.id);
        if (t.type === 'mcq') {
          assert(t.options.length >= 2, `${name}/${t.id}: MCQ cần ≥ 2 lựa chọn`);
          assert(t.options.some((o) => o.id === t.correctOptionId), `${name}/${t.id}: thiếu đáp án đúng`);
          const texts = t.options.map((o) => o.text.toLowerCase());
          assert(new Set(texts).size === texts.length, `${name}/${t.id}: lựa chọn bị trùng`);
        }
        if (t.type === 'table_fill') {
          t.matrix.forEach((row) => row.forEach((c) => assert(!c.isEditable || c.expectedValue !== undefined, `${name}/${t.id}: ô thiếu đáp án`)));
        }
        if (t.type === 'chart_plot') {
          assert(t.expectedValues.length === t.categories.length, `${name}/${t.id}: số cột không khớp`);
          assert(Math.max(...t.expectedValues) < t.axisConfig.max, `${name}/${t.id}: trục đứng phải cao hơn tần số lớn nhất`);
          assert(t.expectedValues.every((v) => Number.isInteger(v)), `${name}/${t.id}: tần số phải là số nguyên`);
        }
        if (t.type === 'ordering') {
          assert(t.items.length === t.correctOrder.length, `${name}/${t.id}: ordering lệch`);
        }
      }
    }
  }
  return computed;
}

function runTests() {
  console.log('--- UNIT TESTS: Bài 22 – Bảng tần số và biểu đồ tần số ---');

  // VD1: Cỡ giày (SGK)
  const vd1 = base({
    context: { doiTuong: 'các bạn nam trong lớp', dauHieu: 'cỡ giày', donVi: '', tenMau: 'cỡ giày của 22 bạn nam' },
    rawValues: '40, 36, 37, 36, 40, 38, 39, 38, 37, 36, 40, 39, 36, 38, 37, 38, 38, 37, 38, 38, 38, 36'.split(', '),
    valueLabel: 'Cỡ giày',
    parts: [
      { label: 'a', question: 'Lập bảng tần số', dangBai: 'TS1', chartKind: 'none' },
      { label: 'b', question: 'Cỡ giày nào phù hợp với nhiều bạn nam nhất?', dangBai: 'TS4', chartKind: 'none', askKind: 'max' },
    ],
  });
  const r1 = validateProcess('VD1', vd1);
  assert(JSON.stringify(r1.categories) === JSON.stringify(['36', '37', '38', '39', '40']), `VD1 categories ${r1.categories}`);
  assert(JSON.stringify(r1.frequencies) === JSON.stringify([5, 4, 8, 2, 3]), `VD1 freq ${r1.frequencies}`);
  assert(r1.sampleSize === 22, 'VD1 N = 22');
  console.log('✓ VD1 cỡ giày: 36:5, 37:4, 38:8, 39:2, 40:3; N = 22');

  // Luyện tập 1: tên bạn đạt điểm tốt (dữ liệu không phải số, bảng thô)
  const lt1 = base({
    sourceKind: 'raw_table',
    valueKind: 'categorical',
    context: { doiTuong: 'học sinh lớp 9E', dauHieu: 'tên bạn đạt điểm tốt', donVi: '', tenMau: '' },
    rawValues: ['Bình', 'Nam', 'Tuấn', 'Thảo', 'Bình', 'Yến', 'Nam', 'Nam', 'Thảo'],
    valueLabel: 'Tên bạn',
    parts: [
      { label: 'a', question: 'Lập bảng tần số', dangBai: 'TS1', chartKind: 'none' },
      { label: 'b', question: 'Bạn nào đạt điểm tốt nhiều nhất?', dangBai: 'TS4', chartKind: 'none', askKind: 'max' },
    ],
  });
  const r2 = validateProcess('LT1', lt1);
  assert(JSON.stringify(r2.categories) === JSON.stringify(['Bình', 'Nam', 'Tuấn', 'Thảo', 'Yến']), `LT1 cats ${r2.categories}`);
  assert(JSON.stringify(r2.frequencies) === JSON.stringify([2, 3, 1, 2, 1]), `LT1 freq ${r2.frequencies}`);
  console.log('✓ LT1 tên bạn: Bình 2, Nam 3, Tuấn 1, Thảo 2, Yến 1');

  // T1: điểm kiểm tra + vẽ biểu đồ cột
  const t1 = base({
    rawValues: ['7', '8', '8', '9', '6', '7', '8', '10', '9', '8', '7', '6', '8', '9', '7', '8', '10', '8', '7', '9'],
    statedSampleSize: 20,
    parts: [
      { label: 'a', question: 'Lập bảng tần số', dangBai: 'TS1', chartKind: 'none' },
      { label: 'b', question: 'Vẽ biểu đồ tần số dạng cột', dangBai: 'TS2', chartKind: 'bar' },
    ],
  });
  const r3 = validateProcess('T1', t1);
  assert(JSON.stringify(r3.frequencies) === JSON.stringify([2, 5, 7, 4, 2]), `T1 freq ${r3.frequencies}`);
  assert(r3.warnings.length === 0, 'T1 không có cảnh báo');
  console.log('✓ T1 điểm: 6:2, 7:5, 8:7, 9:4, 10:2');

  // VD2: bảng cho sẵn → cột + đoạn thẳng
  const vd2 = base({
    sourceKind: 'freq_table',
    categories: ['0', '1', '2', '3'],
    frequencies: [8, 19, 6, 4],
    valueLabel: 'Số anh, chị, em ruột',
    freqLabel: 'Số học sinh',
    parts: [
      { label: 'a', question: 'Vẽ biểu đồ cột', dangBai: 'TS2', chartKind: 'bar' },
      { label: 'b', question: 'Vẽ biểu đồ đoạn thẳng', dangBai: 'TS3', chartKind: 'line' },
    ],
  });
  const r4 = validateProcess('VD2', vd2);
  assert(r4.sampleSize === 37, 'VD2 N = 37');
  assert(r4.niceAxis!.max === 20 && r4.niceAxis!.step === 2, `VD2 axis ${JSON.stringify(r4.niceAxis)}`);
  console.log('✓ VD2 bảng cho sẵn: N = 37, trục 0–20 bước 2');

  // HĐ2: đọc biểu đồ → lập bảng + ít nhất
  const hd2 = base({
    sourceKind: 'freq_chart',
    sourceChartKind: 'bar',
    categories: ['6', '7', '8', '9', '10'],
    frequencies: [3, 8, 12, 6, 4],
    parts: [
      { label: 'a', question: 'Lập bảng tần số', dangBai: 'TS1', chartKind: 'none' },
      { label: 'b', question: 'Điểm nào ít học sinh đạt nhất?', dangBai: 'TS4', chartKind: 'none', askKind: 'min' },
    ],
  });
  const r5 = validateProcess('HD2', hd2);
  assert(r5.sampleSize === 33, 'HD2 N = 33');
  console.log('✓ HĐ2 đọc biểu đồ: N = 33');

  // TS4 value_freq + categorical order given (Tốt, Khá, Trung bình, Kém)
  const t2 = base({
    valueKind: 'categorical',
    rawValues: fixHyphenatedVietnameseWords(['Tốt', 'Trung', 'bình', 'Khá', 'Kém', 'Tốt', 'Khá']),
    categories: ['Tốt', 'Khá', 'Trung bình', 'Kém'],
    parts: [{ label: 'a', question: 'Có bao nhiêu bạn đánh giá Khá?', dangBai: 'TS4', chartKind: 'none', askKind: 'value_freq', targetValue: 'Khá' }],
  });
  const r6 = validateProcess('T2', t2);
  assert(JSON.stringify(r6.frequencies) === JSON.stringify([2, 2, 1, 1]), `T2 freq ${r6.frequencies}`);
  console.log('✓ T2 giữ thứ tự mức đánh giá, ghép "Trung" + "bình"');

  // Helpers
  assert(parseVietnameseNumber('6,5') === 6.5, 'parse 6,5');
  assert(parseVietnameseNumber('Bình') === null, 'parse text → null');
  assert(formatVietnameseNumber(6.5) === '6,5', 'format 6,5');
  const ax = calculateNiceAxis(12);
  assert(ax.max > 12 && ax.step === 2, `axis 12 → ${JSON.stringify(ax)}`);
  const ex = extractDataSeries('Cỡ giày: 40, 36, 37, 36.\na) Lập bảng tần số.');
  assert(ex.sampleSize === 4 && ex.isNumeric, `extract ${JSON.stringify(ex)}`);
  console.log('✓ Hàm phụ trợ hoạt động đúng');

  console.log('--- TẤT CẢ KIỂM THỬ ĐỀU ĐẠT ---');
}

runTests();

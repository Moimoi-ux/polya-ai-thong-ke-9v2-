import {
  ProblemAnalysis,
  ComputedData,
  PolyaStep,
  Interaction,
  McqInteraction,
  McqOption,
  TableFillInteraction,
  TableCell,
  ChartPlotInteraction,
  DifficultyItem,
  DangBaiCode,
  ChartKind,
  AskKind,
  ReferenceChart,
  HintSet,
} from '../types.ts';
import { extractChoiceOptions, ChoiceOption } from '../problemText.ts';

/**
 * KHUÔN QUY TRÌNH PÓLYA – BÀI 22: BẢNG TẦN SỐ VÀ BIỂU ĐỒ TẦN SỐ (Toán 9 – KNTT)
 *  TS1: Lập bảng tần số (từ dãy dữ liệu, bảng dữ liệu thô hoặc đọc từ biểu đồ)
 *  TS2: Vẽ biểu đồ tần số dạng cột
 *  TS3: Vẽ biểu đồ tần số dạng đoạn thẳng
 *  TS4: Đọc – phân tích bảng/biểu đồ tần số – ở file này chỉ còn 3 kiểu: nhiều nhất, ít nhất,
 *       tần số của một giá trị. Các kiểu còn lại của TS4 và TS5, TS6: xem src/shared/bai22/.
 * Mọi con số do code tính; AI chỉ trau chuốt lời dẫn.
 */

const REFLECTION_PROMPT =
  'Những khó khăn trong dự đoán có giống khó khăn mà em đang mắc phải khi giải quyết bài toán trên hay không? Em có gặp những khó khăn nào khác trong bước này không?';

// ───────────────────────── Helpers ─────────────────────────

/** Deterministic shuffle (seeded by a string) so cached processes stay stable */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface OptSpec {
  text: string;
  feedback?: string;
}

/** Build an MCQ with de-duplicated, shuffled options */
function buildMcq(args: {
  id: string;
  prompt: string;
  correct: OptSpec;
  wrongs: OptSpec[];
  hints: HintSet;
  successMsg: string;
  weight?: number;
  shuffle?: boolean;
}): McqInteraction {
  const seen = new Set<string>([args.correct.text.trim().toLowerCase()]);
  const wrongs: OptSpec[] = [];
  for (const w of args.wrongs) {
    const key = w.text.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    wrongs.push(w);
    if (wrongs.length >= 3) break;
  }
  if (wrongs.length === 0) {
    wrongs.push({ text: 'Không xác định được từ dữ liệu đã cho', feedback: 'Chưa đúng, dữ liệu đã cho đủ để trả lời.' });
  }
  const all: (OptSpec & { isCorrect: boolean })[] = [
    { ...args.correct, isCorrect: true },
    ...wrongs.map((w) => ({ ...w, isCorrect: false })),
  ];
  const ordered = args.shuffle === false ? all : seededShuffle(all, args.id);
  const options: McqOption[] = ordered.map((o, i) => ({
    id: `opt${i + 1}`,
    text: o.text,
    feedback: o.feedback || (o.isCorrect ? 'Chính xác!' : 'Chưa đúng, em xem lại nhé.'),
  }));
  const correctOptionId = options[ordered.findIndex((o) => o.isCorrect)].id;
  return {
    id: args.id,
    type: 'mcq',
    prompt: args.prompt,
    options,
    correctOptionId,
    hints: args.hints,
    successMsg: args.successMsg,
    weight: args.weight ?? 1,
  };
}

/** "a", "a và b", "a, b và c" */
function joinVi(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} và ${items[items.length - 1]}`;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

interface Ctx {
  partLabel: string;
  doiTuong: string;
  dauHieu: string;
  donVi: string;
  tenMau: string;
  N: number;
  categories: string[];
  frequencies: number[];
  k: number;
  valueLabel: string;
  freqLabel: string;
  chartTitle: string;
  niceAxis: { min: number; max: number; step: number; ticks: number[] };
  maxFreq: number;
  maxCats: string[];
  minFreq: number;
  minCats: string[];
  sourceKind: ProblemAnalysis['sourceKind'];
  sourceChartKind: 'bar' | 'line';
  isNumeric: boolean;
  /** Bảng tần số đã có sẵn (đề cho bảng/biểu đồ, hoặc đã lập ở ý TS1 trước) */
  tableAvailable: boolean;
  /** Đề có ý vẽ biểu đồ (TS2/TS3) ở bất kỳ đâu */
  hasChartPart: boolean;
  /** Cỡ mẫu đề nêu (-1 nếu đề không nêu) */
  statedN: number;
  /** Đề nêu cỡ mẫu khác tổng các tần số → số liệu của đề chưa khớp */
  sizeMismatch: boolean;
  /** Các phương án A, B, C, D của đề trắc nghiệm (nếu có) */
  choices: ChoiceOption[] | null;
}

function buildCtx(
  analysis: ProblemAnalysis,
  computed: ComputedData,
  part: { label: string }
): Ctx {
  const cats = computed.categories;
  const freqs = computed.frequencies;
  const maxFreq = freqs.length ? Math.max(...freqs) : 0;
  const minFreq = freqs.length ? Math.min(...freqs) : 0;
  const partIdx = Math.max(0, analysis.parts.findIndex((p) => p.label === part.label));
  const ts1Before = analysis.parts.slice(0, partIdx).some((p) => p.dangBai === 'TS1');
  const dauHieu = analysis.context?.dauHieu || 'dữ liệu thống kê';
  const doiTuong = analysis.context?.doiTuong || 'đối tượng khảo sát';

  return {
    partLabel: part.label,
    doiTuong,
    dauHieu,
    donVi: analysis.context?.donVi || '',
    tenMau: analysis.context?.tenMau || 'mẫu dữ liệu',
    N: computed.sampleSize,
    categories: cats,
    frequencies: freqs,
    k: cats.length,
    valueLabel: (analysis.valueLabel || '').trim() || 'Giá trị',
    freqLabel: (analysis.freqLabel || '').trim() || 'Tần số',
    chartTitle: (analysis.chartTitle || '').trim() || `${capitalize(dauHieu)} của ${doiTuong}`,
    niceAxis: computed.niceAxis || { min: 0, max: 10, step: 1, ticks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    maxFreq,
    maxCats: cats.filter((_, i) => freqs[i] === maxFreq),
    minFreq,
    minCats: cats.filter((_, i) => freqs[i] === minFreq),
    sourceKind: analysis.sourceKind || 'raw_list',
    sourceChartKind: analysis.sourceChartKind === 'line' ? 'line' : 'bar',
    isNumeric: computed.valueKind === 'numeric',
    tableAvailable: analysis.sourceKind === 'freq_table' || analysis.sourceKind === 'freq_chart' || ts1Before,
    hasChartPart: analysis.parts.some((p) => p.dangBai === 'TS2' || p.dangBai === 'TS3'),
    statedN: analysis.statedSampleSize > 0 ? analysis.statedSampleSize : -1,
    sizeMismatch: analysis.statedSampleSize > 0 && computed.sampleSize > 0 && analysis.statedSampleSize !== computed.sampleSize,
    choices: analysis.parts.length === 1 ? extractChoiceOptions(analysis.problemText || '') : null,
  };
}

/** Cụm ghi chú cỡ mẫu dùng trong lời giải mẫu (xử lý cả trường hợp đề nêu cỡ mẫu không khớp) */
function nPhrase(ctx: Ctx): string {
  if (ctx.sizeMismatch) {
    return `(tổng các tần số là ${ctx.N}; lưu ý: đề ghi cỡ mẫu là ${ctx.statedN} nên số liệu của đề chưa khớp)`;
  }
  return `(cỡ mẫu $N = ${ctx.N}$)`;
}

/**
 * Bước 4 – kiểm tra tổng các tần số và ĐỐI CHIẾU với cỡ mẫu đề nêu.
 * Nếu đề nêu cỡ mẫu khác tổng tần số, học sinh phải phát hiện ra chỗ chưa khớp
 * (đúng tinh thần "nhìn lại – kiểm tra" của Pólya), thay vì được báo "đã đọc đúng".
 */
function taskTotalCheck(ctx: Ctx, id: string, prompt: string): Interaction[] {
  const sum = ctx.N;
  const stated = ctx.statedN;
  const tasks: Interaction[] = [
    {
      id,
      type: 'numeric',
      prompt,
      correctValue: sum,
      tolerance: 0,
      unit: '',
      placeholder: 'Nhập tổng các tần số...',
      hints: {
        level1: 'Cộng tất cả các số ở dòng tần số.',
        level2: `Phép cộng: $${ctx.frequencies.join(' + ')}$.`,
        level3: `Tổng các tần số bằng ${sum}.`,
        fullExplanation: `$${ctx.frequencies.join(' + ')} = ${sum}$.`,
      },
      successMsg:
        stated > 0
          ? `Đúng, tổng các tần số bằng ${sum}. Bây giờ em đối chiếu với cỡ mẫu đề cho nhé.`
          : `Chính xác! Tổng các tần số bằng ${sum} – đây chính là cỡ mẫu.`,
      weight: 1,
    },
  ];
  if (stated > 0) {
    const ok = stated === sum;
    tasks.push(
      buildMcq({
        id: `${id}-cmp`,
        prompt: `Đề bài cho biết cỡ mẫu là ${stated}. So sánh với tổng các tần số (${sum}), em rút ra điều gì?`,
        correct: ok
          ? { text: `Tổng các tần số bằng ${stated}, khớp với đề – số liệu đã được đọc đúng.`, feedback: 'Chính xác! Kiểm tra này giúp phát hiện đếm sót, đếm trùng.' }
          : {
              text: `Tổng các tần số (${sum}) khác ${stated} – số liệu trong đề chưa khớp, cần báo thầy/cô kiểm tra lại đề.`,
              feedback: 'Rất tốt! Em đã phát hiện được chỗ chưa khớp nhờ bước kiểm tra.',
            },
        wrongs: ok
          ? [
              { text: 'Tổng các tần số không cần bằng cỡ mẫu.', feedback: 'Chưa đúng. Tổng các tần số luôn bằng cỡ mẫu.' },
              { text: 'Phải cộng các giá trị (không phải tần số) mới so sánh được với cỡ mẫu.', feedback: 'Chưa đúng, ta cộng các tần số.' },
            ]
          : [
              { text: 'Số liệu vẫn khớp, không cần kiểm tra gì thêm.', feedback: `Chưa đúng: ${sum} ≠ ${stated}.` },
              {
                text: `Cứ lấy cỡ mẫu là ${stated} và giữ nguyên kết quả.`,
                feedback: 'Chưa đúng: tổng các tần số luôn phải bằng cỡ mẫu; không khớp nghĩa là có chỗ sai trong số liệu.',
              },
            ],
        hints: {
          level1: 'Tổng các tần số luôn bằng cỡ mẫu.',
          level2: `So sánh ${sum} với ${stated}.`,
          level3: ok ? `${sum} = ${stated}.` : `${sum} ≠ ${stated}.`,
          fullExplanation: ok
            ? `Tổng các tần số ${sum} bằng cỡ mẫu ${stated} nên số liệu khớp.`
            : `Tổng các tần số là ${sum} nhưng đề ghi cỡ mẫu ${stated}. Vì tổng các tần số luôn bằng cỡ mẫu nên đề có chỗ chưa khớp (in sai cỡ mẫu hoặc sai một tần số).`,
        },
        successMsg: ok ? 'Chính xác! Số liệu khớp với đề.' : 'Rất tốt! Đây chính là ý nghĩa của bước kiểm tra lại.',
      })
    );
  }
  return tasks;
}

/** Biểu đồ tham chiếu (chỉ xem) để lồng vào các bước */
export function buildReferenceChart(
  kind: 'bar' | 'line',
  computed: ComputedData,
  opts: { title: string; xAxisLabel: string; yAxisLabel: string; caption?: string }
): ReferenceChart {
  return {
    kind,
    title: opts.title,
    xAxisLabel: opts.xAxisLabel,
    yAxisLabel: opts.yAxisLabel,
    categories: computed.categories,
    values: computed.frequencies,
    axisConfig: computed.niceAxis || { min: 0, max: 10, step: 1, ticks: [0, 2, 4, 6, 8, 10] },
    caption: opts.caption,
  };
}

/** Bảng tần số dạng ngang (giống SGK) để điền */
function buildFreqTableTask(ctx: Ctx, id: string, prompt: string): TableFillInteraction {
  const matrix: TableCell[][] = ctx.categories.map((cat, idx) => [
    { row: idx, col: 0, value: cat, isEditable: false },
    { row: idx, col: 1, value: '', isEditable: true, expectedValue: String(ctx.frequencies[idx]) },
  ]);

  return {
    id,
    type: 'table_fill',
    prompt,
    headers: [ctx.valueLabel, 'Tần số'],
    matrix,
    orientation: 'horizontal',
    hints: {
      level1:
        ctx.sourceKind === 'freq_chart'
          ? 'Tần số của mỗi giá trị chính là chiều cao của cột (hoặc tung độ của điểm) ứng với giá trị đó trên biểu đồ.'
          : 'Tần số của một giá trị là số lần xuất hiện của giá trị đó trong mẫu dữ liệu. Em hãy đếm lần lượt từng giá trị, đánh dấu giá trị đã đếm để không bị sót.',
      level2: `Cỡ mẫu $N = ${ctx.N}$. Sau khi điền, em cộng các tần số lại xem có bằng $N$ không.`,
      level3: 'Kiểm tra lại các ô bị tô đỏ: đếm lại riêng giá trị đó một lần nữa.',
      fullExplanation: `Bảng tần số đúng có tổng các tần số $m_1 + m_2 + \\dots + m_k = N = ${ctx.N}$.`,
    },
    successMsg: 'Tuyệt vời! Em đã lập đúng bảng tần số!',
    weight: 2,
  };
}

function freqTableMarkdown(ctx: Ctx, withTotal = false): string {
  const head = `| ${ctx.valueLabel} | ${ctx.categories.join(' | ')}${withTotal ? ' | **Cộng**' : ''} |`;
  const sep = `| --- | ${ctx.categories.map(() => '---').join(' | ')}${withTotal ? ' | ---' : ''} |`;
  const row = `| Tần số | ${ctx.frequencies.join(' | ')}${withTotal ? ` | **${ctx.N}**` : ''} |`;
  return `${head}\n${sep}\n${row}`;
}

function chartKindName(kind: 'bar' | 'line'): string {
  return kind === 'bar' ? 'biểu đồ tần số dạng cột' : 'biểu đồ tần số dạng đoạn thẳng';
}

// ───────────────────────── Difficulty bank ─────────────────────────

interface DifficultyDefinition {
  id: string;
  title: string;
  detail: string;
  quiz: (ctx: Ctx, idSuffix: string) => McqInteraction;
}

function toDiffItem(d: DifficultyDefinition): DifficultyItem {
  return { id: d.id, title: d.title, detail: d.detail };
}

const DIFFICULTY_BANK: Record<string, DifficultyDefinition> = {
  READ_WRONG_TABLE: {
    id: 'diff-read-wrong-table',
    title: 'Tra nhầm cột hoặc so sánh nhầm dòng trong bảng tần số',
    detail:
      'Trong bảng tần số dạng ngang, mỗi giá trị ở dòng trên ứng với tần số ngay bên dưới. Muốn biết giá trị nào xuất hiện nhiều hay ít phải so sánh các số ở dòng tần số, không so sánh các giá trị.',
    quiz: (ctx, sfx) =>
      buildMcq({
        id: `prehint-readtbl-${sfx}`,
        prompt: 'Trong bảng tần số, làm thế nào để biết giá trị nào xuất hiện nhiều nhất?',
        correct: { text: 'Tìm số lớn nhất ở dòng tần số, rồi đọc giá trị ghi ngay phía trên số đó.', feedback: 'Chính xác!' },
        wrongs: [
          { text: 'Chọn giá trị ghi ở ô cuối cùng bên phải của dòng giá trị.', feedback: 'Sai rồi, vị trí trong bảng không cho biết số lần xuất hiện.' },
          ctx.isNumeric
            ? { text: 'Chọn giá trị có số lớn nhất ở dòng giá trị.', feedback: 'Sai rồi, đó là giá trị lớn nhất chứ không phải tần số lớn nhất.' }
            : { text: 'Chọn giá trị được ghi đầu tiên ở dòng giá trị.', feedback: 'Sai rồi, thứ tự ghi không cho biết số lần xuất hiện.' },
        ],
        hints: {
          level1: 'Đại lượng nào cho biết số lần xuất hiện?',
          level2: 'Đó là tần số – nằm ở dòng tần số.',
          level3: 'Số lớn nhất ở dòng tần số ứng với giá trị xuất hiện nhiều nhất.',
          fullExplanation: 'Tần số cho biết số lần xuất hiện; so sánh các số ở dòng tần số rồi đọc giá trị tương ứng.',
        },
        successMsg: 'Chính xác!',
      }),
  },
  TIE_VALUES: {
    id: 'diff-tie-values',
    title: 'Bỏ sót khi có nhiều giá trị cùng tần số lớn nhất (nhỏ nhất)',
    detail:
      'Có thể có hai hay nhiều giá trị cùng có tần số lớn nhất (hoặc nhỏ nhất). Khi đó câu trả lời phải kể đủ tất cả các giá trị đó.',
    quiz: (ctx, sfx) =>
      buildMcq({
        id: `prehint-tie-${sfx}`,
        prompt: 'Một bảng tần số có hai giá trị P và Q cùng có tần số lớn nhất là 7 (các giá trị khác có tần số nhỏ hơn). Giá trị nào xuất hiện nhiều nhất?',
        correct: { text: 'Cả P và Q.', feedback: 'Chính xác! Phải kể đủ các giá trị cùng có tần số lớn nhất.' },
        wrongs: [
          { text: 'Chỉ P, vì P đứng trước Q trong bảng.', feedback: 'Chưa đúng, thứ tự trong bảng không quan trọng.' },
          { text: 'Không có giá trị nào, vì hai tần số bằng nhau.', feedback: 'Chưa đúng, cả hai giá trị đều xuất hiện nhiều nhất.' },
        ],
        hints: {
          level1: 'Hai giá trị cùng có tần số 7, không giá trị nào lớn hơn.',
          level2: 'Vậy giá trị nào cũng "xuất hiện nhiều nhất"?',
          level3: 'Cả hai giá trị.',
          fullExplanation: 'Khi nhiều giá trị cùng có tần số lớn nhất, tất cả các giá trị đó đều xuất hiện nhiều nhất.',
        },
        successMsg: 'Rất tốt!',
      }),
  },
  COUNT_MISMATCH: {
    id: 'diff-count-mismatch',
    title: 'Đếm sót hoặc đếm trùng giá trị',
    detail:
      'Khi dãy dữ liệu dài hoặc kéo xuống nhiều dòng, rất dễ bỏ sót một số giá trị hoặc đếm một giá trị hai lần. Tổng các tần số phải luôn bằng cỡ mẫu $N$.',
    quiz: (ctx, sfx) => {
      // Đề có cỡ mẫu chưa khớp → dùng số minh họa để không gây rối
      const n = ctx.sizeMismatch ? 20 : ctx.N;
      return buildMcq({
        id: `prehint-count-${sfx}`,
        prompt: `Bạn An lập bảng tần số và tính được tổng các tần số là ${Math.max(1, n - 1)}, trong khi cỡ mẫu là ${n}. Bạn An đã mắc sai lầm gì?`,
        correct: { text: 'Bạn An đã đếm sót ít nhất một giá trị trong mẫu dữ liệu.', feedback: 'Chính xác! Tổng các tần số luôn bằng cỡ mẫu N.' },
        wrongs: [
          { text: 'Bạn An đếm đúng, tổng tần số không cần bằng cỡ mẫu.', feedback: 'Chưa đúng. Mỗi giá trị trong mẫu được đếm đúng một lần nên tổng tần số phải bằng N.' },
          { text: 'Bạn An đã cộng các giá trị thay vì đếm số lần xuất hiện.', feedback: 'Chưa đúng, nếu cộng các giá trị thì kết quả thường lớn hơn N rất nhiều.' },
        ],
        hints: {
          level1: 'So sánh tổng các tần số với cỡ mẫu $N$.',
          level2: 'Mỗi giá trị trong mẫu được đếm đúng một lần, nên tổng tần số $= N$.',
          level3: `Tổng tần số ${Math.max(1, n - 1)} < ${n}, tức là còn thiếu giá trị chưa được đếm.`,
          fullExplanation: `Tổng các tần số $m_1 + m_2 + \\dots + m_k$ luôn bằng cỡ mẫu $N$. Nếu nhỏ hơn $N$ là đã đếm sót, lớn hơn $N$ là đã đếm trùng.`,
        },
        successMsg: 'Tuyệt vời! Nhớ luôn kiểm tra: tổng các tần số = N.',
      });
    },
  },
  CONFUSE_X_AND_N: {
    id: 'diff-confuse-x-n',
    title: 'Nhầm lẫn giữa giá trị và tần số',
    detail:
      'Giá trị $x_i$ là dữ liệu thu được (điểm số, cỡ giày, tên bạn...), còn tần số $m_i$ là số lần giá trị đó xuất hiện. Giá trị "lớn nhất" không có nghĩa là tần số lớn nhất.',
    quiz: (ctx, sfx) =>
      buildMcq({
        id: `prehint-xn-${sfx}`,
        prompt: 'Khi nói một giá trị "xuất hiện nhiều lần nhất" trong mẫu dữ liệu, điều đó có nghĩa là:',
        correct: { text: 'Giá trị đó có tần số lớn nhất.', feedback: 'Chính xác! Tần số cho biết số lần xuất hiện của giá trị.' },
        wrongs: [
          ctx.isNumeric
            ? { text: 'Giá trị đó là giá trị lớn nhất trong mẫu.', feedback: 'Sai rồi! Một giá trị nhỏ vẫn có thể xuất hiện nhiều lần nhất.' }
            : { text: 'Giá trị đó được ghi đầu tiên trong bảng tần số.', feedback: 'Sai rồi! Thứ tự ghi trong bảng không cho biết số lần xuất hiện.' },
          { text: 'Giá trị đó bằng cỡ mẫu N.', feedback: 'Không đúng, cỡ mẫu là tổng số giá trị của mẫu.' },
        ],
        hints: {
          level1: 'Nhớ lại: tần số của một giá trị là gì?',
          level2: 'Tần số của một giá trị là số lần xuất hiện giá trị đó trong mẫu dữ liệu.',
          level3: 'Xuất hiện nhiều lần nhất ⇔ tần số lớn nhất.',
          fullExplanation: 'Tần số $m_i$ cho biết giá trị $x_i$ xuất hiện bao nhiêu lần trong mẫu dữ liệu.',
        },
        successMsg: 'Chính xác! Tần số phản ánh số lần xuất hiện.',
      }),
  },
  DUPLICATE_VALUES: {
    id: 'diff-duplicate-values',
    title: 'Liệt kê một giá trị nhiều lần trong bảng tần số',
    detail:
      'Trong bảng tần số ta chỉ liệt kê các giá trị KHÁC NHAU $x_1, x_2, \\dots, x_k$; mỗi giá trị xuất hiện đúng một lần ở dòng "Giá trị".',
    quiz: (ctx, sfx) => {
      const sample = ctx.categories[0] || '8';
      return buildMcq({
        id: `prehint-dup-${sfx}`,
        prompt: `Bạn Bình lập bảng tần số nhưng ở dòng giá trị lại ghi "${sample}" ở hai ô khác nhau. Nhận xét nào đúng?`,
        correct: {
          text: `Sai, mỗi giá trị khác nhau chỉ ghi một lần; tần số của "${sample}" là tổng số lần nó xuất hiện.`,
          feedback: 'Chính xác! Bảng tần số chỉ liệt kê các giá trị khác nhau.',
        },
        wrongs: [
          { text: 'Đúng, vì giá trị đó xuất hiện nhiều lần nên phải ghi nhiều lần.', feedback: 'Chưa đúng. Số lần xuất hiện được ghi ở dòng tần số, không phải ghi lặp giá trị.' },
          { text: 'Đúng, miễn là tổng các tần số bằng N.', feedback: 'Chưa đúng, bảng như vậy không phải là bảng tần số.' },
        ],
        hints: {
          level1: 'Đọc lại nhận xét trong SGK: trong bảng tần số ta liệt kê những giá trị nào?',
          level2: 'Chỉ liệt kê các giá trị $x_i$ khác nhau.',
          level3: 'Số lần xuất hiện được ghi ở dòng "Tần số".',
          fullExplanation: 'Trong bảng tần số, ta chỉ liệt kê các giá trị khác nhau; số lần xuất hiện của mỗi giá trị được ghi ở dòng tần số.',
        },
        successMsg: 'Rất tốt! Mỗi giá trị khác nhau chỉ ghi đúng một lần.',
      });
    },
  },
  NON_NUMERIC_VALUES: {
    id: 'diff-non-numeric',
    title: 'Nghĩ rằng chỉ lập được bảng tần số cho dữ liệu là số',
    detail:
      'Các giá trị $x_i$ có thể không là số (tên bạn, mức đánh giá, lựa chọn...). Ta vẫn lập bảng tần số bình thường bằng cách đếm số lần xuất hiện.',
    quiz: (ctx, sfx) =>
      buildMcq({
        id: `prehint-nonnum-${sfx}`,
        prompt: 'Bảng ghi tên các bạn đạt điểm tốt trong tuần (Bình, Nam, Tuấn, Thảo, Bình, ...). Có lập được bảng tần số cho dữ liệu này không?',
        correct: { text: 'Có. Giá trị là tên các bạn, tần số là số lần mỗi tên xuất hiện.', feedback: 'Chính xác! Giá trị trong bảng tần số có thể không là số.' },
        wrongs: [
          { text: 'Không, vì các giá trị không phải là số.', feedback: 'Chưa đúng. SGK nhận xét: các giá trị $x_i$ có thể không là số.' },
          { text: 'Chỉ lập được nếu đổi tên các bạn thành số thứ tự.', feedback: 'Không cần thiết, ta dùng trực tiếp tên các bạn làm giá trị.' },
        ],
        hints: {
          level1: 'Tần số là số lần xuất hiện, có cần giá trị phải là số không?',
          level2: 'SGK: "Các giá trị $x_i$ này có thể không là số."',
          level3: 'Mỗi tên bạn là một giá trị, đếm số lần tên đó xuất hiện.',
          fullExplanation: 'Bảng tần số chỉ cần đếm số lần xuất hiện của mỗi giá trị, nên các giá trị có thể là chữ (tên, mức đánh giá...).',
        },
        successMsg: 'Rất tốt!',
      }),
  },
  AXIS_SCALE_ERROR: {
    id: 'diff-axis-scale',
    title: 'Chia vạch trục đứng không đều hoặc không bắt đầu từ 0',
    detail:
      'Trục đứng biểu diễn tần số phải bắt đầu từ 0 và các vạch chia cách đều nhau (mỗi vạch 1, 2, 5,... đơn vị). Nếu chia tùy ý, chiều cao các cột sẽ sai lệch.',
    quiz: (ctx, sfx) =>
      buildMcq({
        id: `prehint-axis-${sfx}`,
        prompt: `Khi vẽ trục đứng biểu diễn tần số với tần số lớn nhất là ${ctx.maxFreq}, cách chia vạch nào đúng?`,
        correct: {
          text: `Bắt đầu từ 0, các vạch cách đều nhau, mỗi vạch ${ctx.niceAxis.step} đơn vị.`,
          feedback: 'Chính xác! Thang chia đều, gốc là 0.',
        },
        wrongs: [
          { text: 'Chỉ đánh dấu đúng các tần số có trong bảng, khoảng cách tùy ý.', feedback: 'Sai rồi! Các vạch phải cách đều nhau.' },
          { text: `Bắt đầu từ ${Math.max(1, ctx.minFreq)} cho gọn biểu đồ.`, feedback: 'Sai rồi! Trục tần số phải bắt đầu từ 0 để so sánh đúng chiều cao các cột.' },
        ],
        hints: {
          level1: 'Trục đứng là một trục số có gốc tại 0.',
          level2: 'Các vạch chia phải cách đều nhau.',
          level3: `Chọn bước chia ${ctx.niceAxis.step} đơn vị.`,
          fullExplanation: 'Trục đứng phải bắt đầu từ 0 và chia vạch đều đặn, có ghi tên trục.',
        },
        successMsg: 'Chính xác! Thang đo luôn phải đều đặn và bắt đầu từ 0.',
      }),
  },
  AXIS_SWAP: {
    id: 'diff-axis-swap',
    title: 'Đặt nhầm trục: tần số ở trục ngang, giá trị ở trục đứng',
    detail: 'Theo SGK: trục ngang biểu diễn các giá trị trong dãy dữ liệu, trục đứng thể hiện tần số.',
    quiz: (ctx, sfx) =>
      buildMcq({
        id: `prehint-swap-${sfx}`,
        prompt: 'Trong biểu đồ tần số (dạng cột hoặc đoạn thẳng), trục đứng thể hiện đại lượng nào?',
        correct: { text: 'Tần số của các giá trị.', feedback: 'Chính xác!' },
        wrongs: [
          { text: `Các giá trị (${ctx.valueLabel.toLowerCase()}).`, feedback: 'Bị ngược rồi! Các giá trị nằm trên trục ngang.' },
          { text: 'Cỡ mẫu N.', feedback: 'Không đúng.' },
        ],
        hints: {
          level1: 'Nhớ lại Bước 1 vẽ biểu đồ trong SGK.',
          level2: 'Trục ngang: các giá trị; trục đứng: ...',
          level3: 'Trục đứng: tần số.',
          fullExplanation: 'Bước 1 (SGK): Vẽ trục ngang để biểu diễn các giá trị trong dãy dữ liệu, vẽ trục đứng thể hiện tần số.',
        },
        successMsg: 'Chính xác!',
      }),
  },
  LINE_CONNECT: {
    id: 'diff-line-connect',
    title: 'Nối điểm sai khi vẽ biểu đồ đoạn thẳng',
    detail:
      'Mỗi giá trị trên trục ngang và tần số tương ứng xác định MỘT điểm; ta nối các điểm LIÊN TIẾP nhau (từ trái sang phải). Không nối điểm đầu về gốc tọa độ, không nối các điểm không liền kề.',
    quiz: (ctx, sfx) => {
      const x = ctx.categories[0] || '6';
      const m = ctx.frequencies[0] ?? 3;
      return buildMcq({
        id: `prehint-line-${sfx}`,
        prompt: `Giá trị ${x} có tần số ${m}. Trên biểu đồ tần số dạng đoạn thẳng, điểm biểu diễn giá trị này nằm ở đâu?`,
        correct: { text: `Ngay trên giá trị ${x} của trục ngang, ở độ cao ${m} theo trục đứng.`, feedback: 'Chính xác!' },
        wrongs: [
          { text: `Ngay trên giá trị ${m} của trục ngang, ở độ cao ${x} theo trục đứng.`, feedback: 'Bị đổi chỗ giá trị và tần số rồi!' },
          { text: 'Tại gốc tọa độ, rồi nối lên các điểm khác.', feedback: 'Không đúng, biểu đồ đoạn thẳng không xuất phát từ gốc tọa độ.' },
        ],
        hints: {
          level1: 'Hoành độ là giá trị, tung độ là tần số.',
          level2: `Điểm có "hoành độ" ${x} và "tung độ" ${m}.`,
          level3: 'Sau đó nối các điểm liên tiếp với nhau.',
          fullExplanation: 'Bước 2 (SGK): Với mỗi giá trị trên trục ngang và tần số tương ứng ta xác định một điểm. Nối các điểm liên tiếp với nhau.',
        },
        successMsg: 'Rất tốt!',
      });
    },
  },
  NOT_FREQ_CHART: {
    id: 'diff-not-freq-chart',
    title: 'Cho rằng biểu đồ cột nào cũng là biểu đồ tần số',
    detail:
      'Biểu đồ tần số là biểu đồ biểu diễn BẢNG TẦN SỐ: chiều cao cột (tung độ điểm) là tần số. Biểu đồ cột biểu diễn số liệu khác (nhiệt độ, sản lượng...) không phải biểu đồ tần số.',
    quiz: (ctx, sfx) =>
      buildMcq({
        id: `prehint-notfreq-${sfx}`,
        prompt:
          'Biểu đồ cột biểu diễn nhiệt độ trung bình tháng Sáu năm 2021 của Hà Nội (31,6 °C), Đà Nẵng (31,1 °C), Đà Lạt (19,6 °C). Đây có phải là biểu đồ tần số không?',
        correct: {
          text: 'Không, vì chiều cao các cột là nhiệt độ chứ không phải số lần xuất hiện của một giá trị.',
          feedback: 'Chính xác! Em ủng hộ bạn Tròn trong mục Tranh luận của SGK.',
        },
        wrongs: [
          { text: 'Có, vì đó là biểu đồ dạng cột.', feedback: 'Chưa đúng. Không phải biểu đồ cột nào cũng là biểu đồ tần số.' },
          { text: 'Có, vì trục ngang ghi tên các thành phố.', feedback: 'Chưa đúng. Cần xem trục đứng có biểu diễn tần số hay không.' },
        ],
        hints: {
          level1: 'Biểu đồ tần số là biểu đồ biểu diễn bảng tần số.',
          level2: 'Trục đứng của biểu đồ trên biểu diễn đại lượng gì?',
          level3: 'Trục đứng là nhiệt độ (°C), không phải tần số.',
          fullExplanation: 'Biểu đồ tần số phải biểu diễn bảng tần số, tức chiều cao cột là tần số. Biểu đồ nhiệt độ không thỏa điều này.',
        },
        successMsg: 'Rất tốt! Em đã phân biệt được biểu đồ tần số.',
      }),
  },
  READ_WRONG: {
    id: 'diff-read-wrong',
    title: 'Đọc nhầm cột/điểm hoặc nhầm hàng khi tra bảng',
    detail:
      'Khi đọc bảng hay biểu đồ, cần gióng đúng giá trị trên trục ngang (hoặc dòng giá trị) với tần số tương ứng; cột cao nhất ứng với tần số lớn nhất.',
    quiz: (ctx, sfx) =>
      buildMcq({
        id: `prehint-read-${sfx}`,
        prompt: 'Trên biểu đồ tần số dạng cột, giá trị xuất hiện nhiều nhất được nhận biết như thế nào?',
        correct: { text: 'Là giá trị ứng với cột cao nhất.', feedback: 'Chính xác!' },
        wrongs: [
          { text: 'Là giá trị nằm ở ngoài cùng bên phải trục ngang.', feedback: 'Sai rồi, đó chỉ là giá trị lớn nhất (nếu sắp xếp tăng dần).' },
          { text: 'Là cột rộng nhất.', feedback: 'Các cột có độ rộng bằng nhau, ta so sánh chiều cao.' },
        ],
        hints: {
          level1: 'Chiều cao cột biểu diễn đại lượng gì?',
          level2: 'Chiều cao cột = tần số.',
          level3: 'Tần số lớn nhất ⇔ cột cao nhất.',
          fullExplanation: 'Trên biểu đồ tần số, chiều cao cột thể hiện tần số nên cột cao nhất ứng với giá trị xuất hiện nhiều nhất.',
        },
        successMsg: 'Chính xác!',
      }),
  },
};

// ───────────────────────── Shared step-1 tasks ─────────────────────────

function taskIdentifyData(ctx: Ctx, id: string): McqInteraction {
  return buildMcq({
    id,
    prompt: 'Dữ liệu trong bài toán được thu thập về vấn đề gì?',
    correct: { text: capitalize(ctx.dauHieu), feedback: 'Chính xác! Đây là nội dung được thống kê.' },
    wrongs: [
      { text: capitalize(ctx.doiTuong), feedback: `Đây là đối tượng được khảo sát (${ctx.doiTuong}), chưa phải nội dung dữ liệu.` },
      { text: `Tổng số ${ctx.doiTuong}`, feedback: 'Đây là cỡ mẫu, chưa phải nội dung dữ liệu.' },
    ],
    hints: {
      level1: 'Đề bài đang tìm hiểu điều gì?',
      level2: `Người ta thu thập thông tin gì ở ${ctx.doiTuong}?`,
      level3: `Dữ liệu là "${ctx.dauHieu}".`,
      fullExplanation: `Mẫu dữ liệu gồm các thông tin về "${ctx.dauHieu}" của ${ctx.doiTuong}.`,
    },
    successMsg: 'Rất chính xác!',
  });
}

function taskSampleSize(ctx: Ctx, id: string): Interaction {
  return {
    id,
    type: 'numeric',
    prompt:
      ctx.sourceKind === 'freq_table' || ctx.sourceKind === 'freq_chart'
        ? 'Cỡ mẫu $N$ (tổng số giá trị của mẫu dữ liệu) là bao nhiêu?'
        : 'Cỡ mẫu $N$ (số giá trị của mẫu dữ liệu) là bao nhiêu?',
    correctValue: ctx.N,
    tolerance: 0,
    unit: '',
    placeholder: 'Nhập cỡ mẫu N...',
    hints: {
      level1:
        ctx.sourceKind === 'freq_table' || ctx.sourceKind === 'freq_chart'
          ? 'Cỡ mẫu bằng tổng các tần số.'
          : 'Đếm tất cả các giá trị trong dãy dữ liệu (kể cả các giá trị lặp lại).',
      level2: 'Đếm theo từng dòng rồi cộng lại để tránh sót.',
      level3: `Cỡ mẫu là $N = ${ctx.N}$.`,
      fullExplanation: `Số giá trị của mẫu dữ liệu gọi là cỡ mẫu. Ở bài này $N = ${ctx.N}$.`,
    },
    successMsg: `Chính xác! Cỡ mẫu $N = ${ctx.N}$.`,
    weight: 1,
  };
}

function taskDistinctCount(ctx: Ctx, id: string): McqInteraction {
  const k = ctx.k;
  return buildMcq({
    id,
    prompt:
      ctx.sourceKind === 'freq_chart'
        ? 'Biểu đồ có bao nhiêu giá trị khác nhau (bao nhiêu cột/điểm)?'
        : 'Mẫu dữ liệu có bao nhiêu giá trị khác nhau?',
    correct: { text: `${k}`, feedback: 'Chính xác!' },
    wrongs: [
      { text: `${k + 1}`, feedback: 'Chưa đúng, có thể em đã đếm một giá trị hai lần.' },
      { text: `${Math.max(1, k - 1)}`, feedback: 'Chưa đúng, có thể em đã bỏ sót một giá trị.' },
      { text: `${ctx.N}`, feedback: 'Đây là cỡ mẫu (tổng số giá trị), không phải số giá trị khác nhau.' },
    ],
    hints: {
      level1: 'Liệt kê các giá trị, mỗi giá trị chỉ ghi một lần.',
      level2: `Các giá trị khác nhau: ${ctx.categories.slice(0, 2).join(', ')}, ...`,
      level3: `Có ${k} giá trị khác nhau: ${ctx.categories.join(', ')}.`,
      fullExplanation: `Các giá trị khác nhau là ${ctx.categories.join(', ')} (${k} giá trị).`,
    },
    successMsg: `Chính xác! Có ${k} giá trị khác nhau.`,
  });
}

// ───────────────────────── Entry ─────────────────────────

export function buildPolyaStepsForPart(
  analysis: ProblemAnalysis,
  computed: ComputedData,
  part: { label: string; question: string; dangBai: DangBaiCode; chartKind: ChartKind; askKind?: AskKind; targetValue?: string }
): PolyaStep[] {
  const ctx = buildCtx(analysis, computed, part);
  if (part.dangBai === 'TS1') return buildTableTemplate(computed, part, ctx);
  if (part.dangBai === 'TS2' || part.dangBai === 'TS3') {
    const kind: 'bar' | 'line' = part.dangBai === 'TS3' || part.chartKind === 'line' ? 'line' : 'bar';
    return buildChartTemplate(computed, part, ctx, kind);
  }
  return buildReadingTemplate(computed, part, ctx);
}

// ───────────────────────── TS1 – LẬP BẢNG TẦN SỐ ─────────────────────────

function buildTableTemplate(
  computed: ComputedData,
  part: { label: string; question: string },
  ctx: Ctx
): PolyaStep[] {
  const L = part.label;
  const fromChart = ctx.sourceKind === 'freq_chart';
  const srcChart = fromChart
    ? buildReferenceChart(ctx.sourceChartKind, computed, {
        title: ctx.chartTitle,
        xAxisLabel: ctx.valueLabel,
        yAxisLabel: ctx.freqLabel,
        caption: 'Biểu đồ đề bài cho – em quan sát để trả lời.',
      })
    : undefined;

  // STEP 1
  const step1Tasks: Interaction[] = [taskIdentifyData(ctx, `${L}-s1-data`)];
  if (fromChart) {
    step1Tasks.push(
      buildMcq({
        id: `${L}-s1-axes`,
        prompt: 'Trên biểu đồ đề cho, trục ngang và trục đứng lần lượt biểu diễn gì?',
        correct: { text: `Trục ngang: các giá trị (${ctx.valueLabel.toLowerCase()}); trục đứng: tần số`, feedback: 'Chính xác!' },
        wrongs: [
          { text: `Trục ngang: tần số; trục đứng: các giá trị`, feedback: 'Bị ngược trục rồi!' },
          { text: 'Cả hai trục đều biểu diễn tần số', feedback: 'Không đúng.' },
        ],
        hints: {
          level1: 'Đọc tên ghi ở mỗi trục.',
          level2: 'Trục ngang ghi các giá trị của dữ liệu.',
          level3: 'Trục đứng ghi số lần xuất hiện (tần số).',
          fullExplanation: 'Biểu đồ tần số: trục ngang biểu diễn các giá trị, trục đứng thể hiện tần số.',
        },
        successMsg: 'Chính xác!',
      })
    );
  } else {
    step1Tasks.push(taskSampleSize(ctx, `${L}-s1-n`));
  }
  step1Tasks.push(taskDistinctCount(ctx, `${L}-s1-k`));

  // STEP 2
  const planItems = fromChart
    ? [
        { id: 'p1', text: 'Đọc các giá trị trên trục ngang của biểu đồ.' },
        { id: 'p2', text: 'Đọc chiều cao mỗi cột (tung độ mỗi điểm) trên trục đứng để biết tần số.' },
        { id: 'p3', text: 'Lập bảng gồm dòng "Giá trị" và dòng "Tần số".' },
        { id: 'p4', text: 'Kiểm tra: tổng các tần số bằng cỡ mẫu $N$.' },
      ]
    : [
        { id: 'p1', text: `Xác định các giá trị khác nhau $x_1, x_2, \\dots, x_k$ của mẫu dữ liệu${ctx.isNumeric ? ' (sắp xếp tăng dần)' : ''}.` },
        { id: 'p2', text: 'Đếm tần số $m_1, m_2, \\dots, m_k$ (số lần xuất hiện) của từng giá trị.' },
        { id: 'p3', text: 'Lập bảng gồm dòng "Giá trị" và dòng "Tần số".' },
        { id: 'p4', text: 'Kiểm tra: tổng các tần số bằng cỡ mẫu $N$.' },
      ];

  const step2Tasks: Interaction[] = [
    {
      id: `${L}-s2-plan`,
      type: 'ordering',
      prompt: 'Hãy sắp xếp các bước theo đúng trình tự kế hoạch giải:',
      items: seededShuffle(planItems, `${L}-plan-ts1`),
      correctOrder: planItems.map((p) => p.id),
      hints: {
        level1: fromChart ? 'Bắt đầu bằng việc đọc các giá trị trên trục ngang.' : 'Bước đầu tiên là xác định các giá trị khác nhau.',
        level2: 'Có giá trị và tần số rồi mới lập được bảng.',
        level3: 'Bước cuối cùng luôn là kiểm tra tổng các tần số.',
        fullExplanation: 'Quy trình: Xác định giá trị → Tìm tần số → Lập bảng → Kiểm tra tổng tần số = N.',
      },
      successMsg: 'Xuất sắc! Em đã xây dựng được chương trình giải bài bản.',
      weight: 1,
    },
    buildMcq({
      id: `${L}-s2-def`,
      prompt: 'Chuẩn bị: "Tần số" của một giá trị là gì?',
      correct: { text: 'Số lần xuất hiện của giá trị đó trong mẫu dữ liệu.', feedback: 'Chính xác! Đây là định nghĩa trong SGK.' },
      wrongs: [
        { text: 'Độ lớn của giá trị đó.', feedback: 'Chưa đúng, đó là bản thân giá trị.' },
        { text: 'Tổng tất cả các giá trị trong mẫu.', feedback: 'Chưa đúng.' },
        { text: 'Số giá trị khác nhau của mẫu.', feedback: 'Chưa đúng.' },
      ],
      hints: {
        level1: 'Xem lại khung kiến thức đầu Bài 22.',
        level2: 'Tần số liên quan tới "số lần".',
        level3: 'Tần số = số lần xuất hiện.',
        fullExplanation: 'Tần số của một giá trị là số lần xuất hiện giá trị đó trong mẫu dữ liệu.',
      },
      successMsg: 'Chính xác!',
    }),
  ];

  // STEP 3
  const step3Tasks: Interaction[] = [
    buildFreqTableTask(
      ctx,
      `${L}-s3-table`,
      fromChart
        ? 'Đọc biểu đồ và điền tần số vào bảng tần số dưới đây:'
        : 'Em hãy điền tần số của mỗi giá trị vào bảng tần số dưới đây:'
    ),
  ];

  // STEP 4
  const maxText = joinVi(ctx.maxCats);
  const step4Tasks: Interaction[] = [
    ...taskTotalCheck(ctx, `${L}-s4-total`, 'Kiểm tra lại: tổng các tần số trong bảng bằng bao nhiêu?'),
    buildMcq({
      id: `${L}-s4-max`,
      prompt: 'Từ bảng tần số, giá trị nào xuất hiện nhiều nhất?',
      correct: { text: maxText, feedback: `Chính xác! Tần số lớn nhất là ${ctx.maxFreq}.` },
      wrongs: ctx.categories
        .filter((c) => !ctx.maxCats.includes(c))
        .slice(0, 3)
        .map((c) => ({ text: c, feedback: 'Chưa đúng, hãy tìm số lớn nhất ở dòng tần số.' })),
      hints: {
        level1: 'Tìm số lớn nhất ở dòng tần số.',
        level2: `Tần số lớn nhất là ${ctx.maxFreq}.`,
        level3: `Ứng với ${maxText}.`,
        fullExplanation: `${capitalize(maxText)} có tần số lớn nhất là ${ctx.maxFreq}, nên xuất hiện nhiều nhất.`,
      },
      successMsg: 'Rất tốt! Tần số giúp ta biết giá trị nào xuất hiện nhiều hay ít.',
    }),
  ];

  // Lồng biểu đồ vào bước 4 (mở rộng) khi đề không yêu cầu tự vẽ biểu đồ
  const step4Chart =
    !ctx.hasChartPart && !fromChart
      ? buildReferenceChart('bar', computed, {
          title: ctx.chartTitle,
          xAxisLabel: ctx.valueLabel,
          yAxisLabel: 'Tần số',
          caption: 'Mở rộng: bảng tần số em vừa lập có thể biểu diễn trực quan bằng biểu đồ tần số dạng cột.',
        })
      : srcChart;

  return [
    {
      stepNo: 1,
      title: 'Bước 1: Tìm hiểu nội dung bài toán',
      intro: fromChart
        ? 'Quan sát biểu đồ để nhận biết dữ liệu được biểu diễn, ý nghĩa của mỗi trục và số giá trị khác nhau.'
        : 'Đọc kỹ đề bài để nhận biết mẫu dữ liệu, cỡ mẫu và các giá trị khác nhau.',
      mainTasks: step1Tasks,
      difficulties: [
        toDiffItem(DIFFICULTY_BANK.COUNT_MISMATCH),
        toDiffItem(ctx.isNumeric ? DIFFICULTY_BANK.CONFUSE_X_AND_N : DIFFICULTY_BANK.NON_NUMERIC_VALUES),
      ],
      reflectionPrompt: REFLECTION_PROMPT,
      preHintQuiz: (ctx.isNumeric ? DIFFICULTY_BANK.COUNT_MISMATCH : DIFFICULTY_BANK.NON_NUMERIC_VALUES).quiz(ctx, `${L}-s1`),
      hintCard: fromChart
        ? 'Ghi nhớ: trục ngang cho các giá trị, chiều cao cột (tung độ điểm) cho tần số.'
        : `Ghi nhớ: cỡ mẫu $N = ${ctx.N}$, có ${ctx.k} giá trị khác nhau. Hãy đếm cẩn thận từng giá trị!`,
      referenceChart: srcChart,
    },
    {
      stepNo: 2,
      title: 'Bước 2: Xây dựng chương trình giải',
      intro: 'Lập kế hoạch từng bước để lập bảng tần số và ôn lại khái niệm tần số.',
      mainTasks: step2Tasks,
      difficulties: [toDiffItem(DIFFICULTY_BANK.DUPLICATE_VALUES)],
      reflectionPrompt: REFLECTION_PROMPT,
      preHintQuiz: DIFFICULTY_BANK.DUPLICATE_VALUES.quiz(ctx, `${L}-s2`),
      hintCard: 'Kế hoạch: Xác định các giá trị khác nhau → Đếm tần số → Lập bảng → Kiểm tra tổng tần số = N.',
    },
    {
      stepNo: 3,
      title: 'Bước 3: Trình bày lời giải',
      intro: 'Điền đầy đủ và chính xác tần số vào bảng tần số theo mẫu SGK.',
      mainTasks: step3Tasks,
      difficulties: [toDiffItem(DIFFICULTY_BANK.COUNT_MISMATCH)],
      reflectionPrompt: REFLECTION_PROMPT,
      preHintQuiz: DIFFICULTY_BANK.COUNT_MISMATCH.quiz(ctx, `${L}-s3`),
      hintCard: 'Mẹo: gạch (hoặc đánh dấu) mỗi giá trị sau khi đếm để không đếm sót, không đếm trùng.',
      modelSolution: `### Lời giải mẫu\n\nBảng tần số về **${ctx.dauHieu}** của **${ctx.doiTuong}** ${nPhrase(ctx)}:\n\n${freqTableMarkdown(ctx)}`,
      referenceChart: srcChart,
    },
    {
      stepNo: 4,
      title: 'Bước 4: Kiểm tra và nghiên cứu lời giải',
      intro: 'Đối chiếu tổng các tần số với cỡ mẫu và rút ra nhận xét từ bảng tần số.',
      mainTasks: step4Tasks,
      difficulties: [toDiffItem(DIFFICULTY_BANK.CONFUSE_X_AND_N)],
      reflectionPrompt: REFLECTION_PROMPT,
      preHintQuiz: DIFFICULTY_BANK.CONFUSE_X_AND_N.quiz(ctx, `${L}-s4`),
      hintCard: `Tổng kết: ${maxText} xuất hiện nhiều nhất (tần số ${ctx.maxFreq}). Tần số cho ta biết giá trị nào xuất hiện nhiều hay ít.`,
      referenceChart: step4Chart,
    },
  ];
}

// ───────────────────────── TS2/TS3 – VẼ BIỂU ĐỒ TẦN SỐ ─────────────────────────

function buildChartTemplate(
  computed: ComputedData,
  part: { label: string; question: string },
  ctx: Ctx,
  kind: 'bar' | 'line'
): PolyaStep[] {
  const L = part.label;
  const isLine = kind === 'line';
  const name = chartKindName(kind);
  const otherName = chartKindName(isLine ? 'bar' : 'line');
  const needTableFirst = !ctx.tableAvailable;
  const yLabel = ctx.freqLabel;

  // STEP 1
  const step1Tasks: Interaction[] = [
    buildMcq({
      id: `${L}-s1-kind`,
      prompt: 'Đề bài yêu cầu vẽ dạng biểu đồ nào?',
      correct: { text: capitalize(name), feedback: 'Chính xác!' },
      wrongs: [
        { text: capitalize(otherName), feedback: 'Chưa đúng với yêu cầu của đề.' },
        { text: 'Biểu đồ hình quạt tròn', feedback: 'Không đúng.' },
      ],
      hints: {
        level1: 'Đọc kỹ yêu cầu của ý này.',
        level2: `Đề yêu cầu: "${part.question}"`,
        level3: `Đó là ${name}.`,
        fullExplanation: `Biểu đồ tần số thường gặp là dạng cột và dạng đoạn thẳng. Ý này yêu cầu vẽ ${name}.`,
      },
      successMsg: 'Chính xác! Em đã xác định đúng dạng biểu đồ.',
    }),
    buildMcq({
      id: `${L}-s1-axes`,
      prompt: 'Trục ngang và trục đứng của biểu đồ lần lượt biểu diễn đại lượng nào?',
      correct: { text: `Trục ngang: các giá trị (${ctx.valueLabel.toLowerCase()}); trục đứng: tần số`, feedback: 'Chính xác!' },
      wrongs: [
        { text: `Trục ngang: tần số; trục đứng: các giá trị (${ctx.valueLabel.toLowerCase()})`, feedback: 'Bị ngược trục rồi em ơi!' },
        { text: 'Trục ngang: cỡ mẫu N; trục đứng: tần số', feedback: 'Chưa đúng.' },
      ],
      hints: {
        level1: 'Đọc Bước 1 vẽ biểu đồ trong SGK.',
        level2: 'Trục ngang biểu diễn các giá trị trong dãy dữ liệu.',
        level3: 'Trục đứng thể hiện tần số.',
        fullExplanation: 'Trục ngang biểu diễn các giá trị, trục đứng thể hiện tần số.',
      },
      successMsg: 'Rất chính xác!',
    }),
  ];
  if (needTableFirst) step1Tasks.push(taskSampleSize(ctx, `${L}-s1-n`));

  // STEP 2
  const planItems = isLine
    ? [
        { id: 'b0', text: needTableFirst ? 'Lập bảng tần số từ mẫu dữ liệu.' : 'Đọc bảng tần số để biết các giá trị và tần số.' },
        { id: 'b1', text: 'Vẽ trục ngang biểu diễn các giá trị, vẽ trục đứng thể hiện tần số (chia vạch đều, bắt đầu từ 0).' },
        { id: 'b2', text: 'Với mỗi giá trị trên trục ngang và tần số tương ứng, xác định một điểm. Nối các điểm liên tiếp với nhau.' },
        { id: 'b3', text: 'Ghi chú giải cho các trục, các điểm và tiêu đề của biểu đồ.' },
      ]
    : [
        { id: 'b0', text: needTableFirst ? 'Lập bảng tần số từ mẫu dữ liệu.' : 'Đọc bảng tần số để biết các giá trị và tần số.' },
        { id: 'b1', text: 'Vẽ trục ngang biểu diễn các giá trị, vẽ trục đứng thể hiện tần số (chia vạch đều, bắt đầu từ 0).' },
        { id: 'b2', text: 'Tại mỗi giá trị trên trục ngang, vẽ một cột có chiều cao bằng tần số tương ứng (các cột rộng bằng nhau).' },
        { id: 'b3', text: 'Ghi chú giải cho các trục, số liệu trên mỗi cột và tiêu đề của biểu đồ.' },
      ];

  const step2Tasks: Interaction[] = [
    {
      id: `${L}-s2-plan`,
      type: 'ordering',
      prompt: `Sắp xếp các bước vẽ ${name} theo đúng thứ tự:`,
      items: seededShuffle(planItems, `${L}-plan-${kind}`),
      correctOrder: planItems.map((p) => p.id),
      hints: {
        level1: 'Phải có bảng tần số trước khi vẽ.',
        level2: 'Vẽ trục trước, rồi mới vẽ cột/điểm.',
        level3: 'Ghi chú giải và tiêu đề là bước cuối cùng.',
        fullExplanation: isLine
          ? 'SGK: Bước 1 vẽ trục; Bước 2 xác định các điểm và nối các điểm liên tiếp; Bước 3 ghi chú giải cho các trục, các điểm và tiêu đề.'
          : 'Bảng tần số → Vẽ trục → Vẽ các cột → Ghi chú giải và tiêu đề.',
      },
      successMsg: 'Kế hoạch rất chuẩn xác!',
      weight: 1,
    },
    buildMcq({
      id: `${L}-s2-scale`,
      prompt: `Tần số lớn nhất là ${ctx.maxFreq}. Nên chia vạch trên trục đứng như thế nào để biểu đồ rõ ràng?`,
      correct: { text: `Từ 0 đến ${ctx.niceAxis.max}, mỗi vạch ${ctx.niceAxis.step} đơn vị`, feedback: 'Chính xác! Thang chia đều, đủ chứa tần số lớn nhất.' },
      wrongs: [
        { text: `Từ 0 đến ${Math.max(1, ctx.maxFreq - ctx.niceAxis.step)}, mỗi vạch ${ctx.niceAxis.step} đơn vị`, feedback: 'Trục đứng quá ngắn, không vẽ được cột/điểm cao nhất.' },
        { text: `Từ ${Math.max(1, ctx.minFreq)} đến ${ctx.niceAxis.max}, mỗi vạch ${ctx.niceAxis.step} đơn vị`, feedback: 'Trục tần số phải bắt đầu từ 0.' },
        { text: 'Chỉ đánh dấu các tần số có trong bảng, khoảng cách tùy ý', feedback: 'Các vạch chia phải cách đều nhau.' },
      ],
      hints: {
        level1: 'Trục đứng bắt đầu từ 0 và phải chứa được tần số lớn nhất.',
        level2: 'Các vạch chia cách đều nhau.',
        level3: `Chọn từ 0 đến ${ctx.niceAxis.max}, mỗi vạch ${ctx.niceAxis.step}.`,
        fullExplanation: `Thang chia 0 – ${ctx.niceAxis.max} với bước ${ctx.niceAxis.step} chứa được tần số lớn nhất ${ctx.maxFreq} và các vạch cách đều.`,
      },
      successMsg: 'Chính xác! Lựa chọn thang chia rất hợp lý.',
    }),
  ];
  if (isLine) {
    const x = ctx.categories[0];
    const m = ctx.frequencies[0];
    step2Tasks.push(
      buildMcq({
        id: `${L}-s2-point`,
        prompt: `Giá trị ${x} có tần số ${m}. Điểm biểu diễn giá trị này trên biểu đồ đoạn thẳng được xác định thế nào?`,
        correct: { text: `Gióng từ giá trị ${x} trên trục ngang và từ ${m} trên trục đứng, giao nhau tại một điểm.`, feedback: 'Chính xác!' },
        wrongs: [
          { text: `Gióng từ ${m} trên trục ngang và từ ${x} trên trục đứng.`, feedback: 'Bị đổi chỗ giá trị và tần số rồi!' },
          { text: 'Lấy điểm tại gốc tọa độ.', feedback: 'Không đúng.' },
        ],
        hints: {
          level1: 'Mỗi giá trị và tần số tương ứng xác định một điểm.',
          level2: 'Giá trị ở trục ngang, tần số ở trục đứng.',
          level3: `Điểm ứng với (${x}; ${m}).`,
          fullExplanation: 'Với mỗi giá trị trên trục ngang và tần số tương ứng ta xác định một điểm, rồi nối các điểm liên tiếp với nhau.',
        },
        successMsg: 'Rất tốt!',
      })
    );
  }

  // STEP 3
  const step3Tasks: Interaction[] = [];
  if (needTableFirst) {
    step3Tasks.push(buildFreqTableTask(ctx, `${L}-s3-table`, 'Trước khi vẽ, em hãy lập bảng tần số:'));
  }
  const plot: ChartPlotInteraction = {
    id: `${L}-s3-plot`,
    type: 'chart_plot',
    chartKind: kind,
    prompt: isLine
      ? 'Kéo từng điểm lên đúng tần số của giá trị đó (các điểm liên tiếp tự nối với nhau):'
      : 'Kéo đỉnh mỗi cột lên đúng tần số của giá trị đó:',
    title: ctx.chartTitle,
    xAxisLabel: ctx.valueLabel,
    yAxisLabel: yLabel,
    categories: ctx.categories,
    expectedValues: ctx.frequencies,
    unit: '',
    axisConfig: ctx.niceAxis,
    showSourceTable: true,
    tableValueLabel: ctx.valueLabel,
    tableFreqLabel: 'Tần số',
    hints: {
      level1: `Đối chiếu với bảng tần số: chiều cao mỗi ${isLine ? 'điểm' : 'cột'} bằng tần số của giá trị tương ứng.`,
      level2: `${isLine ? 'Điểm' : 'Cột'} cao nhất ứng với ${joinVi(ctx.maxCats)} có tần số ${ctx.maxFreq}.`,
      level3: `Các ${isLine ? 'điểm' : 'cột'} bị tô đỏ chưa đúng – em gióng lại theo vạch trên trục đứng.`,
      fullExplanation: `Biểu đồ đúng: ${ctx.categories.map((c, i) => `${c} → ${ctx.frequencies[i]}`).join('; ')}.`,
    },
    successMsg: `Xuất sắc! ${capitalize(name)} của em đã chính xác!`,
    weight: 2,
  };
  step3Tasks.push(plot);
  step3Tasks.push(
    buildMcq({
      id: `${L}-s3-title`,
      prompt: 'Bước cuối: chọn tiêu đề phù hợp nhất cho biểu đồ.',
      correct: { text: ctx.chartTitle, feedback: 'Chính xác! Tiêu đề cho biết biểu đồ biểu diễn dữ liệu gì.' },
      wrongs: [
        { text: `Bảng tần số ${ctx.dauHieu}`, feedback: 'Đây là biểu đồ, không phải bảng.' },
        { text: 'Biểu đồ', feedback: 'Tiêu đề quá chung chung, chưa cho biết biểu đồ biểu diễn dữ liệu gì.' },
        { text: `Cỡ mẫu ${ctx.N}`, feedback: 'Chưa phải tiêu đề của biểu đồ.' },
      ],
      hints: {
        level1: 'Tiêu đề cần nêu rõ biểu đồ biểu diễn dữ liệu gì.',
        level2: `Dữ liệu là "${ctx.dauHieu}".`,
        level3: `Chọn "${ctx.chartTitle}".`,
        fullExplanation: 'SGK Bước 3: Ghi chú giải cho các trục, các điểm (cột) và tiêu đề của biểu đồ.',
      },
      successMsg: 'Rất tốt! Biểu đồ đã đầy đủ chú giải và tiêu đề.',
    })
  );

  // STEP 4
  const finishedChart = buildReferenceChart(kind, computed, {
    title: ctx.chartTitle,
    xAxisLabel: ctx.valueLabel,
    yAxisLabel: yLabel,
    caption: `${capitalize(name)} em đã vẽ.`,
  });
  const maxText = joinVi(ctx.maxCats);
  const step4Tasks: Interaction[] = [
    buildMcq({
      id: `${L}-s4-max`,
      prompt: `Quan sát biểu đồ: ${isLine ? 'điểm cao nhất' : 'cột cao nhất'} ứng với giá trị nào?`,
      correct: { text: maxText, feedback: `Chính xác! Tần số lớn nhất là ${ctx.maxFreq}.` },
      wrongs: [
        ...ctx.categories.filter((c) => !ctx.maxCats.includes(c)).slice(0, 2).map((c) => ({ text: c, feedback: 'Chưa đúng, hãy so sánh chiều cao.' })),
        { text: `Cỡ mẫu ${ctx.N}`, feedback: 'Không đúng.' },
      ],
      hints: {
        level1: `Tìm ${isLine ? 'điểm' : 'cột'} cao nhất trên biểu đồ.`,
        level2: 'Gióng xuống trục ngang để đọc giá trị.',
        level3: `Đó là ${maxText}.`,
        fullExplanation: `${capitalize(isLine ? 'điểm' : 'cột')} cao nhất cho biết giá trị có tần số lớn nhất: ${maxText} (${ctx.maxFreq}).`,
      },
      successMsg: 'Rất chính xác!',
    }),
    buildMcq({
      id: `${L}-s4-isfreq`,
      prompt: 'Vì sao biểu đồ em vừa vẽ là một biểu đồ tần số?',
      correct: {
        text: `Vì nó biểu diễn bảng tần số: chiều cao mỗi ${isLine ? 'điểm' : 'cột'} bằng tần số của giá trị tương ứng.`,
        feedback: 'Chính xác! Biểu đồ biểu diễn bảng tần số được gọi là biểu đồ tần số.',
      },
      wrongs: [
        { text: `Vì nó có dạng ${isLine ? 'đoạn thẳng' : 'cột'}.`, feedback: 'Chưa đủ. Có những biểu đồ cột/đoạn thẳng không phải biểu đồ tần số (VD biểu đồ nhiệt độ).' },
        { text: 'Vì trục ngang có ghi các giá trị.', feedback: 'Chưa đủ, phải xét trục đứng có thể hiện tần số không.' },
      ],
      hints: {
        level1: 'Nhớ lại định nghĩa biểu đồ tần số trong SGK.',
        level2: 'Biểu đồ biểu diễn bảng tần số được gọi là biểu đồ tần số.',
        level3: 'Chiều cao = tần số.',
        fullExplanation: 'Biểu đồ biểu diễn bảng tần số được gọi là biểu đồ tần số. Biểu đồ dạng đoạn thẳng còn gọi là đa giác tần số.',
      },
      successMsg: 'Tuyệt vời!',
    }),
  ];

  return [
    {
      stepNo: 1,
      title: 'Bước 1: Tìm hiểu nội dung bài toán',
      intro: 'Xác định dạng biểu đồ cần vẽ và ý nghĩa của trục ngang, trục đứng.',
      mainTasks: step1Tasks,
      difficulties: [toDiffItem(DIFFICULTY_BANK.AXIS_SWAP), toDiffItem(DIFFICULTY_BANK.NOT_FREQ_CHART)],
      reflectionPrompt: REFLECTION_PROMPT,
      preHintQuiz: DIFFICULTY_BANK.AXIS_SWAP.quiz(ctx, `${L}-s1`),
      hintCard: `Lưu ý: trục ngang biểu diễn ${ctx.valueLabel.toLowerCase()}, trục đứng thể hiện tần số.`,
    },
    {
      stepNo: 2,
      title: 'Bước 2: Xây dựng chương trình giải',
      intro: `Lập kế hoạch vẽ ${name} theo các bước trong SGK và chọn thang chia trục đứng hợp lý.`,
      mainTasks: step2Tasks,
      difficulties: [toDiffItem(DIFFICULTY_BANK.AXIS_SCALE_ERROR), ...(isLine ? [toDiffItem(DIFFICULTY_BANK.LINE_CONNECT)] : [])],
      reflectionPrompt: REFLECTION_PROMPT,
      preHintQuiz: (isLine ? DIFFICULTY_BANK.LINE_CONNECT : DIFFICULTY_BANK.AXIS_SCALE_ERROR).quiz(ctx, `${L}-s2`),
      hintCard: `Mẹo: chia trục đứng từ 0 đến ${ctx.niceAxis.max}, mỗi vạch ${ctx.niceAxis.step} đơn vị.`,
    },
    {
      stepNo: 3,
      title: 'Bước 3: Trình bày lời giải',
      intro: needTableFirst
        ? `Lập bảng tần số, sau đó vẽ ${name} ngay trên khung trục.`
        : `Vẽ ${name} ngay trên khung trục: kéo thả để chỉnh chiều cao.`,
      mainTasks: step3Tasks,
      difficulties: [toDiffItem(isLine ? DIFFICULTY_BANK.LINE_CONNECT : DIFFICULTY_BANK.AXIS_SCALE_ERROR)],
      reflectionPrompt: REFLECTION_PROMPT,
      preHintQuiz: (isLine ? DIFFICULTY_BANK.LINE_CONNECT : DIFFICULTY_BANK.AXIS_SCALE_ERROR).quiz(ctx, `${L}-s3`),
      hintCard: `Nhớ gióng từ trục ngang lên và từ trục đứng sang để ${isLine ? 'điểm' : 'đỉnh cột'} không bị lệch!`,
      modelSolution:
        `### Lời giải mẫu\n\n` +
        (needTableFirst ? `Bảng tần số:\n\n${freqTableMarkdown(ctx)}\n\n` : '') +
        `${capitalize(name)} biểu diễn bảng tần số trên:\n\n` +
        `- Trục ngang: ${ctx.valueLabel.toLowerCase()}; trục đứng: tần số (chia từ 0 đến ${ctx.niceAxis.max}).\n` +
        ctx.categories.map((c, i) => `- ${isLine ? 'Điểm' : 'Cột'} ứng với ${c}: cao ${ctx.frequencies[i]}`).join('\n') +
        (isLine ? '\n- Nối các điểm liên tiếp với nhau.' : '') +
        `\n- Tiêu đề: *${ctx.chartTitle}*.`,
    },
    {
      stepNo: 4,
      title: 'Bước 4: Kiểm tra và nghiên cứu lời giải',
      intro: 'Đọc lại biểu đồ vừa vẽ, đối chiếu với bảng tần số và giải thích vì sao đây là biểu đồ tần số.',
      mainTasks: step4Tasks,
      difficulties: [toDiffItem(DIFFICULTY_BANK.NOT_FREQ_CHART)],
      reflectionPrompt: REFLECTION_PROMPT,
      preHintQuiz: DIFFICULTY_BANK.NOT_FREQ_CHART.quiz(ctx, `${L}-s4`),
      hintCard: 'Biểu đồ tần số giúp ta so sánh nhanh tần số của các giá trị: cột (điểm) càng cao thì giá trị xuất hiện càng nhiều.',
      referenceChart: finishedChart,
    },
  ];
}

// ───────────────────────── TS4 – ĐỌC & PHÂN TÍCH ─────────────────────────

/** Chuẩn hóa để so khớp phương án trắc nghiệm với giá trị */
function normKey(x: string): string {
  return (x || '').normalize('NFC').toLowerCase().replace(/[.;,:"“”]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Phương án (A, B, C, D) ứng với giá trị nào (khớp dài nhất), null nếu không khớp */
function choiceToCategory(choiceText: string, categories: string[]): string | null {
  const t = ` ${normKey(choiceText)} `;
  let best: string | null = null;
  for (const c of categories) {
    const k = normKey(c);
    if (!k) continue;
    if (t.includes(` ${k} `) && (!best || k.length > normKey(best).length)) best = c;
  }
  return best;
}

/** Câu kết luận viết lại từ câu hỏi: "Học sinh Quận A đạt giải nào nhiều nhất?" → "Học sinh Quận A đạt giải Bạc nhiều nhất." */
function answerSentence(question: string, answer: string, fallback: string): string {
  let q = (question || '').trim().replace(/^\(?[a-d]\)\s*/i, '');
  q = q.replace(/^.*?(?:hãy\s+)?cho biết\s+/i, '');
  q = q.replace(/\s*[?？.!]+\s*$/, '');
  const re = /(^|\s)nào(?=\s|$)/;
  const matches = q.match(/(^|\s)nào(?=\s|$)/g) || [];
  if (q && matches.length === 1) {
    return capitalize(q.replace(re, `$1${answer}`)) + '.';
  }
  return fallback;
}

function buildReadingTemplate(
  computed: ComputedData,
  part: { label: string; question: string; askKind?: AskKind; targetValue?: string },
  ctx: Ctx
): PolyaStep[] {
  const L = part.label;
  const fromChart = ctx.sourceKind === 'freq_chart';
  const needTableFirst = !ctx.tableAvailable;
  const srcName = fromChart ? 'biểu đồ tần số' : 'bảng tần số';

  // Xác định kiểu câu hỏi
  // Khuôn này chỉ phụ trách 3 kiểu: nhiều nhất, ít nhất, tần số của một giá trị.
  // Các kiểu khác do module Bài 22 (src/shared/bai22) xử lý. KHÔNG tự đổi sang "max" nữa
  // (đây là nguyên nhân cũ khiến ý "ít nhất 3 năm", "tổng số y tá" bị hướng dẫn sai).
  const askKind: AskKind = part.askKind || 'max';
  if (!['max', 'min', 'value_freq'].includes(askKind)) {
    throw new Error(`Khuôn đọc – phân tích cũ không hỗ trợ kiểu câu hỏi "${askKind}" (ý ${part.label}).`);
  }
  let targetIdx = -1;
  if (askKind === 'value_freq') {
    const t = (part.targetValue || '').trim().toLowerCase().replace('.', ',');
    targetIdx = ctx.categories.findIndex((c) => c.toLowerCase() === t);
    if (targetIdx < 0) throw new Error(`Không tìm thấy giá trị "${part.targetValue}" trong bảng (ý ${part.label}).`);
  }

  const srcChart = fromChart
    ? buildReferenceChart(ctx.sourceChartKind, computed, {
        title: ctx.chartTitle,
        xAxisLabel: ctx.valueLabel,
        yAxisLabel: ctx.freqLabel,
        caption: 'Biểu đồ đề bài cho.',
      })
    : undefined;

  const goalText =
    askKind === 'max'
      ? 'Giá trị có tần số lớn nhất (xuất hiện nhiều nhất)'
      : askKind === 'min'
      ? 'Giá trị có tần số nhỏ nhất (xuất hiện ít nhất)'
      : `Tần số của giá trị ${ctx.categories[targetIdx]}`;

  // ───── STEP 1: Hiểu bài toán – dữ liệu về gì, đề cho gì, hỏi gì ─────
  const givenOptions: Record<string, string> = {
    freq_table: `Bảng tần số về ${ctx.dauHieu}`,
    freq_chart: `Biểu đồ tần số ${ctx.sourceChartKind === 'line' ? 'dạng đoạn thẳng' : 'dạng cột'} về ${ctx.dauHieu}`,
    raw_list: `Dãy số liệu ban đầu về ${ctx.dauHieu} (chưa có bảng tần số)`,
    raw_table: `Bảng ghi số liệu ban đầu về ${ctx.dauHieu} (chưa phải bảng tần số)`,
  };
  const givenCorrect = givenOptions[ctx.sourceKind] || givenOptions.raw_list;
  const givenWrongKeys = (['freq_table', 'freq_chart', 'raw_list'] as const).filter((k) => givenOptions[k] !== givenCorrect);

  const step1Tasks: Interaction[] = [
    taskIdentifyData(ctx, `${L}-s1-data`),
    buildMcq({
      id: `${L}-s1-given`,
      prompt: 'Đề bài đã cho em dữ kiện gì để trả lời câu hỏi?',
      correct: { text: givenCorrect, feedback: 'Chính xác! Em đã xác định đúng dữ kiện đề cho.' },
      wrongs: givenWrongKeys.map((k) => ({ text: givenOptions[k], feedback: 'Chưa đúng, em đọc lại đề xem số liệu được cho ở dạng nào.' })),
      hints: {
        level1: 'Số liệu trong đề được trình bày ở dạng nào: dãy số, bảng hay biểu đồ?',
        level2: fromChart ? 'Đề cho một biểu đồ có trục đứng là tần số.' : ctx.tableAvailable ? 'Đề cho bảng có dòng "Tần số".' : 'Đề cho các số liệu ban đầu, chưa đếm tần số.',
        level3: `Dữ kiện: ${givenCorrect.toLowerCase()}.`,
        fullExplanation: `Đề cho: ${givenCorrect.toLowerCase()}.`,
      },
      successMsg: 'Chính xác!',
    }),
    buildMcq({
      id: `${L}-s1-goal`,
      prompt: 'Câu hỏi của ý này yêu cầu em tìm điều gì?',
      correct: { text: goalText, feedback: 'Chính xác! Em đã hiểu đúng yêu cầu.' },
      wrongs: [
        { text: 'Giá trị có tần số lớn nhất (xuất hiện nhiều nhất)', feedback: 'Chưa đúng với câu hỏi.' },
        { text: 'Giá trị có tần số nhỏ nhất (xuất hiện ít nhất)', feedback: 'Chưa đúng với câu hỏi.' },
        ctx.isNumeric
          ? { text: 'Giá trị lớn nhất trong mẫu dữ liệu', feedback: 'Chú ý: câu hỏi về số lần xuất hiện (tần số), không phải độ lớn giá trị.' }
          : { text: `Tổng số ${ctx.doiTuong} (cỡ mẫu)`, feedback: 'Chưa đúng, câu hỏi không hỏi cỡ mẫu.' },
      ],
      hints: {
        level1: 'Đọc kỹ từ khóa trong câu hỏi: "nhiều nhất", "ít nhất", "bao nhiêu"...',
        level2: `Câu hỏi: "${part.question}"`,
        level3: `Yêu cầu: ${goalText.toLowerCase()}.`,
        fullExplanation: `Ý này yêu cầu tìm: ${goalText.toLowerCase()}.`,
      },
      successMsg: 'Chính xác!',
    }),
  ];

  // ───── STEP 2: Lập kế hoạch ─────
  const planItems = [
    { id: 'c1', text: 'Xác định đại lượng cần tìm (tần số lớn nhất, nhỏ nhất, tần số của một giá trị...).' },
    {
      id: 'c2',
      text: needTableFirst
        ? 'Lập bảng tần số từ mẫu dữ liệu.'
        : fromChart
        ? 'Đọc chiều cao các cột/điểm trên biểu đồ để biết tần số.'
        : 'Đọc dòng tần số trong bảng.',
    },
    { id: 'c3', text: 'So sánh các tần số để tìm giá trị cần tìm.' },
    { id: 'c4', text: 'Trả lời câu hỏi, giải thích dựa vào tần số.' },
  ];
  const step2Tasks: Interaction[] = [
    {
      id: `${L}-s2-plan`,
      type: 'ordering',
      prompt: 'Sắp xếp các bước giải theo đúng thứ tự:',
      items: seededShuffle(planItems, `${L}-plan-ts4`),
      correctOrder: planItems.map((p) => p.id),
      hints: {
        level1: 'Xác định yêu cầu trước, rồi mới tra số liệu.',
        level2: 'Có tần số rồi mới so sánh được.',
        level3: 'Bước cuối: trả lời và giải thích.',
        fullExplanation: 'Xác định yêu cầu → Tìm tần số → So sánh → Trả lời có giải thích.',
      },
      successMsg: 'Rất tốt! Kế hoạch phân tích rất logic.',
      weight: 1,
    },
    buildMcq({
      id: `${L}-s2-where`,
      prompt: fromChart
        ? 'Trên biểu đồ tần số, ta dựa vào đâu để biết giá trị nào xuất hiện nhiều hay ít?'
        : 'Trong bảng tần số, ta dựa vào đâu để biết giá trị nào xuất hiện nhiều hay ít?',
      correct: {
        text: fromChart ? 'Chiều cao của các cột (tung độ các điểm).' : 'Các số ở dòng tần số.',
        feedback: 'Chính xác! Tần số cho biết giá trị xuất hiện nhiều hay ít.',
      },
      wrongs: [
        {
          text: fromChart ? 'Thứ tự các giá trị trên trục ngang.' : ctx.isNumeric ? 'Độ lớn của các số ở dòng giá trị.' : 'Thứ tự ghi các giá trị ở dòng giá trị.',
          feedback: 'Chưa đúng, đó là giá trị chứ không phải tần số.',
        },
        { text: 'Cỡ mẫu N.', feedback: 'Cỡ mẫu là tổng các tần số, không cho biết từng giá trị xuất hiện bao nhiêu lần.' },
      ],
      hints: {
        level1: 'Đại lượng nào cho biết số lần xuất hiện?',
        level2: 'Đó là tần số.',
        level3: fromChart ? 'Trên biểu đồ, tần số là chiều cao cột.' : 'Trong bảng, đó là dòng tần số.',
        fullExplanation: 'Tần số của một giá trị cho biết giá trị đó xuất hiện trong mẫu dữ liệu nhiều hay ít.',
      },
      successMsg: 'Chính xác!',
    }),
  ];

  // ───── STEP 3: Thực hiện ─────
  const step3Tasks: Interaction[] = [];
  if (needTableFirst) {
    step3Tasks.push(buildFreqTableTask(ctx, `${L}-s3-table`, 'Trước hết, em hãy lập bảng tần số:'));
  }

  let answerText = '';
  let modelBody = '';
  if (askKind === 'value_freq') {
    const cat = ctx.categories[targetIdx];
    const f = ctx.frequencies[targetIdx];
    step3Tasks.push({
      id: `${L}-s3-answer`,
      type: 'numeric',
      prompt: part.question || `Giá trị ${cat} xuất hiện bao nhiêu lần?`,
      correctValue: f,
      tolerance: 0,
      unit: '',
      placeholder: 'Nhập tần số...',
      hints: {
        level1: fromChart ? `Tìm cột/điểm ứng với ${cat} trên trục ngang.` : `Tìm cột ${cat} ở dòng giá trị.`,
        level2: 'Đọc số tương ứng ở dòng tần số (hoặc chiều cao cột).',
        level3: `Tần số của ${cat} là ${f}.`,
        fullExplanation: `Giá trị ${cat} có tần số ${f}, tức là xuất hiện ${f} lần.`,
      },
      successMsg: `Chính xác! Giá trị ${cat} có tần số ${f}.`,
      weight: 2,
    });
    answerText = `Giá trị ${cat} có tần số ${f}`;
    modelBody = `Từ ${srcName}, giá trị **${cat}** có tần số **${f}**, tức là xuất hiện ${f} lần trong mẫu dữ liệu ${nPhrase(ctx)}.\n\n**Trả lời:** ${answerSentence(part.question, String(f), `Giá trị ${cat} xuất hiện ${f} lần.`)}`;
  } else {
    const isMax = askKind === 'max';
    const targetCats = isMax ? ctx.maxCats : ctx.minCats;
    const targetFreq = isMax ? ctx.maxFreq : ctx.minFreq;
    const tText = joinVi(targetCats);
    const hints: HintSet = {
      level1: fromChart ? `Tìm ${isMax ? 'cột cao nhất' : 'cột thấp nhất'} trên biểu đồ.` : `Tìm số ${isMax ? 'lớn nhất' : 'nhỏ nhất'} ở dòng tần số.`,
      level2: `Tần số ${isMax ? 'lớn nhất' : 'nhỏ nhất'} là ${targetFreq}.`,
      level3: `Ứng với ${tText}.`,
      fullExplanation: `${capitalize(tText)} có tần số ${isMax ? 'lớn nhất' : 'nhỏ nhất'} là ${targetFreq}.`,
    };

    // Đề trắc nghiệm: giữ nguyên các phương án A, B, C, D của đề
    let chosenLetter = '';
    let answerMcq: McqInteraction | null = null;
    if (ctx.choices && targetCats.length === 1) {
      const mapped = ctx.choices.map((c) => ({ ...c, cat: choiceToCategory(c.text, ctx.categories) }));
      const correct = mapped.filter((m) => m.cat === targetCats[0]);
      if (correct.length === 1) {
        chosenLetter = correct[0].letter;
        const options: McqOption[] = mapped.map((m) => {
          const idx = m.cat ? ctx.categories.indexOf(m.cat) : -1;
          return {
            id: `opt${m.letter}`,
            text: `${m.letter}. ${m.text}`,
            feedback:
              m.letter === chosenLetter
                ? `Chính xác! ${capitalize(m.cat!)} có tần số ${isMax ? 'lớn' : 'nhỏ'} nhất là ${targetFreq}.`
                : idx >= 0
                ? `Chưa đúng: ${m.cat} có tần số ${ctx.frequencies[idx]}, chưa phải ${isMax ? 'lớn' : 'nhỏ'} nhất.`
                : 'Chưa đúng, em so sánh lại các tần số nhé.',
          };
        });
        answerMcq = {
          id: `${L}-s3-answer`,
          type: 'mcq',
          prompt: part.question || (isMax ? 'Giá trị nào xuất hiện nhiều nhất?' : 'Giá trị nào xuất hiện ít nhất?'),
          options,
          correctOptionId: `opt${chosenLetter}`,
          hints,
          successMsg: 'Tuyệt vời! Em đã trả lời chính xác câu hỏi của đề!',
          weight: 2,
        };
      }
    }
    if (!answerMcq) {
      answerMcq = buildMcq({
        id: `${L}-s3-answer`,
        prompt: part.question || (isMax ? 'Giá trị nào xuất hiện nhiều nhất?' : 'Giá trị nào xuất hiện ít nhất?'),
        correct: { text: tText, feedback: 'Chính xác!' },
        wrongs: [
          ...ctx.categories
            .filter((c) => !targetCats.includes(c))
            .slice(0, 3)
            .map((c) => {
              const f = ctx.frequencies[ctx.categories.indexOf(c)];
              return { text: c, feedback: `Chưa đúng: ${c} có tần số ${f}, chưa phải ${isMax ? 'lớn' : 'nhỏ'} nhất.` };
            }),
          ...(targetCats.length > 1
            ? [{ text: targetCats[0], feedback: `Chưa đủ: còn giá trị khác cũng có tần số ${targetFreq}.` }]
            : []),
        ],
        hints,
        successMsg: 'Tuyệt vời! Em đã trả lời chính xác câu hỏi của đề!',
        weight: 2,
      });
    }

    step3Tasks.push(answerMcq, {
      id: `${L}-s3-freq`,
      type: 'numeric',
      prompt: `Tần số ${isMax ? 'lớn nhất' : 'nhỏ nhất'} đó bằng bao nhiêu (để làm căn cứ giải thích)?`,
      correctValue: targetFreq,
      tolerance: 0,
      unit: '',
      placeholder: 'Nhập tần số...',
      hints: {
        level1: 'Đọc tần số của giá trị em vừa chọn.',
        level2: fromChart ? 'Gióng đỉnh cột sang trục đứng.' : 'Xem dòng tần số.',
        level3: `Tần số bằng ${targetFreq}.`,
        fullExplanation: `${capitalize(tText)} có tần số ${targetFreq}.`,
      },
      successMsg: `Chính xác! Tần số bằng ${targetFreq}.`,
      weight: 1,
    });

    answerText = `${capitalize(tText)} xuất hiện ${isMax ? 'nhiều' : 'ít'} nhất (tần số ${targetFreq})`;
    const conclusion = answerSentence(part.question, tText, `${capitalize(tText)} xuất hiện ${isMax ? 'nhiều' : 'ít'} nhất.`);
    modelBody =
      `Từ ${srcName}, ta so sánh các tần số: ${ctx.categories.map((c, i) => `${c} (${ctx.frequencies[i]})`).join(', ')} ${nPhrase(ctx)}.\n\n` +
      `Tần số ${isMax ? 'lớn' : 'nhỏ'} nhất là **${targetFreq}**, ứng với **${tText}**.\n\n` +
      `**Trả lời:** ${conclusion}` +
      (chosenLetter ? `\n\n**Chọn ${chosenLetter}.**` : '');
  }

  // ───── STEP 4: Nhìn lại – kiểm tra, cách khác, mở rộng ─────
  const step4Tasks: Interaction[] = [
    ...taskTotalCheck(ctx, `${L}-s4-total`, 'Kiểm tra: tổng các tần số bằng bao nhiêu?'),
    buildMcq({
      id: `${L}-s4-meaning`,
      prompt: 'Nhận xét nào sau đây nói đúng ý nghĩa của tần số trong bài toán này?',
      correct: {
        text: `Tần số cho biết mỗi giá trị xuất hiện nhiều hay ít; ở bài này ${joinVi(ctx.maxCats)} có tần số lớn nhất (${ctx.maxFreq}).`,
        feedback: 'Chính xác! Đây là ý nghĩa và vai trò của tần số trong thực tiễn.',
      },
      wrongs: [
        ctx.isNumeric
          ? { text: 'Giá trị lớn nhất luôn là giá trị có tần số lớn nhất.', feedback: 'Sai rồi! Độ lớn giá trị và tần số là hai đại lượng khác nhau.' }
          : { text: 'Giá trị được ghi đầu tiên trong bảng luôn có tần số lớn nhất.', feedback: 'Sai rồi! Thứ tự ghi không cho biết số lần xuất hiện.' },
        { text: 'Không thể rút ra nhận xét gì từ tần số.', feedback: 'Chưa đúng, tần số giúp ta so sánh mức độ xuất hiện của các giá trị.' },
      ],
      hints: {
        level1: 'Tần số của một giá trị cho biết điều gì?',
        level2: 'Cho biết giá trị đó xuất hiện nhiều hay ít.',
        level3: 'Chọn nhận xét gắn với số lần xuất hiện.',
        fullExplanation:
          'Tần số của một giá trị cho biết giá trị đó xuất hiện trong mẫu dữ liệu nhiều hay ít, từ đó ta dễ dàng xác định được giá trị xuất hiện nhiều nhất, ít nhất.',
      },
      successMsg: 'Rất tốt! Em đã hiểu ý nghĩa thực tiễn của tần số.',
    }),
  ];

  // Mở rộng bài toán (Pólya: "có thể dùng kết quả/phương pháp cho bài toán khác không?")
  const extIsMax = askKind !== 'max';
  const extCats = extIsMax ? ctx.maxCats : ctx.minCats;
  const extFreq = extIsMax ? ctx.maxFreq : ctx.minFreq;
  if (ctx.k >= 2 && extCats.length < ctx.k) {
    const extText = joinVi(extCats);
    step4Tasks.push(
      buildMcq({
        id: `${L}-s4-extend`,
        prompt: `Mở rộng: cũng từ ${srcName} này, giá trị nào xuất hiện ${extIsMax ? 'nhiều' : 'ít'} nhất?`,
        correct: {
          text: extText,
          feedback:
            extCats.length > 1
              ? `Chính xác! Có ${extCats.length} giá trị cùng có tần số ${extFreq}, phải kể đủ.`
              : `Chính xác! Tần số ${extIsMax ? 'lớn' : 'nhỏ'} nhất là ${extFreq}.`,
        },
        wrongs: [
          ...(extCats.length > 1
            ? extCats.map((c) => ({ text: `Chỉ ${c}`, feedback: `Chưa đủ: còn giá trị khác cũng có tần số ${extFreq}.` }))
            : []),
          ...ctx.categories
            .filter((c) => !extCats.includes(c))
            .map((c) => ({ text: c, feedback: `Chưa đúng: ${c} có tần số ${ctx.frequencies[ctx.categories.indexOf(c)]}.` })),
        ],
        hints: {
          level1: `Tìm số ${extIsMax ? 'lớn' : 'nhỏ'} nhất ở dòng tần số.`,
          level2: `Tần số ${extIsMax ? 'lớn' : 'nhỏ'} nhất là ${extFreq}.`,
          level3: extCats.length > 1 ? `Có nhiều giá trị cùng tần số ${extFreq}.` : `Ứng với ${extText}.`,
          fullExplanation: `${capitalize(extText)} có tần số ${extIsMax ? 'lớn' : 'nhỏ'} nhất là ${extFreq}.`,
        },
        successMsg: 'Tuyệt vời! Em đã vận dụng cách làm cho một câu hỏi mới.',
      })
    );
  }

  // Cách khác: biểu diễn bảng tần số bằng biểu đồ cột để thấy ngay kết quả
  const step4Chart = fromChart
    ? srcChart
    : buildReferenceChart('bar', computed, {
        title: ctx.chartTitle,
        xAxisLabel: ctx.valueLabel,
        yAxisLabel: 'Tần số',
        caption: 'Cách khác: biểu diễn bảng tần số bằng biểu đồ cột – cột cao nhất (thấp nhất) cho ngay giá trị xuất hiện nhiều nhất (ít nhất).',
      });

  const readDiff = fromChart ? DIFFICULTY_BANK.READ_WRONG : DIFFICULTY_BANK.READ_WRONG_TABLE;
  const step3Diff = askKind === 'value_freq' ? readDiff : DIFFICULTY_BANK.TIE_VALUES;

  return [
    {
      stepNo: 1,
      title: 'Bước 1: Tìm hiểu nội dung bài toán',
      intro: fromChart
        ? 'Quan sát biểu đồ tần số và đọc kỹ câu hỏi để biết đề cho gì, hỏi gì.'
        : 'Đọc kỹ câu hỏi và nguồn số liệu để biết đề cho gì, hỏi gì.',
      mainTasks: step1Tasks,
      difficulties: [toDiffItem(DIFFICULTY_BANK.CONFUSE_X_AND_N)],
      reflectionPrompt: REFLECTION_PROMPT,
      preHintQuiz: DIFFICULTY_BANK.CONFUSE_X_AND_N.quiz(ctx, `${L}-s1`),
      hintCard: 'Đọc kỹ xem đề hỏi về giá trị hay về tần số (số lần xuất hiện).',
      referenceChart: srcChart,
    },
    {
      stepNo: 2,
      title: 'Bước 2: Xây dựng chương trình giải',
      intro: 'Lựa chọn cách tra cứu tần số và so sánh phù hợp.',
      mainTasks: step2Tasks,
      difficulties: [toDiffItem(readDiff)],
      reflectionPrompt: REFLECTION_PROMPT,
      preHintQuiz: readDiff.quiz(ctx, `${L}-s2`),
      hintCard: fromChart ? 'Gióng đúng từ đỉnh cột (điểm) sang trục đứng để đọc tần số.' : 'Tra đúng cột trong bảng để không lấy nhầm số.',
    },
    {
      stepNo: 3,
      title: 'Bước 3: Trình bày lời giải',
      intro: 'So sánh các tần số và đưa ra câu trả lời có giải thích.',
      mainTasks: step3Tasks,
      difficulties: [toDiffItem(step3Diff)],
      reflectionPrompt: REFLECTION_PROMPT,
      preHintQuiz: step3Diff.quiz(ctx, `${L}-s3`),
      hintCard: `Trình bày kèm căn cứ: ${answerText}.`,
      modelSolution: `### Lời giải\n\n${needTableFirst ? `Bảng tần số:\n\n${freqTableMarkdown(ctx)}\n\n` : ''}${modelBody}`,
      referenceChart: srcChart,
    },
    {
      stepNo: 4,
      title: 'Bước 4: Kiểm tra và nghiên cứu lời giải',
      intro: 'Kiểm tra lại số liệu, đối chiếu với đề, xem cách làm khác và mở rộng bài toán.',
      mainTasks: step4Tasks,
      difficulties: [toDiffItem(DIFFICULTY_BANK.COUNT_MISMATCH)],
      reflectionPrompt: REFLECTION_PROMPT,
      preHintQuiz: DIFFICULTY_BANK.COUNT_MISMATCH.quiz(ctx, `${L}-s4`),
      hintCard: 'Luôn gắn kết quả toán học với ý nghĩa thực tiễn: tần số cho biết điều gì về các đối tượng được khảo sát?',
      referenceChart: step4Chart,
    },
  ];
}

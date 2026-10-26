/**
 * KHUÔN QUY TRÌNH 4 BƯỚC PÓLYA cho dạng TS4 (13 kiểu câu hỏi), TS5 và TS6.
 * Mọi con số lấy từ solve.ts. Mọi lựa chọn sai được sinh từ các sai lầm thường gặp
 * (lấy thiếu/thừa giá trị biên, cộng giá trị thay vì tần số, nhầm N với k...).
 *
 * TS1/TS2/TS3 giữ nguyên khuôn sẵn có của app (đã chạy đúng).
 */
import type {
  Answer,
  Condition,
  FreqTable,
  HintSet,
  Interaction,
  McqInteraction,
  PolyaStep,
  QuestionSpec,
  ReferenceChart,
} from './types.ts';
import { type Choice, mcq, numberDistractors, numeric, ordering, tableFill } from './builders.ts';
import { D, type DCtx, type Difficulty, REFLECTION_PROMPT } from './difficulties.ts';
import { complement, condSymbol, condWords, makeData, testCond, type Data } from './solve.ts';
import { capitalize, fmtNum, fold, joinVi, origPhrase, withUnit } from './textVi.ts';

export interface TemplateHooks {
  /** Hàm dựng bảng tần số của app (nếu có) – dùng khi đề cho dữ liệu thô */
  freqTableTask?: (id: string, prompt: string) => Interaction;
  /** Biểu đồ của đề (khi đề cho biểu đồ) – hiển thị trong Bước 1 và 3 */
  sourceChart?: ReferenceChart;
}

const H = (level1: string, level2: string, level3: string, fullExplanation: string): HintSet => ({
  level1,
  level2,
  level3,
  fullExplanation,
});

interface KindPlan {
  goal: string;
  goalWrongs: Choice[];
  s1Extra: Interaction[];
  s1Diff: Difficulty;
  s1Hint: string;
  plan: string[];
  method: Interaction;
  s2Diff: Difficulty;
  s2Hint: string;
  s3: Interaction[];
  s3Diff: Difficulty;
  s3Hint: string;
  model: string;
  s4: Interaction[];
  s4Diff: Difficulty;
  s4Hint: string;
}

// ───────────────────────── Ngữ cảnh chung ─────────────────────────

interface Env {
  L: string;
  s: QuestionSpec;
  a: Answer;
  t: FreqTable;
  d: Data;
  doi: string;
  u: string;
  dau: string;
  X: (c: string) => string;
  src: string; //       "biểu đồ" | "bảng tần số"
  fromChart: boolean;
  needTable: boolean;
  dctx: DCtx;
  hooks: TemplateHooks;
}

function makeEnv(L: string, s: QuestionSpec, a: Answer, t: FreqTable, hooks: TemplateHooks): Env {
  const d = makeData(t);
  const fromChart = t.sourceKind === 'freq_chart';
  return {
    L,
    s,
    a,
    t,
    d,
    doi: t.doiTuong || 'đối tượng',
    u: t.donVi,
    dau: t.dauHieu || 'dữ liệu',
    X: (c) => withUnit(c, t.donVi),
    src: fromChart ? 'biểu đồ' : 'bảng tần số',
    fromChart,
    needTable: t.sourceKind === 'raw_list' || t.sourceKind === 'raw_table',
    dctx: {
      doi: t.doiTuong || 'đối tượng',
      unit: t.donVi,
      N: d.N,
      k: d.cats.length,
      fromChart,
      threshold: s.condition?.a,
    },
    hooks,
  };
}

function freqTableMarkdown(e: Env): string {
  const head = `| ${e.t.valueLabel || capitalize(e.dau)} | ${e.d.cats.join(' | ')} |`;
  const sep = `| --- | ${e.d.cats.map(() => '---').join(' | ')} |`;
  const row = `| Tần số | ${e.d.freqs.join(' | ')} |`;
  return `${head}\n${sep}\n${row}`;
}

function freqTableTask(e: Env, id: string, prompt: string): Interaction {
  if (e.hooks.freqTableTask) return e.hooks.freqTableTask(id, prompt);
  return tableFill({
    id,
    prompt,
    headers: [e.t.valueLabel || capitalize(e.dau), 'Tần số'],
    rows: e.d.cats.map((c, i) => ({ cells: [c, { expect: e.d.freqs[i] }] })),
    hints: H(
      'Đếm số lần xuất hiện của từng giá trị trong dãy dữ liệu.',
      `Cỡ mẫu N = ${e.d.N}; sau khi điền, cộng các tần số xem có bằng N không.`,
      'Gạch mỗi số liệu sau khi đếm để không sót, không trùng.',
      `Bảng đúng có tổng các tần số bằng ${e.d.N}.`
    ),
    successMsg: 'Tuyệt vời! Em đã lập đúng bảng tần số!',
  });
}

const nameList = (e: Env, cats: string[]) => (cats.length ? joinVi(cats.map(e.X)) : 'Không có giá trị nào');

// ───────────────────────── Bước 1: các câu dùng chung ─────────────────────────

function dataTask(e: Env): McqInteraction {
  return mcq({
    id: `${e.L}-s1-data`,
    prompt: 'Dữ liệu trong bài toán được thu thập về vấn đề gì?',
    correct: { text: capitalize(e.dau), feedback: 'Chính xác! Đây là nội dung được thống kê.' },
    wrongs: [
      { text: `Các ${e.doi}`, feedback: `Đây là đối tượng được khảo sát (các ${e.doi}), chưa phải nội dung dữ liệu.` },
      { text: `Tổng số ${e.doi}`, feedback: 'Đây là cỡ mẫu, chưa phải nội dung dữ liệu.' },
    ],
    hints: H('Đề bài đang tìm hiểu điều gì?', `Người ta thu thập thông tin gì ở các ${e.doi}?`, `Dữ liệu là "${e.dau}".`, `Mẫu dữ liệu gồm các thông tin về "${e.dau}" của các ${e.doi}.`),
    successMsg: 'Rất chính xác!',
  });
}

function givenTask(e: Env): McqInteraction {
  const chartKind = e.t.sourceChartKind === 'line' ? 'đoạn thẳng' : 'cột';
  const all: Record<string, string> = {
    freq_chart: `Biểu đồ tần số dạng ${chartKind} về ${e.dau}`,
    freq_table: `Bảng tần số về ${e.dau}`,
    raw_list: `Dãy số liệu ban đầu về ${e.dau} (chưa có bảng tần số)`,
    raw_table: `Bảng ghi dữ liệu ban đầu về ${e.dau} (chưa có bảng tần số)`,
  };
  const correct = all[e.t.sourceKind];
  return mcq({
    id: `${e.L}-s1-given`,
    prompt: 'Đề bài đã cho em dữ kiện gì để trả lời câu hỏi?',
    correct: { text: correct, feedback: 'Chính xác! Em đã xác định đúng dữ kiện đề cho.' },
    wrongs: Object.entries(all)
      .filter(([k]) => k !== e.t.sourceKind && !(k === 'raw_table' && e.t.sourceKind === 'raw_list') && !(k === 'raw_list' && e.t.sourceKind === 'raw_table'))
      .map(([, v]) => ({ text: v, feedback: 'Chưa đúng, em đọc lại đề xem số liệu được cho ở dạng nào.' })),
    hints: H('Số liệu trong đề được trình bày ở dạng nào: dãy số, bảng hay biểu đồ?', e.fromChart ? 'Đề cho một biểu đồ có trục đứng là tần số.' : 'Xem đề có dòng "tần số" chưa.', `Dữ kiện: ${correct.toLowerCase()}.`, `Đề cho: ${correct.toLowerCase()}.`),
  });
}

function goalTask(e: Env, goal: string, wrongs: Choice[]): McqInteraction {
  return mcq({
    id: `${e.L}-s1-goal`,
    prompt: 'Câu hỏi của ý này yêu cầu em tìm điều gì?',
    correct: { text: goal, feedback: 'Chính xác! Em đã hiểu đúng yêu cầu.' },
    wrongs,
    hints: H(
      'Đọc kỹ từ khóa trong câu hỏi: "bao nhiêu", "nào", "nhiều nhất", "ít nhất + số", "gấp mấy lần"...',
      `Câu hỏi: "${e.s.question}"`,
      `Yêu cầu: ${goal.charAt(0).toLowerCase() + goal.slice(1)}.`,
      `Ý này yêu cầu tìm: ${goal.charAt(0).toLowerCase() + goal.slice(1)}.`
    ),
  });
}

// Các "mục tiêu" dễ nhầm dùng làm lựa chọn sai ở câu "đề hỏi gì"
function G(e: Env) {
  const firstCat = e.d.cats[0];
  return {
    max: { text: 'Giá trị có tần số lớn nhất (xuất hiện nhiều nhất)', feedback: 'Chưa đúng với câu hỏi.' },
    min: { text: 'Giá trị có tần số nhỏ nhất (xuất hiện ít nhất)', feedback: 'Chưa đúng với câu hỏi.' },
    N: { text: `Tổng số ${e.doi} (cỡ mẫu N)`, feedback: 'Chưa đúng: câu hỏi không hỏi tổng số tất cả.' },
    k: { text: 'Số giá trị khác nhau', feedback: 'Chưa đúng với câu hỏi.' },
    vmax: { text: `Giá trị lớn nhất của ${e.dau}`, feedback: 'Chú ý: câu hỏi không hỏi độ lớn của giá trị.' },
    vf: (c?: string) => ({ text: `Tần số của giá trị ${e.X(c ?? firstCat)}`, feedback: 'Chưa đúng với câu hỏi.' }),
  };
}

// ───────────────────────── Từng kiểu câu hỏi ─────────────────────────

function planCountCondition(e: Env): KindPlan {
  const c = e.s.condition!;
  const S = e.a.number!;
  const used = e.a.usedCategories || [];
  const phrase = origPhrase(e.s.question, c.phrase);
  const words = condWords(c, e.u);
  const trap = /it nhat|nhieu nhat|toi thieu|toi da/.test(fold(phrase));
  const g = G(e);

  // Các biến thể sai của điều kiện (biên)
  const variants: Condition[] = [];
  const flip = { gte: 'gt', gt: 'gte', lte: 'lt', lt: 'lte' } as const;
  if (c.op in flip) variants.push({ ...c, op: flip[c.op as keyof typeof flip] });
  const comp = complement(c);
  const sumWhere = (cond: Condition) =>
    e.d.cats.reduce((acc, _, i) => acc + (testCond(e.d.nums[i], cond) ? e.d.freqs[i] : 0), 0);
  const catsWhere = (cond: Condition) => e.d.cats.filter((_, i) => testCond(e.d.nums[i], cond));

  const goal = `Số ${e.doi} có ${e.dau} ${words.replace(/ \(.*\)$/, '')}`;
  const goalWrongs: Choice[] = [
    trap && c.op === 'gte'
      ? { text: g.min.text, feedback: `Bẫy chữ "ít nhất": sau đó có số ${fmtNum(c.a)} nên đây là điều kiện ≥ ${fmtNum(c.a)}, không phải tần số nhỏ nhất.` }
      : trap && c.op === 'lte'
      ? { text: g.max.text, feedback: `Bẫy chữ "nhiều nhất": sau đó có số ${fmtNum(c.a)} nên đây là điều kiện ≤ ${fmtNum(c.a)}.` }
      : g.min,
    { text: `Tần số của giá trị ${e.X(fmtNum(c.a))}`, feedback: `Chưa đúng: không chỉ giá trị ${fmtNum(c.a)} mà mọi giá trị ${condSymbol(c)}.` },
    { ...g.N },
  ];

  const meaning = mcq({
    id: `${e.L}-s1-cond`,
    prompt: `Cụm từ "${phrase}" trong câu hỏi có nghĩa là các giá trị:`,
    correct: { text: capitalize(words), feedback: `Chính xác! "${phrase}" ⇔ ${condSymbol(c, e.u)}.` },
    wrongs: [
      ...variants.map((v) => ({ text: capitalize(condWords(v, e.u)), feedback: 'Chưa đúng ở giá trị biên: xem lại có lấy giá trị ' + fmtNum(c.a) + ' hay không.' })),
      ...(comp ? [{ text: capitalize(condWords(comp, e.u)), feedback: 'Ngược điều kiện rồi.' }] : []),
      trap
        ? { text: c.op === 'gte' ? 'Có tần số nhỏ nhất' : 'Có tần số lớn nhất', feedback: 'Sau "ít nhất / nhiều nhất" có số nên đây là điều kiện về giá trị.' }
        : { text: `Đúng bằng ${fmtNum(c.a)}${e.u ? ' ' + e.u : ''}`, feedback: 'Chưa đúng, điều kiện gồm nhiều giá trị.' },
    ],
    hints: H(`Sau "${phrase.split(' ').slice(0, 2).join(' ')}" có con số nào?`, `Con số ${fmtNum(c.a)} là ngưỡng của điều kiện.`, `Ký hiệu: ${condSymbol(c, e.u)}.`, `"${phrase}" nghĩa là ${words}.`),
  });

  const listChoice = (cats: string[]) => nameList(e, cats);
  const method = mcq({
    id: `${e.L}-s2-which`,
    prompt: `Trên ${e.src}, những giá trị nào thỏa điều kiện "${phrase}"?`,
    correct: { text: listChoice(used), feedback: 'Chính xác! Đó là các giá trị cần lấy tần số.' },
    wrongs: [
      ...variants.map((v) => ({ text: listChoice(catsWhere(v)), feedback: `Xem lại giá trị biên ${fmtNum(c.a)}: ${words}.` })),
      ...(comp ? [{ text: listChoice(catsWhere(comp)), feedback: 'Đây là các giá trị KHÔNG thỏa điều kiện.' }] : []),
      { text: e.X(fmtNum(c.a)), feedback: `Không chỉ giá trị ${fmtNum(c.a)}.` },
    ],
    hints: H('Đi lần lượt từng giá trị trên trục ngang (dòng giá trị).', `Với mỗi giá trị, hỏi: có ${condSymbol(c)} không?`, `Các giá trị thỏa: ${listChoice(used)}.`, `Điều kiện ${condSymbol(c, e.u)} gồm: ${listChoice(used)}.`),
  });

  const usedFreqs = used.map((x) => e.d.freqs[e.d.cats.indexOf(x)]);
  const sumOfValues = used.reduce((acc, x) => acc + e.d.nums[e.d.cats.indexOf(x)], 0);
  const common = [
    ...variants.map((v) => ({ value: sumWhere(v), feedback: `Em đã ${testCond(c.a, c) ? 'bỏ sót' : 'lấy thừa'} giá trị biên ${fmtNum(c.a)}. Xem lại: ${words}.` })),
    ...(comp ? [{ value: sumWhere(comp), feedback: 'Đây là số đối tượng KHÔNG thỏa điều kiện.' }] : []),
    { value: sumOfValues, feedback: 'Em đã cộng các GIÁ TRỊ; cần cộng các TẦN SỐ.' },
    { value: used.length, feedback: 'Đây là số giá trị thỏa điều kiện, chưa phải số đối tượng.' },
    ...(e.d.cats.includes(fmtNum(c.a)) ? [{ value: e.d.freqs[e.d.cats.indexOf(fmtNum(c.a))], feedback: `Đây chỉ là tần số của giá trị ${fmtNum(c.a)}.` }] : []),
  ];

  const s3: Interaction[] = [
    numeric({
      id: `${e.L}-s3-answer`,
      prompt: e.s.question,
      value: S,
      unit: e.doi,
      placeholder: 'Nhập số ...',
      hints: H(`Cộng tần số của các giá trị: ${listChoice(used)}.`, `Các tần số đó là: ${usedFreqs.join(', ') || '0'}.`, `Phép tính: ${e.a.working}`, `${e.a.sentence}`),
      successMsg: `Tuyệt vời! ${e.a.sentence}`,
      weight: 2,
      isFinalAnswer: true,
      commonErrors: common,
    }),
  ];

  const notS = e.d.N - S;
  const s4: Interaction[] = [
    numeric({
      id: `${e.L}-s4-N`,
      prompt: `Kiểm tra: tổng số ${e.doi} (cỡ mẫu N) là bao nhiêu?`,
      value: e.d.N,
      hints: H('Cộng tất cả các tần số.', `Phép cộng: ${e.d.freqs.join(' + ')}.`, `N = ${e.d.N}.`, `N = ${e.d.freqs.join(' + ')} = ${e.d.N}.`),
    }),
    numeric({
      id: `${e.L}-s4-other`,
      prompt: `Cách khác: có bao nhiêu ${e.doi} KHÔNG thỏa điều kiện "${phrase}"? (Kết quả cộng với đáp số của em phải bằng N.)`,
      value: notS,
      hints: H('Cộng tần số của các giá trị còn lại.', `Hoặc lấy N − ${S}.`, `${e.d.N} − ${S} = ${notS}.`, `${S} + ${notS} = ${e.d.N} = N nên đáp số hợp lý.`),
      successMsg: `Đúng! ${S} + ${notS} = ${e.d.N} = N, đáp số được kiểm tra.`,
    }),
  ];
  const ext = variants[0];
  if (ext) {
    const extPhrase = condWords(ext, e.u).replace(/ \(.*\)$/, '');
    s4.push(
      numeric({
        id: `${e.L}-s4-extend`,
        prompt: `Mở rộng: có bao nhiêu ${e.doi} có ${e.dau} ${extPhrase}?`,
        value: sumWhere(ext),
        hints: H('Làm tương tự, chú ý giá trị biên.', `Các giá trị thỏa: ${listChoice(catsWhere(ext))}.`, `Cộng tần số của chúng.`, `Kết quả: ${sumWhere(ext)}.`),
        successMsg: 'Tuyệt vời! Em đã vận dụng cách làm cho một câu hỏi mới.',
      })
    );
  }

  return {
    goal,
    goalWrongs,
    s1Extra: [meaning],
    s1Diff: trap ? D.ITNHAT_TRAP : D.BOUNDARY,
    s1Hint: `Viết lại điều kiện bằng ký hiệu: "${phrase}" ⇔ ${condSymbol(c, e.u)}.`,
    plan: [
      `Đọc các giá trị và tần số tương ứng trên ${e.src}.`,
      `Chọn ra các giá trị thỏa điều kiện ${condSymbol(c, e.u)}.`,
      'Cộng tần số của các giá trị đã chọn.',
      'Trả lời câu hỏi.',
    ],
    method,
    s2Diff: D.BOUNDARY,
    s2Hint: `Lấy ${testCond(c.a, c) ? 'CẢ' : 'KHÔNG lấy'} giá trị ${fmtNum(c.a)}.`,
    s3,
    s3Diff: D.ADD_VALUES,
    s3Hint: `Cộng TẦN SỐ (số ${e.doi}), không cộng giá trị.`,
    model: `Các giá trị thỏa điều kiện ${condSymbol(c, e.u)}: ${listChoice(used)}.\n\nSố ${e.doi} cần tìm: ${e.a.working}.`,
    s4,
    s4Diff: D.COUNT_MISMATCH,
    s4Hint: 'Kiểm tra bằng phần còn lại: (số thỏa điều kiện) + (số không thỏa) = N.',
  };
}

function planValueFreq(e: Env): KindPlan {
  const target = e.s.targets![0];
  const i = e.d.cats.indexOf(target);
  const f = e.d.freqs[i];
  const g = G(e);
  const neighbours = [e.d.freqs[i - 1], e.d.freqs[i + 1]].filter((x) => x !== undefined);
  const other = e.d.cats.find((c) => c !== target)!;
  return {
    goal: `Tần số của giá trị ${e.X(target)} (số ${e.doi} ứng với ${e.X(target)})`,
    goalWrongs: [g.max, g.N, { text: `Giá trị ${e.X(target)} lớn hay nhỏ`, feedback: 'Chưa đúng: câu hỏi hỏi số lượng.' }],
    s1Extra: [],
    s1Diff: D.CONFUSE_X_N,
    s1Hint: `Giá trị được hỏi là ${e.X(target)}; đáp số là một tần số.`,
    plan: [`Xác định giá trị được hỏi: ${e.X(target)}.`, `Tìm giá trị ${e.X(target)} trên ${e.src}.`, 'Đọc tần số tương ứng.', 'Trả lời câu hỏi.'],
    method: mcq({
      id: `${e.L}-s2-where`,
      prompt: `Trên ${e.src}, số ${e.doi} ứng với giá trị ${e.X(target)} được đọc ở đâu?`,
      correct: e.fromChart
        ? { text: `Chiều cao của cột (điểm) ứng với ${e.X(target)}`, feedback: 'Chính xác!' }
        : { text: `Ô ở dòng tần số, cùng cột với ${e.X(target)}`, feedback: 'Chính xác!' },
      wrongs: [
        { text: 'Số ở trục ngang / dòng giá trị', feedback: 'Đó là giá trị, không phải tần số.' },
        { text: `Cỡ mẫu N`, feedback: 'Cỡ mẫu là tổng các tần số.' },
      ],
      hints: H('Số lượng đối tượng ứng với một giá trị gọi là gì?', 'Gọi là tần số.', e.fromChart ? 'Trên biểu đồ, tần số là chiều cao cột.' : 'Trong bảng, đó là dòng tần số.', 'Mỗi giá trị đi cặp với đúng một tần số.'),
    }),
    s2Diff: D.READ_WRONG,
    s2Hint: e.fromChart ? 'Gióng từ đỉnh cột sang trục đứng.' : 'Tra đúng cột của giá trị.',
    s3: [
      numeric({
        id: `${e.L}-s3-answer`,
        prompt: e.s.question,
        value: f,
        hints: H(`Tìm ${e.X(target)} trên ${e.src}.`, 'Đọc tần số tương ứng.', `Tần số của ${e.X(target)} là ${f}.`, e.a.sentence),
        successMsg: `Chính xác! ${e.a.sentence}`,
        weight: 2,
        isFinalAnswer: true,
        commonErrors: [
          ...neighbours.map((n) => ({ value: n, feedback: 'Em đã đọc nhầm sang cột bên cạnh.' })),
          ...(e.d.numeric ? [{ value: e.d.nums[i], feedback: 'Đó là giá trị, không phải tần số.' }] : []),
          { value: e.d.N, feedback: 'Đó là cỡ mẫu N.' },
        ],
      }),
    ],
    s3Diff: D.READ_WRONG,
    s3Hint: `Trình bày: tần số của ${e.X(target)} là ${f}.`,
    model: `Từ ${e.src}, giá trị ${e.X(target)} có tần số **${f}**.`,
    s4: [
      mcq({
        id: `${e.L}-s4-check`,
        prompt: `Kiểm tra: tần số ${f} có hợp lý không?`,
        correct: { text: `Hợp lý, vì ${f} ≤ N = ${e.d.N}`, feedback: 'Chính xác! Tần số của một giá trị không thể vượt cỡ mẫu.' },
        wrongs: [
          { text: `Không hợp lý, vì ${f} phải bằng N`, feedback: 'Chỉ khi mọi đối tượng có cùng giá trị.' },
          { text: 'Không kiểm tra được', feedback: 'Có thể so sánh với cỡ mẫu.' },
        ],
        hints: H('So sánh với tổng số đối tượng.', `N = ${e.d.N}.`, `${f} ≤ ${e.d.N}.`, 'Tần số của mỗi giá trị luôn ≤ N.'),
      }),
      numeric({
        id: `${e.L}-s4-extend`,
        prompt: `Mở rộng: có bao nhiêu ${e.doi} ứng với giá trị ${e.X(other)}?`,
        value: e.d.freqs[e.d.cats.indexOf(other)],
        hints: H(`Tìm ${e.X(other)}.`, 'Đọc tần số.', `Tần số là ${e.d.freqs[e.d.cats.indexOf(other)]}.`, 'Làm tương tự.'),
        successMsg: 'Tuyệt vời!',
      }),
    ],
    s4Diff: D.COUNT_MISMATCH,
    s4Hint: 'Tần số của một giá trị luôn nhỏ hơn hoặc bằng cỡ mẫu.',
  };
}

function planSampleSize(e: Env): KindPlan {
  const g = G(e);
  const sumVals = e.d.numeric ? e.d.nums.reduce((a, b) => a + b, 0) : NaN;
  const mx = Math.max(...e.d.freqs);
  const mxCats = e.d.cats.filter((_, i) => e.d.freqs[i] === mx);
  return {
    goal: `Tổng số ${e.doi} (cỡ mẫu N)`,
    goalWrongs: [g.k, g.max, g.vf()],
    s1Extra: [],
    s1Diff: D.N_VS_K,
    s1Hint: `Tổng số ${e.doi} chính là cỡ mẫu N.`,
    plan: [`Đọc tần số của từng giá trị trên ${e.src}.`, 'Cộng tất cả các tần số.', 'Trả lời câu hỏi.'],
    method: mcq({
      id: `${e.L}-s2-how`,
      prompt: 'Cỡ mẫu N được tính bằng cách nào?',
      correct: { text: 'Cộng tất cả các tần số', feedback: 'Chính xác! N = tổng các tần số.' },
      wrongs: [
        { text: 'Cộng tất cả các giá trị', feedback: 'Cộng giá trị không cho số đối tượng.' },
        { text: 'Đếm số giá trị khác nhau', feedback: 'Đó là k, không phải N.' },
        { text: 'Lấy tần số lớn nhất', feedback: 'Chưa đúng.' },
      ],
      hints: H('Mỗi tần số là số đối tượng ứng với một giá trị.', 'Gộp tất cả lại.', 'Cộng các tần số.', 'N = m₁ + m₂ + … + mₖ.'),
    }),
    s2Diff: D.N_VS_K,
    s2Hint: 'N = tổng các tần số.',
    s3: [
      numeric({
        id: `${e.L}-s3-answer`,
        prompt: e.s.question,
        value: e.d.N,
        hints: H('Cộng tất cả các tần số.', `Các tần số: ${e.d.freqs.join(', ')}.`, `Phép cộng: ${e.a.working}.`, e.a.sentence),
        successMsg: `Tuyệt vời! ${e.a.sentence}`,
        weight: 2,
        isFinalAnswer: true,
        commonErrors: [
          { value: e.d.cats.length, feedback: 'Đây là số giá trị khác nhau (số cột), không phải số đối tượng.' },
          ...(isFinite(sumVals) ? [{ value: sumVals, feedback: 'Em đã cộng các GIÁ TRỊ; cần cộng các TẦN SỐ.' }] : []),
          { value: mx, feedback: 'Đây chỉ là tần số lớn nhất.' },
        ],
      }),
    ],
    s3Diff: D.COUNT_MISMATCH,
    s3Hint: 'Cộng cẩn thận, không bỏ sót cột nào.',
    model: `Cỡ mẫu: ${e.a.working}.`,
    s4: [
      mcq({
        id: `${e.L}-s4-check`,
        prompt: 'Cách nào giúp kiểm tra lại phép cộng?',
        correct: { text: 'Cộng lại theo thứ tự khác (ghép cặp các số dễ cộng)', feedback: 'Chính xác!' },
        wrongs: [
          { text: 'Đếm số cột', feedback: 'Số cột là k, không kiểm tra được N.' },
          { text: 'Không cần kiểm tra', feedback: 'Pólya luôn khuyên kiểm tra lại.' },
        ],
        hints: H('Phép cộng có tính giao hoán.', 'Đổi thứ tự cộng.', 'Kết quả phải không đổi.', 'Cộng theo thứ tự khác để kiểm tra.'),
      }),
      numeric({
        id: `${e.L}-s4-extend`,
        prompt: `Mở rộng: có bao nhiêu ${e.doi} KHÔNG ứng với giá trị ${e.X(mxCats[0])}?`,
        value: e.d.N - e.d.freqs[e.d.cats.indexOf(mxCats[0])],
        hints: H('Lấy tổng số trừ đi số ứng với giá trị đó.', `N = ${e.d.N}.`, `${e.d.N} − ${e.d.freqs[e.d.cats.indexOf(mxCats[0])]}.`, 'Dùng cỡ mẫu để tính phần còn lại.'),
        successMsg: 'Tuyệt vời!',
      }),
    ],
    s4Diff: D.COUNT_MISMATCH,
    s4Hint: 'Luôn kiểm tra lại phép cộng các tần số.',
  };
}

function planMaxMin(e: Env): KindPlan {
  const isMax = e.s.askKind === 'max';
  const g = G(e);
  const ext = e.a.number!;
  const cats = e.a.categories!;
  const answerText = joinVi(cats.map(e.X));
  const sorted = [...new Set(e.d.freqs)].sort((a, b) => (isMax ? b - a : a - b));
  const second = sorted[1];
  const secondCats = e.d.cats.filter((_, i) => e.d.freqs[i] === second);
  const oppExt = isMax ? Math.min(...e.d.freqs) : Math.max(...e.d.freqs);
  const oppCats = e.d.cats.filter((_, i) => e.d.freqs[i] === oppExt);
  const wrongs: Choice[] = [];
  if (cats.length > 1) wrongs.push({ text: e.X(cats[0]), feedback: `Còn thiếu: ${answerText} cùng có tần số ${ext}.` });
  if (e.d.numeric) {
    const vExt = isMax ? Math.max(...e.d.nums) : Math.min(...e.d.nums);
    const vCat = e.d.cats[e.d.nums.indexOf(vExt)];
    if (!cats.includes(vCat)) wrongs.push({ text: e.X(vCat), feedback: `${e.X(vCat)} là giá trị ${isMax ? 'lớn' : 'nhỏ'} nhất, không phải giá trị xuất hiện ${isMax ? 'nhiều' : 'ít'} nhất.` });
  }
  if (secondCats.length) wrongs.push({ text: joinVi(secondCats.map(e.X)), feedback: `Chưa đúng: tần số ${second}, chưa phải ${isMax ? 'lớn' : 'nhỏ'} nhất.` });
  if (oppCats.length) wrongs.push({ text: joinVi(oppCats.map(e.X)), feedback: `Ngược rồi: đây là giá trị xuất hiện ${isMax ? 'ít' : 'nhiều'} nhất.` });
  e.d.cats.forEach((c, i) => wrongs.push({ text: e.X(c), feedback: `Chưa đúng: ${e.X(c)} có tần số ${e.d.freqs[i]}.` }));

  return {
    goal: isMax ? g.max.text : g.min.text,
    goalWrongs: [isMax ? g.min : g.max, g.vmax, g.N],
    s1Extra: [],
    s1Diff: D.CONFUSE_X_N,
    s1Hint: 'Đọc kỹ xem đề hỏi về giá trị hay về tần số (số lần xuất hiện).',
    plan: [
      `Đọc tần số của từng giá trị trên ${e.src}.`,
      `So sánh các tần số, tìm tần số ${isMax ? 'lớn' : 'nhỏ'} nhất.`,
      'Xác định (các) giá trị ứng với tần số đó.',
      'Trả lời câu hỏi, giải thích dựa vào tần số.',
    ],
    method: mcq({
      id: `${e.L}-s2-where`,
      prompt: `Trên ${e.src}, giá trị xuất hiện ${isMax ? 'nhiều' : 'ít'} nhất được nhận biết thế nào?`,
      correct: e.fromChart
        ? { text: `Giá trị ứng với cột (điểm) ${isMax ? 'cao' : 'thấp'} nhất`, feedback: 'Chính xác!' }
        : { text: `Giá trị ứng với số ${isMax ? 'lớn' : 'nhỏ'} nhất ở dòng tần số`, feedback: 'Chính xác!' },
      wrongs: [
        { text: `Giá trị nằm ngoài cùng bên ${isMax ? 'phải' : 'trái'}`, feedback: `Đó chỉ là giá trị ${isMax ? 'lớn' : 'nhỏ'} nhất.` },
        { text: 'Cột rộng nhất', feedback: 'Các cột có độ rộng bằng nhau.' },
      ],
      hints: H('Tần số được biểu diễn bằng gì?', e.fromChart ? 'Bằng chiều cao cột.' : 'Bằng dòng tần số.', `${isMax ? 'Lớn' : 'Nhỏ'} nhất ⇔ ${e.fromChart ? (isMax ? 'cao nhất' : 'thấp nhất') : (isMax ? 'số lớn nhất' : 'số nhỏ nhất')}.`, 'So sánh các tần số.'),
    }),
    s2Diff: D.READ_WRONG,
    s2Hint: 'So sánh TẦN SỐ, không so sánh giá trị.',
    s3: [
      mcq({
        id: `${e.L}-s3-answer`,
        prompt: e.s.question,
        correct: { text: answerText, feedback: 'Chính xác!' },
        wrongs,
        hints: H(`Tìm số ${isMax ? 'lớn' : 'nhỏ'} nhất ở dòng tần số.`, `Tần số ${isMax ? 'lớn' : 'nhỏ'} nhất là ${ext}.`, `Ứng với ${answerText}.`, e.a.sentence),
        successMsg: `Tuyệt vời! ${e.a.sentence}`,
        weight: 2,
        isFinalAnswer: true,
      }),
      numeric({
        id: `${e.L}-s3-freq`,
        prompt: `Tần số ${isMax ? 'lớn' : 'nhỏ'} nhất đó bằng bao nhiêu (để làm căn cứ giải thích)?`,
        value: ext,
        hints: H('Đọc tần số của giá trị em vừa chọn.', e.fromChart ? 'Gióng đỉnh cột sang trục đứng.' : 'Xem dòng tần số.', `Tần số bằng ${ext}.`, `${capitalize(answerText)} có tần số ${ext}.`),
      }),
    ],
    s3Diff: D.TIE,
    s3Hint: `Trình bày kèm căn cứ: ${answerText} có tần số ${ext}.`,
    model: `So sánh các tần số: ${e.d.cats.map((c, i) => `${e.X(c)} (${e.d.freqs[i]})`).join(', ')}.\n\nTần số ${isMax ? 'lớn' : 'nhỏ'} nhất là **${ext}**, ứng với **${answerText}**.`,
    s4: [
      numeric({
        id: `${e.L}-s4-N`,
        prompt: 'Kiểm tra: tổng các tần số bằng bao nhiêu?',
        value: e.d.N,
        hints: H('Cộng các tần số.', e.d.freqs.join(' + '), `= ${e.d.N}.`, `Tổng các tần số bằng ${e.d.N} – đây là cỡ mẫu.`),
      }),
      mcq({
        id: `${e.L}-s4-extend`,
        prompt: `Mở rộng: cũng từ ${e.src} này, giá trị nào xuất hiện ${isMax ? 'ít' : 'nhiều'} nhất?`,
        correct: { text: joinVi(oppCats.map(e.X)), feedback: `Chính xác! Tần số ${isMax ? 'nhỏ' : 'lớn'} nhất là ${oppExt}.` },
        wrongs: e.d.cats.map((c, i) => ({ text: e.X(c), feedback: `${e.X(c)} có tần số ${e.d.freqs[i]}.` })),
        hints: H(`Tìm số ${isMax ? 'nhỏ' : 'lớn'} nhất ở dòng tần số.`, `Đó là ${oppExt}.`, `Ứng với ${joinVi(oppCats.map(e.X))}.`, 'Làm tương tự.'),
        successMsg: 'Tuyệt vời! Em đã vận dụng cách làm cho một câu hỏi mới.',
      }),
    ],
    s4Diff: D.COUNT_MISMATCH,
    s4Hint: 'Gắn kết quả với thực tiễn: tần số cho biết điều gì về các đối tượng được khảo sát?',
  };
}

function planValuesByFreq(e: Env): KindPlan {
  const c = e.s.condition!;
  const phrase = origPhrase(e.s.question, c.phrase);
  const cats = e.a.categories || [];
  const isCount = e.s.answerStyle === 'count';
  const flip = { gte: 'gt', gt: 'gte', lte: 'lt', lt: 'lte' } as const;
  const v = c.op in flip ? { ...c, op: flip[c.op as keyof typeof flip] } : null;
  const comp = complement(c);
  const where = (cd: Condition) => e.d.cats.filter((_, i) => testCond(e.d.freqs[i], cd));
  const sym = `tần số ${condSymbol(c)}`;
  const goal = isCount ? `Số giá trị có số ${e.doi} ${condSymbol(c)}` : `Các giá trị có số ${e.doi} ${condSymbol(c)}`;
  const listQ = mcq({
    id: isCount ? `${e.L}-s3-list` : `${e.L}-s3-answer`,
    prompt: isCount ? `Những giá trị nào có ${sym}?` : e.s.question,
    correct: { text: nameList(e, cats), feedback: 'Chính xác!' },
    wrongs: [
      ...(v ? [{ text: nameList(e, where(v)), feedback: `Xem lại giá trị biên: tần số đúng bằng ${fmtNum(c.a)} có được lấy không?` }] : []),
      ...(comp ? [{ text: nameList(e, where(comp)), feedback: 'Đây là các giá trị KHÔNG thỏa điều kiện.' }] : []),
      ...(e.d.numeric ? [{ text: nameList(e, e.d.cats.filter((_, i) => testCond(e.d.nums[i], c))), feedback: 'Em đã so sánh GIÁ TRỊ với ngưỡng; cần so sánh TẦN SỐ.' }] : []),
    ],
    hints: H(`So sánh từng tần số với ${fmtNum(c.a)}.`, `Điều kiện: ${sym}.`, `Các giá trị thỏa: ${nameList(e, cats)}.`, e.a.working),
    weight: isCount ? 1 : 2,
    isFinalAnswer: !isCount,
    successMsg: isCount ? 'Chính xác!' : `Tuyệt vời! ${e.a.sentence}`,
  });
  const s3: Interaction[] = [listQ];
  if (isCount) {
    s3.push(
      numeric({
        id: `${e.L}-s3-answer`,
        prompt: e.s.question,
        value: cats.length,
        hints: H('Đếm các giá trị vừa chọn.', `Đó là: ${nameList(e, cats)}.`, `Có ${cats.length} giá trị.`, e.a.sentence),
        successMsg: `Tuyệt vời! ${e.a.sentence}`,
        weight: 2,
        isFinalAnswer: true,
        commonErrors: [{ value: cats.reduce((a, x) => a + e.d.freqs[e.d.cats.indexOf(x)], 0), feedback: 'Câu hỏi hỏi số GIÁ TRỊ (số cột), không hỏi số đối tượng.' }],
      })
    );
  }
  const nComp = comp ? where(comp).length : e.d.cats.length - cats.length;
  return {
    goal,
    goalWrongs: [
      { text: `Số ${e.doi} có giá trị ${condSymbol(c)}`, feedback: `Con số ${fmtNum(c.a)} đi với "${e.doi}" nên là ngưỡng của TẦN SỐ.` },
      G(e).max,
      G(e).N,
    ],
    s1Extra: [
      mcq({
        id: `${e.L}-s1-cond`,
        prompt: `Cụm "${phrase}" có nghĩa là:`,
        correct: { text: `Tần số ${condSymbol(c)}`, feedback: 'Chính xác! Đây là điều kiện về số lượng.' },
        wrongs: [
          { text: `Giá trị ${condSymbol(c)}`, feedback: 'Chưa đúng: con số đi với tên đối tượng nên là số lượng.' },
          ...(v ? [{ text: `Tần số ${condSymbol(v)}`, feedback: 'Xem lại giá trị biên.' }] : []),
        ],
        hints: H(`Con số ${fmtNum(c.a)} đi kèm từ nào?`, `Đi kèm "${e.doi}" hoặc "lần".`, 'Vậy đó là số lượng – tức tần số.', `"${phrase}" ⇔ tần số ${condSymbol(c)}.`),
      }),
    ],
    s1Diff: D.FREQ_COND,
    s1Hint: `Điều kiện đặt lên TẦN SỐ: ${sym}.`,
    plan: [`Đọc tần số của từng giá trị trên ${e.src}.`, `So sánh từng tần số với ${fmtNum(c.a)}.`, isCount ? 'Đếm số giá trị thỏa điều kiện.' : 'Liệt kê các giá trị thỏa điều kiện.', 'Trả lời câu hỏi.'],
    method: mcq({
      id: `${e.L}-s2-what`,
      prompt: `Con số ${fmtNum(c.a)} được so sánh với đại lượng nào?`,
      correct: { text: 'Tần số của từng giá trị', feedback: 'Chính xác!' },
      wrongs: [
        { text: 'Các giá trị', feedback: 'Chưa đúng.' },
        { text: 'Cỡ mẫu N', feedback: 'Chưa đúng, so sánh từng tần số.' },
      ],
      hints: H(`${fmtNum(c.a)} là số gì?`, `Là số ${e.doi}.`, 'Số đối tượng ứng với mỗi giá trị là tần số.', 'So sánh từng tần số với ngưỡng.'),
    }),
    s2Diff: D.BOUNDARY,
    s2Hint: `Xét lần lượt từng giá trị: tần số có ${condSymbol(c)} không?`,
    s3,
    s3Diff: D.READ_WRONG,
    s3Hint: e.a.working,
    model: `${e.a.working}`,
    s4: [
      numeric({
        id: `${e.L}-s4-other`,
        prompt: `Kiểm tra: có bao nhiêu giá trị KHÔNG thỏa điều kiện? (Cộng với số giá trị thỏa phải bằng số giá trị khác nhau k = ${e.d.cats.length}.)`,
        value: nComp,
        hints: H('Đếm các giá trị còn lại.', `k = ${e.d.cats.length}.`, `${e.d.cats.length} − ${cats.length} = ${nComp}.`, `${cats.length} + ${nComp} = ${e.d.cats.length}.`),
      }),
    ],
    s4Diff: D.READ_WRONG,
    s4Hint: 'Số giá trị thỏa + số giá trị không thỏa = k.',
  };
}

function planCompare(e: Env): KindPlan {
  const [A, Bc] = e.s.targets!;
  const fa = e.d.freqs[e.d.cats.indexOf(A)];
  const fb = e.d.freqs[e.d.cats.indexOf(Bc)];
  const mode = e.s.compareMode || 'diff';
  const g = G(e);
  const goal =
    mode === 'ratio'
      ? `Số ${e.doi} ứng với ${e.X(A)} gấp mấy lần số ${e.doi} ứng với ${e.X(Bc)}`
      : mode === 'which_more'
      ? `Trong ${e.X(A)} và ${e.X(Bc)}, giá trị nào có nhiều ${e.doi} hơn`
      : `Số ${e.doi} ứng với ${e.X(A)} và ${e.X(Bc)} chênh lệch nhau bao nhiêu`;
  const s3: Interaction[] = [
    numeric({ id: `${e.L}-s3-fa`, prompt: `Số ${e.doi} ứng với ${e.X(A)} là bao nhiêu?`, value: fa, hints: H(`Tìm ${e.X(A)}.`, 'Đọc tần số.', `${fa}.`, `Tần số của ${e.X(A)} là ${fa}.`) }),
    numeric({ id: `${e.L}-s3-fb`, prompt: `Số ${e.doi} ứng với ${e.X(Bc)} là bao nhiêu?`, value: fb, hints: H(`Tìm ${e.X(Bc)}.`, 'Đọc tần số.', `${fb}.`, `Tần số của ${e.X(Bc)} là ${fb}.`) }),
  ];
  if (mode === 'which_more') {
    s3.push(
      mcq({
        id: `${e.L}-s3-answer`,
        prompt: e.s.question,
        correct: { text: fa === fb ? 'Bằng nhau' : e.X(fa > fb ? A : Bc), feedback: 'Chính xác!' },
        wrongs: [
          { text: e.X(fa > fb ? Bc : A), feedback: `So sánh lại: ${fa} và ${fb}.` },
          ...(fa === fb ? [] : [{ text: 'Bằng nhau', feedback: `${fa} ≠ ${fb}.` }]),
        ],
        hints: H('So sánh hai tần số.', `${fa} và ${fb}.`, `Số lớn hơn là ${Math.max(fa, fb)}.`, e.a.sentence),
        weight: 2,
        isFinalAnswer: true,
        successMsg: `Tuyệt vời! ${e.a.sentence}`,
      })
    );
  } else {
    const v = e.a.number!;
    s3.push(
      numeric({
        id: `${e.L}-s3-answer`,
        prompt: e.s.question,
        value: v,
        tolerance: mode === 'ratio' ? 0.01 : 0,
        hints: H(mode === 'ratio' ? '"Gấp mấy lần" → phép chia.' : '"Hơn / kém bao nhiêu" → phép trừ.', `Hai tần số: ${fa} và ${fb}.`, `Phép tính: ${e.a.working}.`, e.a.sentence),
        successMsg: `Tuyệt vời! ${e.a.sentence}`,
        weight: 2,
        isFinalAnswer: true,
        commonErrors:
          mode === 'ratio'
            ? [{ value: Math.abs(fa - fb), feedback: 'Đây là hiệu; "gấp mấy lần" cần lấy thương.' }, { value: Math.round((fb / fa) * 100) / 100, feedback: 'Em đã chia ngược.' }]
            : [{ value: fa + fb, feedback: 'Không cộng hai tần số; "hơn bao nhiêu" là phép trừ.' }, ...(fb ? [{ value: Math.round((fa / fb) * 100) / 100, feedback: 'Đây là thương ("gấp mấy lần"), câu hỏi cần hiệu.' }] : [])],
      })
    );
  }
  const mx = Math.max(...e.d.freqs);
  const mn = Math.min(...e.d.freqs);
  return {
    goal,
    goalWrongs: [g.N, g.max, { text: `Tổng số ${e.doi} ứng với ${e.X(A)} và ${e.X(Bc)}`, feedback: 'Câu hỏi so sánh, không cộng.' }],
    s1Extra: [
      mcq({
        id: `${e.L}-s1-pair`,
        prompt: 'Hai giá trị cần so sánh là:',
        correct: { text: `${e.X(A)} và ${e.X(Bc)}`, feedback: 'Chính xác!' },
        wrongs: e.d.cats.filter((c) => c !== A && c !== Bc).slice(0, 2).map((c) => ({ text: `${e.X(A)} và ${e.X(c)}`, feedback: 'Đọc lại câu hỏi.' })),
        hints: H('Tìm các giá trị được nhắc trong câu hỏi.', `Có ${e.X(A)}.`, `Và ${e.X(Bc)}.`, `So sánh ${e.X(A)} với ${e.X(Bc)}.`),
      }),
    ],
    s1Diff: D.CONFUSE_X_N,
    s1Hint: 'So sánh TẦN SỐ của hai giá trị, không so sánh hai giá trị.',
    plan: [`Đọc tần số của ${e.X(A)}.`, `Đọc tần số của ${e.X(Bc)}.`, mode === 'ratio' ? 'Lấy thương hai tần số.' : mode === 'diff' ? 'Lấy hiệu hai tần số.' : 'So sánh hai tần số.', 'Trả lời câu hỏi.'],
    method: mcq({
      id: `${e.L}-s2-op`,
      prompt: 'Cần dùng phép tính nào?',
      correct: mode === 'ratio' ? { text: 'Phép chia (thương hai tần số)', feedback: 'Chính xác!' } : mode === 'diff' ? { text: 'Phép trừ (hiệu hai tần số)', feedback: 'Chính xác!' } : { text: 'So sánh hai tần số', feedback: 'Chính xác!' },
      wrongs: [
        { text: 'Phép cộng hai tần số', feedback: 'Câu hỏi so sánh, không gộp.' },
        ...(mode !== 'diff' ? [{ text: 'Phép trừ (hiệu hai tần số)', feedback: '"Hơn bao nhiêu" mới dùng phép trừ.' }] : []),
        ...(mode !== 'ratio' ? [{ text: 'Phép chia (thương hai tần số)', feedback: '"Gấp mấy lần" mới dùng phép chia.' }] : []),
      ],
      hints: H('Từ khóa của câu hỏi là gì?', mode === 'ratio' ? '"gấp mấy lần"' : mode === 'diff' ? '"hơn/kém bao nhiêu"' : '"nhiều hơn hay ít hơn"', mode === 'ratio' ? 'Phép chia.' : mode === 'diff' ? 'Phép trừ.' : 'So sánh.', 'Hơn bao nhiêu: hiệu; gấp mấy lần: thương.'),
    }),
    s2Diff: D.DIFF_RATIO,
    s2Hint: 'Hơn/kém bao nhiêu → trừ; gấp mấy lần → chia.',
    s3,
    s3Diff: D.READ_WRONG,
    s3Hint: e.a.working,
    model: `Tần số của ${e.X(A)} là ${fa}, của ${e.X(Bc)} là ${fb}.\n\n${mode === 'which_more' ? '' : `Phép tính: ${e.a.working}.`}`,
    s4: [
      mcq({
        id: `${e.L}-s4-check`,
        prompt: 'Kiểm tra lại kết quả bằng cách nào?',
        correct: mode === 'ratio' ? { text: `Nhân ngược: ${fb} × ${fmtNum(e.a.number ?? 0)} ≈ ${fa}`, feedback: 'Chính xác!' } : { text: `Cộng ngược: ${Math.min(fa, fb)} + ${Math.abs(fa - fb)} = ${Math.max(fa, fb)}`, feedback: 'Chính xác!' },
        wrongs: [
          { text: 'Không cần kiểm tra', feedback: 'Luôn nên kiểm tra.' },
          { text: `Cộng hai tần số: ${fa + fb}`, feedback: 'Phép cộng này không kiểm tra được kết quả.' },
        ],
        hints: H('Dùng phép tính ngược.', mode === 'ratio' ? 'Ngược của chia là nhân.' : 'Ngược của trừ là cộng.', 'Kết quả phải ra đúng tần số ban đầu.', 'Phép tính ngược giúp kiểm tra.'),
      }),
      numeric({
        id: `${e.L}-s4-extend`,
        prompt: `Mở rộng: tần số lớn nhất hơn tần số nhỏ nhất bao nhiêu?`,
        value: mx - mn,
        hints: H('Tìm tần số lớn nhất và nhỏ nhất.', `${mx} và ${mn}.`, `${mx} − ${mn}.`, `Kết quả ${mx - mn}.`),
        successMsg: 'Tuyệt vời!',
      }),
    ],
    s4Diff: D.COUNT_MISMATCH,
    s4Hint: 'Dùng phép tính ngược để kiểm tra.',
  };
}

function planCountSet(e: Env): KindPlan {
  const used = e.a.usedCategories!;
  const parts = used.map((c) => e.d.freqs[e.d.cats.indexOf(c)]);
  const S = e.a.number!;
  const g = G(e);
  return {
    goal: `Tổng số ${e.doi} ứng với các giá trị ${joinVi(used.map(e.X))}`,
    goalWrongs: [g.N, g.max, g.vf(used[0])],
    s1Extra: [
      mcq({
        id: `${e.L}-s1-set`,
        prompt: 'Các giá trị được nhắc trong câu hỏi là:',
        correct: { text: joinVi(used.map(e.X)), feedback: 'Chính xác!' },
        wrongs: [{ text: e.X(used[0]), feedback: 'Còn thiếu giá trị.' }, { text: joinVi(e.d.cats.map(e.X)), feedback: 'Không lấy tất cả các giá trị.' }],
        hints: H('Gạch chân các giá trị trong câu hỏi.', `Có ${e.X(used[0])}.`, `Và ${joinVi(used.slice(1).map(e.X))}.`, `Các giá trị: ${joinVi(used.map(e.X))}.`),
      }),
    ],
    s1Diff: D.CONFUSE_X_N,
    s1Hint: 'Xác định đủ các giá trị được nhắc.',
    plan: ['Xác định các giá trị được nhắc trong câu hỏi.', `Đọc tần số của từng giá trị trên ${e.src}.`, 'Cộng các tần số đó.', 'Trả lời câu hỏi.'],
    method: mcq({
      id: `${e.L}-s2-how`,
      prompt: `Để có số ${e.doi} cần tìm, em làm thế nào?`,
      correct: { text: 'Cộng tần số của các giá trị đó', feedback: 'Chính xác!' },
      wrongs: [{ text: 'Cộng các giá trị đó', feedback: 'Cộng giá trị không cho số đối tượng.' }, { text: 'Lấy tần số lớn nhất', feedback: 'Chưa đúng.' }],
      hints: H('Mỗi tần số là số đối tượng ứng với một giá trị.', 'Gộp các nhóm lại.', 'Cộng các tần số.', 'Tổng tần số của các giá trị trong nhóm.'),
    }),
    s2Diff: D.ADD_VALUES,
    s2Hint: 'Cộng TẦN SỐ, không cộng giá trị.',
    s3: [
      numeric({
        id: `${e.L}-s3-answer`,
        prompt: e.s.question,
        value: S,
        hints: H('Đọc tần số từng giá trị.', `Các tần số: ${parts.join(', ')}.`, `${e.a.working}.`, e.a.sentence),
        successMsg: `Tuyệt vời! ${e.a.sentence}`,
        weight: 2,
        isFinalAnswer: true,
        commonErrors: [
          { value: parts[0], feedback: 'Em mới lấy tần số của một giá trị.' },
          ...(e.d.numeric ? [{ value: used.reduce((a, c) => a + e.d.nums[e.d.cats.indexOf(c)], 0), feedback: 'Em đã cộng các GIÁ TRỊ.' }] : []),
        ],
      }),
    ],
    s3Diff: D.ADD_VALUES,
    s3Hint: e.a.working,
    model: `Số ${e.doi} cần tìm: ${e.a.working}.`,
    s4: [
      numeric({
        id: `${e.L}-s4-other`,
        prompt: `Kiểm tra: có bao nhiêu ${e.doi} ứng với các giá trị còn lại? (Cộng với đáp số phải bằng N = ${e.d.N}.)`,
        value: e.d.N - S,
        hints: H('Cộng tần số các giá trị còn lại.', `Hoặc N − ${S}.`, `${e.d.N} − ${S} = ${e.d.N - S}.`, `${S} + ${e.d.N - S} = ${e.d.N}.`),
      }),
    ],
    s4Diff: D.COUNT_MISMATCH,
    s4Hint: 'Phần đã tính + phần còn lại = N.',
  };
}

function planDistinct(e: Env): KindPlan {
  const g = G(e);
  const k = e.d.cats.length;
  return {
    goal: 'Số giá trị khác nhau (k)',
    goalWrongs: [g.N, g.max, g.vmax],
    s1Extra: [],
    s1Diff: D.N_VS_K,
    s1Hint: 'Mỗi giá trị chỉ đếm một lần dù xuất hiện nhiều lần.',
    plan: [e.needTable ? 'Liệt kê các giá trị, mỗi giá trị ghi một lần.' : `Đọc các giá trị trên ${e.src}.`, 'Đếm các giá trị đã liệt kê.', 'Trả lời câu hỏi.'],
    method: mcq({
      id: `${e.L}-s2-how`,
      prompt: 'Số giá trị khác nhau bằng:',
      correct: { text: 'Số cột (ô giá trị) của bảng tần số', feedback: 'Chính xác!' },
      wrongs: [{ text: 'Tổng các tần số', feedback: 'Đó là cỡ mẫu N.' }, { text: 'Tần số lớn nhất', feedback: 'Chưa đúng.' }],
      hints: H('Trong bảng tần số, mỗi giá trị ghi mấy lần?', 'Một lần.', 'Đếm số ô ở dòng giá trị.', 'k = số cột của bảng tần số.'),
    }),
    s2Diff: D.N_VS_K,
    s2Hint: 'k ≠ N.',
    s3: [
      numeric({
        id: `${e.L}-s3-answer`,
        prompt: e.s.question,
        value: k,
        hints: H('Liệt kê các giá trị.', `Các giá trị: ${joinVi(e.d.cats.map(e.X))}.`, `Có ${k} giá trị.`, e.a.sentence),
        successMsg: `Tuyệt vời! ${e.a.sentence}`,
        weight: 2,
        isFinalAnswer: true,
        commonErrors: [{ value: e.d.N, feedback: 'Đó là cỡ mẫu N (tổng số số liệu).' }],
      }),
    ],
    s3Diff: D.COUNT_MISMATCH,
    s3Hint: e.a.working,
    model: e.a.working,
    s4: [
      numeric({
        id: `${e.L}-s4-N`,
        prompt: 'Phân biệt: cỡ mẫu N của mẫu dữ liệu này bằng bao nhiêu?',
        value: e.d.N,
        hints: H('Cộng các tần số.', e.d.freqs.join(' + '), `= ${e.d.N}.`, `N = ${e.d.N}, còn k = ${k}.`),
        successMsg: `Đúng! N = ${e.d.N} khác k = ${k}.`,
      }),
    ],
    s4Diff: D.N_VS_K,
    s4Hint: `k = ${k}; N = ${e.d.N}.`,
  };
}

function planListValues(e: Env): KindPlan {
  const g = G(e);
  const all = joinVi(e.d.cats.map(e.X));
  const wrongs: Choice[] = [{ text: joinVi(e.d.cats.slice(0, -1).map(e.X)), feedback: 'Còn thiếu giá trị.' }];
  if (e.d.numeric) wrongs.push({ text: joinVi(e.d.freqs.map(String)), feedback: 'Đây là các tần số, không phải giá trị.' });
  return {
    goal: `Các giá trị của ${e.dau}`,
    goalWrongs: [g.N, g.max, g.k],
    s1Extra: [],
    s1Diff: D.CONFUSE_X_N,
    s1Hint: 'Giá trị nằm ở trục ngang / dòng giá trị.',
    plan: [`Đọc trục ngang (dòng giá trị) của ${e.src}.`, 'Ghi mỗi giá trị một lần.', 'Trả lời câu hỏi.'],
    method: mcq({
      id: `${e.L}-s2-where`,
      prompt: `Các giá trị được đọc ở đâu trên ${e.src}?`,
      correct: { text: e.fromChart ? 'Trục ngang' : 'Dòng giá trị', feedback: 'Chính xác!' },
      wrongs: [{ text: e.fromChart ? 'Trục đứng' : 'Dòng tần số', feedback: 'Đó là tần số.' }],
      hints: H('Trục/dòng nào ghi dữ liệu thu được?', e.fromChart ? 'Trục ngang.' : 'Dòng đầu.', 'Đọc lần lượt.', 'Giá trị ở trục ngang, tần số ở trục đứng.'),
    }),
    s2Diff: D.READ_WRONG,
    s2Hint: 'Đọc dòng giá trị, không đọc dòng tần số.',
    s3: [
      mcq({
        id: `${e.L}-s3-answer`,
        prompt: e.s.question,
        correct: { text: all, feedback: 'Chính xác!' },
        wrongs,
        hints: H('Đọc lần lượt từ trái sang phải.', `Bắt đầu: ${e.X(e.d.cats[0])}.`, `Đủ ${e.d.cats.length} giá trị.`, e.a.sentence),
        weight: 2,
        isFinalAnswer: true,
        successMsg: `Tuyệt vời! ${e.a.sentence}`,
      }),
    ],
    s3Diff: D.CONFUSE_X_N,
    s3Hint: e.a.working,
    model: e.a.working,
    s4: [
      numeric({
        id: `${e.L}-s4-k`,
        prompt: 'Kiểm tra: có bao nhiêu giá trị khác nhau?',
        value: e.d.cats.length,
        hints: H('Đếm các giá trị vừa liệt kê.', all, `${e.d.cats.length}.`, `k = ${e.d.cats.length}.`),
      }),
    ],
    s4Diff: D.N_VS_K,
    s4Hint: 'Số giá trị khác nhau khác cỡ mẫu.',
  };
}

function planValueExtreme(e: Env): KindPlan {
  const isMax = e.s.askKind === 'value_max';
  const v = e.a.number!;
  const g = G(e);
  const mf = Math.max(...e.d.freqs);
  const mfCat = e.d.cats[e.d.freqs.indexOf(mf)];
  const opp = isMax ? Math.min(...e.d.nums) : Math.max(...e.d.nums);
  return {
    goal: `Giá trị ${isMax ? 'lớn' : 'nhỏ'} nhất của ${e.dau}`,
    goalWrongs: [g.max, g.min, g.N],
    s1Extra: [],
    s1Diff: D.VALUE_EXTREME,
    s1Hint: 'Câu hỏi về độ lớn của giá trị, không phải tần số.',
    plan: [`Đọc các giá trị trên ${e.src}.`, `So sánh độ lớn các giá trị.`, `Chọn giá trị ${isMax ? 'lớn' : 'nhỏ'} nhất.`, 'Trả lời câu hỏi.'],
    method: mcq({
      id: `${e.L}-s2-what`,
      prompt: 'Em cần so sánh đại lượng nào?',
      correct: { text: 'Độ lớn của các giá trị', feedback: 'Chính xác!' },
      wrongs: [{ text: 'Các tần số', feedback: 'So sánh tần số là để tìm giá trị xuất hiện nhiều/ít nhất.' }],
      hints: H('"Lâu nhất / cao nhất" nói về cái gì?', 'Về giá trị.', 'So sánh các giá trị.', 'Xét dòng giá trị.'),
    }),
    s2Diff: D.VALUE_EXTREME,
    s2Hint: 'Xét dòng giá trị.',
    s3: [
      numeric({
        id: `${e.L}-s3-answer`,
        prompt: e.s.question,
        value: v,
        unit: e.u,
        hints: H('Nhìn dòng giá trị.', `Các giá trị: ${joinVi(e.d.cats)}.`, `${isMax ? 'Lớn' : 'Nhỏ'} nhất là ${fmtNum(v)}.`, e.a.sentence),
        successMsg: `Tuyệt vời! ${e.a.sentence}`,
        weight: 2,
        isFinalAnswer: true,
        commonErrors: [
          { value: e.d.nums[e.d.cats.indexOf(mfCat)], feedback: 'Đây là giá trị xuất hiện nhiều nhất, không phải giá trị lớn nhất.' },
          { value: mf, feedback: 'Đây là một tần số.' },
        ],
      }),
    ],
    s3Diff: D.VALUE_EXTREME,
    s3Hint: e.a.working,
    model: e.a.working,
    s4: [
      numeric({
        id: `${e.L}-s4-extend`,
        prompt: `Mở rộng: giá trị ${isMax ? 'nhỏ' : 'lớn'} nhất là bao nhiêu?`,
        value: opp,
        hints: H('Làm tương tự.', `Các giá trị: ${joinVi(e.d.cats)}.`, `${fmtNum(opp)}.`, `Giá trị ${isMax ? 'nhỏ' : 'lớn'} nhất là ${fmtNum(opp)}.`),
        successMsg: 'Tuyệt vời!',
      }),
    ],
    s4Diff: D.CONFUSE_X_N,
    s4Hint: 'Phân biệt "giá trị lớn nhất" với "giá trị xuất hiện nhiều nhất".',
  };
}

function planSumValues(e: Env): KindPlan {
  const S = e.a.number!;
  const prods = e.d.cats.map((_, i) => e.d.nums[i] * e.d.freqs[i]);
  const g = G(e);
  const i0 = e.d.freqs.findIndex((f, i) => f > 1 && e.d.nums[i] > 1);
  const ex = i0 >= 0 ? i0 : 0;
  return {
    goal: `Tổng số ${e.u} của tất cả các ${e.doi} (cộng mọi số liệu)`,
    goalWrongs: [{ ...g.N, feedback: `Chưa đúng: câu hỏi hỏi tổng số ${e.u}, không hỏi số ${e.doi}.` }, g.max, g.vmax],
    s1Extra: [
      mcq({
        id: `${e.L}-s1-contrib`,
        prompt: `Giá trị ${e.X(e.d.cats[ex])} xuất hiện ${e.d.freqs[ex]} lần. Phần đóng góp của nó vào tổng là:`,
        correct: { text: `${e.d.cats[ex]} · ${e.d.freqs[ex]} = ${fmtNum(prods[ex])}`, feedback: 'Chính xác!' },
        wrongs: [
          { text: `${e.d.cats[ex]} + ${e.d.freqs[ex]} = ${fmtNum(e.d.nums[ex] + e.d.freqs[ex])}`, feedback: 'Không cộng giá trị với tần số.' },
          { text: e.d.cats[ex], feedback: 'Giá trị này xuất hiện nhiều lần.' },
        ],
        hints: H(`${e.d.cats[ex]} được lặp lại mấy lần?`, `${e.d.freqs[ex]} lần.`, 'Phép nhân.', 'Đóng góp = giá trị × tần số.'),
      }),
    ],
    s1Diff: D.FORGET_MULTIPLY,
    s1Hint: 'Mỗi giá trị lặp lại đúng bằng tần số của nó.',
    plan: ['Nhân mỗi giá trị với tần số của nó.', 'Cộng các tích lại.', 'Trả lời câu hỏi.'],
    method: mcq({
      id: `${e.L}-s2-formula`,
      prompt: 'Công thức tính tổng các số liệu là:',
      correct: { text: 'x₁·m₁ + x₂·m₂ + … + xₖ·mₖ', feedback: 'Chính xác!' },
      wrongs: [{ text: 'x₁ + x₂ + … + xₖ', feedback: 'Thiếu nhân với tần số.' }, { text: 'm₁ + m₂ + … + mₖ', feedback: 'Đó là cỡ mẫu N.' }],
      hints: H('Mỗi giá trị lặp lại bao nhiêu lần?', 'Đúng bằng tần số.', 'Nhân rồi cộng.', 'Tổng = Σ xᵢ·mᵢ.'),
    }),
    s2Diff: D.FORGET_MULTIPLY,
    s2Hint: 'Tổng = Σ (giá trị × tần số).',
    s3: [
      tableFill({
        id: `${e.L}-s3-products`,
        prompt: 'Điền tích "giá trị × tần số" cho từng giá trị:',
        headers: [e.t.valueLabel || capitalize(e.dau), 'Tần số', 'Giá trị × Tần số'],
        rows: e.d.cats.map((c, i) => ({ cells: [c, String(e.d.freqs[i]), { expect: prods[i] }] })),
        hints: H('Nhân hai số trên cùng một hàng.', `VD: ${e.d.cats[ex]} · ${e.d.freqs[ex]} = ${fmtNum(prods[ex])}.`, 'Kiểm tra từng ô bị tô đỏ.', `Các tích: ${prods.map(fmtNum).join(', ')}.`),
      }),
      numeric({
        id: `${e.L}-s3-answer`,
        prompt: e.s.question,
        value: S,
        hints: H('Cộng các tích vừa điền.', prods.map(fmtNum).join(' + '), `= ${fmtNum(S)}.`, e.a.sentence),
        successMsg: `Tuyệt vời! ${e.a.sentence}`,
        weight: 2,
        isFinalAnswer: true,
        commonErrors: [
          { value: e.d.nums.reduce((a, b) => a + b, 0), feedback: 'Em mới cộng các giá trị, chưa nhân với tần số.' },
          { value: e.d.N, feedback: `Đây là số ${e.doi} (cỡ mẫu), không phải tổng ${e.u}.` },
        ],
      }),
    ],
    s3Diff: D.FORGET_MULTIPLY,
    s3Hint: e.a.working,
    model: `Tổng = ${e.a.working}.`,
    s4: [
      numeric({
        id: `${e.L}-s4-N`,
        prompt: `Phân biệt: có tất cả bao nhiêu ${e.doi}?`,
        value: e.d.N,
        hints: H('Cộng các tần số.', e.d.freqs.join(' + '), `= ${e.d.N}.`, `N = ${e.d.N} (số ${e.doi}), khác tổng ${e.u} = ${fmtNum(S)}.`),
      }),
    ],
    s4Diff: D.N_VS_K,
    s4Hint: `Tổng ${e.u} khác số ${e.doi}.`,
  };
}

function planRemark(e: Env): KindPlan {
  const mx = Math.max(...e.d.freqs);
  const mn = Math.min(...e.d.freqs);
  const mxC = e.d.cats.filter((_, i) => e.d.freqs[i] === mx);
  const mnC = e.d.cats.filter((_, i) => e.d.freqs[i] === mn);
  const g = G(e);
  const truth = `${capitalize(joinVi(mxC.map(e.X)))} có nhiều ${e.doi} nhất (${mx}/${e.d.N}); ${joinVi(mnC.map(e.X))} có ít nhất (${mn}).`;
  return {
    goal: `Nhận xét về ${e.dau} dựa vào các tần số`,
    goalWrongs: [g.N, g.k],
    s1Extra: [],
    s1Diff: D.CONFUSE_X_N,
    s1Hint: 'Nhận xét phải dựa vào số liệu: tần số lớn nhất, nhỏ nhất, cỡ mẫu.',
    plan: ['Tính cỡ mẫu N.', 'Tìm giá trị có tần số lớn nhất và nhỏ nhất.', 'So sánh các tần số với nhau và với N.', 'Nêu nhận xét có số liệu làm căn cứ.'],
    method: mcq({
      id: `${e.L}-s2-basis`,
      prompt: 'Một nhận xét tốt cần:',
      correct: { text: 'Có số liệu từ bảng/biểu đồ làm căn cứ', feedback: 'Chính xác!' },
      wrongs: [{ text: 'Chỉ nêu cảm nghĩ', feedback: 'Nhận xét thống kê phải dựa vào số liệu.' }],
      hints: H('Căn cứ ở đâu?', 'Ở tần số.', 'Nêu kèm số.', 'Nhận xét dựa trên số liệu.'),
    }),
    s2Diff: D.READ_WRONG,
    s2Hint: 'Nêu số liệu cụ thể.',
    s3: [
      mcq({
        id: `${e.L}-s3-answer`,
        prompt: 'Nhận xét nào sau đây đúng?',
        correct: { text: truth, feedback: 'Chính xác! Nhận xét có số liệu làm căn cứ.' },
        wrongs: [
          { text: `${capitalize(joinVi(mnC.map(e.X)))} có nhiều ${e.doi} nhất.`, feedback: 'Ngược rồi.' },
          { text: `Các giá trị có số ${e.doi} bằng nhau.`, feedback: 'Các tần số khác nhau.' },
          { text: `Có tất cả ${e.d.cats.length} ${e.doi}.`, feedback: `${e.d.cats.length} là số giá trị khác nhau, N = ${e.d.N}.` },
        ],
        hints: H('Tìm tần số lớn nhất, nhỏ nhất.', `Lớn nhất ${mx}, nhỏ nhất ${mn}.`, `N = ${e.d.N}.`, truth),
        weight: 2,
        isFinalAnswer: true,
        successMsg: 'Tuyệt vời!',
      }),
    ],
    s3Diff: D.TIE,
    s3Hint: truth,
    model: e.a.sentence,
    s4: [
      numeric({
        id: `${e.L}-s4-N`,
        prompt: 'Kiểm tra số liệu: cỡ mẫu N bằng bao nhiêu?',
        value: e.d.N,
        hints: H('Cộng các tần số.', e.d.freqs.join(' + '), `= ${e.d.N}.`, `N = ${e.d.N}.`),
      }),
    ],
    s4Diff: D.COUNT_MISMATCH,
    s4Hint: 'Gắn nhận xét với ý nghĩa thực tiễn.',
  };
}

function planMissing(e: Env): KindPlan {
  const mi = e.d.missing[0];
  const cat = e.d.cats[mi];
  const N = e.t.statedSampleSize;
  const known = e.d.freqs.filter((_, i) => i !== mi);
  const sk = known.reduce((a, b) => a + b, 0);
  const x = N - sk;
  const g = G(e);
  return {
    goal: `Tần số còn thiếu của giá trị ${e.X(cat)}`,
    goalWrongs: [g.N, g.max, g.k],
    s1Extra: [
      numeric({
        id: `${e.L}-s1-N`,
        prompt: 'Đề cho cỡ mẫu N bằng bao nhiêu?',
        value: N,
        hints: H('Tìm trong đề số đối tượng được khảo sát.', 'Đó là cỡ mẫu.', `N = ${N}.`, `N = ${N}.`),
      }),
    ],
    s1Diff: D.MISSING_N,
    s1Hint: 'Biết N và các tần số còn lại thì tìm được tần số thiếu.',
    plan: ['Cộng các tần số đã biết.', 'Lấy N trừ đi tổng đó.', 'Kiểm tra: tổng tất cả các tần số bằng N.'],
    method: mcq({
      id: `${e.L}-s2-eq`,
      prompt: 'Đẳng thức nào dùng để tìm tần số còn thiếu (gọi là x)?',
      correct: { text: `${known.join(' + ')} + x = ${N}`, feedback: 'Chính xác! Tổng các tần số bằng N.' },
      wrongs: [{ text: `x = ${known.join(' + ')}`, feedback: 'x không bằng tổng các tần số khác.' }, { text: `x = ${N}`, feedback: 'Đó là cỡ mẫu.' }],
      hints: H('Tổng tất cả các tần số bằng gì?', 'Bằng N.', 'Viết tổng có chứa x.', 'm₁ + … + x + … = N.'),
    }),
    s2Diff: D.MISSING_N,
    s2Hint: 'x = N − (tổng các tần số đã biết).',
    s3: [
      numeric({
        id: `${e.L}-s3-known`,
        prompt: 'Tổng các tần số đã biết bằng bao nhiêu?',
        value: sk,
        hints: H('Cộng các tần số đã biết.', known.join(' + '), `= ${sk}.`, `Tổng đã biết = ${sk}.`),
      }),
      numeric({
        id: `${e.L}-s3-answer`,
        prompt: e.s.question || `Tìm tần số của giá trị ${e.X(cat)}.`,
        value: x,
        hints: H('Lấy N trừ tổng vừa tính.', `${N} − ${sk}.`, `= ${x}.`, e.a.sentence),
        successMsg: `Tuyệt vời! ${e.a.sentence}`,
        weight: 2,
        isFinalAnswer: true,
        commonErrors: [{ value: sk, feedback: 'Đây là tổng các tần số đã biết.' }, { value: N, feedback: 'Đây là cỡ mẫu.' }],
      }),
    ],
    s3Diff: D.COUNT_MISMATCH,
    s3Hint: e.a.working,
    model: `Ta có ${known.join(' + ')} + x = ${N}.\n\nx = ${e.a.working}.`,
    s4: [
      numeric({
        id: `${e.L}-s4-total`,
        prompt: `Kiểm tra: thay x = ${x}, tổng các tần số bằng bao nhiêu?`,
        value: N,
        hints: H('Cộng lại tất cả.', `${sk} + ${x}.`, `= ${N}.`, `Đúng bằng N = ${N}.`),
        successMsg: `Đúng! Tổng bằng N = ${N}, đáp số được kiểm tra.`,
      }),
    ],
    s4Diff: D.COUNT_MISMATCH,
    s4Hint: 'Tần số tìm được phải là số tự nhiên và tổng phải bằng N.',
  };
}

function planCorrection(e: Env): KindPlan {
  const cl = e.t.claimedFrequencies || [];
  const who = e.t.claimedBy ? `bạn ${e.t.claimedBy}` : 'bạn';
  const wrong = e.a.categories || [];
  const claimedSum = cl.reduce<number>((a, b) => a + (b ?? 0), 0);
  const correctText = wrong.length ? joinVi(wrong.map(e.X)) : 'Không sai ô nào';
  return {
    goal: `Kiểm tra bảng tần số của ${who}: đúng hay sai, sai ở đâu và sửa lại`,
    goalWrongs: [G(e).N, G(e).max],
    s1Extra: [],
    s1Diff: D.CHECK_TABLE,
    s1Hint: 'Phải đếm lại từ dữ liệu gốc rồi đối chiếu từng ô.',
    plan: ['Đếm lại tần số của từng giá trị từ dữ liệu gốc.', `Đối chiếu từng ô với bảng của ${who}.`, 'Chỉ ra ô sai và sửa lại.', 'Kiểm tra tổng các tần số bằng N.'],
    method: mcq({
      id: `${e.L}-s2-how`,
      prompt: 'Cách kiểm tra nào chắc chắn nhất?',
      correct: { text: 'Đếm lại từng giá trị từ dữ liệu gốc và so sánh từng ô', feedback: 'Chính xác!' },
      wrongs: [{ text: 'Chỉ kiểm tra tổng các tần số', feedback: 'Chưa đủ: sai số có thể bù trừ.' }, { text: 'Nhìn bảng thấy hợp lý là được', feedback: 'Cần có căn cứ.' }],
      hints: H('Tổng đúng đã chắc bảng đúng chưa?', 'Chưa chắc.', 'Phải so từng ô.', 'Đếm lại và đối chiếu từng ô.'),
    }),
    s2Diff: D.CHECK_TABLE,
    s2Hint: 'Đối chiếu từng ô.',
    s3: [
      freqTableTask(e, `${e.L}-s3-table`, 'Đếm lại từ dữ liệu gốc và điền bảng tần số đúng:'),
      mcq({
        id: `${e.L}-s3-answer`,
        prompt: `Bảng của ${who} sai ở giá trị nào?`,
        correct: { text: correctText, feedback: 'Chính xác!' },
        wrongs: [
          ...(wrong.length ? [{ text: 'Không sai ô nào', feedback: 'Có ô chưa khớp, em đối chiếu lại.' }] : []),
          ...e.d.cats.filter((c) => !wrong.includes(c)).slice(0, 2).map((c) => ({ text: e.X(c), feedback: `Ô ${e.X(c)} của ${who} đúng.` })),
        ],
        hints: H('So từng cột của hai bảng.', 'Tìm cột có hai số khác nhau.', `Khác nhau ở: ${correctText}.`, e.a.working),
        weight: 2,
        isFinalAnswer: true,
        successMsg: `Tuyệt vời! ${e.a.sentence}`,
      }),
    ],
    s3Diff: D.COUNT_MISMATCH,
    s3Hint: e.a.working,
    model: `Bảng tần số đúng:\n\n${freqTableMarkdown(e)}\n\n${e.a.working}.`,
    s4: [
      numeric({
        id: `${e.L}-s4-claimed`,
        prompt: `Tổng các tần số trong bảng của ${who} bằng bao nhiêu? So với N = ${e.d.N} thì sao?`,
        value: claimedSum,
        hints: H(`Cộng dòng tần số của ${who}.`, cl.map((x) => x ?? 0).join(' + '), `= ${claimedSum}.`, claimedSum === e.d.N ? 'Tổng vẫn bằng N dù có ô sai – sai số đã bù trừ nhau.' : `Tổng khác N = ${e.d.N}, đó là dấu hiệu bảng sai.`),
      }),
    ],
    s4Diff: D.CHECK_TABLE,
    s4Hint: 'Tổng đúng là điều kiện cần, chưa đủ.',
  };
}

// ───────────────────────── Lắp 4 bước ─────────────────────────

export function buildSteps(label: string, s: QuestionSpec, a: Answer, t: FreqTable, hooks: TemplateHooks = {}): PolyaStep[] {
  const e = makeEnv(label, s, a, t, hooks);
  const k = s.dang === 'TS5' ? 'missing' : s.dang === 'TS6' ? 'correction' : s.askKind;
  const p: KindPlan =
    k === 'count_condition' ? planCountCondition(e)
    : k === 'value_freq' ? planValueFreq(e)
    : k === 'sample_size' ? planSampleSize(e)
    : k === 'max' || k === 'min' ? planMaxMin(e)
    : k === 'values_by_freq' ? planValuesByFreq(e)
    : k === 'compare' ? planCompare(e)
    : k === 'count_set' ? planCountSet(e)
    : k === 'distinct_count' ? planDistinct(e)
    : k === 'list_values' ? planListValues(e)
    : k === 'value_max' || k === 'value_min' ? planValueExtreme(e)
    : k === 'sum_values' ? planSumValues(e)
    : k === 'remark' ? planRemark(e)
    : k === 'missing' ? planMissing(e)
    : k === 'correction' ? planCorrection(e)
    : (() => { throw new Error(`Chưa có khuôn cho ${k}`); })();

  const L = label;
  const tableFirst = e.needTable && s.dang !== 'TS6';
  const plan = tableFirst ? ['Lập bảng tần số từ dữ liệu.', ...p.plan] : p.plan;
  const s3Tasks = tableFirst ? [freqTableTask(e, `${L}-s3-table`, 'Trước hết, em hãy lập bảng tần số:'), ...p.s3] : p.s3;
  const modelHead = tableFirst ? `Bảng tần số:\n\n${freqTableMarkdown(e)}\n\n` : '';

  return [
    {
      stepNo: 1,
      title: 'Bước 1: Tìm hiểu nội dung bài toán',
      intro: e.fromChart ? 'Quan sát biểu đồ và đọc kỹ câu hỏi để biết đề cho gì, hỏi gì.' : 'Đọc kỹ đề và câu hỏi để biết đề cho gì, hỏi gì.',
      mainTasks: [dataTask(e), givenTask(e), goalTask(e, p.goal, p.goalWrongs), ...p.s1Extra],
      difficulties: [p.s1Diff.item],
      reflectionPrompt: REFLECTION_PROMPT,
      preHintQuiz: p.s1Diff.quiz(e.dctx, `${L}-s1`),
      hintCard: p.s1Hint,
      ...(hooks.sourceChart ? { referenceChart: hooks.sourceChart } : {}),
    },
    {
      stepNo: 2,
      title: 'Bước 2: Xây dựng chương trình giải',
      intro: 'Lập kế hoạch: cần làm những bước nào, theo thứ tự nào.',
      mainTasks: [
        ordering({
          id: `${L}-s2-plan`,
          prompt: 'Sắp xếp các bước giải theo đúng thứ tự:',
          steps: plan,
          hints: H('Bước nào phải làm trước mới làm được bước sau?', `Bắt đầu: ${plan[0].toLowerCase()}`, `Kết thúc: ${plan[plan.length - 1].toLowerCase()}`, plan.join(' → ')),
        }),
        p.method,
      ],
      difficulties: [p.s2Diff.item],
      reflectionPrompt: REFLECTION_PROMPT,
      preHintQuiz: p.s2Diff.quiz(e.dctx, `${L}-s2`),
      hintCard: p.s2Hint,
    },
    {
      stepNo: 3,
      title: 'Bước 3: Trình bày lời giải',
      intro: 'Thực hiện kế hoạch và trình bày lời giải có căn cứ.',
      mainTasks: s3Tasks,
      difficulties: [p.s3Diff.item],
      reflectionPrompt: REFLECTION_PROMPT,
      preHintQuiz: p.s3Diff.quiz(e.dctx, `${L}-s3`),
      hintCard: p.s3Hint,
      modelSolution: `### Lời giải\n\n${modelHead}${p.model}\n\n**Trả lời:** ${a.sentence}`,
      ...(hooks.sourceChart ? { referenceChart: hooks.sourceChart } : {}),
    },
    {
      stepNo: 4,
      title: 'Bước 4: Kiểm tra và nghiên cứu lời giải',
      intro: 'Kiểm tra lại kết quả bằng cách khác và mở rộng bài toán.',
      mainTasks: p.s4,
      difficulties: [p.s4Diff.item],
      reflectionPrompt: REFLECTION_PROMPT,
      preHintQuiz: p.s4Diff.quiz(e.dctx, `${L}-s4`),
      hintCard: p.s4Hint,
    },
  ];
}

export const __test = { freqTableMarkdown };
// tránh cảnh báo biến không dùng khi biên dịch độc lập
void numberDistractors;

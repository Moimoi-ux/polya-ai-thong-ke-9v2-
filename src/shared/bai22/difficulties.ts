/**
 * NGÂN HÀNG KHÓ KHĂN DỰ ĐOÁN (sai lầm thường gặp) + câu hỏi gợi mở trước khi xem gợi ý.
 * Mỗi khó khăn gắn với một bước của quy trình, câu hỏi dùng số liệu của chính bài toán.
 */
import type { DifficultyItem, McqInteraction } from './types.ts';
import { mcq } from './builders.ts';
import { fmtNum } from './textVi.ts';

export interface DCtx {
  doi: string; // đối tượng, VD "y tá"
  unit: string; // đơn vị giá trị, VD "năm"
  N: number;
  k: number; // số giá trị khác nhau
  fromChart: boolean;
  /** ngưỡng của điều kiện (nếu có) để câu hỏi gợi mở dùng đúng số của đề */
  threshold?: number;
}

export interface Difficulty {
  item: DifficultyItem;
  quiz: (c: DCtx, id: string) => McqInteraction;
}

const u = (c: DCtx) => (c.unit ? ` ${c.unit}` : '');

export const D: Record<string, Difficulty> = {
  CONFUSE_X_N: {
    item: {
      id: 'diff-confuse-x-n',
      title: 'Nhầm lẫn giữa giá trị và tần số',
      detail: 'Giá trị $x_i$ là dữ liệu thu được, còn tần số $m_i$ là số lần giá trị đó xuất hiện. Giá trị "lớn nhất" không có nghĩa là tần số lớn nhất.',
    },
    quiz: (c, id) =>
      mcq({
        id: `prehint-xn-${id}`,
        prompt: 'Khi nói một giá trị "xuất hiện nhiều lần nhất" trong mẫu dữ liệu, điều đó có nghĩa là:',
        correct: { text: 'Giá trị đó có tần số lớn nhất.', feedback: 'Chính xác! Tần số cho biết số lần xuất hiện của giá trị.' },
        wrongs: [
          { text: 'Giá trị đó là giá trị lớn nhất trong mẫu.', feedback: 'Sai rồi! Một giá trị nhỏ vẫn có thể xuất hiện nhiều lần nhất.' },
          { text: 'Giá trị đó bằng cỡ mẫu N.', feedback: 'Không đúng, cỡ mẫu là tổng các tần số.' },
        ],
        hints: {
          level1: 'Nhớ lại: tần số của một giá trị là gì?',
          level2: 'Tần số là số lần xuất hiện của giá trị trong mẫu dữ liệu.',
          level3: 'Xuất hiện nhiều lần nhất ⇔ tần số lớn nhất.',
          fullExplanation: 'Tần số $m_i$ cho biết giá trị $x_i$ xuất hiện bao nhiêu lần trong mẫu dữ liệu.',
        },
        successMsg: 'Chính xác! Tần số phản ánh số lần xuất hiện.',
      }),
  },

  ITNHAT_TRAP: {
    item: {
      id: 'diff-itnhat-k',
      title: 'Hiểu "ít nhất k" (hoặc "nhiều nhất k") thành "tần số nhỏ nhất (lớn nhất)"',
      detail:
        '"Ít nhất 3 năm" là một ĐIỀU KIỆN về giá trị: từ 3 năm trở lên (≥ 3). Nó khác hẳn câu hỏi "giá trị nào xuất hiện ít nhất". Khi sau "ít nhất / nhiều nhất" có một con số, đó là điều kiện.',
    },
    quiz: (c, id) => {
      const k = fmtNum(c.threshold ?? 3);
      return mcq({
        id: `prehint-itnhat-${id}`,
        prompt: `Câu "có bao nhiêu ${c.doi} … ít nhất ${k}${u(c)}" yêu cầu tìm:`,
        correct: { text: `Số ${c.doi} có giá trị từ ${k}${u(c)} trở lên.`, feedback: 'Chính xác! "Ít nhất k" nghĩa là ≥ k.' },
        wrongs: [
          { text: 'Giá trị có tần số nhỏ nhất.', feedback: 'Chưa đúng: sau "ít nhất" có số nên đây là điều kiện ≥, không phải tần số nhỏ nhất.' },
          { text: `Tần số của giá trị ${k}.`, feedback: `Chưa đúng: không chỉ giá trị ${k} mà mọi giá trị từ ${k} trở lên.` },
          { text: `Số ${c.doi} có giá trị nhỏ hơn ${k}${u(c)}.`, feedback: 'Ngược điều kiện rồi.' },
        ],
        hints: {
          level1: 'Sau chữ "ít nhất" có một con số không?',
          level2: `"Ít nhất ${k}" nghĩa là không ít hơn ${k}.`,
          level3: `Tức là các giá trị ≥ ${k}.`,
          fullExplanation: `"Ít nhất ${k}${u(c)}" = "từ ${k}${u(c)} trở lên", ta phải cộng tần số của mọi giá trị ≥ ${k}.`,
        },
      });
    },
  },

  BOUNDARY: {
    item: {
      id: 'diff-boundary',
      title: 'Bỏ sót hoặc lấy thừa giá trị biên',
      detail: 'Với "ít nhất k", "từ k trở lên", "nhiều nhất k", "không quá k": LẤY CẢ giá trị k. Với "trên k", "hơn k", "dưới k", "ít hơn k": KHÔNG lấy k.',
    },
    quiz: (c, id) => {
      const k = fmtNum(c.threshold ?? 3);
      return mcq({
        id: `prehint-boundary-${id}`,
        prompt: `Khi đếm số ${c.doi} có giá trị "ít nhất ${k}${u(c)}", giá trị ${k} có được tính không?`,
        correct: { text: `Có, vì "ít nhất ${k}" gồm cả ${k}.`, feedback: 'Chính xác!' },
        wrongs: [
          { text: `Không, chỉ tính các giá trị lớn hơn ${k}.`, feedback: `Đó là "trên ${k}", không phải "ít nhất ${k}".` },
          { text: `Chỉ tính giá trị ${k}.`, feedback: 'Chưa đúng, còn các giá trị lớn hơn nữa.' },
        ],
        hints: {
          level1: '"Ít nhất 3" có cho phép đúng bằng 3 không?',
          level2: 'Có: 3 là "ít nhất 3".',
          level3: 'Dấu tương ứng là ≥.',
          fullExplanation: 'ít nhất k ⇔ ≥ k; nhiều nhất k ⇔ ≤ k; trên k ⇔ > k; dưới k ⇔ < k.',
        },
      });
    },
  },

  ADD_VALUES: {
    item: {
      id: 'diff-add-values',
      title: 'Cộng các giá trị thay vì cộng tần số',
      detail: 'Muốn biết có bao nhiêu đối tượng, ta cộng TẦN SỐ (số đối tượng ứng với mỗi giá trị), không cộng bản thân các giá trị.',
    },
    quiz: (c, id) =>
      mcq({
        id: `prehint-addvals-${id}`,
        prompt: `Để biết có bao nhiêu ${c.doi} thỏa điều kiện, em cộng:`,
        correct: { text: 'Tần số của các giá trị thỏa điều kiện.', feedback: 'Chính xác! Mỗi tần số là số đối tượng ứng với một giá trị.' },
        wrongs: [
          { text: 'Các giá trị thỏa điều kiện.', feedback: 'Chưa đúng: cộng giá trị không cho số đối tượng.' },
          { text: 'Số cột thỏa điều kiện.', feedback: 'Số cột chỉ là số giá trị khác nhau, không phải số đối tượng.' },
        ],
        hints: {
          level1: 'Đại lượng nào cho biết có bao nhiêu đối tượng ứng với một giá trị?',
          level2: 'Đó là tần số.',
          level3: 'Cộng các tần số tương ứng.',
          fullExplanation: 'Số đối tượng có giá trị thuộc một nhóm = tổng tần số của các giá trị trong nhóm đó.',
        },
      }),
  },

  READ_WRONG: {
    item: {
      id: 'diff-read-wrong',
      title: 'Đọc nhầm cột/điểm hoặc nhầm ô khi tra bảng',
      detail: 'Gióng đúng giá trị trên trục ngang (hoặc dòng giá trị) với tần số tương ứng; đọc chiều cao cột trên trục đứng.',
    },
    quiz: (c, id) =>
      mcq({
        id: `prehint-read-${id}`,
        prompt: c.fromChart ? 'Trên biểu đồ tần số dạng cột, tần số của một giá trị được đọc ở đâu?' : 'Trong bảng tần số, tần số của một giá trị nằm ở đâu?',
        correct: c.fromChart
          ? { text: 'Chiều cao của cột ứng với giá trị đó (gióng sang trục đứng).', feedback: 'Chính xác!' }
          : { text: 'Ô ở dòng tần số, cùng cột với giá trị đó.', feedback: 'Chính xác!' },
        wrongs: [
          { text: 'Vị trí của giá trị trên trục ngang.', feedback: 'Đó là giá trị, không phải tần số.' },
          { text: 'Độ rộng của cột.', feedback: 'Các cột rộng bằng nhau; ta đọc chiều cao.' },
          { text: 'Ô cuối cùng của bảng.', feedback: 'Chưa đúng.' },
        ],
        hints: {
          level1: 'Tần số được biểu diễn trên trục nào/dòng nào?',
          level2: c.fromChart ? 'Trục đứng biểu diễn tần số.' : 'Dòng thứ hai của bảng là tần số.',
          level3: c.fromChart ? 'Gióng đỉnh cột sang trục đứng.' : 'Tra đúng cột của giá trị.',
          fullExplanation: 'Mỗi giá trị đi cặp với đúng một tần số.',
        },
      }),
  },

  COUNT_MISMATCH: {
    item: {
      id: 'diff-count-mismatch',
      title: 'Đếm sót hoặc đếm trùng',
      detail: 'Tổng các tần số luôn bằng cỡ mẫu $N$. Nhỏ hơn $N$ là đếm sót, lớn hơn $N$ là đếm trùng.',
    },
    quiz: (c, id) =>
      mcq({
        id: `prehint-count-${id}`,
        prompt: `Bạn An tính được tổng các tần số là ${c.N - 1}, trong khi cỡ mẫu là ${c.N}. Bạn An đã mắc sai lầm gì?`,
        correct: { text: 'Đã đếm sót ít nhất một giá trị trong mẫu dữ liệu.', feedback: 'Chính xác! Tổng các tần số luôn bằng N.' },
        wrongs: [
          { text: 'Đã cộng các giá trị thay vì đếm số lần xuất hiện.', feedback: 'Chưa đúng, cộng giá trị thường cho kết quả khác xa N.' },
          { text: 'An đếm đúng, tổng tần số không cần bằng cỡ mẫu.', feedback: 'Chưa đúng: tổng các tần số phải bằng N.' },
        ],
        hints: {
          level1: 'So sánh tổng các tần số với cỡ mẫu N.',
          level2: 'Mỗi đối tượng được đếm đúng một lần nên tổng tần số = N.',
          level3: `${c.N - 1} < ${c.N}: còn thiếu.`,
          fullExplanation: '$m_1 + m_2 + \\dots + m_k = N$.',
        },
        successMsg: 'Tuyệt vời! Nhớ luôn kiểm tra: tổng các tần số bằng N.',
      }),
  },

  TIE: {
    item: {
      id: 'diff-tie-values',
      title: 'Bỏ sót khi có nhiều giá trị cùng tần số lớn nhất (nhỏ nhất)',
      detail: 'Có thể có hai hay nhiều giá trị cùng tần số lớn nhất (nhỏ nhất); khi đó phải kể đủ tất cả.',
    },
    quiz: (c, id) =>
      mcq({
        id: `prehint-tie-${id}`,
        prompt: 'Hai giá trị P và Q cùng có tần số lớn nhất là 7. Giá trị nào xuất hiện nhiều nhất?',
        correct: { text: 'Cả P và Q.', feedback: 'Chính xác! Phải kể đủ.' },
        wrongs: [
          { text: 'Chỉ P, vì P đứng trước.', feedback: 'Thứ tự trong bảng không quan trọng.' },
          { text: 'Không có giá trị nào.', feedback: 'Chưa đúng, cả hai đều xuất hiện nhiều nhất.' },
        ],
        hints: {
          level1: 'Hai tần số bằng nhau và đều lớn nhất.',
          level2: 'Vậy giá trị nào cũng "nhiều nhất".',
          level3: 'Cả hai.',
          fullExplanation: 'Khi nhiều giá trị cùng có tần số lớn nhất, tất cả đều xuất hiện nhiều nhất.',
        },
      }),
  },

  N_VS_K: {
    item: {
      id: 'diff-n-vs-k',
      title: 'Nhầm cỡ mẫu N với số giá trị khác nhau k',
      detail: `Cỡ mẫu N là tổng số đối tượng (= tổng các tần số). Số giá trị khác nhau k là số cột của bảng tần số.`,
    },
    quiz: (c, id) =>
      mcq({
        id: `prehint-nk-${id}`,
        prompt: `Bảng tần số có ${c.k} cột giá trị, tổng các tần số là ${c.N}. Cỡ mẫu bằng bao nhiêu?`,
        correct: { text: String(c.N), feedback: 'Chính xác! N = tổng các tần số.' },
        wrongs: [
          { text: String(c.k), feedback: `${c.k} là số giá trị khác nhau, không phải cỡ mẫu.` },
          { text: String(c.N + c.k), feedback: 'Không cộng số cột vào.' },
        ],
        hints: {
          level1: 'Cỡ mẫu là tổng số đối tượng được khảo sát.',
          level2: 'Mỗi tần số là số đối tượng ứng với một giá trị.',
          level3: 'N = tổng các tần số.',
          fullExplanation: 'N = $m_1 + m_2 + \\dots + m_k$; còn k là số giá trị khác nhau.',
        },
      }),
  },

  DIFF_RATIO: {
    item: {
      id: 'diff-diff-ratio',
      title: 'Nhầm "hơn bao nhiêu" với "gấp mấy lần"',
      detail: '"Hơn/kém bao nhiêu" → lấy HIỆU hai tần số. "Gấp mấy lần" → lấy THƯƠNG hai tần số.',
    },
    quiz: (c, id) =>
      mcq({
        id: `prehint-diffratio-${id}`,
        prompt: 'A có 12 bạn, B có 4 bạn. "A nhiều hơn B bao nhiêu bạn?"',
        correct: { text: '8 bạn (12 − 4).', feedback: 'Chính xác! Hơn bao nhiêu → lấy hiệu.' },
        wrongs: [
          { text: '3 (12 : 4).', feedback: 'Đó là "gấp mấy lần".' },
          { text: '16 bạn (12 + 4).', feedback: 'Không cộng hai tần số.' },
        ],
        hints: {
          level1: '"Hơn bao nhiêu" là phép tính gì?',
          level2: 'Phép trừ.',
          level3: '12 − 4.',
          fullExplanation: 'Hơn/kém bao nhiêu: hiệu; gấp mấy lần: thương.',
        },
      }),
  },

  FREQ_COND: {
    item: {
      id: 'diff-freq-cond',
      title: 'Nhầm điều kiện về tần số với điều kiện về giá trị',
      detail: 'Câu như "ngày nào có trên 20 học sinh" so sánh TẦN SỐ (số học sinh) với 20, không so sánh giá trị (tên ngày).',
    },
    quiz: (c, id) => {
      const k = fmtNum(c.threshold ?? 20);
      return mcq({
        id: `prehint-freqcond-${id}`,
        prompt: `Trong câu "… nào có hơn ${k} ${c.doi}", con số ${k} được so sánh với:`,
        correct: { text: 'Tần số (số đối tượng) của mỗi giá trị.', feedback: `Chính xác! ${k} là số ${c.doi}.` },
        wrongs: [
          { text: 'Bản thân các giá trị.', feedback: `${k} đi với "${c.doi}" nên là số lượng, tức tần số.` },
          { text: 'Cỡ mẫu N.', feedback: 'Chưa đúng, ta so sánh từng tần số.' },
        ],
        hints: {
          level1: `Con số ${k} đi kèm với từ nào?`,
          level2: `Đi kèm "${c.doi}" – tức là số lượng.`,
          level3: 'Số lượng ứng với mỗi giá trị chính là tần số.',
          fullExplanation: 'So sánh từng tần số với ngưỡng, rồi chọn các giá trị thỏa.',
        },
      });
    },
  },

  FORGET_MULTIPLY: {
    item: {
      id: 'diff-forget-multiply',
      title: 'Quên nhân giá trị với tần số khi tính tổng',
      detail: 'Giá trị $x_i$ xuất hiện $m_i$ lần nên đóng góp $x_i \\cdot m_i$ vào tổng. Chỉ cộng các giá trị (hoặc chỉ cộng các tần số) là sai.',
    },
    quiz: (c, id) =>
      mcq({
        id: `prehint-mult-${id}`,
        prompt: 'Có 4 trận đấu, mỗi trận có 3 bàn thắng. Tổng số bàn thắng của 4 trận này là:',
        correct: { text: '3 · 4 = 12', feedback: 'Chính xác! Giá trị 3 xuất hiện 4 lần.' },
        wrongs: [
          { text: '3 + 4 = 7', feedback: 'Không cộng giá trị với tần số.' },
          { text: '3', feedback: 'Mới tính một trận.' },
          { text: '4', feedback: 'Đó là số trận, không phải số bàn thắng.' },
        ],
        hints: {
          level1: 'Giá trị 3 xuất hiện mấy lần?',
          level2: '4 lần.',
          level3: '3 + 3 + 3 + 3 = 3 · 4.',
          fullExplanation: 'Tổng các giá trị = Σ (giá trị × tần số).',
        },
      }),
  },

  MISSING_N: {
    item: {
      id: 'diff-missing-n',
      title: 'Không dùng được điều kiện "tổng các tần số bằng N"',
      detail: 'Khi biết cỡ mẫu N và các tần số còn lại, tần số chưa biết = N − (tổng các tần số đã biết).',
    },
    quiz: (c, id) =>
      mcq({
        id: `prehint-missing-${id}`,
        prompt: 'Một bảng tần số có cỡ mẫu N = 20, các tần số đã biết là 4, 7, 5 và một tần số x. Tìm x.',
        correct: { text: 'x = 20 − (4 + 7 + 5) = 4', feedback: 'Chính xác!' },
        wrongs: [
          { text: 'x = 4 + 7 + 5 = 16', feedback: 'Đó là tổng các tần số đã biết.' },
          { text: 'x = 20', feedback: 'Đó là cỡ mẫu.' },
          { text: 'x = 20 : 4 = 5', feedback: 'Không chia đều cho số giá trị.' },
        ],
        hints: {
          level1: 'Tổng tất cả các tần số bằng bao nhiêu?',
          level2: 'Bằng N = 20.',
          level3: '4 + 7 + 5 + x = 20.',
          fullExplanation: 'x = N − (tổng các tần số đã biết).',
        },
      }),
  },

  CHECK_TABLE: {
    item: {
      id: 'diff-check-table',
      title: 'Chỉ kiểm tra tổng mà không kiểm tra từng ô',
      detail: 'Tổng các tần số bằng N là điều kiện cần, chưa đủ: có thể hai ô cùng sai và bù trừ cho nhau. Phải đối chiếu từng giá trị.',
    },
    quiz: (c, id) =>
      mcq({
        id: `prehint-check-${id}`,
        prompt: 'Bảng của bạn có tổng các tần số đúng bằng N. Có chắc bảng đúng không?',
        correct: { text: 'Chưa chắc, cần đếm lại từng giá trị.', feedback: 'Chính xác! Hai ô sai có thể bù trừ.' },
        wrongs: [
          { text: 'Chắc chắn đúng.', feedback: 'Chưa đủ: có thể một ô thừa 1, ô khác thiếu 1.' },
          { text: 'Chắc chắn sai.', feedback: 'Không có căn cứ.' },
        ],
        hints: {
          level1: 'Nếu một ô thừa 1 và ô khác thiếu 1 thì tổng thay đổi thế nào?',
          level2: 'Tổng không đổi.',
          level3: 'Vậy phải đối chiếu từng ô.',
          fullExplanation: 'Tổng đúng là điều kiện cần, không phải điều kiện đủ.',
        },
      }),
  },

  VALUE_EXTREME: {
    item: {
      id: 'diff-value-extreme',
      title: 'Nhầm giá trị lớn nhất với giá trị có tần số lớn nhất',
      detail: 'Câu hỏi về độ lớn ("lâu nhất", "cao nhất" của giá trị) xét dòng giá trị; câu hỏi "nhiều nhất" xét dòng tần số.',
    },
    quiz: (c, id) =>
      mcq({
        id: `prehint-vext-${id}`,
        prompt: 'Điểm kiểm tra: 7 (5 bạn), 8 (9 bạn), 10 (2 bạn). Điểm CAO NHẤT là:',
        correct: { text: '10', feedback: 'Chính xác! Xét độ lớn của giá trị.' },
        wrongs: [
          { text: '8', feedback: '8 là điểm có nhiều bạn đạt nhất, không phải điểm cao nhất.' },
          { text: '9', feedback: 'Đó là một tần số.' },
        ],
        hints: {
          level1: 'Câu hỏi về độ lớn của điểm hay số bạn?',
          level2: 'Về độ lớn của điểm.',
          level3: 'So sánh 7, 8, 10.',
          fullExplanation: 'Giá trị lớn nhất ≠ giá trị có tần số lớn nhất.',
        },
      }),
  },
};

export const REFLECTION_PROMPT =
  'Những khó khăn trong dự đoán có giống khó khăn mà em đang mắc phải khi giải quyết bài toán trên hay không? Em có gặp những khó khăn nào khác trong bước này không?';

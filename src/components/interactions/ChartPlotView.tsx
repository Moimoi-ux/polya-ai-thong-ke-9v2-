import React, { useState } from 'react';
import { ChartPlotInteraction } from '../../shared/types.ts';
import { MathView } from '../MathView.tsx';
import { FreqChart, ColumnStatus } from '../charts/FreqChart.tsx';
import confetti from 'canvas-confetti';
import { Minus, Plus, RotateCcw, MousePointerClick } from 'lucide-react';

interface ChartPlotViewProps {
  interaction: ChartPlotInteraction;
  onAnswer: (answer: string, isCorrect: boolean, tryNo: number, hintLevel: number) => void;
  disabled?: boolean;
}

/**
 * Vẽ biểu đồ tần số (cột / đoạn thẳng) bằng kéo thả, lồng trực tiếp trong Bước 3 của quy trình.
 */
export const ChartPlotView: React.FC<ChartPlotViewProps> = ({ interaction, onAnswer, disabled = false }) => {
  const { categories, expectedValues, axisConfig, title, xAxisLabel, yAxisLabel } = interaction;
  const kind: 'bar' | 'line' = interaction.chartKind === 'line' ? 'line' : 'bar';

  const [values, setValues] = useState<number[]>(() => new Array(categories.length).fill(0));
  const [statuses, setStatuses] = useState<ColumnStatus[]>(() => new Array(categories.length).fill(null));
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [tryCount, setTryCount] = useState(0);
  const [wrongTries, setWrongTries] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [usedModel, setUsedModel] = useState(false);

  const locked = disabled || isCompleted;
  const unitName = kind === 'bar' ? 'cột' : 'điểm';

  const handleChange = (idx: number, v: number) => {
    if (locked) return;
    setValues((prev) => {
      const next = [...prev];
      next[idx] = v;
      return next;
    });
    // Sửa cột nào thì bỏ đánh dấu đỏ cột đó
    setStatuses((prev) => {
      if (!prev[idx]) return prev;
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  };

  const nudge = (delta: number) => {
    if (activeIdx === null) return;
    const v = Math.max(0, Math.min(axisConfig.max, (values[activeIdx] || 0) + delta));
    handleChange(activeIdx, v);
  };

  const handleReset = () => {
    if (locked) return;
    setValues(new Array(categories.length).fill(0));
    setStatuses(new Array(categories.length).fill(null));
    setFeedback(null);
  };

  const handleCheck = () => {
    if (locked) return;
    const newTry = tryCount + 1;
    setTryCount(newTry);

    const st: ColumnStatus[] = categories.map((_, i) => (Math.abs((expectedValues[i] || 0) - (values[i] || 0)) < 0.001 ? 'ok' : 'wrong'));
    const wrongCats = categories.filter((_, i) => st[i] === 'wrong');

    if (wrongCats.length === 0) {
      setStatuses(st);
      setIsCompleted(true);
      setActiveIdx(null);
      setFeedback(interaction.successMsg);
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.8 } });
      onAnswer(JSON.stringify(values), true, newTry, Math.min(newTry, 4));
    } else {
      setStatuses(st.map((s) => (s === 'wrong' ? 'wrong' : null)));
      setWrongTries((p) => p + 1);
      setFeedback(
        `Có ${wrongCats.length} ${unitName} chưa đúng (tô đỏ). Em hãy đối chiếu với bảng tần số và kéo lại nhé!`
      );
      onAnswer(JSON.stringify(values), false, newTry, Math.min(newTry, 4));
    }
  };

  const handleUseModel = () => {
    setUsedModel(true);
    setValues([...expectedValues]);
    setStatuses(categories.map(() => 'ok'));
    setIsCompleted(true);
    setActiveIdx(null);
    setFeedback('Đây là biểu đồ đúng. Em hãy quan sát kỹ chiều cao từng ' + unitName + ' so với bảng tần số nhé.');
    onAnswer(JSON.stringify(expectedValues), true, tryCount + 1, 4);
  };

  return (
    <div className="bg-white border border-blue-100 rounded-xl p-4 md:p-5 shadow-xs mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-sm md:text-base font-medium text-slate-900">
          <MathView content={interaction.prompt} />
        </div>
        {wrongTries > 0 && (
          <span className="shrink-0 text-xs px-2.5 py-1 bg-amber-50 text-amber-700 font-medium rounded-full border border-amber-200">
            Số lần sai: {wrongTries}
          </span>
        )}
      </div>

      {/* Bảng tần số tham chiếu (dạng ngang như SGK) */}
      {interaction.showSourceTable && (
        <div className="overflow-x-auto mb-3">
          <table className="border-collapse text-xs md:text-sm mx-auto">
            <tbody>
              <tr>
                <th className="border border-blue-200 bg-blue-50 text-blue-900 px-3 py-1.5 text-left whitespace-nowrap">
                  {interaction.tableValueLabel || 'Giá trị'}
                </th>
                {categories.map((c, i) => (
                  <td
                    key={i}
                    className={`border border-blue-200 px-3 py-1.5 text-center font-semibold ${
                      i === activeIdx ? 'bg-amber-100 text-amber-900' : 'text-slate-800'
                    }`}
                  >
                    {c}
                  </td>
                ))}
              </tr>
              <tr>
                <th className="border border-blue-200 bg-blue-50 text-blue-900 px-3 py-1.5 text-left whitespace-nowrap">
                  {interaction.tableFreqLabel || 'Tần số'}
                </th>
                {expectedValues.map((v, i) => (
                  <td
                    key={i}
                    className={`border border-blue-200 px-3 py-1.5 text-center font-bold ${
                      i === activeIdx ? 'bg-amber-100 text-amber-900' : 'text-blue-700'
                    }`}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2 md:p-3">
        <div className="text-center font-bold text-blue-900 text-sm md:text-base mb-1">{title}</div>
        <FreqChart
          kind={kind}
          categories={categories}
          values={values}
          axis={axisConfig}
          xAxisLabel={xAxisLabel}
          yAxisLabel={yAxisLabel}
          interactive={!locked}
          onChange={handleChange}
          statuses={statuses}
          completed={isCompleted}
          activeIdx={activeIdx}
          onActivate={setActiveIdx}
        />
        {!locked && (
          <div className="flex items-center justify-center gap-1.5 text-[11px] md:text-xs text-slate-500 mt-1">
            <MousePointerClick className="w-3.5 h-3.5" />
            <span>
              Kéo {kind === 'bar' ? 'núm vàng trên đỉnh cột' : 'điểm tròn'} lên/xuống, hoặc bấm vào vị trí bất kỳ trong cột. Có thể dùng phím ↑ ↓.
            </span>
          </div>
        )}
      </div>

      {/* Thanh chỉnh tinh (hữu ích trên điện thoại) */}
      {!locked && activeIdx !== null && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-slate-600">
            Đang chỉnh {unitName} <strong className="text-blue-800">{categories[activeIdx]}</strong>:
          </span>
          <button
            onClick={() => nudge(-1)}
            className="w-9 h-9 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center cursor-pointer"
            aria-label="Giảm 1"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="min-w-[2.5rem] text-center font-black text-lg text-blue-800">{values[activeIdx] || 0}</span>
          <button
            onClick={() => nudge(1)}
            className="w-9 h-9 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center cursor-pointer"
            aria-label="Tăng 1"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-4">
        {!locked && (
          <>
            <button
              onClick={handleCheck}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg transition-colors cursor-pointer"
            >
              Kiểm tra biểu đồ
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" /> Vẽ lại
            </button>
          </>
        )}
        {!locked && wrongTries >= 3 && !usedModel && (
          <button
            onClick={handleUseModel}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm rounded-lg transition-colors cursor-pointer"
          >
            👀 Xem biểu đồ mẫu
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg text-sm mt-3 flex items-start gap-2 ${
            isCompleted ? 'bg-green-100/70 border border-green-300 text-green-800' : 'bg-amber-100/70 border border-amber-300 text-amber-900'
          }`}
        >
          <span>{isCompleted ? '🎉' : '💡'}</span>
          <MathView content={feedback} />
        </div>
      )}

      {!isCompleted && wrongTries >= 1 && (
        <div className="mt-3 p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs md:text-sm text-amber-900">
          <div className="font-semibold text-amber-800 mb-1">🔎 Gợi ý mức {Math.min(wrongTries, 3)}:</div>
          {wrongTries === 1 && <MathView content={interaction.hints.level1} />}
          {wrongTries === 2 && <MathView content={interaction.hints.level2} />}
          {wrongTries >= 3 && <MathView content={interaction.hints.level3} />}
          {wrongTries >= 4 && (
            <div className="mt-2 pt-2 border-t border-amber-200">
              <MathView content={interaction.hints.fullExplanation} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

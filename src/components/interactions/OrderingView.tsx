import React, { useState } from 'react';
import { OrderingInteraction } from '../../shared/types.ts';
import { MathView } from '../MathView.tsx';
import { ArrowUp, ArrowDown } from 'lucide-react';
import confetti from 'canvas-confetti';

interface OrderingViewProps {
  interaction: OrderingInteraction;
  onAnswer: (answer: string, isCorrect: boolean, tryNo: number, hintLevel: number) => void;
  disabled?: boolean;
}

export const OrderingView: React.FC<OrderingViewProps> = ({
  interaction,
  onAnswer,
  disabled = false,
}) => {
  const [items, setItems] = useState(() => [...interaction.items]);
  const [isCorrect, setIsCorrect] = useState(false);
  const [tryCount, setTryCount] = useState(0);
  const [wrongTries, setWrongTries] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  const moveItem = (index: number, direction: 'up' | 'down') => {
    if (disabled || isCorrect) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const copy = [...items];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;
    setItems(copy);
  };

  const handleCheck = () => {
    const newTry = tryCount + 1;
    setTryCount(newTry);

    const currentOrder = items.map((i) => i.id);
    const correct = JSON.stringify(currentOrder) === JSON.stringify(interaction.correctOrder);

    if (correct) {
      setIsCorrect(true);
      setFeedback(interaction.successMsg);
      confetti({ particleCount: 35, spread: 50, origin: { y: 0.8 } });
      onAnswer(JSON.stringify(currentOrder), true, newTry, Math.min(newTry, 4));
    } else {
      setWrongTries((prev) => prev + 1);
      setFeedback('Thứ tự các bước chưa hoàn toàn chính xác. Em hãy tư duy lại logic và sắp xếp lại nhé.');
      onAnswer(JSON.stringify(currentOrder), false, newTry, Math.min(newTry, 4));
    }
  };

  return (
    <div className="bg-white border border-blue-100 rounded-xl p-4 md:p-5 shadow-xs mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="font-medium text-slate-900 text-sm md:text-base">
          <MathView content={interaction.prompt} />
        </div>
        {wrongTries > 0 && (
          <span className="shrink-0 text-xs px-2.5 py-1 bg-amber-50 text-amber-700 font-medium rounded-full border border-amber-200">
            Số lần sai: {wrongTries}
          </span>
        )}
      </div>

      <div className="space-y-2.5 my-3">
        {items.map((it, idx) => (
          <div
            key={it.id}
            className={`flex items-center justify-between p-3 rounded-lg border text-sm transition-all ${
              isCorrect
                ? 'bg-green-50 border-green-300 text-green-950 font-medium'
                : 'bg-slate-50 border-slate-200 text-slate-850 hover:border-blue-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-xs font-bold shrink-0">
                {idx + 1}
              </span>
              <MathView content={it.text} />
            </div>

            {!isCorrect && !disabled && (
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={() => moveItem(idx, 'up')}
                  disabled={idx === 0}
                  className="p-1 rounded-md hover:bg-slate-200 disabled:opacity-30 cursor-pointer"
                  title="Di chuyển lên"
                >
                  <ArrowUp className="w-4 h-4 text-slate-700" />
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(idx, 'down')}
                  disabled={idx === items.length - 1}
                  className="p-1 rounded-md hover:bg-slate-200 disabled:opacity-30 cursor-pointer"
                  title="Di chuyển xuống"
                >
                  <ArrowDown className="w-4 h-4 text-slate-700" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!isCorrect && (
        <button
          onClick={handleCheck}
          disabled={disabled}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium text-sm rounded-lg transition-colors cursor-pointer"
        >
          Xác nhận thứ tự
        </button>
      )}

      {feedback && (
        <div
          className={`p-3 rounded-lg text-sm mt-3 flex items-start gap-2 ${
            isCorrect
              ? 'bg-green-100/70 border border-green-300 text-green-800'
              : 'bg-amber-100/70 border border-amber-300 text-amber-900'
          }`}
        >
          <span>{isCorrect ? '🎉' : '💡'}</span>
          <MathView content={feedback} />
        </div>
      )}

      {!isCorrect && wrongTries >= 1 && (
        <div className="mt-3 p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs md:text-sm text-amber-900">
          <div className="font-semibold text-amber-800 mb-1">
            <span>🔎 Gợi ý mức {Math.min(wrongTries, 3)}:</span>
          </div>
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

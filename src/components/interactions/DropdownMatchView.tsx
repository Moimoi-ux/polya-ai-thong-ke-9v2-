import React, { useState } from 'react';
import { DropdownMatchInteraction } from '../../shared/types.ts';
import { MathView } from '../MathView.tsx';
import confetti from 'canvas-confetti';

interface DropdownMatchViewProps {
  interaction: DropdownMatchInteraction;
  onAnswer: (answer: string, isCorrect: boolean, tryNo: number, hintLevel: number) => void;
  disabled?: boolean;
}

export const DropdownMatchView: React.FC<DropdownMatchViewProps> = ({
  interaction,
  onAnswer,
  disabled = false,
}) => {
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});
  const [isAnsweredCorrectly, setIsAnsweredCorrectly] = useState(false);
  const [tryCount, setTryCount] = useState(0);
  const [wrongTries, setWrongTries] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleChange = (itemId: string, targetId: string) => {
    setSelectedValues((prev) => ({ ...prev, [itemId]: targetId }));
  };

  const handleCheck = () => {
    const newTryCount = tryCount + 1;
    setTryCount(newTryCount);

    const isAllCorrect = interaction.items.every((it) => selectedValues[it.id] === it.correctTargetId);

    if (isAllCorrect) {
      setIsAnsweredCorrectly(true);
      setFeedback(interaction.successMsg);
      confetti({ particleCount: 35, spread: 50, origin: { y: 0.8 } });
      onAnswer(JSON.stringify(selectedValues), true, newTryCount, Math.min(newTryCount, 4));
    } else {
      setWrongTries((prev) => prev + 1);
      setFeedback('Vẫn còn mục ghép chưa chính xác. Em xem lại gợi ý nhé!');
      onAnswer(JSON.stringify(selectedValues), false, newTryCount, Math.min(newTryCount, 4));
    }
  };

  const allSelected = interaction.items.every((it) => selectedValues[it.id]);

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

      <div className="space-y-3 my-4">
        {interaction.items.map((it) => (
          <div
            key={it.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg"
          >
            <div className="font-medium text-slate-800 text-sm">
              <MathView content={it.leftText} />
            </div>
            <select
              value={selectedValues[it.id] || ''}
              onChange={(e) => handleChange(it.id, e.target.value)}
              disabled={disabled || isAnsweredCorrectly}
              className={`p-2 border rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none ${
                isAnsweredCorrectly
                  ? 'border-green-500 bg-green-50 text-green-900'
                  : 'border-slate-300'
              }`}
            >
              <option value="">-- Chọn nhóm tương ứng --</option>
              {interaction.availableOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {!isAnsweredCorrectly && (
        <button
          onClick={handleCheck}
          disabled={disabled || !allSelected}
          className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium text-sm rounded-lg transition-colors cursor-pointer"
        >
          Kiểm tra kết quả
        </button>
      )}

      {feedback && (
        <div
          className={`p-3 rounded-lg text-sm mt-3 flex items-start gap-2 ${
            isAnsweredCorrectly
              ? 'bg-green-100/70 border border-green-300 text-green-800'
              : 'bg-amber-100/70 border border-amber-300 text-amber-900'
          }`}
        >
          <span>{isAnsweredCorrectly ? '🎉' : '💡'}</span>
          <MathView content={feedback} />
        </div>
      )}

      {!isAnsweredCorrectly && wrongTries >= 1 && (
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

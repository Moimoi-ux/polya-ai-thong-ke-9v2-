import React, { useState } from 'react';
import { NumericInteraction } from '../../shared/types.ts';
import { parseVietnameseNumber } from '../../shared/statEngine.ts';
import { MathView } from '../MathView.tsx';
import confetti from 'canvas-confetti';

interface NumericViewProps {
  interaction: NumericInteraction;
  onAnswer: (answer: string, isCorrect: boolean, tryNo: number, hintLevel: number) => void;
  disabled?: boolean;
}

export const NumericView: React.FC<NumericViewProps> = ({
  interaction,
  onAnswer,
  disabled = false,
}) => {
  const [inputVal, setInputVal] = useState('');
  const [tryCount, setTryCount] = useState(0);
  const [wrongTries, setWrongTries] = useState(0);
  const [isCorrect, setIsCorrect] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (disabled || isCorrect || !inputVal.trim()) return;

    const parsed = parseVietnameseNumber(inputVal);
    const newTry = tryCount + 1;
    setTryCount(newTry);

    if (parsed === null) {
      setFeedback('Vui lòng nhập một số hợp lệ.');
      return;
    }

    const tolerance = interaction.tolerance ?? 0.05;
    const correct = Math.abs(parsed - interaction.correctValue) <= tolerance;

    if (correct) {
      setIsCorrect(true);
      setFeedback(interaction.successMsg);
      confetti({ particleCount: 35, spread: 50, origin: { y: 0.8 } });
      onAnswer(inputVal, true, newTry, Math.min(newTry, 4));
    } else {
      setWrongTries((prev) => prev + 1);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      // Sai lầm hay gặp → phản hồi riêng (VD "Em đã bỏ sót giá trị biên 3")
      const known = (interaction.commonErrors || []).find((e) => Math.abs(e.value - parsed) <= 1e-9);
      setFeedback(known ? `Chưa chính xác. ${known.feedback}` : 'Chưa chính xác. Em hãy thử tính lại hoặc xem gợi ý nhé.');
      onAnswer(inputVal, false, newTry, Math.min(newTry, 4));
    }
  };

  return (
    <div className={`bg-white border border-blue-100 rounded-xl p-4 md:p-5 shadow-xs mb-4 ${shake ? 'animate-shake' : ''}`}>
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

      <form onSubmit={handleSubmit} className="my-3 flex flex-wrap items-center gap-2">
        <div className="relative flex items-center">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            disabled={disabled || isCorrect}
            placeholder={interaction.placeholder || 'Nhập số...'}
            className={`px-3.5 py-2.5 border rounded-lg text-sm md:text-base outline-none w-48 transition-all ${
              isCorrect
                ? 'border-green-500 bg-green-50 text-green-900 font-bold'
                : 'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
            }`}
          />
          {interaction.unit && (
            <span className="ml-2 font-medium text-slate-600 text-sm">{interaction.unit}</span>
          )}
        </div>

        {!isCorrect && (
          <button
            type="submit"
            disabled={disabled || !inputVal.trim()}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium text-sm rounded-lg transition-colors cursor-pointer"
          >
            Kiểm tra
          </button>
        )}
      </form>

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
              <span className="font-bold text-blue-700">Đáp án chính xác: </span>
              {interaction.correctValue} {interaction.unit}
              <div className="mt-1 text-slate-700">
                <MathView content={interaction.hints.fullExplanation} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

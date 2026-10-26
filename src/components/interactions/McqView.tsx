import React, { useState } from 'react';
import { McqInteraction } from '../../shared/types.ts';
import { MathView } from '../MathView.tsx';
import confetti from 'canvas-confetti';

interface McqViewProps {
  interaction: McqInteraction;
  onAnswer: (answer: string, isCorrect: boolean, tryNo: number, hintLevel: number) => void;
  disabled?: boolean;
}

export const McqView: React.FC<McqViewProps> = ({ interaction, onAnswer, disabled = false }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wrongSelections, setWrongSelections] = useState<string[]>([]);
  const [tryCount, setTryCount] = useState(0);
  const [isAnsweredCorrectly, setIsAnsweredCorrectly] = useState(false);
  const [activeFeedback, setActiveFeedback] = useState<string | null>(null);

  const handleSelect = (optionId: string) => {
    if (disabled || isAnsweredCorrectly || wrongSelections.includes(optionId)) return;

    setSelectedId(optionId);
    const newTryCount = tryCount + 1;
    setTryCount(newTryCount);

    const isCorrect = optionId === interaction.correctOptionId;
    const option = interaction.options.find((o) => o.id === optionId);
    setActiveFeedback(option?.feedback || (isCorrect ? interaction.successMsg : 'Chưa chính xác, em hãy đọc gợi ý bên dưới nhé.'));

    if (isCorrect) {
      setIsAnsweredCorrectly(true);
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.8 } });
      onAnswer(optionId, true, newTryCount, Math.min(newTryCount, 4));
    } else {
      setWrongSelections((prev) => [...prev, optionId]);
      onAnswer(optionId, false, newTryCount, Math.min(newTryCount, 4));
    }
  };

  // Determine hint level to show
  const currentHintLevel = Math.min(tryCount, 4);

  return (
    <div className="bg-white border border-blue-100 rounded-xl p-4 md:p-5 shadow-xs mb-4">
      {/* Header prompt */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="font-medium text-slate-900 text-sm md:text-base leading-relaxed">
          <MathView content={interaction.prompt} />
        </div>
        {tryCount > 0 && (
          <span className="shrink-0 text-xs px-2.5 py-1 bg-amber-50 text-amber-700 font-medium rounded-full border border-amber-200">
            Số lần sai: {wrongSelections.length}
          </span>
        )}
      </div>

      {/* Options List */}
      <div className="space-y-2.5 my-3">
        {interaction.options.map((opt) => {
          const isWrong = wrongSelections.includes(opt.id);
          const isCorrect = isAnsweredCorrectly && opt.id === interaction.correctOptionId;
          const isSelected = selectedId === opt.id;

          let btnStyle = 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 text-slate-800';
          if (isCorrect) {
            btnStyle = 'border-green-500 bg-green-50 text-green-900 ring-2 ring-green-400 font-medium';
          } else if (isWrong) {
            btnStyle = 'border-red-200 bg-red-50/50 text-slate-400 opacity-60 cursor-not-allowed line-through';
          } else if (isSelected) {
            btnStyle = 'border-blue-500 bg-blue-50 text-blue-900';
          }

          return (
            <button
              key={opt.id}
              onClick={() => handleSelect(opt.id)}
              disabled={disabled || isAnsweredCorrectly || isWrong}
              className={`w-full text-left p-3 md:p-3.5 rounded-lg border text-sm md:text-base transition-all flex items-center justify-between ${btnStyle}`}
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs font-bold shrink-0">
                  {opt.id.replace('opt', '')}
                </span>
                <MathView content={opt.text} />
              </div>
              {isCorrect && <span className="text-green-600 font-bold ml-2">✓ Đúng</span>}
              {isWrong && <span className="text-red-500 text-xs font-semibold ml-2">✕ Sai</span>}
            </button>
          );
        })}
      </div>

      {/* Immediate Feedback */}
      {activeFeedback && (
        <div
          className={`p-3 rounded-lg text-sm my-2 flex items-start gap-2 ${
            isAnsweredCorrectly
              ? 'bg-green-100/70 border border-green-300 text-green-800'
              : 'bg-amber-100/70 border border-amber-300 text-amber-900'
          }`}
        >
          <span className="font-bold">{isAnsweredCorrectly ? '🎉' : '💡'}</span>
          <div className="flex-1">
            <MathView content={activeFeedback} />
          </div>
        </div>
      )}

      {/* Progressive Hints based on mistake count */}
      {!isAnsweredCorrectly && currentHintLevel >= 1 && (
        <div className="mt-3 p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs md:text-sm text-amber-900">
          <div className="font-semibold text-amber-800 mb-1 flex items-center gap-1.5">
            <span>🔎 Gợi ý mức {Math.min(currentHintLevel, 3)}:</span>
          </div>
          {currentHintLevel === 1 && <MathView content={interaction.hints.level1} />}
          {currentHintLevel === 2 && <MathView content={interaction.hints.level2} />}
          {currentHintLevel >= 3 && <MathView content={interaction.hints.level3} />}
          {currentHintLevel >= 4 && (
            <div className="mt-2 pt-2 border-t border-amber-200/80 font-medium">
              <span className="text-blue-700 font-bold">Đáp án đúng: </span>
              {interaction.options.find((o) => o.id === interaction.correctOptionId)?.text}
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

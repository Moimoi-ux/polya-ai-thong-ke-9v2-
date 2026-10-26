import React, { useState } from 'react';
import { TableFillInteraction } from '../../shared/types.ts';
import { parseVietnameseNumber } from '../../shared/statEngine.ts';
import { MathView } from '../MathView.tsx';
import confetti from 'canvas-confetti';

interface TableFillViewProps {
  interaction: TableFillInteraction;
  onAnswer: (answer: string, isCorrect: boolean, tryNo: number, hintLevel: number) => void;
  disabled?: boolean;
}

export const TableFillView: React.FC<TableFillViewProps> = ({
  interaction,
  onAnswer,
  disabled = false,
}) => {
  // Matrix user inputs: rowIdx -> colIdx -> string
  const [userInputs, setUserInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    interaction.matrix.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (!cell.isEditable) {
          init[`${r}-${c}`] = cell.value;
        }
      });
    });
    return init;
  });

  const [cellErrors, setCellErrors] = useState<Record<string, boolean>>({});
  const [tryCount, setTryCount] = useState(0);
  const [wrongTries, setWrongTries] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showModelSolution, setShowModelSolution] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleCellChange = (r: number, c: number, val: string) => {
    setUserInputs((prev) => ({ ...prev, [`${r}-${c}`]: val }));
    // Clear error for edited cell
    if (cellErrors[`${r}-${c}`]) {
      setCellErrors((prev) => {
        const next = { ...prev };
        delete next[`${r}-${c}`];
        return next;
      });
    }
  };

  const checkTable = () => {
    const newTry = tryCount + 1;
    setTryCount(newTry);

    const errors: Record<string, boolean> = {};
    let allCorrect = true;

    interaction.matrix.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell.isEditable && cell.expectedValue !== undefined) {
          const userVal = (userInputs[`${r}-${c}`] || '').trim();
          const expectedNum = parseVietnameseNumber(cell.expectedValue);
          const userNum = parseVietnameseNumber(userVal);

          let match = false;
          if (expectedNum !== null && userNum !== null) {
            match = Math.abs(expectedNum - userNum) <= 0.05;
          } else {
            match = userVal.toLowerCase() === cell.expectedValue.toLowerCase();
          }

          if (!match) {
            errors[`${r}-${c}`] = true;
            allCorrect = false;
          }
        }
      });
    });

    setCellErrors(errors);

    if (allCorrect) {
      setIsCompleted(true);
      setFeedback(interaction.successMsg);
      confetti({ particleCount: 50, spread: 70, origin: { y: 0.8 } });
      onAnswer(JSON.stringify(userInputs), true, newTry, Math.min(newTry, 4));
    } else {
      setWrongTries((prev) => prev + 1);
      setFeedback('Có một số ô chưa chính xác (được đánh dấu đỏ). Em hãy kiểm tra và tính lại nhé!');
      onAnswer(JSON.stringify(userInputs), false, newTry, Math.min(newTry, 4));
    }
  };

  const handleUseModelSolution = () => {
    setShowModelSolution(true);
    // Fill in expected values
    const autoFilled: Record<string, string> = { ...userInputs };
    interaction.matrix.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell.expectedValue) {
          autoFilled[`${r}-${c}`] = cell.expectedValue;
        }
      });
    });
    setUserInputs(autoFilled);
    setCellErrors({});
    setIsCompleted(true);
    onAnswer(JSON.stringify(autoFilled), true, tryCount + 1, 4);
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

      {/* Responsive table */}
      <div className="overflow-x-auto my-3 pb-1">
        {interaction.orientation === 'horizontal' ? (
          /* Bảng ngang như SGK: dòng 1 = Giá trị, dòng 2 = Tần số */
          <table className="border-collapse border border-blue-200 rounded-lg overflow-hidden shadow-xs mx-auto">
            <tbody className="bg-white">
              {interaction.headers.map((h, c) => (
                <tr key={c}>
                  <th className="border border-blue-200 bg-blue-100/90 text-blue-900 font-semibold text-xs md:text-sm px-3 py-2 text-left whitespace-nowrap">
                    <MathView content={h} />
                  </th>
                  {interaction.matrix.map((row, r) => {
                    const cell = row[c];
                    if (!cell) return <td key={r} className="border border-blue-200" />;
                    const key = `${r}-${c}`;
                    const isError = cellErrors[key];
                    const isTotalCol = row[0]?.value === 'Cộng';
                    return (
                      <td
                        key={r}
                        className={`border border-blue-200 p-1.5 text-center text-sm min-w-[56px] ${isTotalCol ? 'bg-blue-50/60 font-semibold' : ''}`}
                      >
                        {!cell.isEditable ? (
                          <span className="text-slate-800 font-semibold px-1.5 py-1 inline-block whitespace-nowrap">
                            <MathView content={cell.value} />
                          </span>
                        ) : (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={userInputs[key] || ''}
                            onChange={(e) => handleCellChange(r, c, e.target.value)}
                            disabled={disabled || isCompleted}
                            placeholder="?"
                            className={`w-14 text-center p-1.5 border rounded-md text-sm outline-none transition-all ${
                              isCompleted
                                ? 'bg-green-50 border-green-400 text-green-900 font-medium'
                                : isError
                                ? 'bg-red-50 border-red-500 text-red-900 ring-2 ring-red-200'
                                : 'bg-white border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-200'
                            }`}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
        <table className="w-full border-collapse border border-blue-200 rounded-lg overflow-hidden shadow-xs">
          <thead>
            <tr className="bg-blue-100/90 text-blue-900 font-semibold text-xs md:text-sm">
              {interaction.headers.map((h, idx) => (
                <th key={idx} className="border border-blue-200 px-3 py-2 text-center">
                  <MathView content={h} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-100 bg-white">
            {interaction.matrix.map((row, r) => (
              <tr key={r} className={row[0]?.value === 'Cộng' ? 'bg-blue-50/50 font-semibold' : ''}>
                {row.map((cell, c) => {
                  const key = `${r}-${c}`;
                  const isError = cellErrors[key];
                  const isLocked = !cell.isEditable;

                  return (
                    <td key={c} className="border border-blue-200 p-1.5 md:p-2 text-center text-sm">
                      {isLocked ? (
                        <span className="text-slate-800 font-medium px-2 py-1 inline-block">
                          <MathView content={cell.value} />
                        </span>
                      ) : (
                        <input
                          type="text"
                          value={userInputs[key] || ''}
                          onChange={(e) => handleCellChange(r, c, e.target.value)}
                          disabled={disabled || isCompleted}
                          placeholder="..."
                          className={`w-full max-w-[120px] text-center p-1.5 md:p-2 border rounded-md text-sm outline-none transition-all ${
                            isCompleted
                              ? 'bg-green-50 border-green-400 text-green-900 font-medium'
                              : isError
                              ? 'bg-red-50 border-red-500 text-red-900 ring-2 ring-red-200'
                              : 'bg-white border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-200'
                          }`}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        {!isCompleted && (
          <button
            onClick={checkTable}
            disabled={disabled}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium text-sm rounded-lg transition-colors cursor-pointer"
          >
            Kiểm tra bảng
          </button>
        )}

        {/* Nút Xem mẫu chỉ xuất hiện sau 3 lần sai */}
        {!isCompleted && wrongTries >= 3 && !showModelSolution && (
          <button
            onClick={handleUseModelSolution}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm rounded-lg transition-colors cursor-pointer"
          >
            👀 Xem mẫu và điền đáp án
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg text-sm mt-3 flex items-start gap-2 ${
            isCompleted
              ? 'bg-green-100/70 border border-green-300 text-green-800'
              : 'bg-amber-100/70 border border-amber-300 text-amber-900'
          }`}
        >
          <span>{isCompleted ? '🎉' : '💡'}</span>
          <MathView content={feedback} />
        </div>
      )}

      {!isCompleted && wrongTries >= 1 && (
        <div className="mt-3 p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs md:text-sm text-amber-900">
          <div className="font-semibold text-amber-800 mb-1">
            <span>🔎 Gợi ý mức {Math.min(wrongTries, 3)}:</span>
          </div>
          {wrongTries === 1 && <MathView content={interaction.hints.level1} />}
          {wrongTries === 2 && <MathView content={interaction.hints.level2} />}
          {wrongTries >= 3 && <MathView content={interaction.hints.level3} />}
        </div>
      )}
    </div>
  );
};

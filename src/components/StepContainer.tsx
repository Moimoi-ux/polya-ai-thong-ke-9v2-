import React, { useState } from 'react';
import { PolyaStep, Interaction } from '../shared/types.ts';
import { MathView } from './MathView.tsx';
import { McqView } from './interactions/McqView.tsx';
import { DropdownMatchView } from './interactions/DropdownMatchView.tsx';
import { NumericView } from './interactions/NumericView.tsx';
import { TableFillView } from './interactions/TableFillView.tsx';
import { OrderingView } from './interactions/OrderingView.tsx';
import { ChartPlotView } from './interactions/ChartPlotView.tsx';
import { ReferenceChartView } from './charts/ReferenceChartView.tsx';
import { AlertTriangle, Lightbulb, Brain, CheckCircle, ChevronRight, BookOpen } from 'lucide-react';

interface StepContainerProps {
  step: PolyaStep;
  isCurrentStep: boolean;
  isUnlocked: boolean;
  isLastStepOfLastPart: boolean;
  onStepComplete: () => void;
  onRecordAnswer: (interactionId: string, answer: string, isCorrect: boolean, tryNo: number, hintLevel: number, phase: 'main' | 'prehint') => void;
  onSaveReflection: (stepNo: number, text: string) => void;
  initialReflection?: string;
}

export const StepContainer: React.FC<StepContainerProps> = ({
  step,
  isLastStepOfLastPart,
  onStepComplete,
  onRecordAnswer,
  onSaveReflection,
  initialReflection = '',
}) => {
  // Tracking completed interactions within this step
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [showDifficulties, setShowDifficulties] = useState(false);
  const [reflectionText, setReflectionText] = useState(initialReflection);
  const [isReflectionSaved, setIsReflectionSaved] = useState(Boolean(initialReflection));
  const [isPreHintPassed, setIsPreHintPassed] = useState(false);
  const [isStepFinished, setIsStepFinished] = useState(false);

  // Main task completion
  const handleTaskAnswer = (task: Interaction, answer: string, isCorrect: boolean, tryNo: number, hintLevel: number) => {
    onRecordAnswer(task.id, answer, isCorrect, tryNo, hintLevel, 'main');
    if (isCorrect && !completedTaskIds.includes(task.id)) {
      setCompletedTaskIds((prev) => [...prev, task.id]);
    }
  };

  const allMainTasksDone = step.mainTasks.every((t) => completedTaskIds.includes(t.id));

  // Pre-hint MCQ quiz answer
  const handlePreHintAnswer = (answer: string, isCorrect: boolean, tryNo: number, hintLevel: number) => {
    onRecordAnswer(step.preHintQuiz.id, answer, isCorrect, tryNo, hintLevel, 'prehint');
    if (isCorrect) {
      setIsPreHintPassed(true);
    }
  };

  const handleSaveReflection = () => {
    if (!reflectionText.trim()) return;
    onSaveReflection(step.stepNo, reflectionText.trim());
    setIsReflectionSaved(true);
  };

  const handleAdvance = () => {
    setIsStepFinished(true);
    onStepComplete();
  };

  const renderInteraction = (task: Interaction) => {
    const isDone = completedTaskIds.includes(task.id);
    switch (task.type) {
      case 'mcq':
        return <McqView key={task.id} interaction={task} onAnswer={(a, c, t, h) => handleTaskAnswer(task, a, c, t, h)} disabled={isDone} />;
      case 'dropdown_match':
        return <DropdownMatchView key={task.id} interaction={task} onAnswer={(a, c, t, h) => handleTaskAnswer(task, a, c, t, h)} disabled={isDone} />;
      case 'numeric':
        return <NumericView key={task.id} interaction={task} onAnswer={(a, c, t, h) => handleTaskAnswer(task, a, c, t, h)} disabled={isDone} />;
      case 'table_fill':
        return <TableFillView key={task.id} interaction={task} onAnswer={(a, c, t, h) => handleTaskAnswer(task, a, c, t, h)} disabled={isDone} />;
      case 'ordering':
        return <OrderingView key={task.id} interaction={task} onAnswer={(a, c, t, h) => handleTaskAnswer(task, a, c, t, h)} disabled={isDone} />;
      case 'chart_plot':
        return <ChartPlotView key={task.id} interaction={task} onAnswer={(a, c, t, h) => handleTaskAnswer(task, a, c, t, h)} disabled={isDone} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Step Intro */}
      <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-4 md:p-5">
        <h3 className="text-base md:text-lg font-bold text-blue-900 mb-1 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          {step.title}
        </h3>
        <div className="text-sm text-slate-700 leading-relaxed">
          <MathView content={step.intro} />
        </div>
      </div>

      {/* Biểu đồ lồng trong bước (nếu có) */}
      {step.referenceChart && <ReferenceChartView chart={step.referenceChart} />}

      {/* PHA 1: NHIỆM VỤ CHÍNH (Sequential rendering) */}
      <div className="space-y-4">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
          Nhiệm vụ chính ({completedTaskIds.length}/{step.mainTasks.length} hoàn thành)
        </div>

        {step.mainTasks.map((task, idx) => {
          // Sequential: Show current task if previous task is completed (or it's the first task)
          const isUnlocked = idx === 0 || completedTaskIds.includes(step.mainTasks[idx - 1].id);
          if (!isUnlocked) return null;

          return (
            <div key={task.id} className="animate-fadeIn">
              <div className="text-xs font-semibold text-blue-700 mb-1">Câu hỏi {idx + 1}:</div>
              {renderInteraction(task)}
            </div>
          );
        })}
      </div>

      {/* Model solution for Step 3 after main tasks done */}
      {step.stepNo === 3 && allMainTasksDone && step.modelSolution && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 md:p-5 shadow-xs">
          <div className="font-bold text-emerald-900 text-sm md:text-base flex items-center gap-2 mb-2">
            <span>✍️</span> Lời giải mẫu chuẩn SGK:
          </div>
          <div className="text-sm text-slate-800">
            <MathView content={step.modelSolution} />
          </div>
        </div>
      )}

      {/* PHA 2: NÚT PHÂN TÍCH KHÓ KHĂN (Available after main tasks are completed) */}
      {allMainTasksDone && (
        <div className="pt-2 border-t border-slate-200 animate-fadeIn">
          {!showDifficulties ? (
            <button
              onClick={() => setShowDifficulties(true)}
              className="w-full sm:w-auto px-5 py-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              ⚠️ Xem phân tích khó khăn & sai lầm thường gặp
            </button>
          ) : (
            <div className="bg-amber-50/80 border border-amber-300 rounded-xl p-4 md:p-5 shadow-xs space-y-3">
              <div className="font-bold text-amber-950 text-sm md:text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Dự đoán các khó khăn & sai lầm phổ biến ở bước này:
              </div>
              <div className="space-y-2.5">
                {step.difficulties.map((diff, dIdx) => (
                  <div key={dIdx} className="bg-white p-3 rounded-lg border border-amber-200 text-sm">
                    <div className="font-bold text-slate-900 mb-0.5">• {diff.title}</div>
                    <div className="text-slate-700 text-xs md:text-sm">
                      <MathView content={diff.detail} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* PHA 3: PHẢN TƯ BẮT BUỘC */}
      {allMainTasksDone && showDifficulties && (
        <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-4 md:p-5 shadow-xs animate-fadeIn">
          <div className="font-bold text-purple-900 text-sm md:text-base flex items-center gap-2 mb-2">
            <span>🤔</span> Góc phản tư của học sinh (Bắt buộc)
          </div>
          <p className="text-xs md:text-sm text-purple-800 mb-3">
            {step.reflectionPrompt}
          </p>
          <textarea
            value={reflectionText}
            onChange={(e) => {
              setReflectionText(e.target.value);
              setIsReflectionSaved(false);
            }}
            placeholder="Em hãy ghi lại suy nghĩ, những chỗ thấy lúng túng hoặc bài học rút ra..."
            rows={3}
            className="w-full p-3 border border-purple-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-400 outline-none text-slate-800"
          />
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-xs text-purple-600">
              {reflectionText.trim().length > 0 ? '✓ Đã viết phản tư' : '* Hãy ghi ít nhất vài dòng trước khi qua câu hỏi thử sức.'}
            </span>
            <button
              onClick={handleSaveReflection}
              disabled={!reflectionText.trim()}
              className="px-4 py-2 bg-purple-700 hover:bg-purple-800 disabled:bg-slate-300 text-white rounded-lg text-xs md:text-sm font-medium transition-colors cursor-pointer"
            >
              {isReflectionSaved ? '✓ Đã lưu phản tư' : 'Lưu phản tư'}
            </button>
          </div>
        </div>
      )}

      {/* PHA 4: THỬ SỨC TRƯỚC KHI XEM GỢI Ý (preHintQuiz) */}
      {allMainTasksDone && showDifficulties && isReflectionSaved && (
        <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4 md:p-5 shadow-xs animate-fadeIn">
          <div className="font-bold text-blue-900 text-sm md:text-base flex items-center gap-2 mb-3">
            <Brain className="w-5 h-5 text-blue-600" />
            🧠 Thử sức nhận diện lỗi sai trước khi xem gợi ý
          </div>
          <p className="text-xs md:text-sm text-slate-600 mb-3">
            Em hãy chọn nhận định đúng để kiểm tra xem mình có tránh được sai lầm này không nhé:
          </p>
          <McqView
            interaction={step.preHintQuiz}
            onAnswer={handlePreHintAnswer}
            disabled={isPreHintPassed}
          />
        </div>
      )}

      {/* PHA 5: GỢI Ý & THÁO GỠ KHÓ KHĂN + NÚT TIẾP TỤC */}
      {isPreHintPassed && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 md:p-5 shadow-xs animate-fadeIn">
          <div className="font-bold text-emerald-950 text-sm md:text-base flex items-center gap-2 mb-2">
            <Lightbulb className="w-5 h-5 text-emerald-600" />
            💡 Gợi ý & Tháo gỡ khó khăn
          </div>
          <div className="text-sm text-emerald-900 mb-4 leading-relaxed">
            <MathView content={step.hintCard} />
          </div>

          <button
            onClick={handleAdvance}
            className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm md:text-base rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLastStepOfLastPart ? (
              <>
                <span>🎉</span> XEM BÁO CÁO HỌC TẬP
              </>
            ) : (
              <>
                <span>Chuyển sang Bước tiếp theo</span>
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { PolyaProcess, Student, Attempt, AnswerEvent } from '../shared/types.ts';
import { StepContainer } from '../components/StepContainer.tsx';
import { LearningReport } from '../components/LearningReport.tsx';
import { ProblemPanel } from '../components/ProblemPanel.tsx';
import { partLabel } from '../shared/labels.ts';
import { CheckCircle2, Lock } from 'lucide-react';

interface WorkspacePageProps {
  process: PolyaProcess;
  student: Student;
  onGoToLibrary: () => void;
  onNewProblem: () => void;
}

export const WorkspacePage: React.FC<WorkspacePageProps> = ({
  process,
  student,
  onGoToLibrary,
  onNewProblem,
}) => {
  const [activePartIndex, setActivePartIndex] = useState(0);
  const [activeStepNo, setActiveStepNo] = useState<1 | 2 | 3 | 4>(1);
  const [unlockedStepNo, setUnlockedStepNo] = useState<number>(1);
  const [unlockedPartIndex, setUnlockedPartIndex] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState(false);

  // Attempt state
  const [attempt, setAttempt] = useState<Attempt>(() => ({
    id: 'att_' + Math.random().toString(36).substring(2, 11),
    studentId: student.id,
    processId: process.id,
    attemptNo: 1,
    startedAt: new Date().toISOString(),
    status: 'in_progress',
    score: 10,
    wrongTotal: 0,
    wrongByStep: { step_1: 0, step_2: 0, step_3: 0, step_4: 0 },
    timeByStep: { step_1: 0, step_2: 0, step_3: 0, step_4: 0 },
    reflections: {},
    progress: {
      currentPartIndex: 0,
      currentStepNo: 1,
      completedInteractions: [],
      completedPreHints: [],
      currentPhase: 'main',
    },
  }));

  const answersLogRef = useRef<Map<string, { weight: number; earned: number }>>(new Map());
  const timerRef = useRef<number>(Date.now());

  // Save attempt to server
  const saveAttemptToServer = async (currentAttempt: Attempt) => {
    try {
      await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentAttempt),
      });
    } catch {
      // silent failover
    }
  };

  const handleRecordAnswer = (
    interactionId: string,
    answer: string,
    isCorrect: boolean,
    tryNo: number,
    hintLevel: number,
    phase: 'main' | 'prehint'
  ) => {
    const currentPart = process.parts[activePartIndex];
    const event: AnswerEvent = {
      id: 'evt_' + Math.random().toString(36).substring(2, 11),
      attemptId: attempt.id,
      studentId: student.id,
      processId: process.id,
      dangBai: currentPart.dangBai,
      partLabel: currentPart.label,
      stepNo: activeStepNo,
      phase,
      interactionId,
      answer,
      isCorrect,
      tryNo,
      hintLevelShown: hintLevel,
      usedModelSolution: false,
      timestamp: new Date().toISOString(),
    };

    // Log answer event
    fetch('/api/answer-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }).catch(() => {});

    // Update attempt score and wrong count
    if (!isCorrect) {
      setAttempt((prev) => {
        const stepKey = `step_${activeStepNo}`;
        const updated = {
          ...prev,
          wrongTotal: prev.wrongTotal + 1,
          wrongByStep: {
            ...prev.wrongByStep,
            [stepKey]: (prev.wrongByStep[stepKey] || 0) + 1,
          },
        };
        saveAttemptToServer(updated);
        return updated;
      });
    }

    // Scoring weights: Section 12
    const weight = activeStepNo === 3 ? 2 : 1;
    let factor = 1.0;
    if (tryNo === 1) factor = 1.0;
    else if (tryNo === 2) factor = 0.7;
    else if (tryNo === 3) factor = 0.4;
    else if (tryNo === 4) factor = 0.2;
    else factor = 0.1;

    answersLogRef.current.set(interactionId, { weight, earned: weight * factor });
  };

  const handleSaveReflection = (stepNo: number, text: string) => {
    setAttempt((prev) => {
      const updated = {
        ...prev,
        reflections: {
          ...prev.reflections,
          [stepNo]: text,
        },
      };
      saveAttemptToServer(updated);
      return updated;
    });
  };

  const handleStepComplete = () => {
    // Record step duration
    const stepDuration = Math.round((Date.now() - timerRef.current) / 1000);
    timerRef.current = Date.now();

    setAttempt((prev) => ({
      ...prev,
      timeByStep: {
        ...prev.timeByStep,
        [`step_${activeStepNo}`]: (prev.timeByStep[`step_${activeStepNo}`] || 0) + stepDuration,
      },
    }));

    if (activeStepNo < 4) {
      const nextStep = (activeStepNo + 1) as 1 | 2 | 3 | 4;
      setUnlockedStepNo((prev) => Math.max(prev, nextStep));
      setActiveStepNo(nextStep);
    } else {
      // Completed Step 4 of current part
      if (activePartIndex < process.parts.length - 1) {
        // Unlock next part!
        const nextPart = activePartIndex + 1;
        setUnlockedPartIndex(nextPart);
        setActivePartIndex(nextPart);
        setActiveStepNo(1);
        setUnlockedStepNo(1);
      } else {
        // Final completion! Calculate total score
        let totalWeight = 0;
        let totalEarned = 0;
        answersLogRef.current.forEach((val) => {
          totalWeight += val.weight;
          totalEarned += val.earned;
        });

        const finalScore = totalWeight > 0 ? Math.round((totalEarned / totalWeight) * 10 * 10) / 10 : 10;
        const finishedAttempt: Attempt = {
          ...attempt,
          status: 'completed',
          score: finalScore,
          finishedAt: new Date().toISOString(),
        };

        setAttempt(finishedAttempt);
        saveAttemptToServer(finishedAttempt);
        setIsCompleted(true);
      }
    }
  };

  if (isCompleted) {
    return (
      <LearningReport
        attempt={attempt}
        student={student}
        process={process}
        onRetry={() => {
          setIsCompleted(false);
          setActivePartIndex(0);
          setActiveStepNo(1);
          setUnlockedStepNo(1);
        }}
        onGoToLibrary={onGoToLibrary}
      />
    );
  }

  const currentPart = process.parts[activePartIndex];
  const currentStep = currentPart.steps[activeStepNo - 1];
  const isLastPart = activePartIndex === process.parts.length - 1;
  const isLastStepOfLastPart = isLastPart && activeStepNo === 4;

  const stepLabels = [
    { no: 1, full: 'Bước 1: Tìm hiểu đề', short: 'B1 · Tìm hiểu' },
    { no: 2, full: 'Bước 2: Xây dựng kế hoạch', short: 'B2 · Kế hoạch' },
    { no: 3, full: 'Bước 3: Trình bày lời giải', short: 'B3 · Lời giải' },
    { no: 4, full: 'Bước 4: Kiểm tra & Nhận xét', short: 'B4 · Kiểm tra' },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="space-y-4">
        {/* ĐỀ BÀI – luôn hiển thị từ đầu đến khi kết thúc bài làm */}
        <ProblemPanel
          sticky
          problemText={process.problemText}
          parts={process.parts}
          activeLabel={currentPart.label}
          sourceChart={process.sourceChart}
        />

        {/* Các ý của đề (nếu có nhiều ý) */}
        {process.parts.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-blue-100 shadow-xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider px-2">Các ý:</span>
            {process.parts.map((p, pIdx) => {
              const isPartUnlocked = pIdx <= unlockedPartIndex;
              const isActive = pIdx === activePartIndex;
              return (
                <button
                  key={p.label}
                  onClick={() => {
                    if (isPartUnlocked) {
                      setActivePartIndex(pIdx);
                      setActiveStepNo(1);
                    }
                  }}
                  disabled={!isPartUnlocked}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : isPartUnlocked
                      ? 'bg-slate-100 text-slate-700 hover:bg-blue-50'
                      : 'bg-slate-50 text-slate-400 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <span>Ý {p.label})</span>
                  <span className={`hidden sm:inline font-normal ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                    {partLabel(p.dangBai, p.askKind)}
                  </span>
                  {isPartUnlocked ? (
                    pIdx < unlockedPartIndex ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : null
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
              );
            })}
            <span className="ml-auto text-xs text-slate-500 px-2 hidden md:inline">
              Học sinh: <strong className="text-slate-800">{student.name}</strong> · {student.className}
            </span>
          </div>
        )}

        {/* Ý chưa có quy trình (app không tự sinh để tránh hướng dẫn sai) */}
        {(process.skippedParts || []).length > 0 && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-700">
            ⏭️ {process.skippedParts!.map((s) => `Ý ${s.label})`).join(', ')} chưa có quy trình hướng dẫn trong ứng dụng – em hỏi thầy/cô cách làm ý này nhé.
          </div>
        )}

        {/* 4 Polya Step Navigation Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-2 rounded-2xl border border-blue-100 shadow-xs">
          {stepLabels.map((st) => {
            const isUnlocked = st.no <= unlockedStepNo;
            const isActive = st.no === activeStepNo;
            const isDone = st.no < unlockedStepNo;

            return (
              <button
                key={st.no}
                onClick={() => {
                  if (isUnlocked) setActiveStepNo(st.no as 1 | 2 | 3 | 4);
                }}
                disabled={!isUnlocked}
                className={`p-2.5 sm:p-3 rounded-xl text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : isDone
                    ? 'bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-200'
                    : isUnlocked
                    ? 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    : 'bg-slate-50 text-slate-400 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className={`font-bold ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                    Bước {st.no}
                  </span>
                  {isDone ? (
                    <CheckCircle2 className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-green-600'}`} />
                  ) : !isUnlocked ? (
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  ) : null}
                </div>
                <div className="text-xs sm:text-sm font-semibold truncate">
                  <span className="sm:hidden">{st.short}</span>
                  <span className="hidden sm:inline">{st.full.replace(`Bước ${st.no}: `, '')}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Current Part Question Prompt */}
        <div className="bg-white rounded-2xl border border-blue-100 shadow-xs p-4 md:p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 bg-blue-600 text-white rounded-md text-xs font-bold">
              Ý {currentPart.label})
            </span>
            <span className="text-sm md:text-base font-bold text-blue-950">
              {currentPart.question}
            </span>
          </div>

          {/* Active Step Content */}
          <StepContainer
            key={`${currentPart.label}-step-${activeStepNo}`}
            step={currentStep}
            isCurrentStep={true}
            isUnlocked={activeStepNo <= unlockedStepNo}
            isLastStepOfLastPart={isLastStepOfLastPart}
            onStepComplete={handleStepComplete}
            onRecordAnswer={handleRecordAnswer}
            onSaveReflection={handleSaveReflection}
            initialReflection={attempt.reflections?.[activeStepNo] || ''}
          />
        </div>
      </div>
    </div>
  );
};

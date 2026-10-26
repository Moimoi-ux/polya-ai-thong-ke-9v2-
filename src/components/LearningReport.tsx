import React from 'react';
import { Attempt, Student, PolyaProcess } from '../shared/types.ts';
import { Award, Star, Clock, AlertCircle, RotateCcw, BookOpen, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { ProblemPanel } from './ProblemPanel.tsx';

interface LearningReportProps {
  attempt: Attempt;
  student: Student;
  process: PolyaProcess;
  onRetry: () => void;
  onGoToLibrary: () => void;
}

export const LearningReport: React.FC<LearningReportProps> = ({
  attempt,
  student,
  process,
  onRetry,
  onGoToLibrary,
}) => {
  React.useEffect(() => {
    confetti({ particleCount: 70, spread: 80, origin: { y: 0.6 } });
  }, []);

  const score = attempt.score;
  const stars = score >= 9 ? 3 : score >= 7 ? 2 : score >= 5 ? 1 : 0;

  // Calculate total seconds
  const totalSeconds = Object.values(attempt.timeByStep || {}).reduce((a, b) => a + b, 0) || 120;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl border border-blue-100 p-6 md:p-8 animate-scaleUp">
      {/* Header Banner */}
      <div className="text-center pb-6 border-b border-slate-100">
        <div className="inline-flex p-3 bg-amber-100 text-amber-600 rounded-full mb-3">
          <Award className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-black text-blue-950">BÁO CÁO HỌC TẬP HOÀN THÀNH</h2>
        <p className="text-sm text-slate-500 mt-1">
          Học sinh: <span className="font-bold text-slate-800">{student.name}</span> • Lớp: <span className="font-bold text-slate-800">{student.className}</span> • {student.school}
        </p>
      </div>

      {/* Đề bài đã giải */}
      <div className="mt-6">
        <ProblemPanel
          heading="Đề bài đã giải"
          problemText={process.problemText}
          parts={process.parts}
          sourceChart={process.sourceChart}
        />
      </div>

      {/* Score & Stars Display */}
      <div className="my-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
        <div className="p-4 bg-blue-50/80 rounded-xl border border-blue-100">
          <div className="text-xs font-semibold text-blue-600 uppercase">Điểm số tổng kết</div>
          <div className="text-3xl font-black text-blue-900 mt-1">
            {score.toFixed(1)} <span className="text-base font-normal text-slate-500">/ 10</span>
          </div>
        </div>

        <div className="p-4 bg-amber-50/80 rounded-xl border border-amber-100">
          <div className="text-xs font-semibold text-amber-600 uppercase">Xếp hạng danh hiệu</div>
          <div className="flex justify-center items-center gap-1 mt-2">
            {[1, 2, 3].map((s) => (
              <Star
                key={s}
                className={`w-6 h-6 ${
                  s <= stars ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="p-4 bg-purple-50/80 rounded-xl border border-purple-100">
          <div className="text-xs font-semibold text-purple-600 uppercase">Tổng thời gian</div>
          <div className="text-2xl font-bold text-purple-900 mt-1 flex items-center justify-center gap-1">
            <Clock className="w-5 h-5 text-purple-600" />
            {minutes}p {seconds}s
          </div>
        </div>
      </div>

      {/* Step mistakes breakdown bar chart */}
      <div className="my-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">
          Phân tích số lần sai theo từng bước Pólya:
        </h4>
        <div className="grid grid-cols-4 gap-3 text-center">
          {[1, 2, 3, 4].map((stepNo) => {
            const mistakes = attempt.wrongByStep?.[`step_${stepNo}`] || 0;
            return (
              <div key={stepNo} className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <div className="text-xs text-slate-500 font-medium">B{stepNo}</div>
                <div className={`text-base font-bold my-0.5 ${mistakes === 0 ? 'text-green-600' : 'text-amber-600'}`}>
                  {mistakes} lỗi
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-1">
                  <div
                    className={`h-full ${mistakes === 0 ? 'bg-green-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, (mistakes + 1) * 30)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reflections Summary */}
      {attempt.reflections && Object.keys(attempt.reflections).length > 0 && (
        <div className="my-6 p-4 bg-purple-50/50 rounded-xl border border-purple-200">
          <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wider mb-2">
            Ghi chép phản tư của em:
          </h4>
          <div className="space-y-2">
            {Object.entries(attempt.reflections).map(([sKey, refText]) => (
              <div key={sKey} className="text-xs md:text-sm text-purple-950 bg-white p-2.5 rounded-lg border border-purple-100">
                <span className="font-bold text-purple-700">Bước {sKey}: </span>
                "{refText}"
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="pt-4 flex flex-col sm:flex-row gap-3">
        <button
          onClick={onRetry}
          className="flex-1 py-3 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 border border-blue-200 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          Làm lại quy trình này
        </button>

        <button
          onClick={onGoToLibrary}
          className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
        >
          <BookOpen className="w-4 h-4" />
          Về Thư viện bài tập
        </button>
      </div>
    </div>
  );
};

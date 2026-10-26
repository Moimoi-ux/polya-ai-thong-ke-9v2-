import React, { useState, useEffect } from 'react';
import { ProblemAnalysis, PolyaProcess } from '../shared/types.ts';
import { MathView } from '../components/MathView.tsx';
import { RobotMascot } from '../components/RobotMascot.tsx';
import { ReferenceChartView } from '../components/charts/ReferenceChartView.tsx';
import { calculateNiceAxis, computeStatistics } from '../shared/statEngine.ts';
import { normalizeProblemText } from '../shared/problemText.ts';
import { partLabel } from '../shared/labels.ts';
import { Check, Edit3, RotateCw, AlertTriangle, ArrowRight } from 'lucide-react';

interface ConfirmProblemPageProps {
  analysis: ProblemAnalysis;
  imageUrl?: string;
  onConfirmSuccess: (processId: string) => void;
  onBackToInput: () => void;
}

export const ConfirmProblemPage: React.FC<ConfirmProblemPageProps> = ({
  analysis: initialAnalysis,
  imageUrl,
  onConfirmSuccess,
  onBackToInput,
}) => {
  const [analysis, setAnalysis] = useState<ProblemAnalysis>(initialAnalysis);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(initialAnalysis.problemText);
  const [isReAnalyzing, setIsReAnalyzing] = useState(false);

  // Generation Job State
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobStatus, setJobStatus] = useState<string>('pending');
  const [jobMessage, setJobMessage] = useState<string>('Đang khởi tạo...');
  const [genError, setGenError] = useState<string | null>(null);

  // Kiểm tra cỡ mẫu đề nêu có khớp với số liệu không (áp dụng cho cả dãy số liệu lẫn bảng/biểu đồ tần số).
  // Không hiện con số đếm được để không lộ đáp án cho học sinh.
  const mismatchInfo = React.useMemo(() => {
    try {
      const c = computeStatistics(analysis);
      if (analysis.statedSampleSize > 0 && c.sampleSize > 0 && analysis.statedSampleSize !== c.sampleSize) {
        return { stated: analysis.statedSampleSize };
      }
    } catch {
      /* bỏ qua */
    }
    return null;
  }, [analysis]);
  const hasMismatchWarning = !!mismatchInfo;
  const [ackMismatch, setAckMismatch] = useState(false);
  const [storageNote, setStorageNote] = useState<string | null>(null);

  const handleReAnalyze = async () => {
    setIsReAnalyzing(true);
    setGenError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editedText }),
      });
      const data = await res.json();
      if (data.ok && data.data) {
        setAnalysis(data.data);
        setAckMismatch(false);
        setIsEditing(false);
      } else {
        setGenError(data.error?.message || 'Không thể đọc lại đề. Em hãy kiểm tra nội dung.');
      }
    } catch {
      setGenError('Lỗi kết nối khi đọc lại đề.');
    } finally {
      setIsReAnalyzing(false);
    }
  };

  const handleStartProcess = async () => {
    setIsGenerating(true);
    setGenError(null);

    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis,
          // Không gửi lại ảnh/PDF: máy chủ không lưu ảnh (tránh vượt giới hạn 1 MB của Firestore)
        }),
      });

      const data = await res.json();
      if (!data.ok || !data.data) {
        setGenError(data.error?.message || 'Không thể khởi tạo quy trình giải.');
        setIsGenerating(false);
        return;
      }

      if (data.data.cached && data.data.processId) {
        // Instant CACHE HIT!
        onConfirmSuccess(data.data.processId);
        return;
      }

      // Poll job status every 1.5s
      const jobId = data.data.jobId;
      pollJob(jobId);
    } catch (err: any) {
      setGenError('Lỗi kết nối máy chủ.');
      setIsGenerating(false);
    }
  };

  const pollJob = (jobId: string) => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data = await res.json();
        if (data.ok && data.data) {
          const job = data.data;
          setJobStatus(job.status);
          setJobMessage(job.message || 'Đang xử lý...');

          if (job.status === 'completed' && job.processId) {
            clearInterval(timer);
            if (job.storageWarning) {
              setStorageNote(job.storageWarning);
              setTimeout(() => onConfirmSuccess(job.processId), 4000);
            } else {
              onConfirmSuccess(job.processId);
            }
          } else if (job.status === 'failed') {
            clearInterval(timer);
            setGenError(job.error || 'Tạo quy trình thất bại.');
            setIsGenerating(false);
          }
        }
      } catch {
        // retry on next tick
      }
    }, 1500);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Title */}
      <div className="bg-white rounded-2xl border border-blue-100 p-6 md:p-8 shadow-sm space-y-5">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-xl md:text-2xl font-black text-blue-950">
              Đây có phải đề bài của em không?
            </h2>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              Kiểm tra kỹ số liệu và các câu hỏi trước khi AI dựng quy trình giải 4 bước Pólya.
            </p>
          </div>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="px-3.5 py-1.5 border border-slate-300 hover:border-blue-400 text-slate-700 hover:text-blue-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEditing ? 'Đóng sửa' : 'Chỉnh sửa đề'}</span>
          </button>
        </div>

        {/* Warning banner without leaking answers (Section 3) */}
        {hasMismatchWarning && (
          <div className="p-3.5 bg-amber-50 border border-amber-300 text-amber-900 text-xs md:text-sm rounded-xl flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="space-y-2">
              <div>
                <strong>Số liệu chưa khớp:</strong> đề nêu cỡ mẫu là <strong>{mismatchInfo?.stated}</strong> nhưng tổng số
                giá trị (tổng các tần số) đọc được lại khác. Có thể máy đọc sai, hoặc chính đề bài có lỗi số liệu.
                Em/thầy cô hãy bấm <em>Chỉnh sửa đề</em> để sửa lại cho đúng.
              </div>
              <label className="flex items-center gap-2 font-semibold cursor-pointer">
                <input type="checkbox" checked={ackMismatch} onChange={(e) => setAckMismatch(e.target.checked)} />
                Tôi đã kiểm tra, vẫn giữ nguyên số liệu này (Bước 4 sẽ yêu cầu học sinh phát hiện chỗ chưa khớp).
              </label>
            </div>
          </div>
        )}

        {/* Edit mode textarea */}
        {isEditing ? (
          <div className="space-y-3">
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              rows={8}
              className="w-full p-4 border border-blue-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={handleReAnalyze}
                disabled={isReAnalyzing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs md:text-sm font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCw className={`w-4 h-4 ${isReAnalyzing ? 'animate-spin' : ''}`} />
                <span>{isReAnalyzing ? 'Đang đọc lại...' : 'Đọc lại đề bài'}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Rendered problem view with LaTeX & Tables */
          <div className="p-5 bg-slate-50/70 border border-slate-200 rounded-xl text-slate-900 leading-relaxed">
            <MathView content={normalizeProblemText(analysis.problemText)} />
          </div>
        )}

        {/* Biểu đồ đề cho: dựng lại từ số liệu máy đọc được để em đối chiếu */}
        {!isEditing &&
          analysis.sourceKind === 'freq_chart' &&
          analysis.categories?.length > 0 &&
          analysis.categories.length === analysis.frequencies?.length && (
            <ReferenceChartView
              chart={{
                kind: analysis.sourceChartKind === 'line' ? 'line' : 'bar',
                title: analysis.chartTitle || 'Biểu đồ trong đề',
                xAxisLabel: analysis.valueLabel || 'Giá trị',
                yAxisLabel: analysis.freqLabel || 'Tần số',
                categories: analysis.categories,
                values: analysis.frequencies.map((f) => f ?? 0),
                axisConfig: calculateNiceAxis(Math.max(...analysis.frequencies.map((f) => f ?? 0))),
                caption: 'Máy đã đọc biểu đồ như sau – em kiểm tra chiều cao các cột/điểm có khớp với đề không nhé.',
              }}
            />
          )}

        {/* Parts breakdown preview */}
        {analysis.parts && analysis.parts.length > 0 && (
          <div className="pt-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Các ý cần giải ({analysis.parts.length} ý):
            </span>
            <div className="space-y-2">
              {analysis.parts.map((p, idx) => (
                <div key={idx} className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg flex items-center justify-between text-xs md:text-sm">
                  <div className="font-medium text-blue-900">
                    <span className="font-bold">Ý {p.label})</span> {p.question}
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded font-semibold text-xs whitespace-nowrap ${
                        p.codeStatus === 'unsupported' ? 'bg-slate-200 text-slate-600' : 'bg-blue-200 text-blue-800'
                      }`}
                      title={p.codeNote || ''}
                    >
                      {p.codeStatus === 'unsupported' ? 'Chưa hỗ trợ – sẽ bỏ qua' : partLabel(p.dangBai, p.askKind)}
                    </span>
                    {p.codeStatus === 'needs_review' && (
                      <span className="px-2 py-0.5 rounded text-[11px] bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap" title={p.codeNote || ''}>
                        GV nên duyệt
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {storageNote && (
          <div className="p-3 bg-amber-50 text-amber-900 text-xs md:text-sm rounded-lg border border-amber-300">
            ⚠️ {storageNote}
          </div>
        )}

        {genError && (
          <div className="p-3 bg-red-50 text-red-700 text-xs md:text-sm rounded-lg border border-red-200">
            {genError}
          </div>
        )}

        {/* Generation Progress Display */}
        {isGenerating ? (
          <div className="p-6 bg-blue-50/80 border border-blue-200 rounded-xl text-center space-y-4 animate-fadeIn">
            <RobotMascot mood="thinking" className="justify-center" />
            <div>
              <div className="font-bold text-blue-900 text-base">{jobMessage}</div>
              <div className="text-xs text-slate-500 mt-1">
                Giai đoạn: {jobStatus === 'building' ? 'Đang dựng quy trình ➔' : jobStatus === 'polishing' ? 'Đang viết lời hướng dẫn ➔' : jobStatus === 'verifying' ? 'Đang kiểm tra tính nhất quán ➔' : 'Hoàn tất 🎉'}
              </div>
            </div>
            {/* Real Progress Bar */}
            <div className="w-full bg-blue-200/70 h-2.5 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-500 rounded-full"
                style={{
                  width:
                    jobStatus === 'building'
                      ? '35%'
                      : jobStatus === 'polishing'
                      ? '70%'
                      : jobStatus === 'verifying'
                      ? '90%'
                      : '100%',
                }}
              />
            </div>
          </div>
        ) : (
          /* Confirmation buttons */
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3">
            <button
              onClick={onBackToInput}
              className="w-full sm:w-auto px-4 py-2.5 text-slate-600 hover:text-slate-900 text-xs md:text-sm font-medium transition-colors"
            >
              ← Quay lại nhập đề khác
            </button>

            <button
              onClick={handleStartProcess}
              disabled={hasMismatchWarning && !ackMismatch}
              title={hasMismatchWarning && !ackMismatch ? 'Hãy sửa đề hoặc đánh dấu đã kiểm tra số liệu' : undefined}
              className="w-full sm:w-auto px-7 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-sm md:text-base rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-5 h-5" />
              <span>Đúng rồi, tạo quy trình ngay</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

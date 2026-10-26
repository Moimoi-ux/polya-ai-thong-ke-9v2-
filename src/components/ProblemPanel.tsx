import React, { useEffect, useMemo, useState } from 'react';
import { ReferenceChart } from '../shared/types.ts';
import { MathView } from './MathView.tsx';
import { ReferenceChartView } from './charts/ReferenceChartView.tsx';
import { partLabel } from '../shared/labels.ts';
import { normalizeProblemText, problemPreview } from '../shared/problemText.ts';
import { FileText, ChevronUp, ChevronDown, Maximize2, X } from 'lucide-react';

interface ProblemPanelProps {
  problemText: string;
  parts: { label: string; question: string; dangBai: string; askKind?: string }[];
  /** Nhãn ý đang làm (VD "a", "b.1") – để tô sáng trong đề */
  activeLabel?: string;
  sourceChart?: ReferenceChart;
  /** Dính trên đầu trang khi cuộn (dùng trong lúc làm bài) */
  sticky?: boolean;
  defaultCollapsed?: boolean;
  heading?: string;
}

interface Segment {
  text: string;
  label?: string; // "a", "b"... nếu đoạn là dòng câu hỏi của một ý
}

/** Tách đề thành các đoạn; mỗi dòng bắt đầu bằng "a)", "b)"... là một đoạn riêng để tô sáng */
function splitSegments(problemText: string): Segment[] {
  const lines = normalizeProblemText(problemText || '').split('\n');
  const segs: Segment[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) segs.push({ text: buf.join('\n') });
    buf = [];
  };
  for (const line of lines) {
    const m = line.match(/^\s*(?:\*\*)?\s*([a-dA-D])\s*\)/);
    if (m) {
      flush();
      segs.push({ text: line, label: m[1].toLowerCase() });
    } else {
      buf.push(line);
    }
  }
  flush();
  return segs;
}

const baseLabel = (label?: string) => (label || '').trim().toLowerCase().replace(/\)$/, '').split('.')[0];

export const ProblemPanel: React.FC<ProblemPanelProps> = ({
  problemText,
  parts,
  activeLabel,
  sourceChart,
  sticky = false,
  defaultCollapsed = false,
  heading = 'Đề bài',
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [fullscreen, setFullscreen] = useState(false);
  const segments = useMemo(() => splitSegments(problemText), [problemText]);
  const activeBase = baseLabel(activeLabel);
  const activePart = parts.find((p) => p.label === activeLabel);
  const hasLabeledLines = segments.some((s) => s.label);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  const renderBody = (large: boolean) => (
    <div className={large ? 'text-base md:text-xl leading-relaxed text-slate-900' : 'text-sm md:text-[15px] leading-relaxed text-slate-800'}>
      {segments.map((seg, i) => {
        const isActive = !!seg.label && seg.label === activeBase && !!activeBase;
        return (
          <div
            key={i}
            className={
              seg.label
                ? `my-1 rounded-lg px-2 py-1 -mx-2 transition-colors ${
                    isActive ? 'bg-amber-100 ring-1 ring-amber-300 font-semibold text-slate-900' : ''
                  }`
                : ''
            }
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <MathView content={seg.text} />
              </div>
              {isActive && (
                <span className="shrink-0 mt-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white whitespace-nowrap">
                  ◀ đang làm
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const activeBadge = activePart && (
    <span className="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md whitespace-nowrap">
      Ý {activePart.label}) · {partLabel(activePart.dangBai, activePart.askKind)}
    </span>
  );

  const panel = (
    <div className="bg-white rounded-2xl border-2 border-blue-200 shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-blue-50/80 border-b border-blue-100">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <FileText className="w-4 h-4 text-blue-700 shrink-0" />
          <span className="text-xs font-black text-blue-900 uppercase tracking-wider">{heading}</span>
          {activeBadge}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setFullscreen(true)}
            className="px-2 py-1.5 rounded-lg text-xs font-semibold text-blue-700 hover:bg-blue-100 flex items-center gap-1 cursor-pointer"
            title="Phóng to đề bài"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Phóng to</span>
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="px-2 py-1.5 rounded-lg text-xs font-semibold text-blue-700 hover:bg-blue-100 flex items-center gap-1 cursor-pointer"
            title={collapsed ? 'Mở rộng đề bài' : 'Thu gọn đề bài'}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            <span className="hidden sm:inline">{collapsed ? 'Mở rộng' : 'Thu gọn'}</span>
          </button>
        </div>
      </div>

      {/* Body */}
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="w-full text-left px-4 py-2 text-sm text-slate-700 truncate cursor-pointer hover:bg-slate-50"
        >
          {activePart ? (
            <>
              <strong className="text-amber-700">Ý {activePart.label}):</strong> {activePart.question}
            </>
          ) : (
            problemPreview(problemText || '', 160)
          )}
        </button>
      ) : (
        <div className={`px-4 py-3 overflow-y-auto ${sticky ? 'max-h-[32vh] md:max-h-[40vh]' : ''}`}>
          {renderBody(false)}
          {/* Đề không đánh nhãn ý → nhắc câu hỏi đang làm */}
          {!hasLabeledLines && activePart && parts.length > 1 && (
            <div className="mt-2 px-2 py-1 rounded-lg bg-amber-100 ring-1 ring-amber-300 text-sm font-semibold">
              ◀ Đang làm: {activePart.question}
            </div>
          )}
          {sourceChart && (
            <div className="mt-3 max-w-md">
              <ReferenceChartView chart={sourceChart} compact />
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {sticky ? <div className="sticky top-16 z-20 -mx-1 px-1 pt-2 pb-1 bg-slate-50">{panel}</div> : panel}

      {/* Phóng to toàn màn hình */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-start md:items-center justify-center p-3 md:p-8" onClick={() => setFullscreen(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-full overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Đề bài phóng to"
          >
            <div className="sticky top-0 bg-white flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2 flex-wrap">
                <FileText className="w-5 h-5 text-blue-700" />
                <span className="font-black text-blue-900 uppercase tracking-wider">{heading}</span>
                {activeBadge}
              </div>
              <button
                onClick={() => setFullscreen(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 md:px-8 py-5">
              {renderBody(true)}
              {sourceChart && (
                <div className="mt-5">
                  <ReferenceChartView chart={sourceChart} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

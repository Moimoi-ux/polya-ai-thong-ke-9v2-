import React, { useState, useEffect } from 'react';
import { PolyaProcess, Student, Attempt } from '../shared/types.ts';
import { problemPreview } from '../shared/problemText.ts';
import { IN_SCOPE_CODES, dangBaiLabel } from '../shared/labels.ts';
import { BookOpen, Search, CheckCircle2, RotateCcw, Filter, Star, Eye } from 'lucide-react';

interface LibraryPageProps {
  student: Student | null;
  onSelectProcess: (processId: string) => void;
  onNewProblem: () => void;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({
  student,
  onSelectProcess,
  onNewProblem,
}) => {
  const [processes, setProcesses] = useState<PolyaProcess[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'my'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<'all' | 'TS1' | 'CHART' | 'TS4'>('all');

  useEffect(() => {
    fetchProcesses();
    if (student) {
      fetchStudentAttempts(student.id);
    }
  }, [student]);

  const fetchProcesses = async () => {
    try {
      const res = await fetch('/api/processes');
      const data = await res.json();
      if (data.ok && data.data) {
        setProcesses(data.data);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStudentAttempts = async (studentId: string) => {
    try {
      const res = await fetch(`/api/attempts/student/${studentId}`);
      const data = await res.json();
      if (data.ok && data.data) {
        setAttempts(data.data);
      }
    } catch {}
  };

  // Map highest score per process for this student
  const bestScoresMap = new Map<string, number>();
  attempts.forEach((a) => {
    if (a.status === 'completed') {
      const curr = bestScoresMap.get(a.processId) || 0;
      if (a.score > curr) bestScoresMap.set(a.processId, a.score);
    }
  });

  // Chỉ giữ các quy trình thuộc Bài 22 (bỏ các đề tần số tương đối / ghép nhóm cũ)
  // Cùng một đề (cùng textHash) có thể có nhiều phiên bản quy trình → chỉ hiện bản mới nhất
  const newestByText = new Map<string, PolyaProcess>();
  for (const p of processes) {
    const key = p.textHash || p.id;
    const cur = newestByText.get(key);
    if (!cur || String(p.createdAt || '') > String(cur.createdAt || '')) newestByText.set(key, p);
  }
  const inScopeProcesses = Array.from(newestByText.values())
    .filter((p) => Array.isArray(p.parts) && p.parts.length > 0 && p.parts.every((part) => IN_SCOPE_CODES.includes(part.dangBai)))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  // Filter processes
  const filtered = inScopeProcesses.filter((p) => {
    // Search match
    const matchSearch = (p.problemText || '').toLowerCase().includes(searchTerm.toLowerCase());

    // Topic filter
    let matchTopic = true;
    if (selectedTopic !== 'all') {
      const codes = selectedTopic === 'CHART' ? ['TS2', 'TS3'] : selectedTopic === 'TS4' ? ['TS4', 'TS5', 'TS6'] : [selectedTopic];
      matchTopic = p.parts.some((part) => codes.includes(part.dangBai));
    }

    // My problems tab
    let matchTab = true;
    if (activeTab === 'my') {
      matchTab = bestScoresMap.has(p.id);
    }

    return matchSearch && matchTopic && matchTab;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 md:p-6 rounded-2xl border border-blue-100 shadow-xs">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-blue-950 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-600" />
            Thư viện đề Bài 22: Bảng tần số và biểu đồ tần số
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Kho lưu trữ các đề bài đã được số hóa và chuẩn hóa 4 bước George Pólya.
          </p>
        </div>

        <button
          onClick={onNewProblem}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-md cursor-pointer shrink-0"
        >
          + Thêm đề bài mới
        </button>
      </div>

      {/* Tabs and Filters */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Tab switch */}
        <div className="flex bg-slate-200/80 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'all' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tất cả đề ({inScopeProcesses.length})
          </button>
          <button
            onClick={() => setActiveTab('my')}
            className={`px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'my' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Bài của em ({bestScoresMap.size})
          </button>
        </div>

        {/* Topic filter chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 text-xs font-semibold">
          <span className="text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Lọc:
          </span>
          <button
            onClick={() => setSelectedTopic('all')}
            className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              selectedTopic === 'all'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
            }`}
          >
            Tất cả
          </button>
          <button
            onClick={() => setSelectedTopic('TS1')}
            className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              selectedTopic === 'TS1'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
            }`}
          >
            Lập bảng tần số
          </button>
          <button
            onClick={() => setSelectedTopic('CHART')}
            className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              selectedTopic === 'CHART'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
            }`}
          >
            Vẽ biểu đồ tần số
          </button>
          <button
            onClick={() => setSelectedTopic('TS4')}
            className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              selectedTopic === 'TS4'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
            }`}
          >
            Đọc – phân tích
          </button>
        </div>

        {/* Search input */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm kiếm nội dung đề..."
            className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs md:text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Process list */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Đang tải thư viện bài tập...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="font-bold text-slate-700 text-base">Không tìm thấy bài tập phù hợp</div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Em có thể bấm "+ Thêm đề bài mới" ở trên để số hóa bài toán thống kê bất kỳ.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((proc) => {
            const hasCompleted = bestScoresMap.has(proc.id);
            const bestScore = bestScoresMap.get(proc.id);

            return (
              <div
                key={proc.id}
                className="bg-white rounded-2xl border border-blue-100 hover:border-blue-300 p-5 shadow-xs transition-all flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {proc.parts.map((part) => (
                        <span
                          key={part.label}
                          className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 text-2xs font-bold rounded-md"
                        >
                          Ý {part.label}: {dangBaiLabel(part.dangBai)}
                        </span>
                      ))}
                    </div>

                    {hasCompleted && (
                      <span className="shrink-0 px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-md text-2xs font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-green-600" />
                        Điểm cao nhất: {bestScore?.toFixed(1)}/10
                      </span>
                    )}
                  </div>

                  <div className="text-xs md:text-sm text-slate-800 line-clamp-4 leading-relaxed">
                    {problemPreview(proc.problemText)}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    {proc.parts.length} ý câu hỏi • {proc.aiPolished ? 'AI viết lời' : 'Lời chuẩn'}
                  </span>

                  <button
                    onClick={() => onSelectProcess(proc.id)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    {hasCompleted ? 'Làm lại quy trình' : 'Bắt đầu học ➔'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

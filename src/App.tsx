import React, { useState, useEffect } from 'react';
import { ProblemAnalysis, PolyaProcess, Student } from './shared/types.ts';
import { InputProblemPage } from './pages/InputProblemPage.tsx';
import { ConfirmProblemPage } from './pages/ConfirmProblemPage.tsx';
import { WorkspacePage } from './pages/WorkspacePage.tsx';
import { LibraryPage } from './pages/LibraryPage.tsx';
import { TeacherPage } from './pages/TeacherPage.tsx';
import { StudentModal } from './components/StudentModal.tsx';
import { BookOpen, Sparkles, User, GraduationCap } from 'lucide-react';

export default function App() {
  const [currentPage, setCurrentPage] = useState<'input' | 'confirm' | 'workspace' | 'library' | 'teacher'>(() => {
    if (window.location.pathname === '/giao-vien') return 'teacher';
    return 'input';
  });

  const [student, setStudent] = useState<Student | null>(() => {
    try {
      const saved = localStorage.getItem('polya_student');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [showStudentModal, setShowStudentModal] = useState(false);
  const [pendingProcessId, setPendingProcessId] = useState<string | null>(null);

  // Active Problem analysis & process
  const [currentAnalysis, setCurrentAnalysis] = useState<ProblemAnalysis | null>(null);
  const [problemImage, setProblemImage] = useState<string | undefined>(undefined);
  const [activeProcess, setActiveProcess] = useState<PolyaProcess | null>(null);
  const [isLoadingProcess, setIsLoadingProcess] = useState(false);

  // Sync simple URL hash or history if needed
  useEffect(() => {
    const handlePop = () => {
      if (window.location.pathname === '/giao-vien') setCurrentPage('teacher');
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const navigateTo = (page: 'input' | 'confirm' | 'workspace' | 'library' | 'teacher') => {
    setCurrentPage(page);
    if (page === 'teacher') window.history.pushState({}, '', '/giao-vien');
    else window.history.pushState({}, '', '/');
  };

  const handleAnalyzeSuccess = (analysis: ProblemAnalysis, imgUrl?: string) => {
    setCurrentAnalysis(analysis);
    setProblemImage(imgUrl);
    setCurrentPage('confirm');
  };

  const handleConfirmSuccess = async (processId: string) => {
    // If student not set, prompt first
    if (!student) {
      setPendingProcessId(processId);
      setShowStudentModal(true);
      return;
    }

    await loadAndOpenProcess(processId);
  };

  const loadAndOpenProcess = async (processId: string) => {
    setIsLoadingProcess(true);
    try {
      const res = await fetch(`/api/processes/${processId}`);
      const data = await res.json().catch(() => null);
      if (data?.ok && data.data) {
        setActiveProcess(data.data);
        setCurrentPage('workspace');
      } else {
        alert(`Không thể tải quy trình giải (mã ${processId}, HTTP ${res.status}): ${data?.error?.message || 'máy chủ không trả dữ liệu'}`);
      }
    } catch (err: any) {
      alert(`Lỗi kết nối khi tải quy trình: ${err?.message || err}`);
    } finally {
      setIsLoadingProcess(false);
    }
  };

  const handleSaveStudent = (savedStudent: Student) => {
    setStudent(savedStudent);
    setShowStudentModal(false);
    if (pendingProcessId) {
      loadAndOpenProcess(pendingProcessId);
      setPendingProcessId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-white border-b border-blue-100 shadow-2xs sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          {/* Logo Branding */}
          <button
            onClick={() => navigateTo('input')}
            className="flex items-center gap-2.5 text-left group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white flex items-center justify-center font-black text-lg shadow-sm group-hover:scale-105 transition-transform">
              P9
            </div>
            <div>
              <div className="font-black text-blue-950 text-base md:text-lg tracking-tight leading-tight">
                Polya AI <span className="text-blue-600 font-bold">• Bảng & biểu đồ tần số</span>
              </div>
              <div className="text-2xs text-slate-500 hidden sm:block">
                Toán 9 – Bài 22 • Quy trình giải toán 4 bước Pólya
              </div>
            </div>
          </button>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1.5 md:gap-3 text-xs md:text-sm font-semibold">
            <button
              onClick={() => navigateTo('input')}
              className={`px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                currentPage === 'input' || currentPage === 'confirm'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>Giải toán</span>
            </button>

            <button
              onClick={() => navigateTo('library')}
              className={`px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                currentPage === 'library'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Thư viện</span>
            </button>

            <button
              onClick={() => navigateTo('teacher')}
              className={`px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                currentPage === 'teacher'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <GraduationCap className="w-4 h-4 text-indigo-600" />
              <span>Giáo viên</span>
            </button>

            {/* Student info badge */}
            {student ? (
              <button
                onClick={() => setShowStudentModal(true)}
                className="ml-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span className="max-w-[90px] truncate">{student.name}</span>
              </button>
            ) : (
              <button
                onClick={() => setShowStudentModal(true)}
                className="ml-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Nhập tên
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Main Page Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">
        {isLoadingProcess ? (
          <div className="p-16 text-center text-slate-500 text-sm">
            Đang tải dữ liệu quy trình giải toán...
          </div>
        ) : (
          <>
            {currentPage === 'input' && (
              <InputProblemPage onAnalyzeSuccess={handleAnalyzeSuccess} />
            )}

            {currentPage === 'confirm' && currentAnalysis && (
              <ConfirmProblemPage
                analysis={currentAnalysis}
                imageUrl={problemImage}
                onConfirmSuccess={handleConfirmSuccess}
                onBackToInput={() => setCurrentPage('input')}
              />
            )}

            {currentPage === 'workspace' && activeProcess && student && (
              <WorkspacePage
                process={activeProcess}
                student={student}
                onGoToLibrary={() => navigateTo('library')}
                onNewProblem={() => navigateTo('input')}
              />
            )}

            {currentPage === 'library' && (
              <LibraryPage
                student={student}
                onSelectProcess={loadAndOpenProcess}
                onNewProblem={() => navigateTo('input')}
              />
            )}

            {currentPage === 'teacher' && <TeacherPage />}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        Polya AI – Bài 22: Bảng tần số và biểu đồ tần số (Toán 9) • Phương pháp George Pólya • Kiến trúc Code tính toán - AI viết lời dẫn
      </footer>

      {/* Student Identity Modal */}
      <StudentModal
        isOpen={showStudentModal}
        onSave={handleSaveStudent}
        currentStudent={student}
        onResetStudent={() => {
          localStorage.removeItem('polya_student');
          setStudent(null);
        }}
      />
    </div>
  );
}

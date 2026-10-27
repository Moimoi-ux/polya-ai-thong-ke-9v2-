import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { partLabel } from '../shared/labels.ts';
import { TeacherStats, Attempt, Student, PolyaProcess, AnswerEvent } from '../shared/types.ts';
import { MathView } from '../components/MathView.tsx';
import { problemPreview } from '../shared/problemText.ts';
import {
  Lock,
  BarChart3,
  Users,
  GraduationCap,
  Layers,
  FileSpreadsheet,
  Cpu,
  Trash2,
  RefreshCw,
  Search,
  CheckCircle,
  AlertCircle,
  Download,
  Share2,
} from 'lucide-react';

export const TeacherPage: React.FC = () => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('teacher_token'));
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Teacher Tabs:
  // overview, gradebook, student_detail, question_analysis, reflections, assign, repo, system, export_research
  const [activeTab, setActiveTab] = useState<
    'overview' | 'gradebook' | 'student_detail' | 'question_analysis' | 'reflections' | 'assign' | 'repo' | 'system' | 'export_research'
  >('overview');

  const [stats, setStats] = useState<TeacherStats | null>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [processes, setProcesses] = useState<PolyaProcess[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [studentDetail, setStudentDetail] = useState<any>(null);
  const [questionAnalysis, setQuestionAnalysis] = useState<any[]>([]);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [accessCheck, setAccessCheck] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(false);

  // Search & filter state
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterDangBai, setFilterDangBai] = useState<string>('all');
  const [searchStudent, setSearchStudent] = useState<string>('');

  useEffect(() => {
    if (token) {
      loadDashboardData();
    }
  }, [token]);

  const loadDashboardData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [statsRes, attemptsRes, procRes, healthRes, qRes] = await Promise.all([
        fetch('/api/teacher/stats', { headers }),
        fetch('/api/teacher/attempts', { headers }),
        fetch('/api/processes'),
        fetch('/api/health'),
        fetch('/api/teacher/question-analysis', { headers }),
      ]);

      if (statsRes.status === 401) {
        logout();
        return;
      }

      const statsData = await statsRes.json();
      const attemptsData = await attemptsRes.json();
      const procData = await procRes.json();
      const healthData = await healthRes.json();
      const qData = await qRes.json();

      if (statsData.ok) setStats(statsData.data);
      if (attemptsData.ok) setAttempts(attemptsData.data);
      if (procData.ok) setProcesses(procData.data);
      if (healthData.ok) setSystemHealth(healthData.data);
      if (qData.ok) setQuestionAnalysis(qData.data);
    } catch {
      // silent
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const res = await fetch('/api/teacher/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      const data = await res.json();
      if (data.ok && data.data) {
        localStorage.setItem('teacher_token', data.data.token);
        setToken(data.data.token);
      } else {
        setLoginError(data.error?.message || 'Mật khẩu không chính xác.');
      }
    } catch {
      setLoginError('Lỗi kết nối máy chủ.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('teacher_token');
    setToken(null);
  };

  const loadStudentDetail = async (stuId: string) => {
    setSelectedStudentId(stuId);
    try {
      const res = await fetch(`/api/teacher/student-detail/${stuId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) setStudentDetail(data.data);
    } catch {}
  };

  const handleDeleteProcess = async (procId: string) => {
    if (deleteConfirmId !== procId) {
      setDeleteConfirmId(procId);
      return;
    }
    // Confirmed second time
    try {
      const res = await fetch(`/api/teacher/processes/${procId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setProcesses((prev) => prev.filter((p) => p.id !== procId));
        setDeleteConfirmId(null);
        setStatusMessage('Đã xóa quy trình thành công.');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch {}
  };

  // Kiểm tra quyền đọc/ghi từng bảng dữ liệu Firestore
  const runAccessCheck = async () => {
    setIsChecking(true);
    try {
      const res = await fetch('/api/teacher/storage-check', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.ok) setAccessCheck(data.data);
      const h = await fetch('/api/health').then((r) => r.json());
      if (h.ok) setSystemHealth(h.data);
    } catch {
      alert('Không kiểm tra được.');
    } finally {
      setIsChecking(false);
    }
  };

  // Sao lưu thư viện quy trình về máy (file .json)
  const downloadLibraryBackup = async () => {
    try {
      const res = await fetch('/api/teacher/backup', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message || 'Lỗi sao lưu');
      const blob = new Blob([JSON.stringify(data.data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SaoLuu_ThuVien_Polya_Bai22_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setStatusMessage(`Đã tải bản sao lưu gồm ${data.data.processes?.length || 0} quy trình.`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (e: any) {
      alert('Không tải được bản sao lưu: ' + (e?.message || ''));
    }
  };

  // Khôi phục thư viện từ file sao lưu
  const restoreLibraryBackup = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      const list = Array.isArray(json) ? json : json?.processes;
      if (!Array.isArray(list)) throw new Error('File không đúng định dạng sao lưu.');
      const res = await fetch('/api/teacher/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ processes: list }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message || 'Lỗi khôi phục');
      const r = data.data;
      setStatusMessage(
        `Khôi phục: ${r.restored} quy trình đã lưu vào Firestore` +
          (r.pending ? `, ${r.pending} quy trình đang chờ lưu lại` : '') +
          (r.skipped ? `, bỏ qua ${r.skipped} mục không hợp lệ` : '') +
          '.'
      );
      setTimeout(() => setStatusMessage(null), 6000);
      loadDashboardData();
    } catch (e: any) {
      alert('Không khôi phục được: ' + (e?.message || ''));
    }
  };

  // Export Excel (.xlsx) using xlsx library
  const exportGradebookExcel = () => {
    const rows = attempts.map((a) => ({
      'Họ và tên': a.studentName,
      'Lớp': a.studentClass,
      'Trường': a.studentSchool,
      'Đề bài': a.problemText?.substring(0, 50) + '...',
      'Dạng bài': a.dangBai,
      'Lượt thứ': a.attemptNo,
      'Điểm số': a.score,
      'Tổng số lỗi': a.wrongTotal,
      'Lỗi B1': a.wrongByStep?.step_1 || 0,
      'Lỗi B2': a.wrongByStep?.step_2 || 0,
      'Lỗi B3': a.wrongByStep?.step_3 || 0,
      'Lỗi B4': a.wrongByStep?.step_4 || 0,
      'Thời gian làm (s)': Object.values(a.timeByStep || {}).reduce((x: any, y: any) => x + y, 0),
      'Ngày làm': a.startedAt?.split('T')[0] || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'BangDiem');
    XLSX.writeFile(workbook, `BangDiem_ThongKe9_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Multi-sheet research data export
  const exportResearchExcel = async () => {
    try {
      const res = await fetch('/api/teacher/export-data', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok || !data.data) return;

      const wb = XLSX.utils.book_new();
      const { students: stus, attempts: atts, events: evts, processes: procs } = data.data;

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(atts), 'Attempts');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(evts), 'AnswerEvents');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stus), 'Students');
      // Quy trình là dữ liệu lồng nhiều tầng → chỉ xuất các cột tóm tắt (Excel giới hạn 32.767 ký tự/ô)
      const procRows = (procs || []).map((p: PolyaProcess) => ({
        id: p.id,
        dangBai: (p.parts || []).map((x) => x.dangBai).join(', '),
        soY: (p.parts || []).length,
        deBai: problemPreview(p.problemText || '', 1000),
        templateVersion: p.templateVersion,
        createdAt: p.createdAt,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(procRows), 'Processes');

      XLSX.writeFile(wb, `DuLieuNghienCuu_ThongKe9_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch {
      alert('Không thể xuất dữ liệu nghiên cứu.');
    }
  };

  // If not logged in, render login screen
  if (!token) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-2xl shadow-xl border border-blue-100 p-6 md:p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-black text-blue-950">Cổng Quản Trị Giáo Viên</h2>
          <p className="text-xs text-slate-500 mt-1">
            Vui lòng nhập mật khẩu quản lý để xem bảng điểm và phân tích học tập.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Mật khẩu giáo viên *
            </label>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Nhập mật khẩu..."
              required
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {loginError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer shadow-md"
          >
            {isLoggingIn ? 'Đang xác thực...' : 'Đăng nhập giáo viên ➔'}
          </button>
        </form>
      </div>
    );
  }

  // Filtered attempts for gradebook
  const filteredAttempts = attempts.filter((a) => {
    const matchClass = filterClass === 'all' || a.studentClass === filterClass;
    const matchDangBai = filterDangBai === 'all' || a.dangBai?.startsWith(filterDangBai);
    const matchSearch =
      a.studentName?.toLowerCase().includes(searchStudent.toLowerCase()) ||
      a.studentSchool?.toLowerCase().includes(searchStudent.toLowerCase());
    return matchClass && matchDangBai && matchSearch;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Navbar for Teacher */}
      <div className="bg-white p-4 md:p-6 rounded-2xl border border-blue-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-blue-950 flex items-center gap-2">
            <GraduationCap className="w-7 h-7 text-blue-600" />
            Bảng Điều Khiển Giáo Viên Toán 9
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi tiến độ, phân tích dữ liệu sư phạm và quản lý đề bài thống kê.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={logout}
            className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Đăng xuất
          </button>
        </div>
      </div>

      {(systemHealth?.storage?.pendingWrites > 0 || systemHealth?.storage?.firestoreConfigured === false) && (
        <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-xs md:text-sm rounded-xl">
          ⚠️ {systemHealth?.storage?.firestoreConfigured === false
            ? 'Chưa kết nối Firestore: dữ liệu chỉ nằm trong bộ nhớ máy chủ và sẽ mất khi máy chủ khởi động lại.'
            : `Có ${systemHealth.storage.pendingWrites} mục chưa lưu được vào Firestore (máy chủ đang tự thử lại mỗi phút). Xem tab "Tình trạng hệ thống" và nên bấm "Sao lưu thư viện".`}
        </div>
      )}

      {statusMessage && (
        <div className="p-3 bg-green-50 text-green-800 border border-green-200 rounded-xl text-xs md:text-sm font-medium flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Tabs list */}
      <div className="flex flex-wrap items-center gap-1 bg-white p-1.5 rounded-xl border border-slate-200 shadow-xs text-xs md:text-sm font-bold">
        {[
          { id: 'overview', label: '📊 Tổng quan' },
          { id: 'gradebook', label: '📋 Bảng điểm' },
          { id: 'student_detail', label: '👤 Chi tiết học sinh' },
          { id: 'question_analysis', label: '📈 Phân tích câu hỏi' },
          { id: 'reflections', label: '💭 Phản tư học sinh' },
          { id: 'repo', label: '📦 Kho quy trình' },
          { id: 'system', label: '⚙️ Tình trạng hệ thống' },
          { id: 'export_research', label: '📑 Xuất dữ liệu nghiên cứu' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-3.5 py-2 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
              activeTab === t.id
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: TỔNG QUAN */}
      {activeTab === 'overview' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase">Tổng số học sinh</span>
              <div className="text-3xl font-black text-blue-900 mt-1">{stats.totalStudents}</div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase">Lượt làm bài</span>
              <div className="text-3xl font-black text-blue-900 mt-1">{stats.totalAttempts}</div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase">Điểm trung bình</span>
              <div className="text-3xl font-black text-green-700 mt-1">{stats.avgScore} / 10</div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 uppercase">Quy trình trong kho</span>
              <div className="text-3xl font-black text-indigo-700 mt-1">{stats.totalProcesses}</div>
            </div>
          </div>

          {/* Activity by Date */}
          <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-xs">
            <h3 className="text-sm font-bold text-blue-950 uppercase tracking-wider mb-4">
              Lượt làm bài gần đây theo ngày:
            </h3>
            {stats.attemptsByDate && stats.attemptsByDate.length > 0 ? (
              <div className="flex items-end gap-3 h-40 pt-4 overflow-x-auto">
                {stats.attemptsByDate.map((item, idx) => (
                  <div key={idx} className="flex flex-col items-center gap-1.5 flex-1 min-w-[50px]">
                    <span className="text-xs font-bold text-blue-700">{item.count}</span>
                    <div
                      className="w-full bg-blue-600 rounded-t-md transition-all"
                      style={{ height: `${Math.min(100, item.count * 20)}%` }}
                    />
                    <span className="text-2xs text-slate-500 whitespace-nowrap">{item.date}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400 py-6 text-center">Chưa có đủ dữ liệu theo ngày.</div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: BẢNG ĐIỂM */}
      {activeTab === 'gradebook' && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-xs p-5 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={searchStudent}
                onChange={(e) => setSearchStudent(e.target.value)}
                placeholder="Tìm học sinh, trường..."
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs md:text-sm outline-none"
              />
              <select
                value={filterDangBai}
                onChange={(e) => setFilterDangBai(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs md:text-sm bg-white"
              >
                <option value="all">Tất cả dạng bài</option>
                <option value="TS1">TS1 – Lập bảng tần số</option>
                <option value="TS2">TS2 – Vẽ biểu đồ cột</option>
                <option value="TS3">TS3 – Vẽ biểu đồ đoạn thẳng</option>
                <option value="TS4">TS4 – Đọc – phân tích</option>
              </select>
            </div>

            <button
              onClick={exportGradebookExcel}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs md:text-sm transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Xuất Excel (.xlsx)</span>
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-200 rounded-lg text-xs md:text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold">
                <tr>
                  <th className="border border-slate-200 px-3 py-2 text-left">Học sinh</th>
                  <th className="border border-slate-200 px-2 py-2 text-center">Lớp</th>
                  <th className="border border-slate-200 px-3 py-2 text-left">Trường</th>
                  <th className="border border-slate-200 px-2 py-2 text-center">Dạng bài</th>
                  <th className="border border-slate-200 px-2 py-2 text-center">Điểm</th>
                  <th className="border border-slate-200 px-2 py-2 text-center">Tổng lỗi</th>
                  <th className="border border-slate-200 px-2 py-2 text-center">Lỗi B1-B4</th>
                  <th className="border border-slate-200 px-2 py-2 text-center">Ngày làm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAttempts.map((a) => (
                  <tr key={a.id} className="hover:bg-blue-50/40">
                    <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-800">
                      {a.studentName}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-center">{a.studentClass}</td>
                    <td className="border border-slate-200 px-3 py-2 text-slate-600">{a.studentSchool}</td>
                    <td className="border border-slate-200 px-2 py-2 text-center font-bold text-blue-700">
                      {a.dangBai}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-center font-black text-green-700">
                      {a.score?.toFixed(1)}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-center text-amber-600 font-bold">
                      {a.wrongTotal}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-center text-slate-500 text-xs">
                      {a.wrongByStep?.step_1 || 0} / {a.wrongByStep?.step_2 || 0} / {a.wrongByStep?.step_3 || 0} / {a.wrongByStep?.step_4 || 0}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-center text-slate-500 text-xs">
                      {a.startedAt?.split('T')[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CHI TIẾT HỌC SINH */}
      {activeTab === 'student_detail' && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-xs p-5 md:p-6 space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-slate-600 uppercase">Chọn học sinh:</span>
            <select
              value={selectedStudentId}
              onChange={(e) => loadStudentDetail(e.target.value)}
              className="p-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="">-- Chọn học sinh để xem chi tiết --</option>
              {attempts.map((a) => (
                <option key={a.id} value={a.studentId}>
                  {a.studentName} ({a.studentClass})
                </option>
              ))}
            </select>
          </div>

          {studentDetail ? (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-blue-950 text-base">{studentDetail.student?.name}</h3>
                  <p className="text-xs text-slate-500">
                    Lớp: {studentDetail.student?.className} • {studentDetail.student?.school}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Số lượt làm bài:</span>
                  <span className="font-black text-blue-800 text-lg">{studentDetail.attempts?.length || 0}</span>
                </div>
              </div>

              {/* Interaction timeline */}
              <div>
                <h4 className="text-xs font-bold text-slate-600 uppercase mb-2">Dòng thời gian câu trả lời:</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {studentDetail.events?.map((e: AnswerEvent, idx: number) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-xs md:text-sm flex items-center justify-between ${
                        e.isCorrect ? 'bg-green-50/60 border-green-200 text-green-900' : 'bg-red-50/60 border-red-200 text-red-900'
                      }`}
                    >
                      <div>
                        <span className="font-bold">B{e.stepNo} ({e.phase}) - Câu {e.interactionId}: </span>
                        <span>Lần {e.tryNo} • Đã xem gợi ý mức {e.hintLevelShown}</span>
                      </div>
                      <span className={`font-bold ${e.isCorrect ? 'text-green-700' : 'text-red-600'}`}>
                        {e.isCorrect ? '✓ Đúng' : '✕ Sai'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400 py-8 text-center">
              Vui lòng chọn một học sinh từ danh sách trên để xem dòng thời gian chi tiết.
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PHÂN TÍCH CÂU HỎI */}
      {activeTab === 'question_analysis' && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-xs p-5 md:p-6 space-y-4">
          <h3 className="text-sm font-bold text-blue-950 uppercase tracking-wider mb-2">
            Tỉ lệ đúng ngay lần đầu theo từng câu hỏi / dạng bài:
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-200 rounded-lg text-xs md:text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold">
                <tr>
                  <th className="border border-slate-200 px-3 py-2 text-left">Hạng mục câu hỏi</th>
                  <th className="border border-slate-200 px-2 py-2 text-center">Số lượt làm</th>
                  <th className="border border-slate-200 px-2 py-2 text-center">Số lần sai</th>
                  <th className="border border-slate-200 px-2 py-2 text-center">% Đúng ngay lần 1</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {questionAnalysis.map((q, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="border border-slate-200 px-3 py-2 font-medium">{q.item}</td>
                    <td className="border border-slate-200 px-2 py-2 text-center">{q.total}</td>
                    <td className="border border-slate-200 px-2 py-2 text-center text-amber-600 font-bold">
                      {q.mistakes}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-center font-bold text-green-700">
                      {q.firstTryAccuracy}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: PHẢN TƯ HỌC SINH */}
      {activeTab === 'reflections' && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-xs p-5 md:p-6 space-y-4">
          <h3 className="text-sm font-bold text-purple-950 uppercase tracking-wider mb-2">
            Ngân hàng phản tư của học sinh:
          </h3>
          <div className="space-y-3">
            {attempts
              .filter((a) => a.reflections && Object.keys(a.reflections).length > 0)
              .map((a) => (
                <div key={a.id} className="p-4 bg-purple-50/50 border border-purple-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-purple-900 border-b border-purple-100 pb-1.5">
                    <span>{a.studentName} ({a.studentClass})</span>
                    <span>Điểm: {a.score?.toFixed(1)}/10</span>
                  </div>
                  {Object.entries(a.reflections).map(([sNo, txt]) => (
                    <div key={sNo} className="text-xs md:text-sm text-slate-800">
                      <strong className="text-purple-700">Bước {sNo}:</strong> "{String(txt)}"
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* TAB 6: KHO QUY TRÌNH */}
      {activeTab === 'repo' && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-xs p-5 md:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-blue-950 uppercase tracking-wider">
              Danh sách các quy trình trong kho ({processes.length}):
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={downloadLibraryBackup}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> Sao lưu thư viện
              </button>
              <label className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer">
                Khôi phục từ file…
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) restoreLibraryBackup(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Nên bấm "Sao lưu thư viện" định kỳ để giữ một bản trên máy. Khi cần, dùng "Khôi phục từ file…" để đưa lại toàn bộ đề vào thư viện.
          </p>
          <div className="space-y-3">
            {processes.map((proc) => (
              <div key={proc.id} className="p-4 border border-slate-200 rounded-xl flex items-center justify-between gap-4">
                <div className="flex-1 text-xs md:text-sm text-slate-800">
                  <span className="font-bold text-blue-700 block mb-1">
                    Mã: {proc.id} • Dạng: {(proc.parts || []).map((x) => `${x.label}) ${partLabel(x.dangBai, x.askKind)}`).join('; ')} • {proc.templateVersion}
                  </span>
                  <div className="line-clamp-2">{problemPreview(proc.problemText || '')}</div>
                  {(proc.parts || []).filter((x) => x.needsReview).map((x) => (
                    <div key={`r-${x.label}`} className="mt-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      ⚠️ Ý {x.label}: nên duyệt lại cách hiểu đề. {(x.reviewNotes || []).join(' ')}
                    </div>
                  ))}
                  {(proc.skippedParts || []).map((x) => (
                    <div key={`s-${x.label}`} className="mt-1 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                      ⏭️ Ý {x.label} chưa sinh quy trình: {x.reason}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleDeleteProcess(proc.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      deleteConfirmId === proc.id
                        ? 'bg-red-600 text-white animate-pulse'
                        : 'bg-red-50 text-red-700 hover:bg-red-100'
                    }`}
                  >
                    {deleteConfirmId === proc.id ? 'Xác nhận xóa?' : 'Xóa'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 7: TÌNH TRẠNG HỆ THỐNG */}
      {activeTab === 'system' && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-xs p-5 md:p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">
            Trạng thái máy chủ và kết nối:
          </h3>
          <div className="space-y-3 text-xs md:text-sm">
            <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3">
              <span className="font-medium">Cơ sở dữ liệu Firebase Firestore:</span>
              {(() => {
                const st = systemHealth?.storage;
                const entries = Object.entries(st?.readStatus || {}) as [string, any][];
                const blocked = entries.filter(([, v]) => v && !v.ok).map(([k]) => k);
                const viaIndex = entries.filter(([, v]) => v && v.ok && v.mode === 'index').map(([k]) => k);
                if (!st?.firestoreConfigured)
                  return <span className="font-bold text-red-600">⚠️ Chưa kết nối (chỉ lưu tạm trong bộ nhớ)</span>;
                if (blocked.length > 0)
                  return <span className="font-bold text-red-600">⚠️ Đã kết nối, nhưng không đọc được: {blocked.join(', ')}</span>;
                if (viaIndex.length > 0 || (st?.listBlocked || []).length > 0)
                  return <span className="font-bold text-green-700 text-right">✓ Đang lưu và đọc dữ liệu bình thường (qua mục lục)</span>;
                return <span className="font-bold text-green-600">✓ Đang kết nối Firestore</span>;
              })()}
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">Kiểm tra quyền đọc/ghi từng bảng dữ liệu:</span>
                <button
                  onClick={runAccessCheck}
                  disabled={isChecking}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300 cursor-pointer"
                >
                  {isChecking ? 'Đang kiểm tra...' : 'Kiểm tra ngay'}
                </button>
              </div>
              {accessCheck?.results?.length > 0 && (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-blue-100">
                      <th className="border border-blue-200 px-2 py-1 text-left">Bảng dữ liệu</th>
                      <th className="border border-blue-200 px-2 py-1 text-left">Đọc danh sách</th>
                      <th className="border border-blue-200 px-2 py-1 text-left">Đọc từng tài liệu</th>
                      <th className="border border-blue-200 px-2 py-1 text-left">Ghi</th>
                      <th className="border border-blue-200 px-2 py-1 text-left">Mục lục</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessCheck.results.map((r: any) => (
                      <tr key={r.collection} className="bg-white">
                        <td className="border border-blue-200 px-2 py-1 font-mono">{r.collection}</td>
                        <td className={`border border-blue-200 px-2 py-1 ${r.list === 'OK' ? 'text-green-700' : 'text-red-700'}`}>
                          {r.list === 'OK' ? '✓ OK' : `✗ ${r.list}`}
                        </td>
                        <td className={`border border-blue-200 px-2 py-1 ${r.get === 'OK' ? 'text-green-700' : 'text-red-700'}`}>
                          {r.get === 'OK' ? '✓ OK' : `✗ ${r.get}`}
                        </td>
                        <td className={`border border-blue-200 px-2 py-1 ${r.write === 'OK' ? 'text-green-700' : 'text-red-700'}`}>
                          {r.write === 'OK' ? '✓ OK' : `✗ ${r.write}`}
                        </td>
                        <td className={`border border-blue-200 px-2 py-1 ${String(r.index).startsWith('OK') ? 'text-green-700' : 'text-red-700'}`}>
                          {String(r.index).startsWith('OK') ? `✓ ${r.index}` : `✗ ${r.index}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {accessCheck?.results?.length > 0 &&
                (() => {
                  const r = accessCheck.results as any[];
                  const writeOk = r.every((x) => x.write === 'OK');
                  const getOk = r.every((x) => x.get === 'OK');
                  const indexOk = r.every((x) => String(x.index).startsWith('OK'));
                  const listOk = r.every((x) => x.list === 'OK');
                  if (writeOk && listOk) return <p className="text-xs text-green-800">✓ Mọi quyền đều bình thường.</p>;
                  if (writeOk && getOk && indexOk)
                    return (
                      <p className="text-xs text-amber-800">
                        Dữ liệu VẪN ĐƯỢC LƯU và đọc lại được qua mục lục. Riêng quyền "đọc danh sách" đang bị luật Firestore chặn –
                        khi vào được Firebase Console, hãy dán nội dung file <code>firestore.rules</code> vào Firestore Database → Rules → Publish
                        để ứng dụng đọc nhanh và đầy đủ hơn (cả các bản ghi cũ chưa có trong mục lục).
                      </p>
                    );
                  return (
                    <p className="text-xs text-red-800">
                      Có quyền bị chặn ngoài "đọc danh sách" – dữ liệu có thể chưa được lưu/đọc đúng. Cần cập nhật luật trong
                      file <code>firestore.rules</code> (Firebase Console → Firestore Database → Rules → Publish).
                    </p>
                  );
                })()}
            </div>
            {(systemHealth?.storage?.listBlocked || []).length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 space-y-1">
                <div className="font-semibold">ℹ️ Ghi chú (không phải lỗi mất dữ liệu)</div>
                <div className="text-xs leading-relaxed">
                  Luật Firestore hiện chưa cho phép "đọc danh sách" ở bảng: <code>{systemHealth.storage.listBlocked.join(', ')}</code>.
                  Ứng dụng đã tự chuyển sang đọc qua mục lục nên đề và bài làm vẫn được lưu, đọc lại đầy đủ.
                  Khi vào được Firebase Console, thầy/cô dán nội dung file <code>firestore.rules</code> vào
                  Firestore Database → Rules → Publish để tắt ghi chú này.
                </div>
              </div>
            )}
            <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3">
              <span className="font-medium">Lệnh lưu đang chờ ghi lại vào Firestore:</span>
              <span className={`font-bold ${systemHealth?.storage?.pendingWrites ? 'text-red-600' : 'text-green-600'}`}>
                {systemHealth?.storage?.pendingWrites ?? 0}
              </span>
            </div>
            {systemHealth?.storage?.lastSuccessAt && (
              <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3">
                <span className="font-medium">Lần lưu thành công gần nhất:</span>
                <span className="font-semibold text-slate-700">{new Date(systemHealth.storage.lastSuccessAt).toLocaleString('vi-VN')}</span>
              </div>
            )}
            {systemHealth?.storage?.lastError &&
              (systemHealth.storage.lastErrorResolved ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 space-y-1">
                  <div className="font-semibold">
                    ✓ Lỗi lưu trữ lúc {new Date(systemHealth.storage.lastErrorAt).toLocaleString('vi-VN')} đã tự khắc phục (sau đó đã lưu thành công, không còn mục chờ ghi).
                  </div>
                  <div className="font-mono text-[11px] break-all text-slate-500">{systemHealth.storage.lastError}</div>
                </div>
              ) : (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 space-y-1">
                  <div className="font-bold">Lỗi lưu trữ gần nhất ({new Date(systemHealth.storage.lastErrorAt).toLocaleString('vi-VN')}):</div>
                  <div className="font-mono text-[11px] break-all">{systemHealth.storage.lastError}</div>
                </div>
              ))}
            <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3">
              <span className="font-medium">Model Gemini chính (Primary):</span>
              <span className="font-bold text-blue-700">{systemHealth?.primaryModel}</span>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3">
              <span className="font-medium">Model Gemini dự phòng (Fallback):</span>
              <span className="font-bold text-blue-700">{systemHealth?.fallbackModel}</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: XUẤT DỮ LIỆU NGHIÊN CỨU */}
      {activeTab === 'export_research' && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-xs p-6 text-center space-y-4 max-w-xl mx-auto">
          <FileSpreadsheet className="w-12 h-12 text-emerald-600 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900">Xuất dữ liệu nghiên cứu khoa học sư phạm</h3>
          <p className="text-xs text-slate-500">
            Tải về tệp Excel đa sheet (.xlsx) chứa đầy đủ dữ liệu người học, tất cả lượt làm bài, từng sự kiện trả lời chi tiết và ngân hàng đề bài.
          </p>
          <button
            onClick={exportResearchExcel}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 mx-auto"
          >
            <Download className="w-4 h-4" />
            <span>Tải tệp Excel nghiên cứu (.xlsx)</span>
          </button>
        </div>
      )}
    </div>
  );
};

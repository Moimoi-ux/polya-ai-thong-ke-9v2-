import React, { useState } from 'react';
import { Student } from '../shared/types.ts';
import { UserCheck, School, GraduationCap } from 'lucide-react';

interface StudentModalProps {
  isOpen: boolean;
  onSave: (student: Student) => void;
  currentStudent?: Student | null;
  onResetStudent?: () => void;
}

export const StudentModal: React.FC<StudentModalProps> = ({
  isOpen,
  onSave,
  currentStudent,
  onResetStudent,
}) => {
  const [name, setName] = useState(currentStudent?.name || '');
  const [className, setClassName] = useState(currentStudent?.className || '');
  const [school, setSchool] = useState(currentStudent?.school || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !className.trim() || !school.trim()) {
      setError('Vui lòng điền đầy đủ cả 3 thông tin để lưu bài học.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, className, school }),
      });
      const data = await res.json();
      if (data.ok && data.data) {
        localStorage.setItem('polya_student', JSON.stringify(data.data));
        onSave(data.data);
      } else {
        setError(data.error?.message || 'Không thể lưu thông tin.');
      }
    } catch {
      setError('Lỗi kết nối máy chủ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-blue-100 animate-scaleUp">
        <div className="text-center mb-5">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <UserCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-blue-900">Thông tin học sinh</h3>
          <p className="text-xs text-slate-500 mt-1">
            Vui lòng nhập thông tin để hệ thống ghi nhận tiến trình và điểm số bài học của em.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Họ và tên học sinh *
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Nguyễn Văn An"
                required
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Lớp *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="Ví dụ: 9A1"
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Trường THCS *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                  placeholder="Ví dụ: THCS Lê Quý Đôn"
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          {error && <div className="p-2.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium">{error}</div>}

          <div className="pt-2 flex flex-col gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer shadow-md"
            >
              {isSubmitting ? 'Đang lưu...' : 'Bắt đầu học ngay ➔'}
            </button>

            {currentStudent && onResetStudent && (
              <button
                type="button"
                onClick={onResetStudent}
                className="text-xs text-slate-500 hover:text-slate-800 py-1 transition-colors"
              >
                Không phải em? Nhập lại thông tin
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

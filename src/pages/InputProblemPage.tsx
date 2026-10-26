import React, { useState, useEffect } from 'react';
import { ProblemAnalysis } from '../shared/types.ts';
import { RobotMascot } from '../components/RobotMascot.tsx';
import { problemPreview } from '../shared/problemText.ts';
import { Sparkles, Upload, Image, FileText, Camera, AlertCircle } from 'lucide-react';

interface InputProblemPageProps {
  onAnalyzeSuccess: (analysis: ProblemAnalysis, imageUrl?: string) => void;
}

// Đề mẫu bám sát SGK Toán 9 (KNTT) – Bài 22: Bảng tần số và biểu đồ tần số
const SAMPLE_PROBLEMS = [
  {
    id: 'VD1',
    title: 'Lập bảng tần số & tìm giá trị nhiều nhất (Cỡ giày)',
    text: `Để mua giày thể thao cho các bạn nam trong lớp luyện tập chuẩn bị cho giải bóng đá của trường, Huy đã thu thập cỡ giày của các bạn nam trong lớp và thu được kết quả như sau:
40, 36, 37, 36, 40, 38, 39, 38, 37, 36, 40, 39, 36, 38, 37, 38, 38, 37, 38, 38, 38, 36.
a) Lập bảng tần số cho dãy dữ liệu trên.
b) Từ bảng tần số, cho biết cỡ giày nào phù hợp với nhiều bạn nam trong lớp nhất.`,
  },
  {
    id: 'LT1',
    title: 'Dữ liệu không phải là số (Bạn đạt điểm tốt)',
    text: `Bảng sau ghi lại tên các bạn đạt điểm tốt vào các ngày trong tuần của lớp 9E, mỗi điểm tốt ghi tên một lần:
| Ngày | Thứ Hai | Thứ Ba | Thứ Tư | Thứ Năm | Thứ Sáu |
| --- | --- | --- | --- | --- | --- |
| Tên bạn đạt điểm tốt | Bình, Nam | Tuấn, Thảo | Bình | Yến, Nam | Nam, Thảo |
a) Lập bảng tần số cho dãy dữ liệu này.
b) Bạn nào có số lần đạt điểm tốt nhiều nhất?`,
  },
  {
    id: 'T1',
    title: 'Lập bảng & vẽ biểu đồ cột (Điểm kiểm tra 9B)',
    text: `Điểm kiểm tra môn Toán của 20 học sinh lớp 9B: 7, 8, 8, 9, 6, 7, 8, 10, 9, 8, 7, 6, 8, 9, 7, 8, 10, 8, 7, 9.
a) Lập bảng tần số.
b) Vẽ biểu đồ tần số dạng cột.`,
  },
  {
    id: 'VD2',
    title: 'Vẽ biểu đồ cột & đoạn thẳng (Số anh, chị, em ruột)',
    text: `Bạn Bình thống kê số anh, chị, em ruột của các bạn trong lớp và thu được bảng sau:
| Số anh, chị, em ruột | 0 | 1 | 2 | 3 |
| --- | --- | --- | --- | --- |
| Số bạn | 8 | 19 | 6 | 4 |
a) Vẽ biểu đồ tần số dạng cột biểu diễn bảng thống kê trên.
b) Vẽ biểu đồ tần số dạng đoạn thẳng biểu diễn bảng thống kê trên.`,
  },
  {
    id: 'LT2',
    title: 'Vẽ biểu đồ từ bảng tần số (Dự đoán World Cup)',
    text: `Bảng tần số sau cho biết số học sinh của lớp 9D dự đoán đội bóng vô địch World Cup 2022 trước khi giải đấu bắt đầu.
| Đội bóng | Brazil | Anh | Pháp | Argentina |
| --- | --- | --- | --- | --- |
| Số bạn dự đoán | 8 | 15 | 12 | 5 |
Vẽ biểu đồ tần số dạng cột và biểu đồ tần số dạng đoạn thẳng biểu diễn bảng tần số trên.`,
  },
  {
    id: 'HD2',
    title: 'Đọc biểu đồ tần số để lập bảng (Kết quả kiểm tra)',
    text: `Cho biểu đồ tần số dạng cột "Kết quả kiểm tra môn Toán": trục ngang là Điểm, trục đứng là Tần số. Cột ứng với điểm 6 cao 3; điểm 7 cao 8; điểm 8 cao 12; điểm 9 cao 6; điểm 10 cao 4.
a) Lập bảng tần số cho dữ liệu được biểu diễn trên biểu đồ.
b) Điểm nào có ít học sinh đạt được nhất?`,
  },
  {
    id: 'T2',
    title: 'Dữ liệu định tính & nhận xét (Ý thức vệ sinh)',
    text: `Một nhóm học sinh đã khảo sát ý kiến về ý thức giữ gìn vệ sinh công cộng của các bạn trong trường với các mức đánh giá Tốt, Khá, Trung bình, Kém và thu được kết quả như sau:
Tốt, Trung bình, Tốt, Trung bình, Khá, Tốt, Khá, Tốt, Tốt, Khá, Trung bình, Kém, Khá, Tốt, Khá, Tốt, Trung bình, Khá, Tốt, Tốt, Tốt, Khá, Kém, Trung bình, Tốt, Khá, Tốt, Khá, Tốt, Khá, Khá.
a) Lập bảng tần số cho dãy dữ liệu trên.
b) Từ bảng tần số, hãy cho biết mức đánh giá nào chiếm ưu thế nhất.`,
  },
];

export const InputProblemPage: React.FC<InputProblemPageProps> = ({ onAnalyzeSuccess }) => {
  const [problemText, setProblemText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [outOfScopeNotice, setOutOfScopeNotice] = useState<string | null>(null);

  // Paste screenshot via Ctrl+V
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            handleImageFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleImageFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Ảnh vượt quá dung lượng cho phép (tối đa 10 MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage(e.target?.result as string);
      setImageName(file.name);
      setErrorMsg(null);
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        handleImageFile(file);
      } else {
        setErrorMsg('Chỉ hỗ trợ tệp hình ảnh (JPG, PNG) hoặc PDF.');
      }
    }
  };

  const handleSelectSample = (sampleText: string) => {
    setProblemText(sampleText);
    setSelectedImage(null);
    setImageName(null);
    setErrorMsg(null);
    setOutOfScopeNotice(null);
  };

  const handleSubmit = async () => {
    if (!problemText.trim() && !selectedImage) {
      setErrorMsg('Vui lòng gõ đề bài hoặc tải ảnh lên.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);
    setOutOfScopeNotice(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: problemText.trim(),
          imageBase64: selectedImage || undefined,
        }),
      });

      const data = await res.json();
      if (data.ok && data.data) {
        const analysis: ProblemAnalysis = data.data;

        // Check scope
        if (!analysis.inScope) {
          setOutOfScopeNotice(
            analysis.outOfScopeReason ||
              'Ứng dụng hiện chỉ hỗ trợ Bài 22: Bảng tần số và biểu đồ tần số. Em thử nhập một đề thuộc nội dung này nhé.'
          );
          setIsAnalyzing(false);
          return;
        }

        onAnalyzeSuccess(analysis, selectedImage || undefined);
      } else {
        setErrorMsg(data.error?.message || 'Không thể phân tích đề bài. Vui lòng thử lại.');
      }
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ khi đọc đề bài.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Hero Welcome banner */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white rounded-2xl p-6 md:p-8 shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="px-3 py-1 bg-blue-500/30 text-blue-200 border border-blue-400/30 rounded-full text-xs font-semibold tracking-wide uppercase inline-block mb-2">
            Toán 9 • Bài 22 • KNTT
          </span>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">
            Bảng tần số và biểu đồ tần số
          </h1>
          <p className="text-blue-100/90 text-sm md:text-base mt-2 leading-relaxed">
            Học giải toán qua quy trình 4 bước của George Pólya: lập bảng tần số, vẽ biểu đồ tần số dạng cột và đoạn thẳng ngay trong bài, đọc và phân tích số liệu. Số liệu do máy tính toán chính xác, lời dẫn thân thiện.
          </p>
        </div>

        {/* Mascot badge in top-right */}
        <div className="hidden sm:block absolute right-6 bottom-4 opacity-90">
          <RobotMascot mood={isAnalyzing ? 'thinking' : 'idle'} />
        </div>
      </div>

      {/* Main Input Box */}
      <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5 md:p-7 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-blue-950 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            Nhập đề bài về bảng tần số, biểu đồ tần số
          </h2>
          <span className="text-xs text-slate-400">Hỗ trợ gõ chữ, dán ảnh (Ctrl+V), PDF</span>
        </div>

        {/* Text Area */}
        <textarea
          value={problemText}
          onChange={(e) => setProblemText(e.target.value)}
          placeholder="Nhập nội dung đề bài tại đây... (Ví dụ: Cỡ giày của các bạn nam: 40, 36, 37... a) Lập bảng tần số. b) Vẽ biểu đồ tần số dạng cột.)"
          rows={6}
          className="w-full p-4 border border-slate-300 rounded-xl text-sm md:text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-800"
        />

        {/* Image Preview if uploaded or pasted */}
        {selectedImage && (
          <div className="relative p-3 bg-blue-50/60 border border-blue-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <img src={selectedImage} alt="Problem preview" className="w-16 h-16 object-cover rounded-lg border border-blue-200" />
              <div className="text-xs text-slate-700 truncate">
                <span className="font-semibold block">{imageName || 'Ảnh đề bài'}</span>
                <span className="text-slate-500">Đã sẵn sàng phân tích</span>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedImage(null);
                setImageName(null);
              }}
              className="text-xs px-2.5 py-1 text-red-600 hover:bg-red-50 rounded-md transition-colors"
            >
              Gỡ ảnh
            </button>
          </div>
        )}

        {/* Action bar with Upload Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <label className="cursor-pointer px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors">
              <Camera className="w-4 h-4 text-slate-600" />
              <span>📷 Tải ảnh / Chụp ảnh</span>
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" capture="environment" />
            </label>

            <label className="cursor-pointer px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors">
              <FileText className="w-4 h-4 text-slate-600" />
              <span>📄 Tải PDF</span>
              <input type="file" accept="application/pdf" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          <button
            onClick={handleSubmit}
            disabled={isAnalyzing || (!problemText.trim() && !selectedImage)}
            className="w-full sm:w-auto px-7 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-sm md:text-base rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            {isAnalyzing ? (
              <>
                <RobotMascot mood="thinking" className="w-6 h-6 inline-block" />
                <span>Đang phân tích đề bài...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>✨ Tạo quy trình giải toán</span>
              </>
            )}
          </button>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs md:text-sm rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Out of scope friendly rejection notice with 3 quick suggestions */}
        {outOfScopeNotice && (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-3">
            <div className="flex items-start gap-2.5 text-amber-900 text-sm font-medium">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <span>{outOfScopeNotice}</span>
            </div>
            <div className="pt-1">
              <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">
                Em có thể thử ngay 3 đề mẫu của Bài 22:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => handleSelectSample(SAMPLE_PROBLEMS[0].text)}
                  className="p-2.5 bg-white border border-amber-200 hover:border-amber-400 rounded-lg text-left text-xs text-slate-800 font-medium hover:bg-amber-50/50 transition-all cursor-pointer"
                >
                  📌 1. Lập bảng tần số (Cỡ giày)
                </button>
                <button
                  onClick={() => handleSelectSample(SAMPLE_PROBLEMS[3].text)}
                  className="p-2.5 bg-white border border-amber-200 hover:border-amber-400 rounded-lg text-left text-xs text-slate-800 font-medium hover:bg-amber-50/50 transition-all cursor-pointer"
                >
                  📌 2. Biểu đồ cột & đoạn thẳng
                </button>
                <button
                  onClick={() => handleSelectSample(SAMPLE_PROBLEMS[5].text)}
                  className="p-2.5 bg-white border border-amber-200 hover:border-amber-400 rounded-lg text-left text-xs text-slate-800 font-medium hover:bg-amber-50/50 transition-all cursor-pointer"
                >
                  📌 3. Đọc biểu đồ tần số
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Sample Problem Buttons (T1 - T6) */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 md:p-6 space-y-3">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
          💡 Chọn đề mẫu theo SGK Bài 22 (bấm để tải nhanh):
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SAMPLE_PROBLEMS.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelectSample(s.text)}
              className="p-3 bg-white hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 rounded-xl text-left transition-all shadow-2xs group cursor-pointer"
            >
              <div className="text-xs font-bold text-blue-700 group-hover:text-blue-800 mb-1">
                {s.title}
              </div>
              <div className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                {problemPreview(s.text, 180)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

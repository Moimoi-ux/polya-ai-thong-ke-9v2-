<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/c4273664-b56d-4224-be1a-43b37ff830f0

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Phiên bản Bài 22 – Bảng tần số và biểu đồ tần số

- Phạm vi chỉ còn 4 dạng: **TS1** lập bảng tần số · **TS2** vẽ biểu đồ cột · **TS3** vẽ biểu đồ đoạn thẳng · **TS4** đọc – phân tích bảng/biểu đồ tần số (đã bỏ tần số tương đối, quạt tròn, ghép nhóm).
- Không còn trang "Biểu đồ" riêng: biểu đồ được lồng vào quy trình (vẽ kéo thả ở Bước 3, biểu đồ xem lại ở Bước 4, biểu đồ của đề hiển thị trong thẻ đề bài).
- Biểu đồ kéo thả mới: `src/components/charts/FreqChart.tsx` (dùng chung cho cột/đoạn thẳng, chế độ chỉ xem và chế độ kéo thả).
- Vẫn 2 lần gọi AI: (1) đọc đề, (2) trau chuốt lời dẫn. Mọi con số do code tính.
- Chạy kiểm thử: `npm test`

## Bản sửa lỗi v2.1 (11/10/2026)

**1. Đề trong thư viện tự biến mất sau vài ngày – đã sửa** (`server/storage.ts`)
- Nguyên nhân: quy trình có bảng để điền (TS1, hoặc TS4 phải lập bảng) chứa mảng lồng mảng mà Firestore không nhận; đề tạo từ ảnh/PDF còn lưu kèm ảnh base64 nên vượt giới hạn 1 MB. Lỗi ghi bị bỏ qua nên đề chỉ nằm trong RAM máy chủ và mất khi máy chủ khởi động lại.
- Cách sửa: lưu quy trình dưới dạng chuỗi JSON (`payload`), không lưu ảnh gốc, ghi có thử lại + hàng đợi tự ghi lại mỗi phút, có giới hạn thời gian chờ; thư viện hiển thị hợp của Firestore và bộ nhớ. Đọc được cả đề lưu theo định dạng cũ.
- Trang Giáo viên: cảnh báo khi có mục chưa lưu được, tab "Tình trạng hệ thống" hiện lỗi lưu gần nhất; tab "Kho quy trình" có nút **Sao lưu thư viện** (.json) và **Khôi phục từ file**.

**2. Bảng tần số trong đề hiển thị thành chuỗi ký tự "| :--- |" – đã sửa** (`src/shared/problemText.ts`, `MathView.tsx`)
- Tự tách lại bảng bị dồn trên một dòng, đưa ý a), b) và phương án A. B. C. D. xuống dòng; áp dụng cả cho đề đã lưu trước đây. Thẻ thư viện hiện bản tóm tắt dạng chữ. Hỗ trợ **chữ đậm** trong lời giải.

**3. Nội dung quy trình** (`src/shared/templates/index.ts`, khuôn `v2.1.0-bai22`)
- Đề nêu cỡ mẫu khác tổng tần số: trang xác nhận cảnh báo rõ và yêu cầu kiểm tra; Bước 4 yêu cầu học sinh đối chiếu và phát hiện chỗ chưa khớp (không còn báo "số liệu đã đọc đúng").
- Đọc – phân tích (TS4): Bước 1 hỏi thêm "đề cho dữ kiện gì"; câu hỏi/nhiễu không còn nhắc biểu đồ khi đề chỉ cho bảng; nhiễu phù hợp dữ liệu không phải số; giữ nguyên phương án A–D của đề trắc nghiệm; lời giải mẫu có câu trả lời đầy đủ và "Chọn …"; Bước 4 có cách làm khác (biểu đồ cột) và câu mở rộng (kể cả trường hợp nhiều giá trị cùng tần số); bỏ trùng lặp câu hỏi trước gợi ý giữa các bước.
- Đề tạo trước bản sửa vẫn dùng khuôn cũ: tạo lại đề để có quy trình mới (thư viện chỉ hiện bản mới nhất của mỗi đề).

Kiểm thử: `npm test`

# Module Bài 22 – Bảng tần số và biểu đồ tần số (Polya AI)

Module này thay phần "Đọc – phân tích" của app Polya AI, nơi đã sinh quy trình sai cho ý b, c
của bài y tá. Nguyên nhân cũ: mọi câu hỏi đọc biểu đồ mà AI không xếp được đều bị
ép về khuôn "giá trị có tần số lớn nhất".

## Nguyên tắc

| Việc | Ai làm |
|---|---|
| Chép đề thành số liệu, chép nguyên văn câu hỏi từng ý | Gemini |
| Xác định dạng bài và tham số (điều kiện, giá trị được hỏi) | **Code** (`classify.ts`) |
| Tính đáp án | **Code** (`solve.ts`) |
| Dựng quy trình 4 bước Pólya | **Code** (`templates.ts`) |
| Kiểm tra quy trình trước khi lưu | **Code** (`validate.ts`) |

Gợi ý phân loại của Gemini chỉ dùng khi luật không nhận ra; khi đó quy trình bị gắn cờ
"giáo viên cần duyệt". Câu không nhận ra được thì **không sinh quy trình** (báo GV), thay vì đoán sai.

## Danh mục dạng toán

**I. TS1 – Lập bảng tần số**: từ dãy số liệu, bảng dữ liệu ban đầu (kể cả dữ liệu không là số), biểu đồ tần số, biểu đồ tranh.

**II. TS2 / TS3 – Vẽ biểu đồ tần số dạng cột / đoạn thẳng**: từ bảng tần số, hoặc từ dữ liệu thô (lập bảng trước).

**III. TS4 – Đọc, phân tích** (13 kiểu câu hỏi):

| Kiểu | Ví dụ | Cách giải |
|---|---|---|
| max / min | Thời gian công tác nào có nhiều y tá nhất? | Tần số lớn/nhỏ nhất (kể đủ nếu bằng nhau) |
| value_freq | Có bao nhiêu y tá công tác 4 năm? | Tra tần số của giá trị |
| sample_size | Phòng khám có tổng số bao nhiêu y tá? | N = tổng các tần số |
| count_condition | Có bao nhiêu y tá công tác **ít nhất 3 năm**? | Cộng tần số các giá trị thỏa (≥, >, ≤, <, từ a đến b, ghép "và/hoặc") |
| count_set | … xếp loại Giỏi **hoặc** Khá? | Cộng tần số các giá trị được nhắc |
| values_by_freq | Những ngày nào có **ít hơn 25 học sinh**? | So từng tần số với ngưỡng |
| compare | … nhiều hơn … bao nhiêu? / gấp mấy lần? | Hiệu / thương hai tần số |
| distinct_count | Có bao nhiêu giá trị khác nhau? | k = số cột |
| list_values | … nhận những giá trị nào? | Đọc dòng giá trị |
| value_max / value_min | Thời gian công tác **lâu nhất** là bao nhiêu? | Độ lớn giá trị (không phải tần số) |
| sum_values | Cả giải có tổng cộng bao nhiêu bàn thắng? | Σ giá trị × tần số |
| remark | Em có nhận xét gì…? | Nhận xét có số liệu làm căn cứ |

**IV. TS5 – Tìm tần số chưa biết**: x = N − (tổng các tần số đã biết).

**V. TS6 – Kiểm tra, sửa bảng tần số của bạn**: đếm lại, đối chiếu từng ô.

**Ngoài phạm vi** (báo GV, không sinh): tần số tương đối, tỉ lệ %, ghép nhóm, biểu đồ quạt tròn, số trung bình/trung vị, xác suất.

## Cấu trúc thư mục

```
src/shared/bai22/
  catalog.ts      danh mục dạng toán (nhãn, dấu hiệu, phương pháp)
  classify.ts     bộ phân loại câu hỏi tiếng Việt
  solve.ts        bộ tính đáp án
  templates.ts    khuôn 4 bước Pólya cho TS4 (10 kiểu mới), TS5, TS6
  difficulties.ts ngân hàng khó khăn dự đoán + câu hỏi gợi mở
  builders.ts     hàm dựng nhiệm vụ (mcq, numeric, ordering, table_fill)
  validate.ts     chốt kiểm tra trước khi lưu
  gemini.ts       quy tắc + schema cho prompt Gemini, chuyển dữ liệu của app sang bảng tần số
  appBridge.ts    cầu nối với app: phân loại lại các ý, dựng quy trình, điền tần số còn thiếu
  index.ts        buildPart(): điểm vào
  bai22.test.ts / bai22.fuzz.test.ts   kiểm thử module
server/processGenerator.test.ts        kiểm thử đầu-cuối (không ghi vào Firestore)
```

## Đã ghép vào app như sau

1. `server/gemini.ts`: prompt có thêm quy tắc chép đề Bài 22 và trường `hint`; `sanitizeAnalysis()` không còn
   tự gán "max", giữ ô tần số trống (null), rồi gọi `reclassifyParts()` để CODE phân loại lại từng ý.
2. `server/processGenerator.ts`: `buildProcessParts()` – TS1, TS2, TS3 và TS4 kiểu nhiều nhất / ít nhất /
   tần số một giá trị dùng khuôn cũ (đang đúng, có hỗ trợ đề trắc nghiệm A–D); các kiểu còn lại, TS5, TS6
   dùng module này. Ý không nhận ra → bỏ qua và ghi lý do. Phiên bản khuôn: `v3.0.0-bai22`.
3. `upgradeProcess()`: quy trình cũ trong Thư viện được dựng lại bằng khuôn mới khi mở hoặc khi tải Thư viện
   (không gọi AI, giữ nguyên mã quy trình).
4. Giao diện: nhãn TS5/TS6 và kiểu câu hỏi chi tiết; trang xác nhận đề hiện cách code hiểu từng ý và cờ
   "GV nên duyệt"; trang Giáo viên hiện ý cần duyệt / ý bị bỏ qua; ô nhập số có phản hồi riêng cho sai lầm hay gặp.

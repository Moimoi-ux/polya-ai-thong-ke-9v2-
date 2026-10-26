import { AskKind, DangBaiCode } from './types.ts';
import { askLabel } from './bai22/catalog.ts';

/** Tên dạng bài hiển thị cho học sinh / giáo viên */
export const DANG_BAI_LABEL: Record<DangBaiCode, string> = {
  TS1: 'Lập bảng tần số',
  TS2: 'Vẽ biểu đồ cột',
  TS3: 'Vẽ biểu đồ đoạn thẳng',
  TS4: 'Đọc – phân tích',
  TS5: 'Tìm tần số chưa biết',
  TS6: 'Kiểm tra – sửa bảng',
};

export function dangBaiLabel(code: string): string {
  return (DANG_BAI_LABEL as Record<string, string>)[code] || code;
}

/** Nhãn chi tiết: "Đọc – phân tích · Số đối tượng thỏa một điều kiện về giá trị" */
export function partLabel(dangBai: string, askKind?: AskKind | string): string {
  if (dangBai === 'TS4' && askKind && askKind !== 'general') return `${dangBaiLabel(dangBai)} · ${askLabel(askKind)}`;
  return dangBaiLabel(dangBai);
}

export const IN_SCOPE_CODES: string[] = ['TS1', 'TS2', 'TS3', 'TS4', 'TS5', 'TS6'];

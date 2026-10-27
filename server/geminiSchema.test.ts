/**
 * Kiểm tra khuôn trả lời (responseSchema) gửi cho Gemini theo các ràng buộc của Gemini API,
 * để không lặp lại lỗi 400 "...properties[hint].properties[askKind]..." (enum chứa giá trị rỗng).
 * Chạy: npx tsx server/geminiSchema.test.ts
 */
process.env.GEMINI_API_KEY ||= 'test';
const { ANALYSIS_SCHEMA } = await import('./gemini.ts');

const TYPES = new Set(['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ARRAY', 'OBJECT']);
const KEYS = new Set(['type', 'properties', 'items', 'enum', 'required', 'nullable', 'description', 'format', 'minItems', 'maxItems', 'propertyOrdering']);
const errors: string[] = [];

function check(node: any, path: string) {
  if (!node || typeof node !== 'object') return errors.push(`${path}: không phải object`);
  for (const k of Object.keys(node)) if (!KEYS.has(k)) errors.push(`${path}: khóa "${k}" Gemini không hỗ trợ`);
  if (!TYPES.has(node.type)) errors.push(`${path}: type "${node.type}" không hợp lệ`);
  if ('nullable' in node && typeof node.nullable !== 'boolean') errors.push(`${path}: nullable phải là true/false`);
  if (node.enum !== undefined) {
    if (node.type !== 'STRING') errors.push(`${path}: enum chỉ dùng cho STRING`);
    if (!Array.isArray(node.enum) || node.enum.length === 0) errors.push(`${path}: enum rỗng`);
    for (const v of node.enum || []) {
      if (typeof v !== 'string' || v.trim() === '') errors.push(`${path}: enum có giá trị rỗng/không phải chuỗi (${JSON.stringify(v)})`);
    }
    if (new Set(node.enum).size !== node.enum.length) errors.push(`${path}: enum bị trùng`);
  }
  if (node.type === 'OBJECT') {
    const props = node.properties || {};
    for (const r of node.required || []) if (!(r in props)) errors.push(`${path}: required "${r}" không có trong properties`);
    for (const [k, v] of Object.entries(props)) check(v, `${path}.properties[${k}]`);
  }
  if (node.type === 'ARRAY') {
    if (!node.items) errors.push(`${path}: ARRAY thiếu items`);
    else check(node.items, `${path}.items`);
  }
}

check(ANALYSIS_SCHEMA, 'response_schema');
if (errors.length) {
  console.log('✗ Khuôn trả lời gửi Gemini có lỗi:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log('--- KHUÔN TRẢ LỜI GỬI GEMINI HỢP LỆ ---');
process.exit(0);

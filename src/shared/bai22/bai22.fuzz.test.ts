/** Kiểm thử ngẫu nhiên: sinh bảng + câu hỏi theo mẫu, so đáp án với phép tính độc lập. */
import { buildPart } from './index.ts';
import type { FreqTable } from './types.ts';
let seed = 7; const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const OBJ = [['y tá','năm','thời gian công tác'],['học sinh','điểm','điểm kiểm tra'],['gia đình','con','số con'],['trận','bàn thắng','số bàn thắng']];
const ops: [string, (x:number,k:number)=>boolean, string][] = [
  ['ít nhất {k} {u}', (x,k)=>x>=k, 'count_condition'], ['từ {k} {u} trở lên', (x,k)=>x>=k, 'count_condition'],
  ['nhiều nhất {k} {u}', (x,k)=>x<=k, 'count_condition'], ['không quá {k} {u}', (x,k)=>x<=k, 'count_condition'],
  ['trên {k} {u}', (x,k)=>x>k, 'count_condition'], ['dưới {k} {u}', (x,k)=>x<k, 'count_condition'],
  ['không ít hơn {k} {u}', (x,k)=>x>=k, 'count_condition'], ['ít hơn {k} {u}', (x,k)=>x<k, 'count_condition'],
  ['nhiều hơn {k} {u}', (x,k)=>x>k, 'count_condition'],
];
let bad = 0, total = 0;
for (let it = 0; it < 300; it++) {
  const [doi, u, dau] = OBJ[rnd(OBJ.length)];
  const start = rnd(3), len = 4 + rnd(5);
  const cats = Array.from({length: len}, (_, i) => String(start + i));
  const freqs = cats.map(() => 1 + rnd(12));
  const t: FreqTable = { sourceKind: rnd(2) ? 'freq_table' : 'freq_chart', valueKind: 'numeric', categories: cats, frequencies: freqs, statedSampleSize: -1, doiTuong: doi, dauHieu: dau, donVi: u, valueLabel: dau };
  const k = start + 1 + rnd(len - 2);
  const [tpl, f, kind] = ops[rnd(ops.length)];
  const q = `Có bao nhiêu ${doi} có ${tpl.replace('{k}', String(k)).replace('{u}', u)}?`;
  const exp = cats.reduce((a, c, i) => a + (f(+c, k) ? freqs[i] : 0), 0);
  const [r] = buildPart('a', q, t); total++;
  if (r.spec.askKind !== kind || r.answer?.number !== exp || r.status !== 'ok') { bad++; if (bad < 8) console.log('✗', q, '→', r.spec.askKind, r.answer?.number, 'mong đợi', exp, r.status, r.notes.slice(-2).join(' | ')); }
  // câu hỏi tổng số, tần số một giá trị, nhiều nhất
  const N = freqs.reduce((a,b)=>a+b,0);
  const checks: [string, string, number | string][] = [
    [`Có tất cả bao nhiêu ${doi}?`, 'sample_size', N],
    [`Có bao nhiêu ${doi} có ${cats[1]} ${u}?`, 'value_freq', freqs[1]],
  ];
  for (const [qq, kk, e] of checks) {
    const [rr] = buildPart('b', qq, t); total++;
    if (rr.spec.askKind !== kk || rr.answer?.number !== e || rr.status !== 'ok') { bad++; if (bad < 8) console.log('✗', qq, '→', rr.spec.askKind, rr.answer?.number, 'mong đợi', e, rr.status); }
  }
}
console.log(`Fuzz: ${total - bad}/${total} đạt`);
if (bad) process.exit(1);

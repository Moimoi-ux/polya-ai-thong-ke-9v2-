import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  limit,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { PolyaProcess, Student, Attempt, AnswerEvent, TeacherStats } from '../src/shared/types.ts';

/**
 * LƯU TRỮ BỀN VỮNG (Firestore) + BỘ ĐỆM TRONG BỘ NHỚ
 *
 * Nguyên nhân lỗi "đề trong thư viện tự biến mất sau vài ngày" ở phiên bản cũ:
 *  1. Quy trình có bảng để điền (TS1, hoặc TS4 phải lập bảng trước) chứa mảng lồng mảng
 *     (`matrix: TableCell[][]`). Firestore KHÔNG nhận mảng lồng mảng → lệnh ghi bị từ chối.
 *  2. Đề tạo từ ảnh/PDF lưu kèm cả ảnh base64 (`problemImageUrl`) → tài liệu vượt giới hạn
 *     1 MB của Firestore → lệnh ghi bị từ chối.
 *  3. Lỗi ghi bị "nuốt" (chỉ console.warn) nên quy trình chỉ nằm trong RAM của máy chủ.
 *     Khi máy chủ AI Studio/Cloud Run ngủ hoặc khởi động lại (thường sau vài giờ – vài ngày)
 *     RAM bị xóa → đề biến mất khỏi thư viện.
 *
 * Cách sửa:
 *  - Quy trình được lưu dưới dạng chuỗi JSON (`payload`) cùng vài trường tra cứu ở cấp cao
 *    → không còn vấn đề mảng lồng mảng / giá trị undefined.
 *  - Không lưu ảnh/PDF gốc của đề (ứng dụng không dùng lại ảnh sau khi đã đọc đề).
 *  - Ghi có thử lại; lệnh ghi lỗi được đưa vào hàng đợi và tự ghi lại định kỳ.
 *  - Trạng thái lưu trữ (số lệnh chờ ghi, lỗi gần nhất) hiển thị ở trang Giáo viên.
 *  - Danh sách thư viện = hợp của Firestore và bộ nhớ (không che mất đề nào).
 *  - MỤC LỤC (index): mỗi bảng có 16 tài liệu "_index_0".."_index_f" ghi danh sách mã tài liệu.
 *    Nếu luật Firestore chặn quyền ĐỌC DANH SÁCH (list) nhưng vẫn cho đọc từng tài liệu (get),
 *    ứng dụng đọc mục lục rồi lấy từng tài liệu → thư viện không bị "biến mất".
 */

const PROCESS_SCHEMA = 2;
const MAX_DOC_CHARS = 900_000; // Firestore giới hạn 1 MiB/tài liệu – chừa khoảng an toàn

const memoryCache = {
  processes: new Map<string, PolyaProcess>(),
  students: new Map<string, Student>(),
  attempts: new Map<string, Attempt>(),
  answerEvents: new Map<string, AnswerEvent>(),
  failures: new Map<string, any>(),
};

let db: any = null;
let firestoreConfigured = false;

const status = {
  lastError: '' as string,
  lastErrorAt: '' as string,
  lastSuccessAt: '' as string,
  lastReadOk: null as boolean | null,
};

/**
 * Bảng bị luật Firestore chặn quyền "đọc danh sách" (list) nhưng vẫn đọc được qua mục lục.
 * Đây KHÔNG phải lỗi mất dữ liệu → ghi nhận riêng, không đưa vào "Lỗi lưu trữ gần nhất".
 */
const listBlocked: Record<string, string> = {};
/** Sau khi bị chặn, bỏ qua đọc danh sách trực tiếp trong 6 giờ (đọc thẳng qua mục lục, đỡ báo lỗi lặp lại) */
const LIST_RETRY_MS = 6 * 60 * 60_000;

// Lệnh ghi chưa thành công → thử lại định kỳ
interface PendingWrite {
  kind?: 'doc' | 'index';
  col: string;
  id: string;
  data: any;
  error: string;
  since: string;
  tries: number;
}
const pendingWrites = new Map<string, PendingWrite>();

try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
    db = getFirestore(app, config.firestoreDatabaseId);
    firestoreConfigured = true;
    console.log('[Storage] Firestore initialized with database:', config.firestoreDatabaseId);
  } else {
    console.warn('[Storage] firebase-applet-config.json not found → CHỈ lưu trong bộ nhớ (sẽ mất khi máy chủ khởi động lại).');
  }
} catch (err) {
  console.error('[Storage] Error initializing Firestore SDK:', err);
  firestoreConfigured = false;
}

function errMsg(err: any): string {
  return String(err?.message || err || 'Lỗi không xác định').slice(0, 500);
}

const COLLECTIONS = ['processes', 'students', 'attempts', 'answerEvents', 'generationFailures'] as const;

/** Trạng thái đọc danh sách của từng bảng dữ liệu (để biết chính xác bảng nào bị chặn quyền) */
const readStatus: Record<string, { ok: boolean; mode?: 'list' | 'index' | 'memory'; error?: string; count?: number; at: string }> = {};

function markError(err: any, where?: string) {
  status.lastError = (where ? `[${where}] ` : '') + errMsg(err);
  status.lastErrorAt = new Date().toISOString();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Firestore không nhận undefined → loại bỏ bằng vòng JSON */
function clean<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ───────── Mục lục (index) ─────────

const INDEX_SHARDS = 16;
/** Trường bắt buộc theo luật firestore.rules của từng bảng (để tài liệu mục lục được phép ghi) */
const INDEX_PLACEHOLDER: Record<string, any> = {
  processes: { textHash: '_index', dataHash: '_index' },
  students: { name: '_index', className: '_index', school: '_index' },
  attempts: { studentId: '_index', processId: '_index' },
  answerEvents: { attemptId: '_index' },
  generationFailures: { reason: '_index' },
};

function shardOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % INDEX_SHARDS;
}
function indexDocId(shard: number): string {
  return `_index_${shard.toString(16)}`;
}
function isMetaId(id: string): boolean {
  return id === '_kiemtra' || id.startsWith('_index');
}

/** Thêm mã tài liệu vào mục lục (arrayUnion → an toàn khi nhiều người ghi cùng lúc) */
async function addToIndex(col: string, ids: string[]) {
  const byShard = new Map<number, string[]>();
  for (const id of ids) {
    if (!id || isMetaId(id)) continue;
    const s = shardOf(id);
    if (!byShard.has(s)) byShard.set(s, []);
    byShard.get(s)!.push(id);
  }
  for (const [shard, list] of byShard.entries()) {
    for (let i = 0; i < list.length; i += 400) {
      const chunk = list.slice(i, i + 400);
      const docId = indexDocId(shard);
      await withTimeout(
        setDoc(
          doc(db, col, docId),
          { id: docId, kind: 'index', ...(INDEX_PLACEHOLDER[col] || {}), ids: arrayUnion(...chunk) },
          { merge: true }
        ),
        12_000,
        `ghi mục lục ${col}`
      );
    }
  }
}

async function removeFromIndex(col: string, id: string) {
  const docId = indexDocId(shardOf(id));
  await withTimeout(
    setDoc(doc(db, col, docId), { id: docId, kind: 'index', ...(INDEX_PLACEHOLDER[col] || {}), ids: arrayRemove(id) }, { merge: true }),
    12_000,
    `xóa khỏi mục lục ${col}`
  );
}

/** Đọc toàn bộ mã tài liệu trong mục lục của một bảng */
async function readIndex(col: string): Promise<Set<string>> {
  const snaps = await Promise.all(
    Array.from({ length: INDEX_SHARDS }, (_, s) =>
      withTimeout(getDoc(doc(db, col, indexDocId(s))), 10_000, `đọc mục lục ${col}`)
    )
  );
  const ids = new Set<string>();
  for (const sn of snaps) {
    if (sn.exists()) for (const id of (sn.data()?.ids || []) as string[]) if (id && !isMetaId(id)) ids.add(id);
  }
  return ids;
}

/** Firestore Web SDK có thể chờ vô hạn khi mất mạng → đặt giới hạn thời gian */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Hết thời gian chờ Firestore (${what}, ${ms / 1000}s)`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function writeOnce(col: string, id: string, data: any) {
  await withTimeout(setDoc(doc(db, col, id), data), 12_000, `ghi ${col}`);
  status.lastSuccessAt = new Date().toISOString();
}

/**
 * Ghi có thử lại (2 lần). Thất bại → đưa vào hàng đợi để ghi lại sau.
 * Trả về true nếu đã lưu vào Firestore.
 */
async function durableWrite(col: string, id: string, data: any): Promise<{ persisted: boolean; error?: string }> {
  if (!db) return { persisted: false, error: 'Chưa cấu hình Firestore' };
  const key = `${col}/${id}`;
  let lastErr: any = null;
  for (let i = 0; i < 2; i++) {
    try {
      await writeOnce(col, id, data);
      pendingWrites.delete(key);
      try {
        await addToIndex(col, [id]);
        pendingWrites.delete(`index:${key}`);
      } catch (idxErr) {
        markError(idxErr, `ghi mục lục ${key}`);
        pendingWrites.set(`index:${key}`, {
          kind: 'index',
          col,
          id,
          data: null,
          error: errMsg(idxErr),
          since: new Date().toISOString(),
          tries: 1,
        });
      }
      return { persisted: true };
    } catch (err) {
      lastErr = err;
      // Lỗi do dữ liệu (không hợp lệ / quá lớn / bị luật chặn) → thử lại vô ích
      const code = String((err as any)?.code || '');
      if (code === 'invalid-argument' || code === 'permission-denied' || code === 'failed-precondition') break;
      await sleep(400 * Math.pow(2, i));
    }
  }
  markError(lastErr, `ghi ${key}`);
  console.error(`[Storage] KHÔNG lưu được ${key} vào Firestore:`, lastErr);
  const prev = pendingWrites.get(key);
  pendingWrites.set(key, {
    col,
    id,
    data,
    error: errMsg(lastErr),
    since: prev?.since || new Date().toISOString(),
    tries: (prev?.tries || 0) + 1,
  });
  return { persisted: false, error: errMsg(lastErr) };
}

/** Thử ghi lại các lệnh còn treo (mỗi phút) */
async function flushPending() {
  if (!db || pendingWrites.size === 0) return;
  for (const [key, w] of Array.from(pendingWrites.entries())) {
    try {
      if (w.kind === 'index') {
        await addToIndex(w.col, [w.id]);
      } else {
        await writeOnce(w.col, w.id, w.data);
        await addToIndex(w.col, [w.id]).catch(() => {});
      }
      pendingWrites.delete(key);
      console.log(`[Storage] Đã ghi lại thành công ${key}`);
    } catch (err) {
      w.tries++;
      w.error = errMsg(err);
      markError(err, `ghi lại ${key}`);
    }
  }
}
const flushTimer = setInterval(() => {
  flushPending().catch(() => {});
}, 60_000);
(flushTimer as any).unref?.();

// ───────── Mã hóa quy trình ─────────

function encodeProcess(p: PolyaProcess): any {
  // Không lưu ảnh/PDF gốc (base64 rất lớn, ứng dụng không dùng lại)
  const { problemImageUrl: _omit, ...rest } = p as any;
  const payload = JSON.stringify(rest);
  if (payload.length > MAX_DOC_CHARS) {
    throw new Error(`Quy trình quá lớn để lưu (${Math.round(payload.length / 1024)} KB).`);
  }
  return {
    id: p.id,
    textHash: p.textHash,
    dataHash: p.dataHash,
    templateVersion: p.templateVersion || '',
    status: p.status || 'ready',
    createdAt: p.createdAt || new Date().toISOString(),
    problemText: (p.problemText || '').slice(0, 5000),
    dangBai: (p.parts || []).map((x) => x.dangBai).join(','),
    schema: PROCESS_SCHEMA,
    payload,
  };
}

/** Đọc cả dạng mới (payload) lẫn dạng cũ (lưu trực tiếp các trường) */
function decodeProcess(data: any): PolyaProcess | null {
  if (!data) return null;
  if (typeof data.payload === 'string') {
    try {
      const p = JSON.parse(data.payload) as PolyaProcess;
      if (p && p.id && Array.isArray(p.parts)) return p;
    } catch (err) {
      console.warn('[Storage] Không giải mã được quy trình', data.id, err);
    }
    return null;
  }
  if (data.id && Array.isArray(data.parts)) return data as PolyaProcess;
  return null;
}

/** Hợp danh sách Firestore + bộ nhớ (theo id) */
function mergeById<T extends { id: string }>(fromDb: T[], mem: Map<string, T>): T[] {
  const map = new Map<string, T>();
  for (const x of fromDb) map.set(x.id, x);
  for (const [id, x] of mem.entries()) if (!map.has(id)) map.set(id, x);
  return Array.from(map.values());
}

const listDeniedUntil: Record<string, number> = {};
const lastBackfill: Record<string, number> = {};

async function listCollection<T extends { id: string }>(
  col: string,
  mem: Map<string, T>,
  decode: (d: any) => T | null = (d) => d as T
): Promise<T[]> {
  if (!db) return Array.from(mem.values());

  // 1) Đọc danh sách trực tiếp (nhanh, đầy đủ) – bỏ qua 10 phút nếu vừa bị chặn quyền
  if (!(listDeniedUntil[col] > Date.now())) {
    try {
      const snap = await withTimeout(getDocs(collection(db, col)), 15_000, `đọc ${col}`);
      const list: T[] = [];
      snap.forEach((d: any) => {
        if (isMetaId(d.id)) return;
        const x = decode(d.data());
        if (x && x.id && !isMetaId(x.id)) {
          mem.set(x.id, x);
          list.push(x);
        }
      });
      status.lastReadOk = true;
      delete listBlocked[col];
      readStatus[col] = { ok: true, mode: 'list', at: new Date().toISOString() };
      // Bổ sung mục lục cho dữ liệu cũ (tối đa 30 phút/lần)
      if (!(lastBackfill[col] > Date.now() - 30 * 60_000)) {
        lastBackfill[col] = Date.now();
        readIndex(col)
          .then((idx) => addToIndex(col, list.map((x) => x.id).filter((id) => !idx.has(id))))
          .catch((e) => console.warn(`[Storage] backfill index ${col}:`, e));
      }
      return mergeById(list, mem);
    } catch (err) {
      const code = String((err as any)?.code || '');
      if (code === 'permission-denied') {
        // Luật Firestore chưa cho "đọc danh sách" → chuyển sang đọc qua mục lục (dữ liệu vẫn an toàn).
        // Không ghi vào lastError; chỉ báo lỗi nếu cả cách đọc qua mục lục cũng thất bại.
        listDeniedUntil[col] = Date.now() + LIST_RETRY_MS;
        listBlocked[col] = errMsg(err);
        console.warn(`[Storage] Luật Firestore chặn đọc danh sách "${col}" → đọc qua mục lục.`);
      } else {
        markError(err, `đọc danh sách "${col}"`);
        console.warn(`[Storage] list ${col} error → thử đọc qua mục lục:`, err);
      }
      readStatus[col] = { ok: false, mode: 'memory', error: errMsg(err), at: new Date().toISOString() };
    }
  }

  // 2) Dự phòng: đọc mục lục rồi lấy từng tài liệu (chỉ cần quyền "get")
  try {
    const ids = await readIndex(col);
    // Tài liệu đã lưu thành công trong phiên này nhưng chưa có trong mục lục → bổ sung
    const memMissing = Array.from(mem.keys()).filter(
      (id) => !ids.has(id) && !isMetaId(id) && !pendingWrites.has(`${col}/${id}`)
    );
    if (memMissing.length) addToIndex(col, memMissing).catch(() => {});

    const toFetch = Array.from(ids).filter((id) => !mem.has(id));
    for (let i = 0; i < toFetch.length; i += 20) {
      const batch = toFetch.slice(i, i + 20);
      const snaps = await Promise.all(
        batch.map((id) =>
          withTimeout(getDoc(doc(db, col, id)), 10_000, `đọc ${col}/${id}`).catch(() => null)
        )
      );
      for (const sn of snaps) {
        if (sn && sn.exists()) {
          const x = decode(sn.data());
          if (x && x.id) mem.set(x.id, x);
        }
      }
    }
    status.lastReadOk = true;
    readStatus[col] = {
      ok: true,
      mode: 'index',
      error: readStatus[col]?.error,
      count: ids.size,
      at: new Date().toISOString(),
    };
    return Array.from(mem.values()).filter((x) => !isMetaId(x.id));
  } catch (err) {
    status.lastReadOk = false;
    readStatus[col] = { ok: false, mode: 'memory', error: errMsg(err), at: new Date().toISOString() };
    markError(err, `đọc mục lục "${col}"`);
    return Array.from(mem.values());
  }
}

async function getOne<T>(col: string, id: string, mem: Map<string, T>, decode: (d: any) => T | null = (d) => d as T): Promise<T | null> {
  if (mem.has(id)) return mem.get(id)!;
  if (!db) return null;
  try {
    const snap = await withTimeout(getDoc(doc(db, col, id)), 10_000, `đọc ${col}/${id}`);
    if (snap.exists()) {
      const x = decode(snap.data());
      if (x) {
        mem.set(id, x);
        return x;
      }
    }
  } catch (err) {
    markError(err, `đọc ${col}/${id}`);
    console.warn(`[Storage] get ${col}/${id} error:`, err);
  }
  return null;
}

export function isFirestoreConnected(): boolean {
  return firestoreConfigured && status.lastReadOk !== false;
}

/**
 * Kiểm tra quyền ĐỌC DANH SÁCH và GHI của từng bảng dữ liệu trên Firestore.
 * Ghi thử một tài liệu "_kiemtra" rồi xóa đi (không ảnh hưởng dữ liệu thật).
 */
export async function checkFirestoreAccess() {
  const results: { collection: string; list: string; get: string; write: string; index: string }[] = [];
  if (!db) return { configured: false, results };
  const probes: Record<string, any> = {
    processes: { id: '_kiemtra', textHash: '_', dataHash: '_', payload: '{}', schema: PROCESS_SCHEMA },
    students: { id: '_kiemtra', name: '_', className: '_', school: '_' },
    attempts: { id: '_kiemtra', studentId: '_', processId: '_' },
    answerEvents: { id: '_kiemtra', attemptId: '_' },
    generationFailures: { id: '_kiemtra', reason: '_' },
  };
  for (const col of COLLECTIONS) {
    let list = 'OK';
    let get = 'OK';
    let write = 'OK';
    let index = 'OK';
    try {
      await withTimeout(getDocs(query(collection(db, col), limit(1))), 10_000, `đọc ${col}`);
      listDeniedUntil[col] = 0;
      delete listBlocked[col];
    } catch (err) {
      list = errMsg(err);
    }
    try {
      await withTimeout(setDoc(doc(db, col, '_kiemtra'), probes[col]), 10_000, `ghi ${col}`);
      try {
        const sn = await withTimeout(getDoc(doc(db, col, '_kiemtra')), 10_000, `đọc ${col}/_kiemtra`);
        if (!sn.exists()) get = 'Không đọc lại được tài liệu vừa ghi';
      } catch (err) {
        get = errMsg(err);
      }
      try {
        await withTimeout(deleteDoc(doc(db, col, '_kiemtra')), 10_000, `xóa ${col}`);
      } catch {
        /* xóa thử không được thì thôi – tài liệu "_kiemtra" bị lọc khi đọc */
      }
    } catch (err) {
      write = errMsg(err);
      get = '(chưa kiểm tra)';
    }
    try {
      const n = (await readIndex(col)).size;
      index = `OK (${n} mục)`;
    } catch (err) {
      index = errMsg(err);
    }
    results.push({ collection: col, list, get, write, index });
  }
  return { configured: true, results };
}

export function getStorageStatus() {
  // Lỗi cũ đã được khắc phục: sau lỗi đó đã lưu thành công và không còn lệnh nào chờ ghi
  const lastErrorResolved =
    !!status.lastError &&
    pendingWrites.size === 0 &&
    !!status.lastSuccessAt &&
    status.lastSuccessAt > status.lastErrorAt;
  return {
    firestoreConfigured,
    firestoreConnected: isFirestoreConnected(),
    pendingWrites: pendingWrites.size,
    pendingItems: Array.from(pendingWrites.values())
      .slice(0, 20)
      .map((w) => ({ key: `${w.col}/${w.id}`, error: w.error, since: w.since, tries: w.tries })),
    lastError: status.lastError,
    lastErrorAt: status.lastErrorAt,
    lastErrorResolved,
    lastSuccessAt: status.lastSuccessAt,
    /** Các bảng bị chặn "đọc danh sách" nhưng vẫn đọc được qua mục lục */
    listBlocked: Object.keys(listBlocked),
    readStatus,
  };
}

export const storage = {
  /** Lưu quy trình. persisted=false nghĩa là CHƯA vào Firestore (đang chờ ghi lại). */
  async saveProcess(proc: PolyaProcess): Promise<{ persisted: boolean; error?: string }> {
    const { problemImageUrl: _omit, ...rest } = proc as any;
    const p = rest as PolyaProcess;
    memoryCache.processes.set(p.id, p);
    let encoded: any;
    try {
      encoded = encodeProcess(p);
    } catch (err) {
      markError(err);
      return { persisted: false, error: errMsg(err) };
    }
    return durableWrite('processes', p.id, encoded);
  },

  async getProcessById(id: string): Promise<PolyaProcess | null> {
    return getOne('processes', id, memoryCache.processes, decodeProcess);
  },

  async findProcessByHashes(textHash: string, dataHash: string, templateVersion?: string): Promise<PolyaProcess | null> {
    const versionOk = (p: PolyaProcess) => !templateVersion || p.templateVersion === templateVersion;

    for (const p of memoryCache.processes.values()) {
      if ((p.textHash === textHash || p.dataHash === dataHash) && versionOk(p)) return p;
    }

    if (!db) return null;
    try {
      // Luật Firestore đang chặn truy vấn danh sách → tìm thẳng qua mục lục
      if (listDeniedUntil['processes'] > Date.now()) throw Object.assign(new Error('list blocked'), { code: 'permission-denied' });
      for (const [field, value] of [
        ['textHash', textHash],
        ['dataHash', dataHash],
      ] as const) {
        const q = query(collection(db, 'processes'), where(field, '==', value), limit(10));
        const snap = await withTimeout(getDocs(q), 10_000, 'tra cứu quy trình');
        for (const d of snap.docs) {
          const found = decodeProcess(d.data());
          if (found && versionOk(found)) {
            memoryCache.processes.set(found.id, found);
            return found;
          }
        }
      }
    } catch (err) {
      if (String((err as any)?.code || '') === 'permission-denied') {
        listDeniedUntil['processes'] = Math.max(listDeniedUntil['processes'] || 0, Date.now() + LIST_RETRY_MS);
        listBlocked['processes'] = listBlocked['processes'] || errMsg(err);
      } else {
        console.warn('[Storage] Firestore hash lookup error → tìm qua mục lục:', err);
      }
      try {
        const all = await listCollection('processes', memoryCache.processes, decodeProcess);
        const found = all.find((p) => (p.textHash === textHash || p.dataHash === dataHash) && versionOk(p));
        if (found) return found;
      } catch {
        /* bỏ qua */
      }
    }
    return null;
  },

  async listProcesses(): Promise<PolyaProcess[]> {
    const list = await listCollection('processes', memoryCache.processes, decodeProcess);
    return list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  },

  async deleteProcess(id: string): Promise<void> {
    memoryCache.processes.delete(id);
    pendingWrites.delete(`processes/${id}`);
    if (!db) return;
    try {
      await withTimeout(deleteDoc(doc(db, 'processes', id)), 15_000, 'xóa quy trình');
      await removeFromIndex('processes', id).catch((e) => console.warn('[Storage] removeFromIndex:', e));
    } catch (err) {
      markError(err, `xóa processes/${id}`);
      console.warn('[Storage] deleteProcess error:', err);
      throw err;
    }
  },

  async saveStudent(student: Student) {
    memoryCache.students.set(student.id, student);
    return durableWrite('students', student.id, clean(student));
  },

  async getStudent(id: string): Promise<Student | null> {
    return getOne('students', id, memoryCache.students);
  },

  async saveAttempt(attempt: Attempt) {
    memoryCache.attempts.set(attempt.id, attempt);
    return durableWrite('attempts', attempt.id, clean(attempt));
  },

  async getAttempt(id: string): Promise<Attempt | null> {
    return getOne('attempts', id, memoryCache.attempts);
  },

  async listAttempts(): Promise<Attempt[]> {
    return listCollection('attempts', memoryCache.attempts);
  },

  async listStudents(): Promise<Student[]> {
    return listCollection('students', memoryCache.students);
  },

  async saveAnswerEvent(event: AnswerEvent) {
    memoryCache.answerEvents.set(event.id, event);
    return durableWrite('answerEvents', event.id, clean(event));
  },

  async listAnswerEvents(): Promise<AnswerEvent[]> {
    return listCollection('answerEvents', memoryCache.answerEvents);
  },

  async saveFailure(failure: { id: string; problemText: string; reason: string; createdAt: string }) {
    memoryCache.failures.set(failure.id, failure);
    return durableWrite('generationFailures', failure.id, clean(failure));
  },

  async listFailures(): Promise<any[]> {
    return listCollection('generationFailures', memoryCache.failures);
  },

  async getTeacherStats(): Promise<TeacherStats> {
    const attempts = await this.listAttempts();
    const students = await this.listStudents();
    const processes = await this.listProcesses();
    const failures = await this.listFailures();

    let totalScore = 0;
    let completedCount = 0;
    const dateMap = new Map<string, number>();

    for (const a of attempts) {
      if (a.status === 'completed') {
        totalScore += a.score;
        completedCount++;
      }
      const d = (a.startedAt || '').split('T')[0] || 'Hôm nay';
      dateMap.set(d, (dateMap.get(d) || 0) + 1);
    }

    const attemptsByDate = Array.from(dateMap.entries()).map(([date, count]) => ({ date, count }));

    return {
      totalStudents: students.length,
      totalAttempts: attempts.length,
      avgScore: completedCount > 0 ? Math.round((totalScore / completedCount) * 10) / 10 : 0,
      totalProcesses: processes.length,
      failedCount: failures.length,
      attemptsByDate,
    };
  },
};

/** Dùng cho kiểm thử */
export const __storageTest = { encodeProcess, decodeProcess };

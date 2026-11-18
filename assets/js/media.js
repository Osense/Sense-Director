/* 영상 파일 보관 — 서버가 없으므로 지금은 이 브라우저(IndexedDB)에 올려 두는 목업.
   서버를 붙이면 putMedia를 실제 업로드로, getMedia를 다운로드 주소로 바꾼다. */
const DB = 'sense-director-media', OS = 'files';
let dbp = null;
function db() {
  return dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(OS);
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  }));
}
const tx = async (mode, f) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(OS, mode); const r = f(t.objectStore(OS)); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };

/** 업로드(목업): 진행률을 보여 주며 파일을 저장한다 */
export async function putMedia(fid, file, onProgress = () => {}) {
  // 실제 업로드처럼 진행률이 오르도록 파일을 조각내 읽어 본다 (큰 파일도 멈춘 듯 보이지 않게)
  const step = Math.max(4 << 20, Math.ceil(file.size / 40));
  for (let o = 0; o < file.size; o += step) {
    await file.slice(o, o + step).arrayBuffer();
    onProgress(Math.min(0.95, (o + step) / file.size));
    await new Promise(r => setTimeout(r, 25));
  }
  await tx('readwrite', s => s.put(file, fid));
  onProgress(1);
  return { fid, name: file.name, size: file.size, type: file.type };
}
export async function getMedia(fid) { try { return (await tx('readonly', s => s.get(fid))) || null; } catch { return null; } }
export async function deleteMedia(fid) { try { await tx('readwrite', s => s.delete(fid)); } catch {} }
export const fmtSize = n => n > 1 << 30 ? (n / (1 << 30)).toFixed(2) + 'GB' : n > 1 << 20 ? (n / (1 << 20)).toFixed(1) + 'MB' : Math.round(n / 1024) + 'KB';
/** 작은 값(그림 데이터 등) 보관 — 캔바 페이지 사진 */
export async function putValue(key, value) { try { await tx('readwrite', s => s.put(value, key)); return true; } catch { return false; } }

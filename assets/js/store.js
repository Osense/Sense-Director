/* 저장소 — 지금은 서버 없는 목업(이 브라우저 localStorage).
   나중에 서버를 붙일 때 이 파일의 함수만 바꾸면 화면 코드는 그대로 쓴다. */
export const MODE = 'mock';
const handlers = {};
addEventListener('storage', e => { if (e.key && e.key.startsWith('sd:')) Object.values(handlers).forEach(f => f(e.key)); });

const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const K = { projects: 'sd:projects', inbox: id => 'sd:inbox:' + id, client: id => 'sd:client:' + id, me: 'sd:me', dl: id => 'sd:dl:' + id };

export const Store = {
  projects() { return Object.values(read(K.projects, {})).sort((a, b) => (!!b.pinned - !!a.pinned) || (b.updatedAt || 0) - (a.updatedAt || 0)); },
  getProject(id) { return read(K.projects, {})[id] || null; },
  saveProject(p) { const all = read(K.projects, {}); p.updatedAt = Date.now(); all[p.id] = p; return write(K.projects, all); },
  deleteProject(id) { const all = read(K.projects, {}); delete all[id]; write(K.projects, all); localStorage.removeItem(K.inbox(id)); localStorage.removeItem(K.dl(id)); },
  /** 최종본 수령 기록 { gotAt, okAt, by } — 목업: 같은 브라우저로 주고받는다 */
  delivery(pid) { return read(K.dl(pid), null); },
  saveDelivery(pid, patch) { return write(K.dl(pid), { ...(read(K.dl(pid), {}) || {}), ...patch }); },
  clearDelivery(pid) { localStorage.removeItem(K.dl(pid)); },

  inbox(pid) { return read(K.inbox(pid), []); },
  saveInbox(pid, list) { return write(K.inbox(pid), list); },
  /** 클라이언트 → 디렉터 전송. 목업: 같은 브라우저의 디렉터 수신함에 넣는다. */
  async submit(pid, req) {
    const list = read(K.inbox(pid), []);
    const i = list.findIndex(r => r.rid === req.rid);
    if (i >= 0) list[i] = { ...list[i], ...req, items: mergeItems(list[i].items, req.items) }; else list.push(req);
    const ok = write(K.inbox(pid), list);
    if (!ok) { // 용량 초과: 스냅샷 없이 다시 시도
      const slim = list.map(r => ({ ...r, items: r.items.map(({ th, ...it }) => it) }));
      if (!write(K.inbox(pid), slim)) throw new Error('storage');
    }
    return { delivered: MODE };
  },
  /** 디렉터가 링크·파일로 받은 요청을 수신함에 합치기 */
  importRequest(pid, req) {
    const list = read(K.inbox(pid), []);
    const i = list.findIndex(r => r.rid === req.rid);
    if (i >= 0) list[i] = { ...list[i], ...req, items: mergeItems(list[i].items, req.items, true) }; else list.push(req);
    write(K.inbox(pid), list);
    return i < 0;
  },

  client(pid) { return read(K.client(pid), { from: read(K.me, ''), draft: [], sent: [] }); },
  saveClient(pid, s) { if (s.from) write(K.me, s.from); return write(K.client(pid), s); },

  /** 다른 탭에서 바뀐 내용 알림 — 화면마다 하나의 처리기만 둔다 */
  onChange(cb, scope = 'page') { handlers[scope] = cb; },
  /** 화면 하나에 처리기를 하나 더 (납품 탭 등) */
  onChangeAlso(scope, cb) { handlers[scope] = cb; },
};

/* 같은 수정 포인트가 다시 들어오면 디렉터가 남긴 상태·댓글은 지키고 클라이언트 쪽 내용만 갱신 */
function mergeItems(oldItems = [], newItems = [], keepThumb = false) {
  const map = new Map(oldItems.map(it => [it.id, it]));
  for (const it of newItems) {
    const o = map.get(it.id);
    if (!o) { map.set(it.id, it); continue; }
    const rp = [...(o.rp || [])];
    for (const r of it.rp || []) if (!rp.some(x => x.at === r.at && x.b === r.b)) rp.push(r);
    map.set(it.id, { ...o, ...it, th: it.th || (keepThumb ? o.th : o.th), st: o.st || it.st, rp: rp.sort((a, b) => a.at - b.at) });
  }
  return [...map.values()].sort((a, b) => a.t - b.t);
}
export { mergeItems };

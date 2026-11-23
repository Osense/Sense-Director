/* 수정본(차수) — 한 프로젝트에 1차·2차·3차… 영상을 차례로 올린다.
   p.vers = [{ n, src, ar, fps, fpsHow, poster, duration, at }] — 마지막이 최신.
   p.src·p.ar 등은 언제나 최신 차수와 같다(클라이언트 링크·납품이 그대로 쓴다).
   수정요청·디렉터 안내에는 만든 차수 v가 붙는다(없으면 1차). DB에서는 versions 표 + items.version 열. */
import { esc, ic } from './util.js';
import { t, fmtTime, fmtDay } from './i18n.js';

const FIELDS = ['src', 'ar', 'fps', 'fpsHow', 'poster', 'duration'];

/** 차수 목록 — 예전 프로젝트(vers 없음)는 지금 영상을 1차로 본다 */
export function versOf(p) {
  if (p.vers && p.vers.length) return p.vers;
  if (p.vs && p.vs.length) return p.vs; // 클라이언트 링크에 담겨 온 것
  const src = p.src;
  return src ? [{ n: 1, src, ar: p.ar, fps: p.fps, fpsHow: p.fpsHow || p.fh || '', poster: p.poster || p.pv || '', duration: p.duration || 0, at: p.createdAt || 0 }] : [];
}

/** 최신 차수에 프로젝트의 영상 정보를 맞춘다(저장할 때마다) */
export function syncLatest(p) {
  if (!p.vers || !p.vers.length) return;
  const last = p.vers[p.vers.length - 1];
  FIELDS.forEach(k => { last[k] = p[k]; });
}

/** 새 수정본 — 지금까지 영상은 이전 차수로 남고, 새 영상이 최신이 된다 */
export function addVersion(p, src, meta = {}) {
  if (!p.vers || !p.vers.length) p.vers = versOf(p).map(v => ({ ...v }));
  const n = (p.vers.length ? p.vers[p.vers.length - 1].n : 0) + 1;
  const v = { n, src, ar: meta.ar || [16, 9], fps: meta.fps || 0, fpsHow: meta.fps ? 'title' : '', poster: meta.poster || '', duration: 0, at: Date.now() };
  p.vers.push(v);
  FIELDS.forEach(k => { p[k] = v[k]; });
  return v;
}

/** 최신 차수 지우기(잘못 올렸을 때) — 그 차수에 남긴 표시는 바로 앞 차수로 옮긴다 */
export function dropLatest(p, moveItems) {
  const vs = versOf(p); if (vs.length < 2) return false;
  p.vers = vs.slice(0, -1).map(v => ({ ...v }));
  const gone = vs[vs.length - 1].n, prev = p.vers[p.vers.length - 1];
  FIELDS.forEach(k => { p[k] = prev[k]; });
  moveItems(gone, prev.n);
  return true;
}

export const itemVer = it => it.v || 1;
export const verName = n => t('{n}차', { n });

/* 보고 있는 차수 — 탭을 닫을 때까지 기억(링크·저장 데이터는 늘 최신) */
const key = id => 'sd:cv:' + id;
export function viewedVer(id, vers) {
  const n = +(sessionStorage.getItem(key(id)) || 0);
  return vers.find(v => v.n === n) || vers[vers.length - 1];
}
export function setViewed(id, n, latest) {
  if (!n || n === latest) sessionStorage.removeItem(key(id)); else sessionStorage.setItem(key(id), n);
}

/** 영상 위 차수 단추 줄 — 1차 2차 3차 [+ 새 수정본] */
export function verbarHTML(vers, cur, { add = false } = {}) {
  if (!vers.length || (vers.length < 2 && !add)) return '';
  const last = vers[vers.length - 1].n;
  return `<div class="verbar" role="group" aria-label="${t('수정본')}">
    ${vers.length > 1 ? `<span class="verbar-label">${t('수정본')}</span>
    <div class="seg small vers">${vers.map(v => `<button class="btn${v.n === cur ? ' on' : ''}" data-ver="${v.n}" title="${esc(t('{n}차 수정본', { n: v.n }))}${v.at ? ' · ' + esc(fmtTime(v.at)) : ''}">${esc(verName(v.n))}${v.n === last && vers.length > 1 ? `<i class="ver-new">${t('최신')}</i>` : ''}</button>`).join('')}</div>` : ''}
    ${cur !== last ? `<span class="ver-old">${t('이전 수정본을 보는 중')}</span><button class="btn small ghost" data-ver="${last}">${t('최신으로')}</button>` : ''}
    ${add ? `<button class="btn small" data-act="add-ver" title="${t('같은 프로젝트에 다음 차수 영상을 올려요')}">${ic('plus', 14)}${t('새 수정본')}</button>` : ''}
  </div>`;
}

/** 채팅 구분선 — "2차 수정본이 업로드되었습니다." */
export const verLine = v => `<div class="ver-line" data-ver-line="${v.n}"><span>${esc(t('{n}차 수정본이 업로드되었습니다.', { n: v.n }))}${v.at ? `<time>${esc(fmtDay(v.at) + ' ' + fmtTime(v.at))}</time>` : ''}</span></div>`;

/** 시간 순서 목록 사이사이에 구분선을 끼운다. rows: [{ at, html }], desc: 최신이 위 */
export function withVerLines(rows, vers, desc = true) {
  const lines = vers.filter(v => v.n > 1).map(v => ({ at: v.at || 0, html: verLine(v), line: true }));
  const all = [...rows, ...lines].sort((a, b) => desc ? (b.at - a.at) || (a.line ? -1 : 1) : (a.at - b.at) || (a.line ? -1 : 1));
  return all.map(x => x.html).join('');
}

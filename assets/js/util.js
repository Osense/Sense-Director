/* 공통 도구: DOM, 아이콘, 시간 주소, 압축 링크, 토스트·모달 */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = (n = 8) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- 아이콘: 얇은 선, 이모지 대신 ---------- */
const P = {
  play: '<path d="M7 5v14l12-7z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  prev: '<path d="M6 5v14M19 5 9 12l10 7z"/>',
  next: '<path d="M18 5v14M5 5l10 7-10 7z"/>',
  pin: '<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>',
  note: '<path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3"/>',
  send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  link: '<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12m0-12-4 4m4-4 4 4"/>',
  msg: '<path d="M4 5h16v11H9l-5 4z"/>',
  file: '<path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7zM14 3v4h4"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  inbox: '<path d="M3 13h5l1 3h6l1-3h5M5 5h14l2 8v6H3v-6z"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  help: '<path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 18h.01"/><circle cx="12" cy="12" r="10"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  back: '<path d="M15 18 9 12l6-6"/>',
  undo: '<path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/>',
  loop: '<path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4"/>',
  cam: '<path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  reply: '<path d="M10 9 5 13l5 4M5 13h9a5 5 0 0 1 5 5v1"/>',
  import: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6"/>',
  dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
};
export const ic = (n, s = 16) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

/* ---------- 시간 주소: 시:분:초:프레임 ---------- */
export const STD_FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];
export function snapFps(f) {
  if (!f || !isFinite(f)) return 0;
  let best = STD_FPS[0];
  for (const s of STD_FPS) if (Math.abs(s - f) < Math.abs(best - f)) best = s;
  return Math.abs(best - f) / best < 0.06 ? best : Math.round(f);
}
export function tc(t, fps = 30) {
  t = Math.max(0, +t || 0);
  const base = Math.round(fps) || 30;
  let frames = Math.round(t * (fps || 30));
  const ff = frames % base, s = Math.floor(frames / base);
  const p = n => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(ff)}`;
}
export const fpsLabel = f => !f ? '' : (Number.isInteger(f) ? f : f.toFixed(2).replace(/0$/, '')) + 'fps';

/* ---------- 링크에 담는 데이터: deflate + base64url ---------- */
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
export async function pack(obj) {
  const data = new TextEncoder().encode(JSON.stringify(obj));
  if (window.CompressionStream) {
    const out = await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    return 'z' + b64u(out);
  }
  return 'j' + b64u(data);
}
export async function unpack(s) {
  if (!s) return null;
  const kind = s[0], bytes = unb64u(s.slice(1));
  let text;
  if (kind === 'z') text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  else text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}
export async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return b64u(d).slice(0, 22);
}
export const hashParams = () => Object.fromEntries(location.hash.slice(1).split('&').filter(Boolean).map(kv => { const i = kv.indexOf('='); return i < 0 ? [kv, ''] : [kv.slice(0, i), kv.slice(i + 1)]; }));
export const appBase = () => location.origin + location.pathname;

/* ---------- 유튜브·영상 주소 ---------- */
export function parseSource(raw) {
  const url = String(raw || '').trim();
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/))([A-Za-z0-9_-]{11})/) || (/^[A-Za-z0-9_-]{11}$/.test(url) ? [0, url] : null);
  if (m) return { k: 'yt', id: m[1], short: /\/shorts\//.test(url) };
  const vp = url.match(/player\.vimeo\.com\/video\/(\d+)(?:[^#]*[?&]h=([0-9a-f]+))?/i);
  if (vp) return { k: 'vimeo', id: vp[1], h: vp[2] || undefined };
  const v = url.match(/vimeo\.com\/(?:[^?#]*\/)?(\d{6,})(?:\/([0-9a-f]{6,}))?/i);
  if (v) return { k: 'vimeo', id: v[1], h: v[2] || (url.match(/[?&]h=([0-9a-f]+)/i) || [])[1] };
  if (/^https?:\/\/.+/i.test(url)) return { k: 'url', url };
  return null;
}

/* ---------- 복사·내려받기·공유 ---------- */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok;
}
export function download(name, content, type = 'text/html') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: type + ';charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
export async function shareOrCopy({ title, text, url }) {
  if (navigator.share && matchMedia('(pointer:coarse)').matches) {
    try { await navigator.share({ title, text, url }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  return (await copyText([text, url].filter(Boolean).join('\n'))) ? 'copied' : 'fail';
}
export const safeName = s => String(s || 'sense-director').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'sense-director';

/* ---------- 토스트 ---------- */
let toastT;
export function toast(msg, ms = 2600) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.innerHTML = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms);
}

/* ---------- 모달 ---------- */
export function modal({ title = '', body = '', actions = [], wide = false, onOpen, dismissible = true }) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal open';
    wrap.innerHTML = `<div class="box${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      ${title ? `<h3>${esc(title)}</h3>` : ''}<div class="mbody">${body}</div>
      ${actions.length ? `<div class="foot">${actions.map((a, i) => `<button class="btn ${a.kind || ''}" data-i="${i}">${a.label}</button>`).join('')}</div>` : ''}</div>`;
    const close = v => { wrap.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = e => { if (e.key === 'Escape' && dismissible) { e.stopPropagation(); close(null); } };
    document.addEventListener('keydown', onKey, true);
    wrap.addEventListener('click', e => {
      if (e.target === wrap && dismissible) return close(null);
      const b = e.target.closest('[data-i]'); if (!b) return;
      const a = actions[+b.dataset.i];
      if (a.onClick) { const r = a.onClick(wrap); if (r === false) return; }
      close(a.value ?? a.label);
    });
    document.body.appendChild(wrap);
    onOpen && onOpen(wrap, close);
    const f = wrap.querySelector('[autofocus]') || wrap.querySelector('.foot .primary'); f && f.focus();
  });
}

export const fmtDate = ts => { const d = new Date(ts); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export function dueLabel(due) {
  if (!due) return '';
  const d = new Date(due + 'T23:59:59'), now = new Date();
  const days = Math.ceil((d - now) / 864e5);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  if (days < 0) return `마감 지남 · ${md}`;
  if (days === 0) return `오늘 마감 · ${md}`;
  return `D-${days} · ${md}`;
}

/** 영상 출처를 사람이 읽는 주소로 */
export function srcText(src) {
  if (!src) return '';
  if (src.k === 'yt') return 'https://youtu.be/' + src.id;
  if (src.k === 'vimeo') return 'https://vimeo.com/' + src.id + (src.h ? '/' + src.h : '');
  if (src.k === 'file') return src.name || '영상 파일';
  return src.url;
}
export const srcKind = src => !src ? '' : ({ yt: 'YouTube', vimeo: 'Vimeo', file: '영상 파일', url: '영상 주소' })[src.k];

/* ---------- WesNS 로고 마크: 하나로 이어진 선이 W(Wes)를 그리고 N(Osense)으로 이어진다 ---------- */
let markN = 0;
export function logoMark(cls = 'mark') {
  const id = 'wsns-g' + (markN++);
  return `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7c5cf0"/><stop offset="1" stop-color="#38bcd8"/></linearGradient></defs>
    <rect width="40" height="40" rx="11" fill="url(#${id})"/><rect x=".5" y=".5" width="39" height="39" rx="10.5" fill="none" stroke="#fff" stroke-opacity=".18"/>
    <polyline points="5.5,12.5 9.5,27.5 13.5,18 17.5,27.5 21.5,12.5 30.5,27.5 30.5,12.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="21.5" y1="12.5" x2="21.5" y2="27.5" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/><circle cx="21.5" cy="12.5" r="2.1" fill="#fff"/><circle cx="34.6" cy="30.6" r="1.3" fill="#fff" fill-opacity=".7"/></svg>`;
}
/** 제품 로고: WSNS 마크 + 쎈스 디렉터 / Sense Director */
export const brandHTML = (tag = 'span', attrs = '') => `<${tag} class="wordmark" ${attrs}>${logoMark()}<span class="bn"><b>쎈스 디렉터</b><small>Sense Director</small></span></${tag}>`;
/** 밝은 화면 / 다크 모드 (WesNS 사이트와 같은 설정을 쓴다) */
export const themeBtnHTML = () => `<button class="btn icon ghost theme-btn" data-theme-toggle aria-label="다크 모드 전환" title="밝은 화면 / 다크 모드">${ic('sun', 17).replace('class="ic"', 'class="ic sun"')}${ic('moon', 17).replace('class="ic"', 'class="ic moon"')}</button>`;

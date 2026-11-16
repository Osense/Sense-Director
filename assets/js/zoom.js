/* 카드 확대 보기 — 카드의 장면을 누르면 그 자리에서 커지며 자세히 본다.
   확대(휠·두 번 누르기·두 손가락)·이동(끌기)·앞뒤 넘기기(화살표·스와이프)·옆에서 바로 편집 */
import { $, ic, esc, tc, clamp } from './util.js';
import { strokesSVG, pinHTML } from './viewer.js';

/**
 * openZoom({ items, index, ar, poster, fps, numOf, from, detail, wire, onSeek, onClose, emptyText })
 * detail(it) → 오른쪽 패널 HTML, wire(panelEl, it, api) → 이벤트 연결 (api.refresh(), api.close())
 */
const openers = new Set();
/** 화면이 바뀔 때 열린 확대 보기를 바로 닫는다 */
export function closeAllZooms() { openers.forEach(f => f()); }

export function openZoom(o) {
  let i = o.index, z = 1, tx = 0, ty = 0;
  const wrap = document.createElement('div');
  wrap.className = 'zoom';
  wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `
    <div class="zoom-bar">
      <span class="no" data-no></span><b class="ztc" data-tc></b><span class="kind" data-kind></span>
      <div class="grow"></div>
      <span class="zcount" data-zcount></span>
      <button class="btn icon ghost" data-z="prev" aria-label="이전" title="이전 (←)">${ic('back', 18)}</button>
      <button class="btn icon ghost flip" data-z="next" aria-label="다음" title="다음 (→)">${ic('back', 18)}</button>
      <button class="btn icon" data-z="close" aria-label="닫기" title="닫기 (Esc)">${ic('close', 18)}</button>
    </div>
    <div class="zoom-body">
      <div class="zoom-view" data-view>
        <div class="zoom-inner" data-inner></div>
        <div class="zoom-tools">
          <button class="btn icon" data-z="out" aria-label="축소" title="축소 (-)">${ic('minus', 16)}</button>
          <span class="zpct" data-pct>100%</span>
          <button class="btn icon" data-z="in" aria-label="확대" title="확대 (+)">${ic('plus', 16)}</button>
          <button class="btn small" data-z="fit" title="화면에 맞추기 (0)">맞추기</button>
        </div>
      </div>
      <aside class="zoom-side" data-side></aside>
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('zoom-open');
  const view = $('[data-view]', wrap), inner = $('[data-inner]', wrap), side = $('[data-side]', wrap);
  const items = () => o.items();
  const cur = () => items()[i];

  /* ---------- 크기 맞추기 ---------- */
  function fit() {
    const [aw, ah] = o.ar, r = view.getBoundingClientRect();
    const s = Math.min((r.width - 24) / aw, (r.height - 84) / ah); // 아래 확대 도구 자리를 비워 둔다
    inner.style.width = aw * s + 'px'; inner.style.height = ah * s + 'px'; inner.style.marginBottom = '60px';
  }
  function apply(anim) {
    inner.style.transition = anim ? 'transform .18s ease-out' : '';
    inner.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
    inner.style.setProperty('--z', z);
    $('[data-pct]', wrap).textContent = Math.round(z * 100) + '%';
    view.classList.toggle('zoomed', z > 1.01);
  }
  function bound() {
    const w = inner.offsetWidth, h = inner.offsetHeight, r = view.getBoundingClientRect();
    const mx = Math.max(0, (w * z - r.width) / 2 + 12), my = Math.max(0, (h * z - r.height) / 2 + 12);
    tx = clamp(tx, -mx, mx); ty = clamp(ty, -my, my);
  }
  /** 화면의 (cx,cy) 점을 기준으로 확대 */
  function zoomAt(nz, cx, cy, anim = true) {
    nz = clamp(nz, 1, 6);
    const r = view.getBoundingClientRect(), ox = cx - (r.left + r.width / 2), oy = cy - (r.top + r.height / 2);
    tx = ox - (ox - tx) * nz / z; ty = oy - (oy - ty) * nz / z; z = nz;
    if (z === 1) { tx = 0; ty = 0; }
    bound(); apply(anim);
  }
  const center = () => { const r = view.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

  /* ---------- 내용 ---------- */
  function draw() {
    const it = cur(); if (!it) return close();
    const n = o.numOf(it);
    $('[data-no]', wrap).textContent = String(n).padStart(2, '0');
    $('[data-tc]', wrap).textContent = tc(it.t, o.fps());
    $('[data-kind]', wrap).textContent = it.x != null ? (it.s && it.s.length ? '핀 + 그림' : '핀') : it.s && it.s.length ? '그림' : '메모';
    $('[data-zcount]', wrap).textContent = `${i + 1} / ${items().length}`;
    $('[data-z=prev]', wrap).disabled = i <= 0; $('[data-z=next]', wrap).disabled = i >= items().length - 1;
    const img = it.th ? `<img src="${esc(it.th)}" alt="${n}번 장면" draggable="false">`
      : (o.poster ? `<img src="${esc(o.poster)}" alt="" class="fallback" draggable="false">` : '') + `<span class="nosnap">${esc(o.emptyText ? o.emptyText(it) : '장면 사진 없음')}</span>`;
    inner.innerHTML = img + strokesSVG(it.s) + pinHTML(it, n);
    side.innerHTML = o.detail(it);
    o.wire && o.wire(side, it, api);
  }
  const api = { refresh: () => { const id = cur() && cur().id; const k = items().findIndex(x => x.id === id); if (k >= 0) i = k; draw(); }, close: () => close(), item: cur };
  function go(d) { const k = clamp(i + d, 0, items().length - 1); if (k === i) return; i = k; z = 1; tx = 0; ty = 0; apply(); draw(); }

  /* ---------- 열고 닫기: 카드 자리에서 커지고 다시 들어간다 ---------- */
  function flipFrom(el, reverse = false) {
    if (!el) return false;
    const a = el.getBoundingClientRect(), b = inner.getBoundingClientRect();
    if (!a.width || !b.width) return false;
    const t = `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${a.width / b.width})`;
    inner.animate(reverse ? [{ transform: inner.style.transform || 'none' }, { transform: t }] : [{ transform: t }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
    return true;
  }
  let closing = false;
  const hardClose = () => { if (closing) return; closing = true; openers.delete(hardClose); removeEventListener('keydown', onKey, true); removeEventListener('resize', onResize); wrap.remove(); document.body.classList.remove('zoom-open'); };
  openers.add(hardClose);
  function close() {
    if (closing) return; closing = true; openers.delete(hardClose);
    removeEventListener('keydown', onKey, true); removeEventListener('resize', onResize);
    const it = cur(), el = it && o.from && o.from(it);
    wrap.classList.add('closing');
    flipFrom(el && el.getBoundingClientRect().height ? el : null, true);
    setTimeout(() => { wrap.remove(); document.body.classList.remove('zoom-open'); o.onClose && o.onClose(it); }, 230);
  }

  /* ---------- 조작 ---------- */
  wrap.addEventListener('click', e => {
    const b = e.target.closest('[data-z]'); if (!b) return;
    const k = b.dataset.z;
    if (k === 'close') close();
    else if (k === 'prev') go(-1); else if (k === 'next') go(1);
    else if (k === 'in') zoomAt(z * 1.6, ...center()); else if (k === 'out') zoomAt(z / 1.6, ...center());
    else if (k === 'fit') zoomAt(1, ...center());
  });
  view.addEventListener('wheel', e => { e.preventDefault(); zoomAt(z * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY, false); }, { passive: false });
  view.addEventListener('dblclick', e => { e.preventDefault(); zoomAt(z > 1.2 ? 1 : 2.5, e.clientX, e.clientY); });
  // 끌어서 이동 · 두 손가락 확대 · 좌우로 밀어 넘기기
  const pts = new Map(); let start = null, lastTap = 0;
  view.addEventListener('pointerdown', e => {
    if (e.target.closest('.zoom-tools')) return;
    view.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) {
      start = { x: e.clientX, y: e.clientY, tx, ty, t: Date.now() };
      if (e.pointerType !== 'mouse') { if (Date.now() - lastTap < 280) { zoomAt(z > 1.2 ? 1 : 2.5, e.clientX, e.clientY); start = null; } lastTap = Date.now(); }
    }
    if (pts.size === 2) { const [p, q] = [...pts.values()]; start = { pinch: Math.hypot(p[0] - q[0], p[1] - q[1]), z, cx: (p[0] + q[0]) / 2, cy: (p[1] + q[1]) / 2 }; }
  });
  view.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !start) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && start.pinch) { const [p, q] = [...pts.values()]; const d = Math.hypot(p[0] - q[0], p[1] - q[1]); const nz = clamp(start.z * d / start.pinch, 1, 6); const k = nz / z; z = nz; tx *= k; ty *= k; bound(); apply(); return; }
    if (pts.size === 1 && start.tx !== undefined) {
      if (z > 1.01) { tx = start.tx + e.clientX - start.x; ty = start.ty + e.clientY - start.y; bound(); apply(); view.classList.add('panning'); }
      else inner.style.transform = `translateX(${(e.clientX - start.x) * 0.6}px)`;
    }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId); view.classList.remove('panning');
    if (start && start.tx !== undefined && z <= 1.01 && pts.size === 0) {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4 && Date.now() - start.t < 700) go(dx < 0 ? 1 : -1); else apply(true);
    }
    if (pts.size === 0) start = null;
  };
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
  const onKey = e => {
    if (document.querySelector('.modal.open')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (e.target.closest && e.target.closest('textarea,input')) { e.target.blur(); return; } close(); return; }
    if (e.target.closest && e.target.closest('textarea,input,select')) return;
    e.stopPropagation();
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === '+' || e.key === '=') zoomAt(z * 1.6, ...center());
    else if (e.key === '-') zoomAt(z / 1.6, ...center());
    else if (e.key === '0') zoomAt(1, ...center());
  };
  addEventListener('keydown', onKey, true);
  const onResize = () => { fit(); bound(); apply(); };
  addEventListener('resize', onResize);

  fit(); draw(); apply();
  const src = o.from && o.from(cur());
  if (!flipFrom(src)) wrap.classList.add('fadein');
  requestAnimationFrame(() => wrap.classList.add('on'));
  $('[data-z=close]', wrap).focus({ preventScroll: true });
  return api;
}

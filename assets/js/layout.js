/* 칸 나누기 — 경계선을 끌어 재생 화면·목록·수정내역 칸의 비율을 조정한다. 크기는 기억한다. */
import { t, tn, lang, fmtDateL, fmtMD } from './i18n.js';

const KEY = 'sd:layout:';
const load = k => { try { return +localStorage.getItem(KEY + k) || 0; } catch { return 0; } };
const save = (k, v) => { try { localStorage.setItem(KEY + k, Math.round(v)); } catch {} };

/**
 * splitter(el, { container, cssVar, key, axis, after, min, max, def })
 * el: 경계선 요소 · container: CSS 변수를 줄 요소
 * axis 'x' = 좌우로 끌기(열 너비), 'y' = 위아래로 끌기(높이)
 * after: 조절되는 칸이 경계선 뒤(오른쪽·아래)에 있으면 true
 */
export function splitter(el, o) {
  const { container, cssVar, key, axis = 'x', after = true, def } = o;
  const min = () => typeof o.min === 'function' ? o.min() : (o.min ?? 160);
  const max = () => typeof o.max === 'function' ? o.max() : (o.max ?? 900);
  const apply = v => {
    v = Math.max(min(), Math.min(max(), v));
    container.style.setProperty(cssVar, v + 'px');
    el.setAttribute('aria-valuenow', Math.round(v));
    dispatchEvent(new Event('resize'));
    return v;
  };
  el.setAttribute('role', 'separator');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-orientation', axis === 'x' ? 'vertical' : 'horizontal');
  el.title = t('끌어서 크기 조정 · 두 번 누르면 처음 크기');
  let size = load(key);
  if (size) size = apply(size);
  const current = () => size || parseFloat(getComputedStyle(container).getPropertyValue(cssVar)) || def || 380;

  let start = null;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    start = { p: axis === 'x' ? e.clientX : e.clientY, s: current() };
    try { el.setPointerCapture(e.pointerId); } catch {}
    document.body.classList.add('resizing', axis === 'x' ? 'resizing-x' : 'resizing-y');
    el.classList.add('on');
  });
  const move = e => {
    if (!start) return;
    const d = (axis === 'x' ? e.clientX : e.clientY) - start.p;
    size = apply(after ? start.s - d : start.s + d);
  };
  const up = () => {
    if (!start) return;
    start = null; save(key, size);
    document.body.classList.remove('resizing', 'resizing-x', 'resizing-y');
    el.classList.remove('on');
  };
  el.addEventListener('pointermove', move);
  addEventListener('pointermove', move);
  el.addEventListener('pointerup', up); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  el.addEventListener('dblclick', () => { size = 0; container.style.removeProperty(cssVar); try { localStorage.removeItem(KEY + key); } catch {} dispatchEvent(new Event('resize')); });
  el.addEventListener('keydown', e => {
    const step = e.shiftKey ? 64 : 16;
    const k = e.key, grow = axis === 'x' ? (after ? 'ArrowLeft' : 'ArrowRight') : (after ? 'ArrowUp' : 'ArrowDown');
    const shrink = axis === 'x' ? (after ? 'ArrowRight' : 'ArrowLeft') : (after ? 'ArrowDown' : 'ArrowUp');
    if (k !== grow && k !== shrink) return;
    e.preventDefault(); e.stopPropagation();
    size = apply(current() + (k === grow ? step : -step)); save(key, size);
  });
  return el;
}

/** 자주 쓰는 배치: 영상 | 오른쪽 칸, 휴대폰에서는 영상 높이 */
export function workspaceSplitters(root, name) {
  const row = root.querySelector('.workspace, .pbody');
  const col = root.querySelector('.splitter.col');
  if (row && col) splitter(col, { container: row, cssVar: '--side', key: name + ':side', axis: 'x', after: true, def: 400, min: 300, max: () => Math.max(320, row.clientWidth - 420) });
  const sr = root.querySelector('.splitter.row');
  if (row && sr) splitter(sr, { container: row, cssVar: '--stage-h', key: name + ':stage', axis: 'y', after: false, def: 240, min: 160, max: () => innerHeight * 0.8 });
}

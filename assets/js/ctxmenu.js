/* 우클릭 메뉴 — 마우스 위치(또는 버튼 아래)에 작은 메뉴를 띄운다.
   items: [{ label, icon, act, danger, hint } | '-']  →  고른 항목의 act()를 부른다. */
import { esc, ic } from './util.js';

let cur = null;
export function closeMenu() {
  if (!cur) return;
  const { el, back, onKey, opener } = cur; cur = null;
  el.remove(); back.remove(); removeEventListener('keydown', onKey, true);
  removeEventListener('resize', closeMenu); removeEventListener('blur', closeMenu);
  if (opener && opener.isConnected) opener.focus({ preventScroll: true });
}

/** x, y: 화면 좌표. opener: 닫은 뒤 초점을 돌려줄 요소 */
export function openMenu(x, y, items, { opener = null, label = '' } = {}) {
  closeMenu();
  const back = document.createElement('div'); back.className = 'ctx-back';
  const el = document.createElement('div'); el.className = 'ctx-menu'; el.setAttribute('role', 'menu');
  if (label) el.setAttribute('aria-label', label);
  const acts = [];
  el.innerHTML = items.filter(Boolean).map(it => {
    if (it === '-') return '<div class="ctx-sep" role="separator"></div>';
    acts.push(it);
    return `<button type="button" role="menuitem" class="${it.danger ? 'danger' : ''}" data-i="${acts.length - 1}">${it.icon ? ic(it.icon, 15) : '<span class="ctx-gap"></span>'}<span class="ctx-l">${esc(it.label)}</span>${it.hint ? `<kbd>${esc(it.hint)}</kbd>` : ''}</button>`;
  }).join('');
  document.body.append(back, el);
  // 화면 밖으로 나가지 않게
  const r = el.getBoundingClientRect(), pad = 8;
  el.style.left = Math.max(pad, Math.min(x, innerWidth - r.width - pad)) + 'px';
  el.style.top = Math.max(pad, y + r.height > innerHeight - pad ? y - r.height : y) + 'px';
  const btns = [...el.querySelectorAll('button')];
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault(); e.stopPropagation();
      const i = btns.indexOf(document.activeElement);
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
      btns[n].focus();
    }
    if (e.key === 'Tab') { e.preventDefault(); closeMenu(); }
  };
  cur = { el, back, onKey, opener };
  addEventListener('keydown', onKey, true);
  addEventListener('resize', closeMenu); addEventListener('blur', closeMenu);
  back.addEventListener('pointerdown', e => { e.preventDefault(); closeMenu(); });
  back.addEventListener('contextmenu', e => { e.preventDefault(); closeMenu(); });
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('click', e => {
    const b = e.target.closest('button[data-i]'); if (!b) return;
    const it = acts[+b.dataset.i]; closeMenu(); it.act && it.act();
  });
  (btns[0] || el).focus({ preventScroll: true });
  return el;
}

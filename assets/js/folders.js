/* 프로젝트 폴더 — 왼쪽 목록을 폴더(하위 폴더까지)로 묶는다.
   데이터: Store.folders() { id, name, parentId, sort } + 프로젝트의 folderId (server/schema.sql과 같은 모양) */
import { $, $$, esc, ic, uid, modal, toast } from './util.js';
import { Store } from './store.js';
import { openMenu } from './ctxmenu.js';
import { t } from './i18n.js';

export const MAX_DEPTH = 3; // 폴더 > 폴더 > 폴더 까지
const CLOSED = 'sd:fold-closed';
const closedSet = () => { try { return new Set(JSON.parse(localStorage.getItem(CLOSED) || '[]')); } catch { return new Set(); } };
const saveClosed = s => localStorage.setItem(CLOSED, JSON.stringify([...s]));

/** 폴더의 깊이(맨 위 = 1) */
export function depthOf(id, map = byId()) { let d = 0; for (let x = map[id]; x && d < 20; x = map[x.parentId]) d++; return d; }
const byId = () => Object.fromEntries(Store.folders().map(f => [f.id, f]));
/** "도교육청 행사 / 예술행사" 같은 경로 */
export function folderPath(id, map = byId()) { const out = []; for (let x = map[id]; x && out.length < 20; x = map[x.parentId]) out.unshift(x.name); return out.join(' / '); }

/* ---------- 새 프로젝트를 특정 폴더에 ---------- */
let newIn = null;
export const setNewIn = fid => { newIn = fid ? { fid, at: Date.now() } : null; };
/** newProject가 한 번 꺼내 쓴다 (2분 안에 만든 것만) */
export const takeNewIn = () => { const v = newIn && Date.now() - newIn.at < 120000 ? newIn.fid : null; newIn = null; return v; };

/* ---------- 목록 그리기 ---------- */
/** 진행 중 프로젝트를 폴더 나무로. row: 프로젝트 한 줄을 그리는 함수 */
export function treeHTML(projects, row, curId) {
  const folders = Store.folders(), map = Object.fromEntries(folders.map(f => [f.id, f]));
  const closed = closedSet();
  // 지금 연 프로젝트가 든 폴더는 펼쳐 둔다
  const cur = curId && projects.find(p => p.id === curId);
  for (let x = cur && map[cur.folderId]; x; x = map[x.parentId]) closed.delete(x.id);
  const inFolder = id => projects.filter(p => (map[p.folderId] ? p.folderId : null) === id);
  const count = id => inFolder(id).length + folders.filter(f => f.parentId === id).reduce((n, f) => n + count(f.id), 0);
  const kids = id => folders.filter(f => (map[f.parentId] ? f.parentId : null) === id);
  const draw = (id, d) => kids(id).map(f => {
    const open = !closed.has(f.id), inner = draw(f.id, d + 1) + inFolder(f.id).map(row).join('');
    return `<div class="fold${open ? '' : ' closed'}" data-fid="${f.id}" style="--d:${d}">
      <div class="fhead" data-fhead draggable="true" tabindex="0" role="button" aria-expanded="${open}" title="${esc(f.name)}">
        ${ic('down', 13)}${ic('folder', 15)}<span class="fname">${esc(f.name)}</span><span class="fcount">${count(f.id)}</span>
        <button type="button" class="pmore" data-fmore aria-label="${t('폴더 메뉴')}" title="${t('폴더 메뉴 (우클릭)')}">${ic('more', 16)}</button>
      </div>
      <div class="fbody">${inner || `<div class="fempty">${t('비어 있어요 · 프로젝트를 끌어다 놓거나 메뉴의 "폴더로 이동"을 쓰세요')}</div>`}</div>
    </div>`;
  }).join('');
  return draw(null, 0) + inFolder(null).map(row).join('');
}

/* ---------- 대화창 ---------- */
export async function promptName(title, value = '', ok = t('만들기')) {
  let v = value;
  const r = await modal({
    title,
    body: `<input class="field-in" data-name maxlength="60" value="${esc(value)}" placeholder="${t('예: 제3회 예술행사')}" aria-label="${t('이름')}">`,
    actions: [{ label: t('취소'), value: null }, { label: ok, kind: 'primary', value: 'ok' }],
    onOpen: w => {
      const i = $('[data-name]', w); i.focus(); i.select();
      i.addEventListener('input', () => { v = i.value; });
      i.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); v = i.value; $('.foot .primary', w).click(); } });
    },
  });
  return r === 'ok' && v.trim() ? v.trim() : null;
}

export async function newFolder(parentId = null) {
  if (parentId && depthOf(parentId) >= MAX_DEPTH) { toast(t('폴더는 {n}단계까지 만들 수 있어요', { n: MAX_DEPTH })); return null; }
  const name = await promptName(parentId ? t('하위 폴더 만들기') : t('새 폴더'));
  if (!name) return null;
  const f = { id: uid(8), name, parentId: parentId || null, sort: 0 };
  Store.saveFolder(f);
  if (parentId) { const c = closedSet(); c.delete(parentId); saveClosed(c); }
  return f;
}

/** 폴더 고르기 — 고른 폴더 id, 맨 위는 '', 취소는 null */
export async function pickFolder({ title, current = null, exclude = null } = {}) {
  const folders = Store.folders(), map = Object.fromEntries(folders.map(f => [f.id, f]));
  const blocked = id => { for (let x = map[id]; x; x = map[x.parentId]) if (x.id === exclude) return true; return false; };
  const list = (pid, d) => folders.filter(f => (map[f.parentId] ? f.parentId : null) === pid).map(f => blocked(f.id) ? '' :
    `<button type="button" class="fpick${f.id === current ? ' on' : ''}" data-pick="${f.id}" style="--d:${d}">${ic('folder', 15)}<span>${esc(f.name)}</span>${f.id === current ? `<em>${t('지금 위치')}</em>` : ''}</button>` + list(f.id, d + 1)).join('');
  let chosen = null;
  const r = await modal({
    title: title || t('폴더로 이동'),
    body: `<div class="fpicks">
        <button type="button" class="fpick${!current ? ' on' : ''}" data-pick="" style="--d:0">${ic('list', 15)}<span>${t('폴더 밖 (맨 위)')}</span>${!current ? `<em>${t('지금 위치')}</em>` : ''}</button>
        ${list(null, 0)}
      </div>
      <button type="button" class="btn ghost small" data-newf>${ic('plus', 14)}${t('새 폴더 만들고 넣기')}</button>`,
    actions: [{ label: t('취소'), value: null }],
    onOpen: (w, close) => w.addEventListener('click', async e => {
      const b = e.target.closest('[data-pick]'); if (b) { chosen = b.dataset.pick; close('ok'); return; }
      if (e.target.closest('[data-newf]')) { close('new'); }
    }),
  });
  if (r === 'new') { const f = await newFolder(null); return f ? f.id : null; }
  return r === 'ok' ? chosen : null;
}

/* ---------- 메뉴·끌어 놓기 ---------- */
/** list: .plist / onChange: 다시 그리기 / onNewIn: 이 폴더에 새 프로젝트 */
export function wireFolders(list, { onChange, onNewIn }) {
  const toggle = fold => {
    const c = closedSet(), id = fold.dataset.fid, open = fold.classList.toggle('closed') === false;
    open ? c.delete(id) : c.add(id); saveClosed(c);
    $('[data-fhead]', fold).setAttribute('aria-expanded', open);
  };
  const menu = (fold, x, y, opener) => {
    const f = Store.getFolder(fold.dataset.fid); if (!f) return;
    fold.classList.add('menu-on');
    const el = openMenu(x, y, [
      { label: t('이 폴더에 새 프로젝트'), icon: 'plus', act: () => onNewIn(f.id) },
      depthOf(f.id) < MAX_DEPTH ? { label: t('하위 폴더 만들기'), icon: 'folder', act: async () => { if (await newFolder(f.id)) onChange(); } } : null,
      '-',
      { label: t('이름 바꾸기'), icon: 'rename', hint: 'F2', act: () => renameFolder(f, onChange) },
      { label: t('다른 폴더로 이동'), icon: 'next', act: async () => {
        const to = await pickFolder({ title: t('폴더 옮기기'), current: f.parentId, exclude: f.id });
        if (to === null) return;
        if (to && depthOf(to) + subDepth(f.id) > MAX_DEPTH) { toast(t('폴더는 {n}단계까지 만들 수 있어요', { n: MAX_DEPTH })); return; }
        Store.moveFolder(f.id, to || null); onChange();
      } },
      '-',
      { label: t('폴더 삭제'), icon: 'trash', danger: true, hint: 'Del', act: () => deleteFolderAsk(f, onChange) },
    ], { opener, label: f.name });
    const off = new MutationObserver(() => { if (!el.isConnected) { fold.classList.remove('menu-on'); off.disconnect(); } });
    off.observe(document.body, { childList: true });
  };
  list.addEventListener('click', e => {
    const more = e.target.closest('[data-fmore]');
    if (more) { e.preventDefault(); e.stopPropagation(); const r = more.getBoundingClientRect(); menu(more.closest('.fold'), r.left, r.bottom + 4, more); return; }
    const h = e.target.closest('[data-fhead]'); if (h) toggle(h.closest('.fold'));
    if (e.target.closest('[data-newfolder]')) newFolder(null).then(f => f && onChange());
  });
  list.addEventListener('contextmenu', e => {
    const h = e.target.closest('[data-fhead]'); if (!h) return;
    e.preventDefault(); e.stopPropagation(); menu(h.closest('.fold'), e.clientX, e.clientY, h);
  }, true);
  list.addEventListener('keydown', e => {
    const h = e.target.closest('[data-fhead]'); if (!h || e.target !== h) return;
    const fold = h.closest('.fold'), f = Store.getFolder(fold.dataset.fid);
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(fold); }
    else if (e.key === 'ArrowRight' && fold.classList.contains('closed')) toggle(fold);
    else if (e.key === 'ArrowLeft' && !fold.classList.contains('closed')) toggle(fold);
    else if (e.key === 'F2') { e.preventDefault(); renameFolder(f, onChange); }
    else if (e.key === 'Delete') { e.preventDefault(); deleteFolderAsk(f, onChange); }
    else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { e.preventDefault(); const r = h.getBoundingClientRect(); menu(fold, r.left + 16, r.bottom, h); }
  });

  // 끌어 놓기: 프로젝트·폴더를 폴더 위로, "진행 중" 머리글 위로 놓으면 폴더 밖으로
  const TYPE = 'application/x-sd-item';
  let dragging = null;
  list.addEventListener('dragstart', e => {
    const row = e.target.closest('.prow'), fh = e.target.closest('[data-fhead]');
    if (row && !row.classList.contains('done')) dragging = { k: 'p', id: row.dataset.pid };
    else if (fh) dragging = { k: 'f', id: fh.closest('.fold').dataset.fid };
    else return;
    e.dataTransfer.setData(TYPE, JSON.stringify(dragging)); e.dataTransfer.setData('text/plain', '');
    e.dataTransfer.effectAllowed = 'move';
    (row || fh.closest('.fold')).classList.add('is-drag');
  });
  list.addEventListener('dragend', () => { dragging = null; $$('.is-drag, .drop-on', list).forEach(x => x.classList.remove('is-drag', 'drop-on')); });
  const target = e => e.target.closest('.fold') || e.target.closest('[data-root-drop]');
  list.addEventListener('dragover', e => {
    if (!dragging && ![...e.dataTransfer.types].includes(TYPE)) return;
    const tg = target(e); if (!tg) return;
    if (dragging && dragging.k === 'f' && tg.dataset.fid && (tg.dataset.fid === dragging.id || tg.closest(`.fold[data-fid="${dragging.id}"]`))) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    $$('.drop-on', list).forEach(x => x !== tg && x.classList.remove('drop-on')); tg.classList.add('drop-on');
  });
  list.addEventListener('dragleave', e => { const tg = target(e); if (tg && !tg.contains(e.relatedTarget)) tg.classList.remove('drop-on'); });
  list.addEventListener('drop', e => {
    const tg = target(e); let it = dragging;
    try { it = it || JSON.parse(e.dataTransfer.getData(TYPE) || 'null'); } catch { /* 무시 */ }
    if (!tg || !it) return;
    e.preventDefault(); tg.classList.remove('drop-on');
    const to = tg.dataset.fid || null;
    if (it.k === 'p') {
      const p = Store.getProject(it.id); if (!p || (p.folderId || null) === to) return;
      Store.moveProject(it.id, to); toast(to ? t('"{f}" 폴더로 옮겼어요', { f: Store.getFolder(to).name }) : t('폴더 밖으로 꺼냈어요'));
    } else {
      if (to && depthOf(to) + subDepth(it.id) > MAX_DEPTH) { toast(t('폴더는 {n}단계까지 만들 수 있어요', { n: MAX_DEPTH })); return; }
      if (!Store.moveFolder(it.id, to)) return;
    }
    onChange();
  });
}
/** 폴더 아래로 몇 단계가 더 있는지 (자기 포함) */
function subDepth(id) { const fs = Store.folders(); const go = x => 1 + Math.max(0, ...fs.filter(f => f.parentId === x).map(f => go(f.id))); return go(id); }

async function renameFolder(f, onChange) {
  const name = await promptName(t('폴더 이름 바꾸기'), f.name, t('바꾸기'));
  if (!name) return; const fresh = Store.getFolder(f.id) || f; fresh.name = name; Store.saveFolder(fresh); onChange(); toast(t('이름을 바꿨어요'));
}
async function deleteFolderAsk(f, onChange) {
  const n = Store.projects().filter(p => p.folderId === f.id).length, sub = Store.folders().filter(x => x.parentId === f.id).length;
  const up = f.parentId ? `"${esc(folderPath(f.parentId))}"` : t('폴더 밖');
  const r = await modal({
    title: t('폴더를 삭제할까요?'),
    body: `<p class="note"><b>${esc(f.name)}</b></p><p class="note">${n || sub ? t('안의 프로젝트 {n}개와 하위 폴더 {s}개는 지워지지 않고 {up}으로 옮겨져요.', { n, s: sub, up }) : t('빈 폴더예요.')}</p>`,
    actions: [{ label: t('취소'), value: null }, { label: t('폴더 삭제'), kind: 'danger', value: 'del' }],
  });
  if (r !== 'del') return;
  Store.deleteFolder(f.id); toast(t('폴더를 삭제했어요')); onChange();
}

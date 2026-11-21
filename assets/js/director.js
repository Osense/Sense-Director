/* 디렉터 콘솔 — 영상 임베드, 프로젝트·안내사항·핀 설정, 링크 공유, 받은 수정요청에 댓글로 환류 */
import { $, $$, ic, esc, uid, tc, sha, modal, toast, dueLabel, fmtDate, copyText, shareOrCopy, parseSource, safeName, fpsLabel, unpack, srcText, srcKind, STD_FPS, brandHTML, themeBtnHTML, listViewHTML, toggleListView, saidHTML } from './util.js';
import { Store, MODE } from './store.js';
import { mountViewer, snapHTML, posterOf } from './viewer.js';
import { openZoom } from './zoom.js';
import { splitter, workspaceSplitters } from './layout.js';
import { probe } from './player.js';
import { putMedia, fmtSize } from './media.js';
import { putDoc, docType, isDoc, resolveSource, canvaFrom, canvaInfo } from './doc.js';
import { showTour, maybeShowTour } from './tour.js';
import { openMenu } from './ctxmenu.js';
import { msg, replies, dayLine, composer } from './chat.js';
import { clientLink, feedbackMessage, reportHTML, printHTML, shareFile, parseIncoming, STATUS, noteLabel } from './exports.js';
import { accountBtnHTML } from './auth.js';
import { t, tn, lang, fmtDateL, fmtMD, langBtnHTML, fmtTime } from './i18n.js';

const NOTICE_CHIPS = [t('피드백은 마감일까지 부탁드립니다.'), t('수정할 장면에서 멈추고 핀을 찍은 뒤 내용을 적어 주세요.'), t('자막·색보정·음악은 각각 따로 적어 주시면 빨라요.'), t('음악은 저작권 확인 중이라 바뀔 수 있어요.'), t('최종본이 아닌 1차 편집본입니다.')];
const REPLY_CHIPS = [t('반영하겠습니다'), t('확인했습니다'), t('다음 버전에 반영할게요'), t('논의가 필요해요'), t('원본 의도를 유지할게요')];
const pin4 = () => String(crypto.getRandomValues(new Uint16Array(1))[0] % 10000).padStart(4, '0');

let V = null; // 현재 재생 화면

export async function newProject(fields = {}) {
  const p = { id: uid(8), salt: uid(6), pin: pin4(), title: '', notice: '', due: '', by: localStorage.getItem('sd:director') || '', src: null, ar: [16, 9], fps: 0, createdAt: Date.now(), ...fields };
  p.pinHash = await sha(p.salt + p.pin);
  Store.saveProject(p);
  return p;
}

/** 프로젝트 목록: ⋯ 버튼·우클릭·키보드(메뉴 키, Shift+F10)로 여는 메뉴 */
function wireProjectMenu(list, cur) {
  const show = (row, x, y, opener) => {
    const p = Store.getProject(row.dataset.pid); if (!p) return;
    row.classList.add('menu-on');
    const el = openMenu(x, y, [
      { label: t('열기'), icon: 'next', act: () => { location.hash = '#p=' + p.id; } },
      { label: t('새 탭에서 열기'), icon: 'newtab', act: () => window.open(location.pathname + '#p=' + p.id, '_blank', 'noopener') },
      '-',
      { label: t('이름 바꾸기'), icon: 'rename', hint: 'F2', act: () => renameProject(p) },
      { label: t('복제'), icon: 'dup', act: () => duplicateProject(p) },
      { label: p.pinned ? t('고정 풀기') : t('맨 위에 고정'), icon: 'top', act: () => { p.pinned = !p.pinned; Store.saveProject(p); rerender(); } },
      p.src ? { label: t('검수 링크 복사'), icon: 'link', act: async () => { const l = await clientLink(p).catch(() => ''); toast(l && await copyText(l) ? t('주소를 복사했어요') : t('복사하지 못했어요')); } } : null,
      '-',
      { label: t('프로젝트 삭제'), icon: 'trash', danger: true, hint: 'Del', act: () => deleteProjectAsk(p, cur && cur.id === p.id) },
    ], { opener, label: p.title || t('제목 없음') });
    const off = new MutationObserver(() => { if (!el.isConnected) { row.classList.remove('menu-on'); off.disconnect(); } });
    off.observe(document.body, { childList: true });
  };
  list.addEventListener('contextmenu', e => {
    const row = e.target.closest('.prow'); if (!row) return;
    e.preventDefault(); show(row, e.clientX, e.clientY, row.querySelector('.pitem'));
  });
  list.addEventListener('click', e => {
    const b = e.target.closest('[data-pmore]'); if (!b) return;
    e.preventDefault(); const r = b.getBoundingClientRect(); show(b.closest('.prow'), r.left, r.bottom + 4, b);
  });
  list.addEventListener('keydown', e => {
    const row = e.target.closest('.prow'); if (!row || !e.target.matches('.pitem')) return;
    const p = Store.getProject(row.dataset.pid); if (!p) return;
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { e.preventDefault(); const r = e.target.getBoundingClientRect(); show(row, r.left + 16, r.bottom, e.target); }
    else if (e.key === 'F2') { e.preventDefault(); renameProject(p); }
    else if (e.key === 'Delete') { e.preventDefault(); deleteProjectAsk(p, cur && cur.id === p.id); }
  });
}
const rerender = () => dispatchEvent(new HashChangeEvent('hashchange'));
async function renameProject(p) {
  let v = p.title || '';
  const r = await modal({
    title: t('이름 바꾸기'),
    body: `<input class="field-in" data-rename maxlength="80" value="${esc(v)}" aria-label="${t('프로젝트 이름')}">`,
    actions: [{ label: t('취소'), value: null }, { label: t('바꾸기'), kind: 'primary', value: 'ok' }],
    onOpen: w => {
      const i = w.querySelector('[data-rename]'); i.focus(); i.select();
      i.addEventListener('input', () => { v = i.value; });
      i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); v = i.value; w.querySelector('.foot .primary').click(); } });
    },
  });
  if (r !== 'ok') return;
  const fresh = Store.getProject(p.id) || p; fresh.title = v.trim(); Store.saveProject(fresh);
  rerender(); toast(t('이름을 바꿨어요'));
}
async function duplicateProject(p) {
  const { id, salt, pin, pinHash, createdAt, updatedAt, imported, pinned, ...rest } = Store.getProject(p.id) || p;
  const c = await newProject({ ...JSON.parse(JSON.stringify(rest)), title: (p.title || t('제목 없음')) + ' ' + t('사본') });
  location.hash = '#p=' + c.id + '&tab=setup'; toast(t('복제했어요. 받은 수정요청은 복사하지 않아요'), 3200);
}
async function deleteProjectAsk(p, isCur) {
  const n = Store.inbox(p.id).flatMap(r => r.items).length;
  const r = await modal({
    title: t('프로젝트를 삭제할까요?'),
    body: `<p class="note"><b>${esc(p.title || t('제목 없음'))}</b>${n ? ' · ' + t('받은 요청 {n}건', { n }) : ''}</p>${t('<p class="note">받은 수정요청과 댓글도 이 브라우저에서 함께 지워지고 되돌릴 수 없어요.</p>')}`,
    actions: [{ label: t('취소'), value: null }, { label: t('삭제'), kind: 'danger', value: 'del' }],
  });
  if (r !== 'del') return;
  Store.deleteProject(p.id); toast(t('프로젝트를 삭제했어요'));
  if (isCur || location.hash.includes('p=' + p.id)) location.hash = '#'; else rerender();
}

export async function renderDirector(app, params) {
  // 수정요청 링크(#r=)로 들어온 경우: 수신함으로 가져오기
  if (params.r) {
    try {
      const { p: pp, r } = await unpack(params.r);
      const id = importInto(pp, [r]);
      history.replaceState(null, '', '#p=' + id + '&tab=inbox');
      toast(`${esc(r.from || t('클라이언트'))}${t('의 수정요청')} ${r.items.length}${t('건을 수신함에 넣었어요')}`, 3600);
      params = { p: id, tab: 'inbox' };
    } catch { toast(t('수정요청 링크를 읽지 못했어요')); history.replaceState(null, '', '#'); params = {}; }
  }
  Store.onChange(() => {});
  const projects = Store.projects();
  const cur = params.p ? Store.getProject(params.p) : null;
  if (V) { V.destroy(); V = null; }
  document.title = (cur ? (cur.title || t('새 프로젝트')) + ' · ' : '') + t('쎈스 디렉터 · 디렉터 콘솔');

  app.innerHTML = `
  <header class="topbar">
    ${brandHTML('a', t('href="#" aria-label="쎈스 디렉터 처음으로"'))}
    <div class="ptitle"><div class="eyebrow">${t('디렉터 콘솔')}</div></div>
    <div class="grow"></div>
    ${MODE === 'mock' ? t('<span class="chip mock" title="서버 없이 이 브라우저와 링크로 주고받는 시험 버전">시험 버전 · 서버 없음</span>') : ''}
    <button class="btn ghost" data-act="import" title="${t('수정요청 링크·HTML 가져오기')}">${ic('import')}<span class="bl">${t('가져오기')}</span></button>
    ${langBtnHTML()}${themeBtnHTML()}
    <button class="btn ghost icon" data-act="tour" aria-label="${t('사용 안내')}" title="${t('사용 안내 다시 보기')}">${ic('help')}</button>
    <button class="btn brand" data-act="new" aria-label="${t('새 프로젝트')}">${ic('plus')}<span class="bl">${t('새 프로젝트')}</span></button>
    ${accountBtnHTML()}
  </header>
  <div class="console">
    <nav class="plist" aria-label="${t('프로젝트')}">
      <div class="plist-head">${t('프로젝트')} <b>${projects.length}</b></div>
      ${projects.map(pr => {
        const inbox = Store.inbox(pr.id), all = inbox.flatMap(r => r.items), open = all.filter(it => (it.st || 'open') === 'open').length;
        return `<div class="prow${pr.pinned ? ' pinned' : ''}" data-pid="${pr.id}"><a class="pitem${cur && cur.id === pr.id ? ' on' : ''}" href="#p=${pr.id}${open ? '&tab=inbox' : ''}">
          <span class="pt">${pr.pinned ? `<span class="pin-top" title="${t('맨 위에 고정됨')}">${ic('top', 12)}</span>` : ''}<span class="ptn">${esc(pr.title || t('제목 없음'))}</span></span>
          <span class="pm">${pr.due ? esc(dueLabel(pr.due)) + ' · ' : ''}${all.length ? `${t('요청')} ${all.length}` : t('요청 없음')}</span>
          ${open ? `<i class="badge" title="${t('확인 안 한 요청')}">${open}</i>` : ''}</a>
          <button type="button" class="pmore" data-pmore aria-label="${t('프로젝트 메뉴')}" title="${t('프로젝트 메뉴 (우클릭)')}">${ic('more', 16)}</button></div>`;
      }).join('') || t('<div class="plist-empty">아직 프로젝트가 없어요</div>')}
    </nav>
    <div class="splitter col plist-split" aria-label="${t('프로젝트 목록 너비 조정')}"></div>
    <section class="pmain" data-main></section>
  </div>`;
  splitter($('.plist-split', app), { container: $('.console', app), cssVar: '--plist', key: 'plist', axis: 'x', after: false, def: 230, min: 150, max: 420 });
  $('[data-act=new]', app).addEventListener('click', () => newDialog());
  $('[data-act=tour]', app).addEventListener('click', () => showTour());
  $('[data-act=import]', app).addEventListener('click', () => importDialog());
  wireProjectMenu($('.plist', app), cur);
  const main = $('[data-main]', app);
  if (!cur) return renderHome(main, projects);
  renderProject(main, cur, params.tab || (Store.inbox(cur.id).length ? 'inbox' : 'setup'));
}

function renderHome(main) {
  main.innerHTML = `<div class="hero">
    <div class="eyebrow">${t('새 검수')}</div>
    <h2>${t('영상 링크나 문서를 넣으면')}<br><span class="text-gradient">${t('검수 링크')}</span>${t('가 바로 만들어져요')}</h2>
    <form class="hero-form" data-hero><input placeholder="${t('유튜브 · 비메오 · 캔바 링크, 영상 · PDF · 사진 주소')}" aria-label="${t('영상 링크')}" autofocus><button class="btn brand">${ic('plus')}${t('만들기')}</button></form>
    <label class="drop-file" data-drop>${ic('import', 18)}<span><b>${t('파일 올리기')}</b><small>${t('영상 · PDF · PPT(.pptx) · 사진 — 끌어 놓거나 눌러서 고르기')}</small></span><input type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,application/pdf,.pdf,.pptx,image/*" multiple hidden></label>
    <div class="flow-title">${t('이렇게 진행돼요')}</div>
    <ol class="flow" aria-label="${t('이렇게 진행돼요')}">
      <li><b>1</b><span>${t('영상 임베드')}</span><small>${t('화면비·프레임 수는 알아서 맞춰요')}</small></li>
      <li><b>2</b><span>${t('안내사항 · 핀 번호')}</span><small>${t('4자리 핀으로 클라이언트만 열어요')}</small></li>
      <li><b>3</b><span>${t('링크 공유')}</span><small>${t('카톡·메시지·QR')}</small></li>
      <li><b>4</b><span>${t('수정요청 받기')}</span><small>${t('장면·시간 주소·내용')}</small></li>
      <li><b>5</b><span>${t('댓글로 환류')}</span><small>${t('반영 상태와 답을 돌려보내요')}</small></li>
    </ol>
  </div>`;
  wireSourcePicker(main);
}

/** 링크 붙여 넣기 · 파일 올리기 — 첫 화면과 '새 프로젝트' 팝업이 함께 쓴다 */
function wireSourcePicker(root, before = () => {}) {
  $('[data-hero]', root).addEventListener('submit', e => {
    e.preventDefault();
    const v = $('[data-hero] input', root).value.trim();
    if (!v) { toast(t('링크를 붙여 넣거나 파일을 올려 주세요')); return; }
    const btn = $('[data-hero] .btn', root); btn.disabled = true;
    checkSource(v).then(src => { btn.disabled = false; if (src) { before(); startNew('', src); } });
  });
  const drop = $('[data-drop]', root);
  const take = async files => { if (!files.length) return; before(); const src = await uploadFile(files); if (src) startNew('', src); };
  $('input', drop).addEventListener('change', e => take([...e.target.files]));
  drop.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); take([...e.dataTransfer.files]); });
}

/** 새 프로젝트 — 첫 화면처럼 팝업에서 영상·문서를 바로 넣는다 */
function newDialog() {
  if (document.querySelector('.modal.new-dlg')) return;
  modal({
    title: t('새 프로젝트'),
    body: `<p class="note dim new-lead">${t('영상 링크를 붙여 넣거나 파일을 올리면 검수 링크가 바로 만들어져요.')}</p>
      <form class="hero-form" data-hero><input placeholder="${t('유튜브 · 비메오 · 캔바 링크, 영상 · PDF · 사진 주소')}" aria-label="${t('영상 링크')}" autofocus><button class="btn brand">${ic('plus')}${t('만들기')}</button></form>
      <label class="drop-file" data-drop>${ic('import', 18)}<span><b>${t('파일 올리기')}</b><small>${t('영상 · PDF · PPT(.pptx) · 사진 — 끌어 놓거나 눌러서 고르기')}</small></span><input type="file" accept="${ACC}" multiple hidden></label>`,
    actions: [{ label: t('나중에 넣기'), kind: 'ghost', value: 'later' }, { label: t('닫기'), value: null }],
    onOpen: (w, close) => { w.classList.add('new-dlg'); wireSourcePicker(w, () => close('go')); },
  }).then(v => { if (v === 'later') startNew(); });
}

/** 영상·문서 올리기 — 시험 버전: 서버 대신 이 브라우저에 저장. 사진은 여러 장을 한 세트로 */
async function uploadFile(input) {
  const files = [...(input instanceof File ? [input] : input)];
  if (!files.length) return null;
  const kinds = files.map(f => (f.type || '').startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name) ? 'video' : docType(f));
  if (kinds.includes('ppt-old')) { toast(t('예전 PPT(.ppt) 형식은 열 수 없어요. PowerPoint에서 .pptx나 PDF로 저장해 올려 주세요'), 4600); return null; }
  let use = files, kind = kinds[0];
  if (kinds.every(k => k === 'img')) kind = 'img';
  else { use = [files[0]]; if (files.length > 1) toast(t('한 번에 하나씩 올려 주세요 — 사진만 여러 장을 한 세트로 올릴 수 있어요'), 4000); }
  if (!kind) { toast(t('영상·PDF·PPT(.pptx)·사진 파일을 골라 주세요')); return null; }
  const size = use.reduce((x, f) => x + f.size, 0), label = use.length > 1 ? `${use[0].name} +${use.length - 1}` : use[0].name;
  let setP;
  const done = modal({
    title: kind === 'video' ? t('영상 올리는 중') : t('문서 올리는 중'), dismissible: false,
    body: `<div class="upload"><b>${esc(label)}</b><span class="dim">${fmtSize(size)}</span><div class="progress big"><i data-up></i></div><span class="up-pct" data-pct>0%</span></div>
      <p class="note dim">${MODE === 'mock' ? t('시험 버전: 서버 대신 이 브라우저에 저장해요. 다른 기기의 클라이언트는 같은 파일을 직접 골라 연결해요.') : ''}</p>`,
    onOpen: (w, close) => { setP = (x, end) => { $('[data-up]', w).style.width = x * 100 + '%'; $('[data-pct]', w).textContent = Math.round(x * 100) + '%'; if (end) setTimeout(() => close('ok'), 250); }; },
  });
  try {
    let src;
    if (kind === 'video') { const meta = await putMedia('f' + uid(10), use[0], x => setP && setP(x)); src = { k: 'file', ...meta }; }
    else src = await putDoc(use, kind, x => setP && setP(x));
    setP(1, true); await done;
    toast(kind === 'video' ? t('영상을 올렸어요') : t('문서를 올렸어요'));
    return src;
  } catch { setP && setP(0, true); await done; toast(t('영상을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요')); return null; }
}

const ACC = 'video/*,.mp4,.mov,.m4v,.webm,.mkv,application/pdf,.pdf,.pptx,image/*';
/** 붙여 넣은 링크 확인 — 알아볼 수 없으면 안내하고 false */
async function checkSource(v) {
  v = (v || '').trim(); if (!v) return null;
  const slow = setTimeout(() => toast(t('링크를 확인하는 중…'), 2500), 500);
  const src = await resolveSource(v); clearTimeout(slow);
  if (src && src.error === 'canva-short') { const full = await canvaShortDialog(src.short); return full ? checkSource(full) : false; }
  if (src && src.error === 'mixed') { toast(t('여러 링크는 사진 주소만 한 세트로 넣을 수 있어요'), 4200); return false; }
  if (!src) { toast(t('알아볼 수 없는 링크예요. 유튜브·비메오·캔바 링크나 영상·PDF·사진 주소인지 확인해 주세요'), 4600); return false; }
  if (src.dt === 'canva') {
    const slow2 = setTimeout(() => toast(t('캔바 디자인의 페이지 수를 확인하는 중…'), 3000), 400);
    const info = await canvaInfo(src); clearTimeout(slow2);
    if (info && info.pages) { toast(t('캔바 디자인 {n}페이지를 불러왔어요', { n: info.pages }), 2600); return { ...src, n: info.pages, ar: info.ar || src.ar, auto: 1 }; }
    return canvaDialog(src);
  }
  return src;
}

/** canva.link 짧은 주소: 브라우저는 다른 사이트가 어디로 넘어가는지 읽을 수 없다 → 새 탭에서 열고 주소를 붙여 넣게 한다 */
async function canvaShortDialog(short) {
  let full = '';
  const v = await modal({
    title: t('캔바 짧은 주소'),
    body: `<p class="note">${t('짧은 주소(canva.link)는 브라우저가 진짜 주소를 알려 주지 않아서 한 단계가 더 필요해요.')}</p>
      <ol class="short-steps">
        <li><a class="btn" href="${esc(short)}" target="_blank" rel="noopener" data-open>${ic('link', 15)}${t('캔바에서 열기')}</a><span>${t('새 탭에 캔바 디자인이 열려요')}</span></li>
        <li><span>${t('그 탭의 주소창 주소(canva.com/design/…)를 복사해 아래에 붙여 넣어 주세요')}</span></li>
      </ol>
      <input class="field-in" data-full placeholder="https://www.canva.com/design/…/view" aria-label="${t('캔바 전체 주소')}">
      <p class="note dim">${t('디자인 소유자가 공유 → 공개 보기 링크를 켜 둔 디자인만 열 수 있어요.')}</p>`,
    actions: [{ label: t('취소'), value: null }, { label: t('확인'), kind: 'primary', value: 'ok' }],
    onOpen: w => {
      const inp = w.querySelector('[data-full]');
      const sync = () => { full = inp.value.trim(); };
      inp.addEventListener('input', sync); inp.addEventListener('paste', () => setTimeout(sync));
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sync(); w.querySelector('.foot .primary').click(); } });
      w.querySelector('[data-open]').addEventListener('click', () => setTimeout(() => inp.focus(), 300));
    },
  });
  if (v !== 'ok' || !full) return '';
  if (!canvaFrom(full) || canvaFrom(full).error) { toast(t('canva.com/design/… 로 시작하는 전체 주소를 넣어 주세요'), 4200); return ''; }
  return full;
}

/** 서버에서 페이지 수를 못 읽었을 때(비공개 디자인·연결 실패) → 넣을 때 바로 묻는다 */
const CANVA_AR = [['16:9', '16 : 9'], ['4:3', '4 : 3'], ['1:1', '1 : 1'], ['9:16', '9 : 16'], ['210:297', 'A4 ↕'], ['297:210', 'A4 ↔']];
async function canvaDialog(src) {
  let n = Math.max(1, +src.n || 1), ar = (src.ar || [16, 9]).join(':');
  const v = await modal({
    title: t('캔바 디자인 페이지 수'),
    body: `<p class="note">${t('페이지 수를 자동으로 알아내지 못했어요. 디자인이 몇 페이지인지 알려 주세요. 나중에 설정에서 바꿀 수 있어요.')}</p>
      <div class="canva-ask">
        <div class="stepper"><button type="button" class="btn icon" data-cs="-1" aria-label="${t('한 페이지 줄이기')}">${ic('minus')}</button>
          <input type="number" min="1" max="300" value="${n}" data-cn aria-label="${t('페이지 수')}"><span>${t('페이지')}</span>
          <button type="button" class="btn icon" data-cs="1" aria-label="${t('한 페이지 늘리기')}">${ic('plus')}</button></div>
        <div class="card-title">${t('화면비')}</div>
        <div class="seg ar-seg">${CANVA_AR.map(([k, l]) => `<button type="button" class="btn ${k === ar ? 'on' : ''}" data-car="${k}">${l}</button>`).join('')}</div>
      </div>`,
    actions: [{ label: t('확인'), kind: 'primary', value: 'ok' }],
    onOpen: w => {
      const inp = w.querySelector('[data-cn]');
      inp.focus(); inp.select();
      w.addEventListener('click', e => {
        const s = e.target.closest('[data-cs]'); if (s) { inp.value = n = Math.max(1, Math.min(300, (parseInt(inp.value) || 1) + +s.dataset.cs)); }
        const a = e.target.closest('[data-car]'); if (a) { ar = a.dataset.car; w.querySelectorAll('[data-car]').forEach(b => b.classList.toggle('on', b === a)); }
      });
      inp.addEventListener('input', () => { n = Math.max(1, Math.min(300, parseInt(inp.value) || 1)); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); w.querySelector('.foot .primary').click(); } });
      w.addEventListener('click', () => { n = Math.max(1, Math.min(300, parseInt(inp.value) || 1)); }, true);
    },
  });
  if (v !== 'ok') n = Math.max(1, Math.min(300, parseInt(n) || 1));
  return { ...src, n, ar: ar.split(':').map(Number) };
}

async function startNew(url = '', given = null) {
  const src = given || (url ? await checkSource(url) : null);
  if (src === false) return;
  if (url && !src) return;
  const p = await newProject({ src });
  if (src) { const m = await probe(src); Object.assign(p, { title: p.title || m.title, ar: m.ar || p.ar, fps: m.fps || 0, fpsHow: m.fps ? 'title' : '', poster: m.poster || '' }); Store.saveProject(p); }
  location.hash = '#p=' + p.id + '&tab=setup';
  setTimeout(maybeShowTour, 500); // 프로젝트를 만들 때마다 사용 안내 (다시 보지 않기를 고르면 건너뛴다)
}

function importInto(pp, reqs) {
  let p = Store.getProject(pp.id);
  if (!p) { // 다른 기기에서 만든 프로젝트: 링크 정보로 다시 만든다
    p = { id: pp.id, title: pp.t, notice: pp.n, due: pp.d, src: pp.src, ar: pp.ar, fps: pp.fps, fpsHow: pp.fh, poster: pp.pv || '', notes: (pp.dn || []).map(n => ({ ...n, by: 'd', rp: n.rp || [] })), pinHash: pp.ph, salt: pp.s, by: pp.by, pin: '', createdAt: Date.now(), imported: true };
    Store.saveProject(p);
  }
  let added = 0;
  for (const r of reqs) {
    r.items.forEach(it => { it.st = it.st || 'open'; it.rp = it.rp || []; });
    // 클라이언트가 디렉터 안내에 단 답글
    for (const x of r.nr || []) { const n = (p.notes || []).find(k => k.id === x.id); if (!n) continue; n.rp = n.rp || []; for (const rp of x.rp) if (!n.rp.some(o => o.at === rp.at && o.b === rp.b)) n.rp.push(rp); n.rp.sort((a, b) => a.at - b.at); }
    if (Store.importRequest(p.id, r)) added++;
  }
  Store.saveProject(p);
  return p.id;
}

async function importDialog(fileText) {
  const handle = async text => {
    try {
      const d = await parseIncoming(text);
      const reqs = d.reqs || [d.r];
      const id = importInto(d.p, reqs);
      toast(`${t('수정요청')} ${reqs.reduce((a, r) => a + r.items.length, 0)}${t('건을 가져왔어요')}`);
      location.hash = '#p=' + id + '&tab=inbox';
      return true;
    } catch { toast(t('가져올 수 없는 형식이에요. 수정요청 링크나 HTML 파일인지 확인해 주세요')); return false; }
  };
  if (fileText) return handle(fileText);
  await modal({
    title: t('수정요청 가져오기'),
    body: `<p class="note">${t('클라이언트가 메시지로 보낸 글(링크 포함)을 붙여 넣거나, 받은 HTML 파일을 골라 주세요. 화면 아무 곳에 파일을 끌어 놓아도 돼요.')}</p>
      <textarea class="paste" data-paste rows="5" placeholder="${t('메시지 전체 또는 #r= 링크 붙여 넣기')}" autofocus></textarea>
      <label class="btn ghost file-btn">${ic('file')}${t('HTML 파일 고르기')}<input type="file" accept=".html,.htm,.json" hidden data-file></label>`,
    actions: [{ label: t('취소'), value: null }, { label: t('가져오기'), kind: 'primary', onClick: w => { const v = $('[data-paste]', w).value; if (!v.trim()) { toast(t('붙여 넣은 내용이 없어요')); return false; } handle(v); } }],
    onOpen: (w, close) => { $('[data-file]', w).addEventListener('change', async e => { const f = e.target.files[0]; if (f && await handle(await f.text())) close('ok'); }); },
  });
}

/* ---------- 프로젝트 화면 ---------- */
const params_pane = p => (p.notes || []).length && !Store.inbox(p.id).length ? 'notes' : 'req';
function renderProject(main, p, tab) {
  const inbox = Store.inbox(p.id), all = inbox.flatMap(r => r.items);
  main.innerHTML = `
    <div class="phead">
      <input class="ptitle-in" data-f="title" value="${esc(p.title)}" placeholder="${t('프로젝트 이름')}" aria-label="${t('프로젝트 이름')}" spellcheck="false">
      <div class="tabs" role="tablist">
        <button role="tab" data-tab="inbox" class="${tab === 'inbox' ? 'on' : ''}">${ic('inbox')}${t('수정요청 · 안내')} <b>${all.length}</b></button>
        <button role="tab" data-tab="setup" class="${tab === 'setup' ? 'on' : ''}">${ic('sliders')}${t('설정 · 공유')}</button>
      </div>
    </div>
    <div class="pbody ${tab}">
      <section class="left" data-viewer></section>
    <div class="splitter row" aria-label="${t('영상 높이 조정')}"></div><div class="splitter col" aria-label="${t('수정내역 칸 너비 조정')}"></div>
      <aside class="side" data-side></aside>
    </div>`;
  workspaceSplitters(main, 'director-' + tab);
  $$('[data-tab]', main).forEach(b => b.addEventListener('click', () => { location.hash = '#p=' + p.id + '&tab=' + b.dataset.tab; }));
  $('[data-f=title]', main).addEventListener('input', e => { p.title = e.target.value; Store.saveProject(p); const pt = $('.pitem.on .ptn'); if (pt) pt.textContent = p.title || t('제목 없음'); queueLink(); });

  const viewerEl = $('[data-viewer]', main);
  let selected = null;
  const items = () => [...Store.inbox(p.id).flatMap(r => r.items), ...(p.notes || [])].sort((a, b) => a.t - b.t);
  const hooks = {};
  if (p.src) {
    V = mountViewer(viewerEl, p.src, {
      items: tab === 'inbox' ? items : null,
      selected: () => selected,
      // 디렉터도 핀·펜으로 클라이언트에게 안내를 남긴다
      tools: tab === 'inbox', mine: 'd',
      label: it => hooks.label ? hooks.label(it) : '',
      onPin: a => hooks.pin && hooks.pin(a), onStroke: s => hooks.stroke && hooks.stroke(s), onMemo: () => hooks.memo && hooks.memo(),
      onMeta: m => { // 알아서 알아낸 화면비·프레임 수를 저장 → 클라이언트 링크에도 들어간다
        let ch = false;
        if (m.ar && (m.ar[0] !== (p.ar || [])[0] || m.ar[1] !== (p.ar || [])[1])) { p.ar = m.ar; ch = true; }
        if (m.fps && m.fpsHow === 'measured' && p.fpsHow !== 'set' && (m.fps !== p.fps || p.fpsHow !== 'measured')) { p.fps = m.fps; p.fpsHow = 'measured'; ch = true; }
        if (m.title && !p.title) { p.title = m.title; $('[data-f=title]', main).value = m.title; ch = true; }
        if (m.poster && m.poster !== p.poster) { p.poster = m.poster; ch = true; }
        if (ch) { Store.saveProject(p); queueLink(); renderMeta(); }
      },
      onReady: info => { p.duration = info.duration; if (!p.title && info.title) { p.title = info.title; $('[data-f=title]', main).value = info.title; } Store.saveProject(p); renderMeta(); },
    });
    if (p.ar) V.P.setMeta({ ar: p.ar });
    if (p.fps) V.P.setMeta({ fps: p.fps, how: p.fpsHow || 'measured' });
  } else {
    viewerEl.innerHTML = `<div class="viewer"><div class="stage empty-stage"><div><b>${t('영상을 넣어 주세요')}</b><span>${t('오른쪽')} "${t('영상')}" ${t('칸에 유튜브·비메오 링크나 mp4 주소를 붙여 넣거나 영상 파일을 올리면 여기서 바로 재생돼요.')}</span></div></div></div>`;
  }

  if (tab === 'setup') renderSetup($('[data-side]', main), p, main);
  else renderInbox($('[data-side]', main), p, () => selected, id => { selected = id; }, hooks, params_pane(p));

  document.onkeydown = e => {
    if (document.querySelector('.modal.open')) return;
    if (e.target.closest && e.target.closest('textarea,input,select')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'v' || e.key === 'V') { toggleListView(); return; }
    V && V.key(e);
  };

  function renderMeta() {
    const el = $('[data-meta]', main); if (!el || !V) return;
    const P = V.P;
    if (P.doc) { el.innerHTML = `<span class="chip">${srcKind(p.src)}</span>${P.ready() ? `<span class="chip">${t(p.src.dt === 'pptx' || p.src.dt === 'canva' ? '슬라이드 {n}장' : p.src.dt === 'img' ? '사진 {n}장' : '총 {n}쪽', { n: P.duration() + 1 })}</span>` : ''}`; return; }
    const how = P.fpsHow === 'measured' ? t('측정됨') : P.fpsHow === 'title' ? t('영상 정보') : P.fpsHow === 'set' ? t('직접 지정') : P.live() ? t('재생하면 측정') : t('기본값');
    el.innerHTML = `<span class="chip">${srcKind(p.src)}</span><span class="chip">${P.ar[0]}:${P.ar[1]}${P.ar[0] < P.ar[1] ? t(' 세로') : ''}</span>
      <label class="chip fps-pick ${P.fpsHow === 'measured' ? 'measured' : ''}" title="${t('프레임 수 — 시간 주소의 프레임 번호 기준')}">
        <select data-fps-pick aria-label="${t('프레임 수')}">${['', ...STD_FPS].map(f => `<option value="${f}" ${(f === '' ? !P.fps : f === P.fps) ? 'selected' : ''}>${f === '' ? t('30fps (기본)') : fpsLabel(f)}</option>`).join('')}</select><span>${how}</span></label>
      ${p.duration ? `<span class="chip">${tc(p.duration, P.effFps())}</span>` : ''}`;
    $('[data-fps-pick]', el).addEventListener('change', e => {
      const f = +e.target.value || 0;
      p.fps = f; p.fpsHow = f ? 'set' : ''; Store.saveProject(p); queueLink();
      if (f) V.P.setMeta({ fps: f, how: 'set', force: true }); else { V.P.fps = 0; V.P.fpsHow = ''; }
      renderMeta(); V.render();
    });
  }
  let linkT;
  function queueLink() { clearTimeout(linkT); linkT = setTimeout(() => main.dispatchEvent(new CustomEvent('linkchange')), 250); }
  main._queueLink = queueLink; main._renderMeta = renderMeta;
  setTimeout(renderMeta, 50);
}

/* ---------- 설정 · 공유 ---------- */
function renderSetup(side, p, main) {
  const isFile = p.src && (p.src.k === 'file' || (p.src.k === 'doc' && !p.src.url));
  side.innerHTML = `
    <div class="card">
      <div class="card-title">${isDoc(p.src) ? t('검수 문서') : t('영상')}</div>
      <div class="linkbox"><input class="field-in" data-f="src" value="${esc(isFile ? '' : srcText(p.src))}" placeholder="${isFile ? esc(p.src.name + ' · ' + fmtSize(p.src.size || 0)) : t('유튜브 · 비메오 · 캔바 링크, 영상 · PDF · 사진 주소')}" aria-label="${t('영상 링크')}" spellcheck="false">
        <label class="btn" title="${t('영상·문서 파일 올리기')}">${ic('import')}${t('파일')}<input type="file" data-upload accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,application/pdf,.pdf,.pptx,image/*" multiple hidden></label></div>
      <div class="meta-row" data-meta></div>
      ${p.src && p.src.dt === 'canva' ? `<div class="canva-set">
        <label><span>${t('페이지 수')}</span><input class="field-in" type="number" min="1" max="300" data-canva="n" value="${p.src.n || 10}"></label>
        <label><span>${t('화면비')}</span><select class="field-in" data-canva="ar">${(() => {
          const cur = (p.src.ar || [16, 9]).join(':'), list = [['16:9', '16 : 9'], ['4:3', '4 : 3'], ['1:1', '1 : 1'], ['9:16', '9 : 16'], ['3:4', '3 : 4'], ['4:5', '4 : 5'], ['210:297', t('A4 세로')], ['297:210', t('A4 가로')]];
          if (!list.some(([v]) => v === cur)) list.unshift([cur, cur.replace(':', ' : ')]);
          return list.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('');
        })()}</select></label>
        <button type="button" class="btn small" data-canva-sync title="${t('캔바에서 페이지 수와 화면비를 다시 읽어 와요')}">${ic('sync', 15)}${t('다시 확인')}</button>
        <p class="note dim">${t('페이지 수와 화면비는 캔바 디자인에서 자동으로 맞춰요. 캔바에서 페이지를 늘리거나 줄였다면 [다시 확인]을 눌러 주세요. 화면이 안 보이면 캔바에서 공유 → 공개 보기 링크를 켜 주세요. 장면 사진은 보낼 때 화면 공유로 한 번에 찍어요.')}</p></div>` : ''}
    </div>
    <div class="card">
      <div class="card-title">${t('클라이언트 안내사항')}</div>
      <textarea class="field-in" data-f="notice" rows="5" placeholder="${t('클라이언트가 처음 열 때 보이는 안내예요. 주의사항·마감·요청 방법을 적어 주세요.')}">${esc(p.notice)}</textarea>
      <div class="chips" data-chips>${NOTICE_CHIPS.map(c => `<button class="chipbtn" type="button">${esc(c)}</button>`).join('')}</div>
      <div class="two">
        <label class="field"><span>${t('피드백 마감')}</span><input type="date" data-f="due" value="${esc(p.due || '')}"></label>
        <label class="field"><span>${t('보내는 사람(디렉터)')}</span><input data-f="by" value="${esc(p.by || '')}" placeholder="${t('이름·팀')}" maxlength="40"></label>
      </div>
    </div>
    <div class="card share">
      <div class="card-title">${t('클라이언트 공유')} ${ic('lock', 14)}</div>
      <div class="pinrow">
        <div class="pin-show" data-pin aria-label="${t('핀 번호')}">${p.pin ? p.pin.split('').map(d => `<span>${d}</span>`).join('') : t('<em>다른 기기에서 만든 프로젝트예요</em>')}</div>
        <div class="pin-act">
          <button class="btn small ghost" data-act="pin-new" title="${t('새 번호로 바꾸면 이전 링크는 열리지 않아요')}">${t('새 번호')}</button>
          <button class="btn small ghost" data-act="pin-edit">${t('직접 입력')}</button>
        </div>
      </div>
      <label class="field"><span>${t('클라이언트 링크')}</span><div class="linkbox"><input readonly data-link value="${t('만드는 중…')}" aria-label="${t('클라이언트 링크')}"><button class="btn icon" data-act="copy-link" title="${t('주소 복사')}" aria-label="${t('주소 복사')}">${ic('copy')}</button></div></label>
      <div class="share-btns">
        <button class="btn brand" data-act="copy-msg">${ic('msg')}${t('카톡·메시지용 복사')}</button>
        <button class="btn" data-act="share">${ic('share')}${t('공유하기')}</button>
        <button class="btn" data-act="qr">${ic('qr')}QR</button>
        <a class="btn" data-act="preview" target="_blank" rel="noopener">${ic('eye')}${t('클라이언트 화면')}</a>
      </div>
      <div class="qr" data-qr hidden></div>
      ${(p.notes || []).length ? `<p class="note">${ic('pin', 13)} ${t('디렉터 안내')} <b>${p.notes.length}${t('건')}</b>${t('이 링크에 함께 들어가요.')}</p>` : ''}
      <p class="note dim">${t('핀 번호는 링크와 따로 보내면 더 안전해요. 링크에는 핀 번호 대신 확인용 값만 들어가요.')}${MODE === 'mock' ? t(' 시험 버전에서는 핀 확인이 브라우저 안에서만 이뤄져요.') : ''}</p>
    </div>
    <div class="card danger-zone"><button class="btn ghost danger small" data-act="delete">${ic('trash', 14)}${t('프로젝트 삭제')}</button></div>`;

  const f = k => $(`[data-f=${k}]`, side);
  let link = '';
  async function refreshLink() {
    if (!p.src) { $('[data-link]', side).value = t('영상 링크를 먼저 넣어 주세요'); link = ''; return; }
    link = await clientLink(p);
    $('[data-link]', side).value = link;
    $('[data-act=preview]', side).href = link;
    const q = $('[data-qr]', side); if (!q.hidden) drawQR(q, link);
  }
  main.addEventListener('linkchange', refreshLink);
  refreshLink();

  const changeSrc = async src => {
    p.src = src; p.fps = 0; p.fpsHow = ''; p.poster = ''; p.ar = src && src.k === 'yt' && src.short ? [9, 16] : [16, 9]; p.duration = 0;
    if (src) { const m = await probe(src); p.ar = m.ar || p.ar; p.fps = m.fps || 0; p.fpsHow = m.fps ? 'title' : ''; p.poster = m.poster || ''; if (!p.title) p.title = m.title; }
    if (Store.inbox(p.id).length) toast(t('영상을 바꿨어요. 이미 받은 요청은 이전 영상 기준 시간이에요'), 4200);
    const h = '#p=' + p.id + '&tab=setup'; if (location.hash === h) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = h;
  };
  f('src').addEventListener('change', async e => {
    const src = await checkSource(e.target.value);
    if (src === false) return;
    changeSrc(src);
  });
  $('[data-canva-sync]', side)?.addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true;
    const info = await canvaInfo(p.src); b.disabled = false;
    if (!info || !info.pages) { toast(info ? t('공개 보기 링크가 켜진 디자인만 자동으로 확인할 수 있어요') : t('캔바에 연결하지 못했어요. 잠시 뒤 다시 눌러 주세요'), 4200); return; }
    $('[data-canva=n]', side).value = info.pages;
    const sel = $('[data-canva=ar]', side), v = (info.ar || p.src.ar || [16, 9]).join(':');
    if (![...sel.options].some(o => o.value === v)) sel.add(new Option(v.replace(':', ' : '), v), 0);
    sel.value = v; toast(t('캔바 디자인 {n}페이지를 불러왔어요', { n: info.pages }), 2600);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  side.querySelectorAll('[data-canva]').forEach(el => el.addEventListener('change', () => {
    const n = Math.max(1, Math.min(300, parseInt($('[data-canva=n]', side).value) || 1)), ar = $('[data-canva=ar]', side).value.split(':').map(Number);
    p.src = { ...p.src, n, ar }; p.ar = ar; Store.saveProject(p);
    const h = '#p=' + p.id + '&tab=setup'; if (location.hash === h) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = h;
  }));
  $('[data-upload]', side).addEventListener('change', async e => { if (!e.target.files.length) return; const src = await uploadFile(e.target.files); if (src) changeSrc(src); });
  const bind = (k, ev = 'input') => f(k).addEventListener(ev, e => { p[k] = e.target.value; if (k === 'by') localStorage.setItem('sd:director', p.by); Store.saveProject(p); main._queueLink(); });
  bind('notice'); bind('due', 'change'); bind('by');
  $('[data-chips]', side).addEventListener('click', e => {
    const b = e.target.closest('.chipbtn'); if (!b) return;
    const ta = f('notice'); ta.value = (ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' : '') + '· ' + b.textContent;
    p.notice = ta.value; Store.saveProject(p); main._queueLink(); ta.focus();
  });
  const setPin = async pin => {
    p.pin = pin; p.salt = uid(6); p.pinHash = await sha(p.salt + pin); Store.saveProject(p);
    $('[data-pin]', side).innerHTML = pin.split('').map(d => `<span>${d}</span>`).join('');
    refreshLink(); toast(t('핀 번호를 바꿨어요. 새 링크를 보내 주세요'));
  };
  $('[data-act=pin-new]', side).addEventListener('click', () => setPin(pin4()));
  $('[data-act=pin-edit]', side).addEventListener('click', async () => {
    let v = '';
    const r = await modal({ title: t('핀 번호 직접 입력'), body: '<input class="pin-input" inputmode="numeric" maxlength="4" placeholder="0000" autofocus data-pin-in>', actions: [{ label: t('취소'), value: null }, { label: t('바꾸기'), kind: 'primary', onClick: w => { v = $('[data-pin-in]', w).value; if (!/^\d{4}$/.test(v)) { toast(t('숫자 4자리로 입력해 주세요')); return false; } } }] });
    if (r && v) setPin(v);
  });
  const shareText = () => `[Sense Director] ${p.title || t('영상')} ${t('검수를 부탁드려요')}\n${p.due ? t('마감: ') + dueLabel(p.due) + '\n' : ''}${t('링크를 열고 핀 번호')} ${p.pin || t('(따로 안내)')}${t('를 입력해 주세요.')}`;
  $('[data-act=copy-link]', side).addEventListener('click', async () => { if (!link) return; toast(await copyText(link) ? t('주소를 복사했어요') : t('복사하지 못했어요')); });
  $('[data-act=copy-msg]', side).addEventListener('click', async () => { if (!link) return; toast(await copyText(shareText() + '\n' + link) ? t('안내 글과 링크를 복사했어요. 카톡에 붙여 넣어 주세요') : t('복사하지 못했어요')); });
  $('[data-act=share]', side).addEventListener('click', async () => { if (!link) return; const r = await shareOrCopy({ title: p.title, text: shareText(), url: link }); if (r === 'copied') toast(t('공유 창이 없어 복사했어요')); });
  $('[data-act=qr]', side).addEventListener('click', () => { const q = $('[data-qr]', side); q.hidden = !q.hidden; if (!q.hidden && link) drawQR(q, link); });
  $('[data-act=delete]', side).addEventListener('click', () => deleteProjectAsk(p, true));
}

let qrLib = null;
function drawQR(el, text) {
  const go = () => { el.innerHTML = ''; try { new window.QRCode(el, { text, width: 176, height: 176, colorDark: '#17171f', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.L }); el.insertAdjacentHTML('beforeend', t('<small>휴대폰 카메라로 비추면 바로 열려요</small>')); } catch { el.innerHTML = t('<small>링크가 길어 QR로 만들 수 없어요. 안내사항을 줄여 보세요.</small>'); } };
  if (window.QRCode) return go();
  qrLib = qrLib || new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  qrLib.then(go).catch(() => { el.innerHTML = t('<small>QR 도구를 불러오지 못했어요</small>'); });
}

/* ---------- 받은 수정요청 ---------- */
function renderInbox(side, p, getSel, setSel, hooks, initialPane) {
  let filter = 'all', pane = initialPane || 'req', activeNote = null;
  const notes = () => (p.notes || (p.notes = [])).slice().sort((a, b) => a.t - b.t);
  const saveNotes = () => { Store.saveProject(p); side.closest('.pmain')?._queueLink?.(); };
  const label = it => it.by === 'd' ? noteLabel(p.notes, it.id) : String(Store.inbox(p.id).flatMap(r => r.items).sort((a, b) => a.t - b.t).findIndex(x => x.id === it.id) + 1).padStart(2, '0');
  hooks.label = label;

  /* ---------- 디렉터 안내 만들기: 핀·펜·메모 ---------- */
  async function addNote({ x = null, y = null, s = [] }) {
    if (!V || !V.P.ready()) return;
    V.P.pause();
    const snap = await V.P.snapshot();
    const it = { id: 'd' + uid(6), by: 'd', t: snap.t, x, y, s, tx: '', th: snap.img, rp: [], at: Date.now(), ...(snap.ar ? { ar: snap.ar } : {}) };
    (p.notes || (p.notes = [])).push(it);
    activeNote = it.id; setSel(it.id); pane = 'notes'; saveNotes(); draw();
    const ta = $(`[data-id="${it.id}"] [data-ntx]`, side); if (ta) { ta.focus(); ta.closest('.item').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
  hooks.pin = a => addNote(a);
  hooks.memo = () => addNote({});
  hooks.stroke = pts => {
    const a = (p.notes || []).find(n => n.id === activeNote);
    if (a && V && V.P.paused() && V.P.same(a.t)) { a.s = [...(a.s || []), pts]; saveNotes(); draw(); return; }
    addNote({ s: [pts] });
  };

  // 다시 그려도 보던 자리 그대로 — 상태·댓글을 바꿀 때 목록이 맨 위로 튀지 않게
  const draw = () => {
    const lists = [...side.querySelectorAll('.list')].map(l => l.scrollTop), sideTop = side.scrollTop, winY = scrollY;
    drawNow();
    side.querySelectorAll('.list').forEach((l, k) => { if (lists[k] != null) l.scrollTop = lists[k]; });
    side.scrollTop = sideTop;
    if (Math.abs(scrollY - winY) > 1) scrollTo({ top: winY, behavior: 'instant' });
  };
  const drawNow = () => {
    const inbox = Store.inbox(p.id).sort((a, b) => b.at - a.at), all = inbox.flatMap(r => r.items), ns = notes();
    const cnt = k => all.filter(it => (it.st || 'open') === k).length, done = cnt('done');
    const fps = V ? V.P.effFps() : (p.fps || 30), poster = posterOf(p.src, p.poster);
    const missing = all.filter(it => !it.th).length + ns.filter(it => !it.th).length;
    const sendable = all.length || ns.length;
    side.innerHTML = `
      <div class="side-tabs" role="tablist">
        <button role="tab" class="${pane === 'req' ? 'on' : ''}" data-pane="req">${t('받은 요청')} <b>${all.length}</b></button>
        <button role="tab" class="${pane === 'notes' ? 'on' : ''}" data-pane="notes">${t('내 안내')} <b class="d">${ns.length}</b></button>
      </div>
      ${listViewHTML()}
      <div class="inbox-head">
        ${pane === 'req' ? `
        <div class="progress" title="${t('반영')} ${done} / ${all.length}"><i style="width:${all.length ? done / all.length * 100 : 0}%"></i></div>
        <div class="inbox-stats"><b>${done}</b><span>/ ${all.length} ${t('반영')}</span><span class="dim">${t('진행')} ${cnt('doing')} ${t('· 보류')} ${cnt('hold')} ${t('· 대기')} ${cnt('open')}</span></div>`
        : `<p class="note-hint">${ic('pin', 14)}<span>${t('영상에 핀·펜으로 표시하면')} <b>${t('디렉터 안내')}</b>${t('가 돼요. 클라이언트 화면에 파란 표시로 보이고, 클라이언트가 답글을 달 수 있어요.')}</span></p>`}
        ${missing && V && V.canShare() ? `<button class="btn small ghost thumbs-btn" data-act="thumbs">${ic('cam', 14)}${t('장면 사진 없는')} ${missing}${t('건 만들기')}</button>` : ''}
        <div class="thumb-progress" data-tp hidden><i></i><span></span></div>
        <div class="inbox-actions">
          ${pane === 'req' ? `<div class="seg small" role="group" aria-label="${t('상태 필터')}">${['all', 'open', 'doing', 'done', 'hold'].map(k => `<button class="btn${filter === k ? ' on' : ''}" data-filter="${k}">${k === 'all' ? t('전체') : STATUS[k]}</button>`).join('')}</div>` : '<span></span>'}
          <div class="split" data-menu-root>
            <button class="btn brand" data-act="feedback" ${sendable ? '' : 'disabled'} title="${t('상태·댓글·디렉터 안내를 클라이언트에게')}">${ic('send')}${all.length ? t('회신 보내기') : t('안내 보내기')}</button>
            <button class="btn brand caret" data-act="fb-more" aria-label="${t('보내는 방법')}" ${sendable ? '' : 'disabled'}>${ic('down', 14)}</button>
            <div class="menu" role="menu" hidden>
              <button data-fb="msg">${ic('msg')}<span><b>${t('메시지로 보내기')}</b><small>${t('안내·상태·댓글 요약 + 클라이언트 확인 링크')}</small></span></button>
              <button data-fb="html">${ic('file')}<span><b>${t('HTML 보내기')}</b><small>${t('장면 사진과 댓글이 담긴 파일')}</small></span></button>
              <button data-fb="pdf">${ic('print')}<span><b>${t('PDF 보내기')}</b><small>${t('인쇄 창에서 \'PDF로 저장\'')}</small></span></button>
            </div>
          </div>
        </div>
      </div>
      <div class="list">${pane === 'notes' ? (ns.length ? ns.map(it => noteCard(it, fps, poster)).join('') : `<div class="empty">
          <b>${t('클라이언트에게 남길 안내가 없어요')}</b>
          <span>${ic('pin', 14)} ${t('핀 ·')} ${ic('pen', 14)} ${t('펜으로 영상 위에 표시하고 내용을 적어 주세요.')}</span>
          <span>${t('예:')} "${t('이 컷은 색보정 전이에요')}", "${t('자막 위치는 여기로 바뀔 예정')}"</span>
          <span class="dim">${t('안내는 클라이언트 링크와')} "${t('안내 보내기')}"${t('에 함께 담겨요.')}</span></div>`)
        : inbox.length ? inbox.map(r => {
          const its = r.items.filter(it => filter === 'all' || (it.st || 'open') === filter).sort((a, b) => a.t - b.t);
          if (!its.length) return '';
          return `<div class="group">${dayLine(r.at, `${esc(r.from || t('클라이언트'))} · ${fmtTime(r.at)} · ${r.items.length}${t('건')}`)}${its.map(it => card(it, r, label(it), fps, poster)).join('')}</div>`;
        }).join('') || t('<div class="empty"><b>이 상태의 요청이 없어요</b></div>') : `<div class="empty">
          <b>${t('아직 받은 수정요청이 없어요')}</b>
          <span>"${t('설정 · 공유')}"${t('에서 링크와 핀 번호를 클라이언트에게 보내 주세요.')}</span>
          <span>${t('클라이언트가 메시지나 HTML 파일로 보냈다면 위의')} "${t('가져오기')}"${t('를 쓰거나 파일을 이 화면에 끌어 놓으세요.')}</span>
          ${MODE === 'mock' ? t('<span class="dim">시험 버전: 같은 브라우저에서 "클라이언트 화면"을 열어 보내면 여기에 바로 들어와요.</span>') : ''}</div>`}
      </div>`;
    bindMenu(side);
    if (V) V.render();
  };
  // 받은 요청: 클라이언트 말(왼쪽 말풍선, 장면 사진 + 내용) → 상태 → 댓글 대화 → 입력창
  function card(it, r, n, fps, poster) {
    const st = it.st || 'open', sel = getSel() === it.id, who = r.from || t('클라이언트');
    const body = `<div class="item-head"><span class="no">${n}</span><button class="tcbtn" data-seek title="${t('이 시점으로')}">${tc(it.t, fps)}</button>
        <button class="icon-x tonly" data-full aria-label="${t('크게 보기')}" title="${t('장면과 함께 크게 보기')}">${ic('expand', 14)}</button><button class="icon-x" data-loop title="${t('앞뒤 2초 반복 재생')}" aria-label="${t('앞뒤 재생')}">${ic('loop', 15)}</button></div>
      <div data-snapseek role="button" tabindex="0" aria-label="${n}${t('번 장면으로 이동')}">${snapHTML(it, n, p.ar || [16, 9], poster, undefined, { full: true })}</div>
      ${it.tx ? `<p class="tx">${esc(it.tx)}</p>` : `<p class="tx dim">${t('(내용 없음)')}</p>`}`;
    return `<article class="item chat st-${st}${sel ? ' sel' : ''}" data-id="${it.id}" data-rid="${r.rid}">
      ${msg({ me: false, side: 'c', name: who, body, at: it.at || r.at, cls: 'req', after: statusSeg(st) })}
      ${threadHTML(it, who)}
    </article>`;
  }
  // 내 안내: 내 말(오른쪽 말풍선) → 클라이언트 답글
  function noteCard(it, fps, poster) {
    const n = label(it), sel = getSel() === it.id;
    const kind = it.x != null ? (it.s && it.s.length ? t('핀 + 그림') : t('핀')) : it.s && it.s.length ? t('그림') : t('메모');
    const body = `<div class="item-head"><span class="no d">${n}</span><button class="tcbtn" data-seek title="${t('이 시점으로')}">${tc(it.t, fps)}</button><span class="kind">${kind}</span><button class="icon-x tonly" data-full aria-label="${t('크게 보기')}" title="${t('장면과 함께 크게 보기')}">${ic('expand', 14)}</button>
        <button class="icon-x" data-ndel aria-label="${t('안내 삭제')}" title="${t('삭제')}">${ic('trash', 15)}</button></div>
      <div data-snapseek role="button" tabindex="0" aria-label="${n} ${t('장면으로 이동')}">${snapHTML(it, n, p.ar || [16, 9], poster, V && V.needsShare() ? t('장면 사진 없음 — 위 버튼으로 만들 수 있어요') : t('장면 사진 없음'), { full: true })}</div>
      <textarea rows="2" placeholder="${t('클라이언트에게 남길 안내를 적어 주세요')}" data-ntx>${esc(it.tx || '')}</textarea>`;
    return `<article class="item chat note${sel ? ' sel' : ''}" data-id="${it.id}" data-note>
      ${msg({ me: true, side: 'd', name: p.by || t('디렉터'), body, at: it.at, cls: 'req' })}
      ${(it.rp || []).length ? threadHTML(it, t('클라이언트'), true) : ''}
    </article>`;
  }
  function threadHTML(it, from, noteThread = false) {
    return `<div class="thread">${replies(it.rp, 'd', { c: from || t('클라이언트'), d: p.by || t('디렉터') })}
        ${noteThread ? '' : `<div class="qchips">${REPLY_CHIPS.map(c => `<button class="chipbtn" data-q>${esc(c)}</button>`).join('')}</div>`}
        ${composer(noteThread ? t('답글') : t('댓글로 답하기'), t('댓글 달기'))}
      </div>`;
  }
  const statusSeg = st => `<div class="seg status" role="group" aria-label="${t('반영 상태')}">${['open', 'doing', 'done', 'hold'].map(k => `<button class="btn st-${k}${st === k ? ' on' : ''}" data-st="${k}">${STATUS[k]}</button>`).join('')}</div>`;
  const update = (rid, id, f) => {
    const inbox = Store.inbox(p.id), r = inbox.find(x => x.rid === rid), it = r && r.items.find(x => x.id === id);
    if (!it) return; f(it); Store.saveInbox(p.id, inbox); draw();
  };
  const addReply = (rid, id, b) => update(rid, id, it => { it.rp = [...(it.rp || []), { by: 'd', n: p.by || t('디렉터'), b, at: Date.now() }]; if ((it.st || 'open') === 'open' && /반영하겠|반영할게|will (apply|fix)/i.test(b)) it.st = 'doing'; });
  const noteOf = id => (p.notes || []).find(n => n.id === id);
  const noteReply = (id, b) => { const n = noteOf(id); if (!n) return; n.rp = [...(n.rp || []), { by: 'd', n: p.by || t('디렉터'), b, at: Date.now() }]; saveNotes(); draw(); };
  const noteDelete = id => {
    const k = (p.notes || []).findIndex(n => n.id === id); if (k < 0) return;
    const [gone] = p.notes.splice(k, 1); saveNotes(); draw();
    toast(`${t('안내를 지웠어요')} <button class="link" data-undo>${t('되돌리기')}</button>`, 4000);
    const u = $('#toast [data-undo]'); u && u.addEventListener('click', () => { p.notes.push(gone); saveNotes(); draw(); });
  };

  /* ---------- 크게 보기 ---------- */
  const visible = () => pane === 'notes' ? notes()
    : Store.inbox(p.id).sort((a, b) => b.at - a.at).flatMap(r => r.items.filter(it => filter === 'all' || (it.st || 'open') === filter).sort((a, b) => a.t - b.t).map(it => ({ ...it, _rid: r.rid, _from: r.from })));
  function zoom(id) {
    const vis = visible(), index = vis.findIndex(it => it.id === id); if (index < 0) return;
    setSel(id); draw();
    openZoom({
      items: visible, index, ar: p.ar || [16, 9], poster: posterOf(p.src, p.poster), fps: () => V ? V.P.effFps() : (p.fps || 30), numOf: label,
      from: it => $(`.list [data-id="${it.id}"] .snap`, side),
      detail: it => it.by === 'd'
        ? `<div class="zfrom d">${t('디렉터 안내')}</div><label class="field"><span>${t('안내 내용')}</span><textarea class="ztx-in" data-zntx rows="5" placeholder="${t('클라이언트에게 남길 안내를 적어 주세요')}">${esc(it.tx || '')}</textarea></label>
          <div class="zacts"><button class="btn" data-zact="loop">${ic('loop', 14)}${t('앞뒤 2초 재생')}</button><button class="btn ghost danger" data-zact="ndel">${ic('trash', 14)}${t('삭제')}</button></div>
          ${threadHTML(it, t('클라이언트'), true)}`
        : `${saidHTML(it._from || t('클라이언트'), it.tx || t('(내용 없음)'), 'c ztx')}
          ${statusSeg(it.st || 'open')}
          <div class="zacts"><button class="btn" data-zact="loop">${ic('loop', 14)}${t('앞뒤 2초 재생')}</button></div>
          ${threadHTML(it, it._from)}`,
      wire: (el, it, api) => {
        const ta = $('[data-zntx]', el);
        if (ta) { ta.addEventListener('input', () => { const n = noteOf(it.id); if (n) { n.tx = ta.value; saveNotes(); const c = $(`.list [data-id="${it.id}"] [data-ntx]`, side); if (c) c.value = ta.value; } }); if (!it.tx) setTimeout(() => ta.focus(), 260); }
        el.addEventListener('click', ev => {
          const stb = ev.target.closest('[data-st]'); if (stb) { update(it._rid, it.id, x => x.st = stb.dataset.st); api.refresh(); return; }
          const q = ev.target.closest('[data-q]'); if (q) { const inp = $('[data-reply] input', el); inp.value = q.textContent; inp.focus(); return; }
          if (ev.target.closest('[data-zact=loop]')) { api.close(); setSel(it.id); V && V.loopAround(it.t); }
          if (ev.target.closest('[data-zact=ndel]')) { noteDelete(it.id); if (!visible().length) api.close(); else api.refresh(); }
        });
        $('[data-reply]', el).addEventListener('submit', ev => {
          ev.preventDefault(); const b = $('[data-reply] input', el).value.trim(); if (!b) return;
          if (it.by === 'd') noteReply(it.id, b); else addReply(it._rid, it.id, b);
          api.refresh();
        });
      },
      onClose: it => { if (it && V) { setSel(it.id); if (it.by === 'd') activeNote = it.id; V.P.pause(); V.P.seek(it.t); if (it.th) V.P.showFreeze(it.th, it.t); draw(); } },
    });
  }
  // 썸네일 = 그 프레임으로 이동, 오른쪽 아래 버튼 = 전체화면으로 장면·수정사항 보기
  side.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-snapseek]')) { e.preventDefault(); e.target.click(); } });
  side.addEventListener('input', e => {
    const ta = e.target.closest('[data-ntx]'); if (!ta) return;
    const n = noteOf(ta.closest('.item').dataset.id); if (!n) return;
    n.tx = ta.value; ta.style.height = 'auto'; ta.style.height = Math.min(220, ta.scrollHeight + 2) + 'px';
    clearTimeout(side._nt); side._nt = setTimeout(saveNotes, 300);
  });
  side.addEventListener('click', async e => {
    const pb = e.target.closest('[data-pane]'); if (pb) { pane = pb.dataset.pane; draw(); return; }
    const fb = e.target.closest('[data-filter]'); if (fb) { filter = fb.dataset.filter; draw(); return; }
    if (e.target.closest('[data-act=thumbs]')) {
      const inbox = Store.inbox(p.id), items = [...inbox.flatMap(r => r.items), ...(p.notes || [])], tp = $('[data-tp]', side);
      if (V.needsShare()) {
        const ok = await modal({ title: t('장면 사진 만들기'), body: `<p class="note">${t('이 탭 화면을 잠깐 공유해서 사진이 없는')} ${items.filter(it => !it.th).length}${t('개 장면을 자동으로 찍어요. 끝나면 공유는 바로 꺼져요.')}</p>`, actions: [{ label: t('취소'), value: null }, { label: `${ic('cam')}${t('만들기')}`, kind: 'primary', value: 'go' }] });
        if (ok !== 'go') return;
      }
      const res = await V.makeThumbs(items, (i, n) => { tp.hidden = false; $('i', tp).style.width = i / n * 100 + '%'; $('span', tp).textContent = `${t('장면 사진 만드는 중')} ${i}/${n}`; });
      Store.saveInbox(p.id, inbox); saveNotes(); draw();
      toast(res.made ? `${t('장면 사진')} ${res.made}${t('장을 만들었어요')}` : t('장면 사진을 만들지 못했어요'));
      return;
    }
    const cardEl = e.target.closest('.item'); if (!cardEl) return;
    const id = cardEl.dataset.id, isNote = cardEl.hasAttribute('data-note');
    const it = isNote ? noteOf(id) : Store.inbox(p.id).find(x => x.rid === cardEl.dataset.rid).items.find(x => x.id === id);
    if (!it) return;
    if (isNote && e.target.closest('[data-ndel]')) { noteDelete(id); return; }
    const stb = e.target.closest('[data-st]');
    if (stb) { update(cardEl.dataset.rid, id, x => x.st = stb.dataset.st); return; }
    const q = e.target.closest('[data-q]');
    if (q) { const inp = $('[data-reply] input', cardEl); inp.value = q.textContent; inp.focus(); return; }
    if (e.target.closest('[data-loop]')) { setSel(id); V && V.loopAround(it.t); draw(); return; }
    if (e.target.closest('form,input,textarea')) { if (isNote) activeNote = id; return; }
    if (e.target.closest('[data-full]')) { zoom(id); return; }
    setSel(id); if (isNote) activeNote = id;
    if (V) { V.P.pause(); V.P.seek(it.t); if (it.th) V.P.showFreeze(it.th, it.t); const st = V.P.stage.getBoundingClientRect(); if (st.bottom < 0 || st.top > innerHeight) V.P.stage.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    $$('.item', side).forEach(c => c.classList.toggle('sel', c.dataset.id === id)); V && V.render();
  });
  side.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target.closest('[data-reply]'), cardEl = form.closest('.item'), b = $('input', form).value.trim(); if (!b) return;
    if (cardEl.hasAttribute('data-note')) { noteReply(cardEl.dataset.id, b); return; }
    addReply(cardEl.dataset.rid, cardEl.dataset.id, b);
    toast(t('댓글을 달았어요. 다 달았으면 "회신 보내기"로 돌려보내 주세요'));
  });
  function bindMenu(root) {
    const mr = $('[data-menu-root]', root); if (!mr) return;
    const menu = $('.menu', mr);
    $('[data-act=fb-more]', mr).addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    $('[data-act=feedback]', mr).addEventListener('click', () => feedback('msg'));
    $$('[data-fb]', mr).forEach(b => b.addEventListener('click', () => { menu.hidden = true; feedback(b.dataset.fb); }));
  }
  document.addEventListener('click', e => { const mr = $('[data-menu-root]', side); if (mr && !mr.contains(e.target)) $('.menu', mr).hidden = true; });
  async function feedback(kind) {
    const reqs = Store.inbox(p.id); if (!reqs.length && !(p.notes || []).length) return;
    const link = await clientLink(p, reqs.length ? reqs : null);
    const name = safeName(`${p.title || t('프로젝트')}_${reqs.length ? t('수정요청_회신') : t('디렉터_안내')}_${new Date().toISOString().slice(0, 10)}`);
    if (kind === 'msg') { const r = await shareOrCopy({ title: p.title + (reqs.length ? t(' 회신') : t(' 안내')), text: feedbackMessage(p, reqs, link) }); toast(r === 'copied' ? t('안내·회신 글과 확인 링크를 복사했어요. 카톡에 붙여 넣어 주세요') : r === 'shared' ? t('공유했어요') : t('복사하지 못했어요'), 3600); }
    else if (kind === 'html') { await shareFile(name + '.html', reportHTML({ p, reqs, role: 'director', link })); toast(t('HTML을 내려받았어요')); }
    else printHTML(reportHTML({ p, reqs, role: 'director' }));
  }
  Store.onChange(k => {
    if (k === 'sd:inbox:' + p.id) { draw(); toast(t('수정요청이 새로 들어왔어요')); }
    else if (k === 'sd:projects') { const fresh = Store.getProject(p.id); if (fresh) { const before = JSON.stringify((p.notes || []).map(n => n.rp)); p.notes = fresh.notes || []; draw(); if (JSON.stringify(p.notes.map(n => n.rp)) !== before) toast(t('클라이언트가 안내에 답글을 달았어요')); } }
  });
  draw();
}

export { importDialog };

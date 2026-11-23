/* 클라이언트 화면 — 핀 번호로 들어와 핀·펜으로 수정요청을 남기고 디렉터에게 보낸다 */
import { $, $$, ic, esc, uid, tc, sha, unpack, modal, toast, dueLabel, fmtDate, copyText, shareOrCopy, safeName, fpsLabel, brandHTML, themeBtnHTML, listViewHTML, toggleListView, logoStacked, pronHTML, WSNS_HOME, saidHTML } from './util.js';
import { Store, MODE, replyKey, mergeReplies } from './store.js';
import { openMenu } from './ctxmenu.js';
import { mountViewer, snapHTML, posterOf } from './viewer.js';
import { openZoom } from './zoom.js';
import { workspaceSplitters } from './layout.js';
import { replyLink, requestMessage, reportHTML, printHTML, shareFile, STATUS } from './exports.js';
import { showClientTour, maybeShowClientTour } from './tour.js';
import { msg, replies, dayLine, composer, glide, editText, confirmDelete } from './chat.js';
import { renderDelivery } from './deliver.js';
import { t, tn, lang, fmtDateL, fmtMD, langBtnHTML, fmtTime } from './i18n.js';
import { versOf, itemVer, verName, viewedVer, setViewed, verbarHTML, verLine, withVerLines } from './versions.js';

let jumpTo = null; // 다른 차수 카드를 눌러 차수를 바꾼 뒤 그 장면으로

export async function renderClient(app, params) {
  let p;
  try { p = await unpack(params.c); if (!p || !p.id) throw 0; }
  catch { app.innerHTML = errorScreen(t('링크가 올바르지 않아요'), t('받은 링크 전체가 복사되었는지 확인해 주세요. 메신저에서 링크 끝이 잘리면 열리지 않을 수 있어요.')); return; }
  document.title = (p.t || t('수정요청')) + t(' · 쎈스 디렉터');

  const okKey = 'sd:ok:' + p.id;
  if (p.ph && sessionStorage.getItem(okKey) !== p.ph) {
    const passed = await pinGate(app, p);
    if (!passed) return;
    sessionStorage.setItem(okKey, p.ph);
  }

  if (params.v === 'dl' && p.dl) return renderDelivery(app, p);
  const state = Store.client(p.id);
  // 디렉터 회신 링크(&f=)로 들어왔으면 상태·댓글을 합친다
  if (params.f) { try { mergeFeedback(state, await unpack(params.f)); Store.saveClient(p.id, state); toast(t('디렉터 회신을 불러왔어요')); } catch {} }
  syncFromInbox(state, p.id);

  app.innerHTML = `
  <header class="topbar">
    ${brandHTML('span', t('aria-label="쎈스 디렉터"'))}
    <div class="ptitle"><div class="eyebrow">${t('수정요청')}${p.by ? ' · ' + esc(p.by) : ''}</div><h1>${esc(p.t || t('제목 없는 프로젝트'))}</h1></div><div class="ver-slot" data-verslot></div>
    ${p.d ? `<span class="chip due" title="${t('피드백 마감')}">${ic('clock', 13)}${esc(dueLabel(p.d))}</span>` : ''}
    <div class="grow"></div>
    ${p.n ? `<button class="btn ghost" data-act="notice" aria-label="${t('안내사항')}">${ic('note')}<span class="bl">${t('안내사항')}</span></button>` : ''}
    ${langBtnHTML()}${themeBtnHTML()}
    <button class="btn ghost icon" data-act="help" aria-label="${t('사용법')}" title="${t('사용법·단축키 (?)')}">${ic('help', 17)}</button>
    <div class="split" data-menu-root>
      <button class="btn brand" data-act="send">${ic('send')}${t('수정요청 보내기')}<span class="count" data-count></span></button>
      <button class="btn brand caret" data-act="more" aria-label="${t('다른 방법으로 보내기')}" aria-haspopup="menu">${ic('down', 14)}</button>
      <div class="menu" role="menu" hidden>
        <div class="menu-label">${t('전송이 안 될 때')}</div>
        <button role="menuitem" data-send="msg">${ic('msg')}<span><b>${t('메시지로 보내기')}</b><small>${t('카톡·문자에 붙여 넣는 글 + 가져오기 링크')}</small></span></button>
        <button role="menuitem" data-send="html">${ic('file')}<span><b>${t('HTML 보내기')}</b><small>${t('장면 사진까지 담긴 파일 하나')}</small></span></button>
        <button role="menuitem" data-send="pdf">${ic('print')}<span><b>${t('PDF 보내기')}</b><small>${t('인쇄 창에서 \'PDF로 저장\'')}</small></span></button>
      </div>
    </div>
  </header>
  <main class="workspace">
    <section class="left" data-viewer></section>
    <div class="splitter row" aria-label="${t('영상 높이 조정')}"></div><div class="splitter col" aria-label="${t('수정내역 칸 너비 조정')}"></div>
    <aside class="side">
      <div class="side-tabs" role="tablist">
        <button role="tab" data-tab="notes" hidden>${t('디렉터 안내')} <b class="d" data-n="notes">0</b></button>
        <button role="tab" class="on" data-tab="draft">${t('작성 중')} <b data-n="draft">0</b></button>
        <button role="tab" data-tab="sent">${t('보낸 요청')} <b data-n="sent">0</b></button>
      </div>
      ${listViewHTML()}
      <div class="thumb-progress" data-tp hidden><i></i><span></span></div>
      <div class="list" data-list></div>
    </aside>
  </main>`;

  workspaceSplitters(app, 'client');
  let tab = 'draft', selected = null, activeId = null;
  // 수정본: 같은 브라우저면 디렉터 콘솔의 최신 목록, 아니면 링크에 담겨 온 목록
  const vers = (() => { const sp = Store.getProject(p.id); return versOf(sp && sp.src ? sp : p); })();
  const vw = viewedVer(p.id, vers), lastN = vers.length ? vers[vers.length - 1].n : 1, curN = vw ? vw.n : 1;
  const src = vw ? vw.src : p.src;
  const here = it => itemVer(it) === curN;
  const goVer = it => { jumpTo = { id: it.id, t: it.t, th: it.th }; setViewed(p.id, itemVer(it), lastN); renderClient(app, params); };
  const verTag = it => vers.length > 1 ? `<span class="vtag${here(it) ? ' on' : ''}" title="${esc(t('{v} 영상에 남긴 표시', { v: verName(itemVer(it)) }))}">${esc(verName(itemVer(it)))}</span>` : '';
  const allItems = () => [...state.sent.flatMap(r => r.items.map(it => ({ ...it, _sent: r.rid }))), ...state.draft].sort((a, b) => a.t - b.t);
  const numOf = id => allItems().findIndex(it => it.id === id) + 1;
  /* 디렉터 안내: 같은 브라우저면 디렉터 콘솔 저장본, 아니면 링크에 담겨 온 것 */
  state.nr = state.nr || {};
  const sameBrowser = () => !!Store.getProject(p.id);
  const notes = () => {
    const sp = Store.getProject(p.id), base = (sp && sp.notes) || p.dn || [];
    return base.map(n => {
      return { ...n, by: 'd', rp: mergeReplies(n.rp, state.nr[n.id]) };
    }).sort((a, b) => a.t - b.t);
  };
  const labelOf = it => it.by === 'd' ? 'D' + (notes().findIndex(n => n.id === it.id) + 1) : String(numOf(it.id)).padStart(2, '0');
  const pendingNr = () => Object.entries(state.nr).map(([id, rp]) => ({ id, rp: rp.filter(x => x.pending).map(({ pending, ...x }) => x) })).filter(x => x.rp.length);
  if (notes().length && !state.draft.length && !state.sent.length) tab = 'notes';
  const save = () => Store.saveClient(p.id, state);

  const viewerEl = $('[data-viewer]', app);
  $('[data-verslot]', app).innerHTML = verbarHTML(vers, curN);
  const jump = jumpTo; jumpTo = null;
  const V = mountViewer(viewerEl, src, {
    tools: true,
    items: () => [...allItems(), ...notes()].filter(here),
    label: it => labelOf(it),
    selected: () => selected,
    onPin: ({ x, y }) => addItem({ x, y }),
    onStroke: pts => addStroke(pts),
    onMemo: () => addItem({}),
    onMeta: () => renderList(),
    onReady: () => {
      V.renderMarks();
      if (jump) { selected = jump.id; P.pause(); P.seek(jump.t); if (jump.th) P.showFreeze(jump.th, jump.t); renderList(); const c = $(`[data-list] [data-id="${jump.id}"]`, app); c && c.scrollIntoView({ block: 'nearest' }); }
    },
  });
  const P = V.P;
  const ar = vw ? vw.ar : p.ar, fps = vw ? vw.fps : p.fps;
  if (ar) P.setMeta({ ar });
  if (fps) P.setMeta({ fps, how: (vw ? vw.fpsHow : p.fh) || 'measured' });
  $('[data-verslot]', app).querySelector('.verbar')?.addEventListener('click', e => { const b = e.target.closest('[data-ver]'); if (b) { setViewed(p.id, +b.dataset.ver, lastN); renderClient(app, params); } });

  async function addItem({ x = null, y = null, s = [] }) {
    if (!P.ready()) return;
    P.pause();
    const snap = await P.snapshot(); // 영상 주소·파일은 바로 찍히고, 유튜브·비메오는 보낼 때 한 번에 찍는다
    const it = { id: uid(6), t: snap.t, x, y, s, tx: '', th: snap.img, st: 'open', rp: [], at: Date.now(), ...(snap.ar ? { ar: snap.ar } : {}), ...(curN > 1 ? { v: curN } : {}) };
    state.draft.push(it); state.draft.sort((a, b) => a.t - b.t);
    activeId = it.id; selected = it.id; tab = 'draft';
    save(); renderList(); V.render();
    const ta = $(`[data-id="${it.id}"] textarea`, app); if (ta) { ta.focus(); ta.closest('.item').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
  function addStroke(pts) {
    const a = state.draft.find(it => it.id === activeId);
    if (a && P.same(a.t) && P.paused()) { a.s = [...(a.s || []), pts]; save(); renderList(); V.render(); return; }
    addItem({ s: [pts] });
  }

  // 내 수정요청: 내 말(오른쪽 말풍선, 장면 사진 + 내용) → 디렉터 답(왼쪽) → 입력창
  function itemCard(it) {
    const n = numOf(it.id), sent = !!it._sent, st = it.st || 'open';
    const kind = it.x != null ? (it.s && it.s.length ? t('핀 + 그림') : t('핀')) : it.s && it.s.length ? t('그림') : t('메모');
    const body = `<div class="item-head">
        <span class="no">${String(n).padStart(2, '0')}</span>
        <button class="tcbtn" data-seek title="${t('이 시점으로 이동')}">${tc(it.t, P.effFps())}</button>
        ${verTag(it)}<span class="kind">${kind}</span><button class="icon-x tonly" data-zoom aria-label="${t('크게 보기')}" title="${t('장면과 함께 크게 보기')}">${ic('expand', 14)}</button>
        ${sent ? `<span class="tag st-${st}">${STATUS[st]}</span>` : `<button class="icon-x" data-del aria-label="${t('삭제')}" title="${t('삭제')}">${ic('trash', 15)}</button>`}
      </div>
      <div data-zoom role="button" tabindex="0" aria-label="${n}${t('번 크게 보기')}">${snapHTML(it, n, P.ar, posterOf(p.src, P.poster || p.pv), sent ? t('장면 사진 없음') : t('장면 사진은 보낼 때 자동으로 붙어요'))}</div>
      ${sent ? (it.tx ? `<p class="tx">${esc(it.tx)}</p>` : `<p class="tx dim">${t('(내용 없음)')}</p>`) : `<textarea rows="2" placeholder="${t('어떻게 고치면 좋을지 적어 주세요')}" data-tx>${esc(it.tx)}</textarea>`}`;
    return `<article class="item chat${it.id === selected ? ' sel' : ''}${sent ? ' sent' : ''}" data-id="${it.id}">
      ${msg({ me: true, side: 'c', name: t('나'), body, at: sent ? (it._at || it.at) : it.at, cls: 'req', meta: sent ? (it.ed ? `<em class="edited">${t('수정됨')}</em>` : '') : `<em>${t('보내기 전')}</em>` })}
      ${thread(it, sent)}
    </article>`;
  }
  function thread(it, sent) {
    const rp = it.rp || [];
    if (!sent) return '';
    return `<div class="thread">${replies(rp, 'c', { c: t('나'), d: p.by || t('디렉터') })}
      ${rp.some(r => r.by === 'd') ? composer(t('디렉터에게 답글'), t('답글 보내기')) : t('<div class="waiting">디렉터 확인을 기다리는 중</div>')}
    </div>`;
  }
  // 디렉터 안내: 디렉터 말(왼쪽) → 내 답글(오른쪽) → 입력창
  function noteCard(it) {
    const n = labelOf(it), kind = it.x != null ? (it.s && it.s.length ? t('핀 + 그림') : t('핀')) : it.s && it.s.length ? t('그림') : t('메모');
    const body = `<div class="item-head"><span class="no d">${n}</span><button class="tcbtn" data-seek title="${t('이 시점으로 이동')}">${tc(it.t, P.effFps())}</button>${verTag(it)}<span class="kind">${kind}</span><button class="icon-x tonly" data-zoom aria-label="${t('크게 보기')}" title="${t('장면과 함께 크게 보기')}">${ic('expand', 14)}</button></div>
      <div data-zoom role="button" tabindex="0" aria-label="${n} ${t('크게 보기')}">${snapHTML(it, n, P.ar, posterOf(p.src, P.poster || p.pv))}</div>
      ${it.tx ? `<p class="tx">${esc(it.tx)}</p>` : `<p class="tx dim">${t('(내용 없음)')}</p>`}`;
    return `<article class="item chat note${it.id === selected ? ' sel' : ''}" data-id="${it.id}" data-note>
      ${msg({ me: false, side: 'd', name: p.by || t('디렉터'), body, at: it.at, cls: 'req' })}
      ${noteThread(it)}
    </article>`;
  }
  function noteThread(it) {
    return `<div class="thread">${replies(it.rp, 'c', { c: t('나'), d: p.by || t('디렉터') }, t('보내기 전'))}
      ${composer(t('디렉터에게 답글'), t('답글 보내기'))}</div>`;
  }
  async function noteReply(id, b) {
    const rp = { by: 'c', n: state.from || '', b, at: Date.now() };
    const sp = Store.getProject(p.id);
    if (sp && (sp.notes || []).some(n => n.id === id)) { // 같은 브라우저: 디렉터 콘솔에 바로
      const n = sp.notes.find(x => x.id === id); n.rp = [...(n.rp || []), rp]; Store.saveProject(sp);
      toast(t('디렉터에게 답글을 남겼어요'));
    } else { // 다른 기기: 다음에 보낼 때 함께
      state.nr[id] = [...(state.nr[id] || []), { ...rp, pending: true }]; save();
      toast(t('답글은 "수정요청 보내기"를 누를 때 함께 전달돼요'), 3600);
    }
    renderList();
  }
  function renderList() {
    const items = allItems(), ns = notes();
    const nt = $('[data-tab=notes]', app); nt.hidden = !ns.length; $('[data-n=notes]', app).textContent = ns.length;
    $('.side-tabs', app).classList.toggle('three', ns.length > 0);
    if (!ns.length && tab === 'notes') tab = 'draft';
    $('[data-n=draft]', app).textContent = state.draft.length;
    $('[data-n=sent]', app).textContent = state.sent.reduce((a, r) => a + r.items.length, 0);
    $('[data-count]', app).textContent = state.draft.length ? ' ' + state.draft.length : pendingNr().length ? t(' 답글') : '';
    $$('[data-tab]', app).forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const list = $('[data-list]', app);
    if (tab === 'notes') {
      list.innerHTML = `<p class="note-hint">${ic('pin', 14)}<span>${t('디렉터가 영상에 남긴 안내예요. 파란 표시가 그 위치예요. 궁금한 점은 답글로 남겨 주세요.')}</span></p>` + (vers.length > 1 ? vers.map(v => (v.n > 1 ? verLine(v) : '') + ns.filter(it => itemVer(it) === v.n).map(noteCard).join('')).join('') : ns.map(noteCard).join(''));
    } else if (tab === 'draft') {
      const draft = items.filter(it => !it._sent);
      list.innerHTML = draft.length ? draft.map(itemCard).join('') : `<div class="empty">
        <b>${t('고칠 곳을 화면에서 눌러 주세요')}</b>
        <span>${ic('pin', 14)} ${t('핀: 누른 자리에 표시 ·')} ${ic('pen', 14)} ${t('펜: 그려서 표시')}</span>
        <span>${t('장면과 시간 주소(시:분:초:프레임)가 여기에 붙고, 바로 내용을 적을 수 있어요.')}</span>
        <span class="keys">${t('Space 재생 · ← → 또는 , . 한 프레임 · Shift ← → 1초 · P 핀 · D 펜 · H 손 · M 메모')}</span></div>`;
    } else {
      list.innerHTML = state.sent.length ? withVerLines(state.sent.map(r => ({ at: r.at, html: `<div class="group">${dayLine(r.at, `${fmtTime(r.at)} · ${r.items.length}${t('건 보냄')}${r.from ? ' · ' + esc(r.from) : ''}`)}${r.items.map(it => itemCard({ ...it, _sent: r.rid, _at: r.at })).join('')}</div>` })), vers)
        : t('<div class="empty"><b>아직 보낸 요청이 없어요</b><span>작성을 마치면 오른쪽 위 "수정요청 보내기"를 눌러 주세요.</span></div>');
    }
    V.render();
  }

  // 목록 상호작용
  const list = $('[data-list]', app);
  list.addEventListener('click', e => {
    const card = e.target.closest('.item'); if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest('[data-del]')) {
      const i = state.draft.findIndex(it => it.id === id); const [gone] = state.draft.splice(i, 1); save(); renderList();
      toast(`${t('삭제했어요')} <button class="link" data-undo>${t('되돌리기')}</button>`, 4000);
      const u = $('#toast [data-undo]'); u && u.addEventListener('click', () => { state.draft.push(gone); state.draft.sort((a, b) => a.t - b.t); save(); renderList(); });
      return;
    }
    if (e.target.closest('textarea,input,form')) return;
    if (e.target.closest('[data-zoom]')) { zoom(id); return; }
    const it = allItems().find(x => x.id === id) || notes().find(x => x.id === id); if (!it) return;
    if (!here(it)) { goVer(it); return; }
    selected = id; activeId = it._sent || it.by === 'd' ? null : id;
    P.pause(); P.seek(it.t);
    if (it.th) P.showFreeze(it.th, it.t);
    $$('.item', list).forEach(c => c.classList.toggle('sel', c.dataset.id === id));
    V.render();
  });
  // 말풍선 우클릭 — 내 요청·답글은 고치기·지우기, 디렉터 말은 복사
  const sentReqOf = id => state.sent.find(r => r.items.some(it => it.id === id));
  const changeNoteReply = (nid, rk, f) => {
    const sp = Store.getProject(p.id), n = sp && (sp.notes || []).find(x => x.id === nid);
    let hit = false;
    if (n) { const r = (n.rp || []).find(x => replyKey(x) === rk); if (r) { f(r); Store.saveProject(sp); hit = true; } }
    const mine = (state.nr[nid] || []).find(x => replyKey(x) === rk);
    if (mine) { f(mine); if (!n) mine.pending = true; save(); hit = true; }
    else if (!n) { const base = (p.dn || []).find(x => x.id === nid), r = base && (base.rp || []).find(x => replyKey(x) === rk); if (r) { const c = { ...r }; f(c); state.nr[nid] = [...(state.nr[nid] || []), { ...c, pending: true }]; save(); hit = true; } }
    return hit;
  };
  list.addEventListener('contextmenu', e => {
    const m = e.target.closest('.msg'), card = e.target.closest('.item');
    if (!m || !card || e.target.closest('textarea, input')) return;
    e.preventDefault();
    const id = card.dataset.id, isNote = card.hasAttribute('data-note');
    const copy = txt => ({ label: t('복사'), icon: 'dup', act: async () => toast(await copyText(txt) ? t('복사했어요') : t('복사하지 못했어요')) });
    let items = [];
    if (m.dataset.rk) {
      const rk = m.dataset.rk, all = isNote ? (notes().find(n => n.id === id) || {}).rp || [] : (allItems().find(x => x.id === id) || {}).rp || [];
      const r = all.find(x => replyKey(x) === rk); if (!r || r.del) return;
      items = [copy(r.b)];
      if (r.by === 'c') {
        const apply = async f => {
          if (isNote) changeNoteReply(id, rk, f);
          else { const req = sentReqOf(id), it = req && req.items.find(x => x.id === id), x = it && (it.rp || []).find(y => replyKey(y) === rk); if (!x) return; f(x); save(); await Store.submit(p.id, req); }
          renderList();
        };
        items.push('-',
          { label: t('답글 고치기'), icon: 'rename', act: async () => { const nb = await editText(t('답글 고치기'), r.b); if (nb && nb !== r.b) { await apply(x => { x.b = nb; x.ed = Date.now(); }); toast(t('고쳤어요')); } } },
          { label: t('답글 삭제'), icon: 'trash', danger: true, act: async () => { if (await confirmDelete(t('답글을 삭제할까요?'), t('디렉터 화면에는 "삭제된 메시지예요"로 보여요.'))) { await apply(x => { x.del = true; x.b = ''; x.ed = Date.now(); }); toast(t('삭제했어요')); } } });
      }
    } else if (isNote) {
      const n = notes().find(x => x.id === id); items = [copy((n && n.tx) || '')];
    } else if (card.classList.contains('sent')) {
      const req = sentReqOf(id), it = req && req.items.find(x => x.id === id); if (!it) return;
      items = [copy(it.tx || ''), '-',
        { label: t('요청 내용 고치기'), icon: 'rename', act: async () => {
          const nb = await editText(t('요청 내용 고치기'), it.tx || '', t('어떻게 고치면 좋을지 적어 주세요'));
          if (nb == null || nb === (it.tx || '')) return;
          it.tx = nb; it.ed = Date.now(); save(); await Store.submit(p.id, req); renderList();
          toast(MODE === 'mock' ? t('고쳤어요. 디렉터 화면에도 바뀐 내용이 보여요') : t('고쳤어요'));
        } },
        { label: t('요청 취소(삭제)'), icon: 'trash', danger: true, act: async () => {
          if (!await confirmDelete(t('이 요청을 취소할까요?'), t('디렉터의 수신함에서도 지워지고, 이 요청에 달린 댓글도 함께 사라져요.'))) return;
          req.items = req.items.filter(x => x.id !== id); save();
          await Store.submit(p.id, { ...req, items: [{ id, del: true }] });
          if (selected === id) selected = null; renderList(); toast(t('요청을 취소했어요'));
        } }];
    } else {
      const it = state.draft.find(x => x.id === id);
      items = [copy((it && it.tx) || ''), '-', { label: t('삭제'), icon: 'trash', danger: true, act: () => { const b = $('[data-del]', card); b && b.click(); } }];
    }
    openMenu(e.clientX, e.clientY, items, { opener: card });
  });
  list.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-zoom]')) { e.preventDefault(); zoom(e.target.closest('.item').dataset.id); } });

  /* ---------- 크게 보기 ---------- */
  const visible = () => tab === 'notes' ? notes() : tab === 'draft' ? state.draft.slice().sort((a, b) => a.t - b.t) : state.sent.slice().reverse().flatMap(r => r.items.map(it => ({ ...it, _sent: r.rid })));
  function zoom(id) {
    const vis = visible(), index = vis.findIndex(it => it.id === id); if (index < 0) return;
    selected = id; renderList();
    openZoom({
      items: visible, index, ar: P.ar, poster: posterOf(p.src, P.poster || p.pv), fps: () => P.effFps(), numOf: it => labelOf(it),
      emptyText: it => it._sent ? t('장면 사진 없음') : t('장면 사진은 보낼 때 자동으로 붙어요'),
      from: it => $(`.list [data-id="${it.id}"] .snap`, app),
      detail: it => {
        if (it.by === 'd') return `<div class="zfrom d">${t('디렉터 안내')}</div>${saidHTML(p.by || t('디렉터'), it.tx || t('(내용 없음)'), 'd ztx')}
          <div class="zacts"><button class="btn" data-zact="play">${ic('play', 14)}${t('이 장면 재생')}</button></div>${noteThread(it)}`;
        const sent = !!it._sent, st = it.st || 'open';
        return `${sent ? `<div class="zrow"><span class="tag st-${st}">${STATUS[st]}</span></div>${saidHTML(t('나'), it.tx || t('(내용 없음)'), 'c ztx')}`
          : `<label class="field"><span>${t('수정할 내용')}</span><textarea class="ztx-in" data-ztx rows="5" placeholder="${t('어떻게 고치면 좋을지 적어 주세요')}">${esc(it.tx)}</textarea></label>`}
          <div class="zacts"><button class="btn" data-zact="play">${ic('play', 14)}${t('이 장면 재생')}</button>${sent ? '' : `<button class="btn ghost danger" data-zact="del">${ic('trash', 14)}${t('삭제')}</button>`}</div>
          ${sent ? thread(it, true) : ''}`;
      },
      wire: (el, it, api) => {
        const ta = $('[data-ztx]', el);
        if (ta) { ta.addEventListener('input', () => { const d = state.draft.find(x => x.id === it.id); if (d) { d.tx = ta.value; save(); renderList(); } }); if (!it.tx) setTimeout(() => ta.focus(), 260); }
        el.addEventListener('click', ev => {
          const b = ev.target.closest('[data-zact]'); if (!b) return;
          if (b.dataset.zact === 'play') { api.close(); P.seek(Math.max(0, it.t - 1.5)); P.play(); }
          if (b.dataset.zact === 'del') { const k = state.draft.findIndex(x => x.id === it.id); if (k >= 0) state.draft.splice(k, 1); save(); renderList(); if (!visible().length) api.close(); else api.refresh(); }
        });
        const f = $('[data-reply]', el);
        f && f.addEventListener('submit', async ev => { ev.preventDefault(); const b = $('input', f).value.trim(); if (!b) return; if (it.by === 'd') await noteReply(it.id, b); else await replyTo(it.id, b); api.refresh(); });
      },
      onClose: it => { if (it && !here(it)) { goVer(it); return; } if (it) { selected = it.id; P.pause(); P.seek(it.t); if (it.th) P.showFreeze(it.th, it.t); renderList(); } },
    });
  }
  async function replyTo(id, b) {
    const req = state.sent.find(r => r.items.some(it => it.id === id)); const it = req.items.find(x => x.id === id);
    it.rp = [...(it.rp || []), { by: 'c', n: state.from || '', b, at: Date.now() }];
    save(); await Store.submit(p.id, req); renderList(); toast(t('답글을 남겼어요'));
  }

  let txT;
  list.addEventListener('input', e => {
    const ta = e.target.closest('[data-tx]'); if (!ta) return;
    const it = state.draft.find(x => x.id === ta.closest('.item').dataset.id); if (!it) return;
    it.tx = ta.value; autoGrow(ta); clearTimeout(txT); txT = setTimeout(save, 300);
  });
  list.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.closest('[data-reply]'); const input = $('input', f); const b = input.value.trim(); if (!b) return;
    const card = f.closest('.item');
    await glide(list, card.dataset.id, () => card.hasAttribute('data-note') ? noteReply(card.dataset.id, b) : replyTo(card.dataset.id, b));
  });
  $$('[data-tab]', app).forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; renderList(); }));
  const autoGrow = ta => { ta.style.height = 'auto'; ta.style.height = Math.min(220, ta.scrollHeight + 2) + 'px'; };

  // 보내기
  const menuRoot = $('[data-menu-root]', app), menu = $('.menu', menuRoot);
  $('[data-act=more]', app).addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', e => { if (!menuRoot.contains(e.target)) menu.hidden = true; });
  $('[data-act=send]', app).addEventListener('click', send);
  $$('[data-send]', app).forEach(b => b.addEventListener('click', () => { menu.hidden = true; fallback(b.dataset.send); }));
  $('[data-act=help]', app).addEventListener('click', () => showClientTour(P.doc));
  const nb = $('[data-act=notice]', app); nb && nb.addEventListener('click', showNotice);

  function currentRequest() {
    const nr = pendingNr();
    if (state.draft.length || nr.length) return { rid: 'draft', from: state.from || '', at: Date.now(), items: state.draft, nr };
    const items = state.sent.flatMap(r => r.items);
    return items.length ? { rid: state.sent[state.sent.length - 1].rid, from: state.from || '', at: Date.now(), items } : null;
  }
  async function askName() {
    return modal({
      title: t('수정요청 보내기'),
      body: `<label class="field"><span>${t('보내는 사람')}</span><input data-name value="${esc(state.from || '')}" placeholder="${t('이름 또는 회사')}" autofocus maxlength="40"></label>
        <div class="send-sum">${state.draft.length}${t('건')}${pendingNr().length ? ` ${t('· 디렉터 안내 답글')} ${pendingNr().reduce((a, x) => a + x.rp.length, 0)}${t('개')}` : ''}${state.draft.filter(it => !it.tx.trim()).length ? ` · <em>${t('내용이 빈 항목')} ${state.draft.filter(it => !it.tx.trim()).length}${t('건')}</em>` : ''}</div>`,
      actions: [{ label: t('취소'), value: null }, { label: `${ic('send')}${t('보내기')}`, kind: 'primary', onClick: w => { state.from = $('[data-name]', w).value.trim(); }, value: 'go' }],
      onOpen: w => { const i = $('[data-name]', w); i.addEventListener('keydown', e => { if (e.key === 'Enter') $('.foot .primary', w).click(); }); },
    });
  }
  /** 보내기 직전: 장면 사진이 없는 항목을 한 번에 찍는다 */
  async function ensureThumbs(items) {
    const need = items.filter(it => !it.th && here(it));
    if (!need.length) return { made: 0, skipped: 0 };
    if (V.needsShare()) {
      if (!V.canShare()) return { made: 0, skipped: need.length, reason: 'unsupported' };
      const r = await modal({
        title: t('장면 사진을 붙여서 보낼까요?'),
        body: `<p class="note">${t('작업할 때는 화면 공유 없이 가볍게 쓰고, 보낼 때')} <b>${t('한 번만')}</b> ${t('이 탭 화면을 공유해')} ${need.length}${t('개 장면을 자동으로 찍어요. 몇 초면 끝나고 공유는 바로 꺼져요.')}</p>
          <p class="note dim">${t('공유 창에서')} <b>${t('이 탭')}</b>${t('을 고르고 \'공유\'를 눌러 주세요. 화면은 기기 밖으로 나가지 않아요. 사진이 없어도 시간 주소와 핀·그림으로 디렉터가 같은 장면을 볼 수 있어요.')}</p>`,
        actions: [{ label: t('사진 없이 보내기'), value: 'skip' }, { label: `${ic('cam')}${t('사진 만들고 보내기')}`, kind: 'primary', value: 'go' }],
      });
      if (r === null) return null;
      if (r === 'skip') return { made: 0, skipped: need.length };
    }
    const tp = $('[data-tp]', app), sendBtn = $('[data-act=send]', app), label = sendBtn.innerHTML;
    document.getElementById('toast')?.classList.remove('on');
    sendBtn.disabled = true;
    const res = await V.makeThumbs(need, (i, n) => {
      tp.hidden = false; $('i', tp).style.width = (i / n * 100) + '%'; $('span', tp).textContent = `${t('장면 사진 만드는 중')} ${i}/${n}`;
      sendBtn.innerHTML = `${ic('cam')}${t('장면 사진')} ${i}/${n}`;
    });
    tp.hidden = true; sendBtn.disabled = false; sendBtn.innerHTML = label;
    save(); renderList();
    if (res.reason === 'denied') toast(t('화면 공유를 취소해서 사진 없이 보내요'));
    return { made: res.made, skipped: need.length - res.made, reason: res.reason };
  }
  async function send() {
    const nr = pendingNr();
    if (!state.draft.length && !nr.length) { toast(state.sent.length ? t('새로 작성한 수정 포인트가 없어요') : t('먼저 화면에 핀을 찍거나 그려 주세요')); return; }
    if (await askName() !== 'go') return;
    const th = await ensureThumbs(state.draft);
    if (th === null) return;
    const req = { rid: uid(8), from: state.from || '', at: Date.now(), items: state.draft.map(it => ({ ...it })), nr: nr.length ? nr : undefined };
    let delivered = false;
    try { await Store.submit(p.id, req); delivered = true; } catch {}
    if (req.items.length) state.sent.push(req);
    for (const k in state.nr) state.nr[k] = state.nr[k].map(({ pending, ...x }) => x);
    state.draft = []; save(); tab = req.items.length ? 'sent' : 'notes'; activeId = null; renderList();
    const link = await replyLink(p, req);
    const r = await modal({
      title: delivered ? t('수정요청을 보냈어요') : t('전송하지 못했어요'),
      body: `<div class="sent-ok">${ic(delivered ? 'check' : 'close', 28)}<b>${req.items.length ? req.items.length + t('건') : ''}${nr.length ? `${req.items.length ? ' · ' : ''}${t('답글')} ${nr.reduce((a, x) => a + x.rp.length, 0)}${t('개')}` : ''}</b></div>
        ${th.skipped ? `<p class="note dim">${th.reason === 'unsupported' ? t('이 기기에서는 장면 사진을 만들 수 없어 ') : ''}${t('장면 사진 없이 보낸 항목')} ${th.skipped}${t('건 — 시간 주소와 핀·그림은 그대로 전달돼요.')}</p>` : ''}
        <p class="note">${MODE === 'mock' ? t('지금은 <b>서버 없는 시험 버전</b>이라 같은 브라우저의 디렉터 콘솔에만 바로 들어가요. 디렉터가 다른 기기라면 아래 방법 중 하나로 한 번 더 보내 주세요.') : t('디렉터에게 전달되었어요.')}</p>
        <div class="fallbacks">
          <button class="btn" data-fb="msg">${ic('msg')}${t('메시지로 보내기')}</button>
          <button class="btn" data-fb="html">${ic('file')}${t('HTML 보내기')}</button>
          <button class="btn" data-fb="pdf">${ic('print')}${t('PDF 보내기')}</button>
        </div>`,
      actions: [{ label: t('닫기'), kind: 'primary' }],
      onOpen: w => $$('[data-fb]', w).forEach(b => b.addEventListener('click', () => fallback(b.dataset.fb, req, link))),
    });
    void r;
  }
  async function fallback(kind, req = currentRequest(), link) {
    if (!req) { toast(t('보낼 수정 포인트가 없어요')); return; }
    if (!state.from && kind !== 'pdf') { if (await askName() !== 'go') return; req.from = state.from; save(); }
    if (kind !== 'msg' && req.rid === 'draft') { const th = await ensureThumbs(state.draft); if (th === null) return; req = currentRequest(); }
    const r = { ...req, rid: req.rid === 'draft' ? 'm' + uid(6) : req.rid, from: state.from || req.from };
    link = link || await replyLink(p, r);
    const name = safeName(`${p.t || t('수정요청')}${t('_수정요청_')}${new Date().toISOString().slice(0, 10)}`);
    if (kind === 'msg') {
      const text = requestMessage({ ...p, dn: notes() }, r, link);
      const res = await shareOrCopy({ title: (p.t || '') + t(' 수정요청'), text });
      toast(res === 'copied' ? t('메시지를 복사했어요. 카톡·문자에 붙여 넣어 주세요') : res === 'shared' ? t('공유했어요') : t('복사하지 못했어요'));
    } else if (kind === 'html') {
      const res = await shareFile(name + '.html', reportHTML({ p, reqs: [r], link }));
      toast(res === 'downloaded' ? t('HTML 파일을 내려받았어요. 디렉터에게 보내 주세요') : t('공유했어요'));
    } else if (kind === 'pdf') {
      printHTML(reportHTML({ p, reqs: [r] })); toast(t("인쇄 창에서 대상을 'PDF로 저장'으로 골라 주세요"), 4000);
    }
  }
  function showNotice() {
    return modal({
      title: p.t || t('안내사항'),
      body: `${p.by ? `<div class="eyebrow">From ${esc(p.by)}</div>` : ''}${p.n ? `<div class="notice-body">${esc(p.n)}</div>` : ''}${notes().length ? `<p class="note">${ic('pin', 13)} ${t('디렉터가 영상에 남긴 안내')} <b>${notes().length}${t('건')}</b>${t('이 있어요. 영상 위 파란 표시와')} "${t('디렉터 안내')}" ${t('탭에서 볼 수 있어요.')}</p>` : ''}${p.d ? `<div class="chip due">${ic('clock', 13)}${esc(dueLabel(p.d))}</div>` : ''}`,
      actions: [{ label: t('확인하고 시작하기'), kind: 'primary' }],
    });
  }
  function help() {
    if (P.doc) return modal({
      title: t('사용법'), wide: true,
      body: `<ol class="steps"><li><b>${t('찾기')}</b>${t('왼쪽 쪽 목록이나 아래 화살표, 키보드 ← →로 고칠 쪽을 열어요.')}</li>
      <li><b>${t('확대')}</b>${t('Ctrl + 휠, 두 손가락, 또는 아래 + 버튼으로 확대해요. 확대하면 오른쪽 아래 미니맵으로 보는 자리를 옮기고, 이동(H) 도구로 끌어서 옮겨요.')}</li>
      <li><b>${t('표시')}</b>${t('핀(P)으로 누르거나 펜(D)으로 그려요. 확대한 채로 그리면 더 세밀하게 그려져요. 쪽 번호와 사진이 오른쪽 카드에 바로 붙어요.')}</li>
      <li><b>${t('적기')}</b>${t('붙은 카드에 바로 내용을 적어요. 같은 쪽에 이어 그린 획은 같은 카드에 합쳐져요.')}</li>
      <li><b>${t('보내기')}</b>${t('오른쪽 위')} "${t('수정요청 보내기')}"${t('. 안 되면 옆 화살표에서 메시지·HTML·PDF로 보내요.')}</li></ol>
      <div class="keys-grid"><kbd>← →</kbd><span>${t('이전 / 다음 쪽')}</span><kbd>+ −</kbd><span>${t('확대 / 축소')}</span><kbd>0</kbd><span>${t('화면에 맞추기')}</span><kbd>P D H M</kbd><span>${t('핀 · 펜 · 이동 · 메모')}</span><kbd>Esc</kbd><span>${t('입력 마치기')}</span></div>`,
      actions: [{ label: t('닫기'), kind: 'primary' }],
    });
    return modal({
      title: t('사용법'), wide: true,
      body: `<ol class="steps"><li><b>${t('찾기')}</b>${t('재생하다가 고칠 장면에서 멈춰요.')} <kbd>←</kbd> <kbd>→</kbd>${t('로 한 프레임씩 맞출 수 있어요.')}</li>
      <li><b>${t('표시')}</b>${t('핀(P)으로 누르거나 펜(D)으로 그려요. 시간 주소가 오른쪽에 붙고, 장면 사진은 보낼 때 한 번에 만들어져요.')}</li>
      <li><b>${t('적기')}</b>${t('붙은 카드에 바로 내용을 적어요. 펜으로 이어 그린 획은 같은 카드에 합쳐져요.')}</li>
      <li><b>${t('조작')}</b>${t('손(H) 도구를 고르면 유튜브·비메오 플레이어를 직접 눌러 화질·자막·볼륨을 바꿀 수 있어요. 핀·펜으로 돌아오면 깨끗한 화면이 돼요.')}</li>
      <li><b>${t('보내기')}</b>${t('오른쪽 위')} "${t('수정요청 보내기')}"${t('. 안 되면 옆 화살표에서 메시지·HTML·PDF로 보내요.')}</li>
      <li><b>${t('회신')}</b>${t('디렉터가 단 댓글과 반영 상태는')} "${t('보낸 요청')}"${t('에서 볼 수 있어요.')}</li></ol>
      <div class="keys-grid"><kbd>Space</kbd><span>${t('재생/정지')}</span><kbd>← → , .</kbd><span>${t('1프레임')}</span><kbd>Shift ← →</kbd><span>${t('1초')}</span><kbd>J L</kbd><span>${t('5초')}</span><kbd>P D H M</kbd><span>${t('핀 · 펜 · 손 · 메모만')}</span><kbd>Esc</kbd><span>${t('입력 끝내기')}</span></div>
      <p class="note dim">${t('시간 주소는 시:분:초:프레임이에요. 프레임 수(')}${esc(P.fps ? fpsLabel(P.fps) : t('재생하면 자동 측정'))}${t(')는 영상에 맞춰 자동으로 정해져요.')}</p>`,
      actions: [{ label: t('닫기'), kind: 'primary' }],
    });
  }

  // 키보드
  document.onkeydown = e => {
    if (document.querySelector('.modal.open')) return;
    if (e.target.closest && e.target.closest('textarea,input,select')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === '?') { showClientTour(P.doc); return; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'v' || e.key === 'V')) { toggleListView(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    V.key(e);
  };
  // 같은 브라우저 디렉터 콘솔의 회신을 실시간 반영
  Store.onChange(k => {
    if (k === 'sd:inbox:' + p.id) { syncFromInbox(state, p.id); save(); renderList(); }
    else if (k === 'sd:projects' && versOf(Store.getProject(p.id) || p).length !== vers.length) { const nv = versOf(Store.getProject(p.id)); setViewed(p.id, 0); toast(t('{n}차 수정본이 올라왔어요', { n: nv[nv.length - 1].n }), 3600); renderClient(app, params); }
    else if (k === 'sd:projects') { const before = $('[data-n=notes]', app).textContent; renderList(); if (notes().length > +before) toast(t('디렉터가 새 안내를 남겼어요')); }
  });

  renderList();
  const seenKey = 'sd:seenv:' + p.id, seenV = +(localStorage.getItem(seenKey) || 0);
  if (vers.length > 1 && seenV && seenV < lastN) toast(t('{n}차 수정본이 올라왔어요. 위 단추로 이전 수정본도 볼 수 있어요', { n: lastN }), 4200);
  try { localStorage.setItem(seenKey, lastN); } catch {}
  // 처음 열면: 안내사항 → 사용 안내(애니메이션) 순서로
  const firstNotice = (p.n || notes().length) && !sessionStorage.getItem('sd:seen:' + p.id);
  if (firstNotice) sessionStorage.setItem('sd:seen:' + p.id, '1');
  (firstNotice ? showNotice() : Promise.resolve()).then(() => setTimeout(() => maybeShowClientTour(p.id, P.doc), 250));
}

function syncFromInbox(state, pid) {
  const inbox = Store.inbox(pid);
  for (const r of state.sent) {
    const ir = inbox.find(x => x.rid === r.rid); if (!ir) continue;
    for (const it of r.items) { const o = ir.items.find(x => x.id === it.id); if (o) { it.st = o.st; it.rp = o.rp || []; } }
  }
}
function mergeFeedback(state, reqs) {
  for (const fr of reqs || []) {
    let r = state.sent.find(x => x.rid === fr.rid);
    if (!r) { state.sent.push({ ...fr, items: fr.items.map(it => ({ ...it, rp: it.rp || [] })) }); continue; }
    for (const fi of fr.items) { const it = r.items.find(x => x.id === fi.id); if (it) { it.st = fi.st; it.rp = fi.rp || []; } else r.items.push(fi); }
  }
}

function errorScreen(title, msg) {
  return `<div class="gate"><a class="gate-logo" href="${WSNS_HOME()}" target="_blank" rel="noopener" title="${t('WSNS studio 홈페이지')}">${logoStacked()}</a><div class="gate-pron">${t('쎈스 디렉터')} · ${pronHTML()}</div><h2>${esc(title)}</h2><p>${esc(msg)}</p></div>`;
}

/** 핀 번호 4자리 */
function pinGate(app, p) {
  return new Promise(resolve => {
    app.innerHTML = `<div class="gate">
      <a class="gate-logo" href="${WSNS_HOME()}" target="_blank" rel="noopener" title="${t('WSNS studio 홈페이지')}">${logoStacked()}</a><div class="gate-pron">${t('쎈스 디렉터')} · ${pronHTML()}</div>
      <div class="eyebrow">${p.by ? esc(p.by) + ' · ' : ''}${t('비공개 검수')}</div>
      <h2>${esc(p.t || t('수정요청'))}</h2>
      <p>${t('디렉터에게 받은 핀 번호 4자리를 입력해 주세요.')}</p>
      <form class="pin-boxes" autocomplete="off">${[0, 1, 2, 3].map(i => `<input inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="${i + 1}${t('번째 숫자')}" ${i === 0 ? 'autofocus' : ''}>`).join('')}</form>
      <div class="gate-msg" role="status" aria-live="polite"></div>
    </div>`;
    const boxes = $$('.pin-boxes input', app), msg = $('.gate-msg', app), form = $('.pin-boxes', app);
    let fails = +(sessionStorage.getItem('sd:fail:' + p.id) || 0), lockUntil = +(sessionStorage.getItem('sd:lock:' + p.id) || 0);
    const check = async () => {
      const pin = boxes.map(b => b.value).join('');
      if (pin.length < 4) return;
      if (Date.now() < lockUntil) { msg.textContent = `${t('잠시 후 다시 시도해 주세요 (')}${Math.ceil((lockUntil - Date.now()) / 1000)}${t('초)')}`; return; }
      if (await sha(p.s + pin) === p.ph) { form.classList.add('ok'); msg.textContent = ''; setTimeout(() => resolve(true), 260); return; }
      fails++; sessionStorage.setItem('sd:fail:' + p.id, fails);
      if (fails % 5 === 0) { lockUntil = Date.now() + 30000; sessionStorage.setItem('sd:lock:' + p.id, lockUntil); }
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      msg.textContent = fails % 5 === 0 ? t('5번 틀려서 30초 동안 잠겼어요') : t('번호가 맞지 않아요');
      boxes.forEach(b => b.value = ''); boxes[0].focus();
    };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        const d = b.value.replace(/\D/g, '');
        if (d.length > 1) { d.split('').slice(0, 4 - i).forEach((c, k) => boxes[i + k].value = c); boxes[Math.min(3, i + d.length - 1)].focus(); }
        else { b.value = d; if (d && i < 3) boxes[i + 1].focus(); }
        check();
      });
      b.addEventListener('keydown', e => { if (e.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1].value = ''; boxes[i - 1].focus(); } });
      b.addEventListener('paste', e => { const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4); if (d) { e.preventDefault(); d.split('').forEach((c, k) => boxes[k] && (boxes[k].value = c)); check(); } });
    });
    form.addEventListener('submit', e => { e.preventDefault(); check(); });
    boxes[0].focus();
  });
}

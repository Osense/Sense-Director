/* 클라이언트 화면 — 핀 번호로 들어와 핀·펜으로 수정요청을 남기고 디렉터에게 보낸다 */
import { $, $$, ic, esc, uid, tc, sha, unpack, modal, toast, dueLabel, fmtDate, copyText, shareOrCopy, safeName, fpsLabel } from './util.js';
import { Store, MODE } from './store.js';
import { mountViewer, snapHTML } from './viewer.js';
import { Cap } from './player.js';
import { replyLink, requestMessage, reportHTML, printHTML, shareFile, STATUS } from './exports.js';

export async function renderClient(app, params) {
  let p;
  try { p = await unpack(params.c); if (!p || !p.id) throw 0; }
  catch { app.innerHTML = errorScreen('링크가 올바르지 않아요', '받은 링크 전체가 복사되었는지 확인해 주세요. 메신저에서 링크 끝이 잘리면 열리지 않을 수 있어요.'); return; }
  document.title = (p.t || '수정요청') + ' · Sense Director';

  const okKey = 'sd:ok:' + p.id;
  if (p.ph && sessionStorage.getItem(okKey) !== p.ph) {
    const passed = await pinGate(app, p);
    if (!passed) return;
    sessionStorage.setItem(okKey, p.ph);
  }

  const state = Store.client(p.id);
  // 디렉터 회신 링크(&f=)로 들어왔으면 상태·댓글을 합친다
  if (params.f) { try { mergeFeedback(state, await unpack(params.f)); Store.saveClient(p.id, state); toast('디렉터 회신을 불러왔어요'); } catch {} }
  syncFromInbox(state, p.id);

  app.innerHTML = `
  <header class="topbar">
    <span class="wordmark" aria-label="Sense Director"><b>SENSE</b><i>director</i></span>
    <div class="ptitle"><div class="eyebrow">Revision request${p.by ? ' · ' + esc(p.by) : ''}</div><h1>${esc(p.t || '제목 없는 프로젝트')}</h1></div>
    ${p.d ? `<span class="chip due" title="피드백 마감">${ic('clock', 13)}${esc(dueLabel(p.d))}</span>` : ''}
    <div class="grow"></div>
    ${p.n ? `<button class="btn ghost" data-act="notice">${ic('note')}안내사항</button>` : ''}
    <button class="btn ghost icon" data-act="help" aria-label="사용법" title="사용법·단축키 (?)">${ic('help', 17)}</button>
    <div class="split" data-menu-root>
      <button class="btn primary" data-act="send">${ic('send')}수정요청 보내기<span class="count" data-count></span></button>
      <button class="btn primary caret" data-act="more" aria-label="다른 방법으로 보내기" aria-haspopup="menu">${ic('down', 14)}</button>
      <div class="menu" role="menu" hidden>
        <div class="menu-label">전송이 안 될 때</div>
        <button role="menuitem" data-send="msg">${ic('msg')}<span><b>메시지로 보내기</b><small>카톡·문자에 붙여 넣는 글 + 가져오기 링크</small></span></button>
        <button role="menuitem" data-send="html">${ic('file')}<span><b>HTML 보내기</b><small>장면 사진까지 담긴 파일 하나</small></span></button>
        <button role="menuitem" data-send="pdf">${ic('print')}<span><b>PDF 보내기</b><small>인쇄 창에서 'PDF로 저장'</small></span></button>
      </div>
    </div>
  </header>
  <main class="workspace">
    <section class="left" data-viewer></section>
    <aside class="side">
      <div class="side-tabs" role="tablist">
        <button role="tab" class="on" data-tab="draft">작성 중 <b data-n="draft">0</b></button>
        <button role="tab" data-tab="sent">보낸 요청 <b data-n="sent">0</b></button>
      </div>
      <div class="list" data-list></div>
    </aside>
  </main>`;

  let tab = 'draft', selected = null, activeId = null, askedCap = false;
  const allItems = () => [...state.sent.flatMap(r => r.items.map(it => ({ ...it, _sent: r.rid }))), ...state.draft].sort((a, b) => a.t - b.t);
  const numOf = id => allItems().findIndex(it => it.id === id) + 1;
  const save = () => Store.saveClient(p.id, state);

  const V = mountViewer($('[data-viewer]', app), p.src, {
    tools: true,
    items: allItems,
    selected: () => selected,
    onPin: ({ x, y }) => addItem({ x, y }),
    onStroke: pts => addStroke(pts),
    onMemo: () => addItem({}),
    onMeta: () => renderList(),
    onReady: () => { V.renderMarks(); },
  });
  const P = V.P;
  if (p.ar) P.setMeta({ ar: p.ar });
  if (p.fps) P.setMeta({ fps: p.fps, how: p.fh || 'measured' });

  async function ensureCapture() {
    if (!P.needsCapture() || askedCap) return;
    askedCap = true;
    const r = await modal({
      title: '장면 사진을 같이 붙일까요?',
      body: `<p class="note">유튜브 영상은 보안상 바로 찍을 수 없어서, <b>이 탭 화면 공유</b>를 한 번 허용하면 핀을 찍을 때마다 그 장면이 사진으로 붙어요. 화면은 이 기기 밖으로 나가지 않아요.</p>
             <p class="note dim">공유 창이 뜨면 <b>이 탭</b>을 고르고 '공유'를 눌러 주세요.</p>`,
      actions: [{ label: '사진 없이 계속', value: 'no' }, { label: `${ic('cam')}장면 사진 켜기`, kind: 'primary', value: 'yes' }],
    });
    if (r === 'yes') { const ok = await Cap.start(P.stage); toast(ok ? '장면 사진이 켜졌어요' : '화면 공유가 취소됐어요. 아래 "장면 캡처 켜기"로 언제든 켤 수 있어요', 3600); }
  }

  async function addItem({ x = null, y = null, s = [] }) {
    if (!P.ready()) return;
    P.pause();
    await ensureCapture();
    const snap = await P.snapshot();
    const it = { id: uid(6), t: snap.t, x, y, s, tx: '', th: snap.img, st: 'open', rp: [], at: Date.now() };
    state.draft.push(it); state.draft.sort((a, b) => a.t - b.t);
    activeId = it.id; selected = it.id; tab = 'draft';
    save(); renderList(); V.render();
    const ta = $(`[data-id="${it.id}"] textarea`, app); if (ta) { ta.focus(); ta.closest('.item').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
  function addStroke(pts) {
    const a = state.draft.find(it => it.id === activeId);
    if (a && Math.abs(a.t - P.time()) < 1 / P.effFps() + 0.02 && P.paused()) { a.s = [...(a.s || []), pts]; save(); renderList(); V.render(); return; }
    addItem({ s: [pts] });
  }

  function itemCard(it) {
    const n = numOf(it.id), sent = !!it._sent, st = it.st || 'open';
    const kind = it.x != null ? (it.s && it.s.length ? '핀 + 그림' : '핀') : it.s && it.s.length ? '그림' : '메모';
    return `<article class="item${it.id === selected ? ' sel' : ''}${sent ? ' sent' : ''}" data-id="${it.id}">
      <div class="item-head">
        <span class="no">${String(n).padStart(2, '0')}</span>
        <button class="tcbtn" data-seek title="이 시점으로 이동">${tc(it.t, P.effFps())}</button>
        <span class="kind">${kind}</span>
        ${sent ? `<span class="tag st-${st}">${STATUS[st]}</span>` : `<button class="icon-x" data-del aria-label="삭제" title="삭제">${ic('trash', 15)}</button>`}
      </div>
      <div data-seek>${snapHTML(it, n, P.ar, p.src.k === 'yt' ? p.src.id : '')}</div>
      ${sent ? `<p class="tx">${esc(it.tx || '(내용 없음)')}</p>` : `<textarea rows="2" placeholder="어떻게 고치면 좋을지 적어 주세요" data-tx>${esc(it.tx)}</textarea>`}
      ${thread(it, sent)}
    </article>`;
  }
  function thread(it, sent) {
    const rp = it.rp || [];
    if (!sent) return '';
    return `<div class="thread">${rp.map(r => `<div class="rp ${r.by}"><b>${r.by === 'd' ? esc(r.n || '디렉터') : '나'}</b><span>${esc(r.b)}</span><time>${fmtDate(r.at)}</time></div>`).join('')}
      ${rp.some(r => r.by === 'd') ? `<form class="reply" data-reply><input placeholder="디렉터에게 답글" aria-label="답글"><button class="btn small" aria-label="답글 보내기">${ic('reply', 14)}</button></form>` : '<div class="waiting">디렉터 확인을 기다리는 중</div>'}
    </div>`;
  }
  function renderList() {
    const items = allItems();
    $('[data-n=draft]', app).textContent = state.draft.length;
    $('[data-n=sent]', app).textContent = state.sent.reduce((a, r) => a + r.items.length, 0);
    $('[data-count]', app).textContent = state.draft.length ? ' ' + state.draft.length : '';
    $$('[data-tab]', app).forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const list = $('[data-list]', app);
    if (tab === 'draft') {
      const draft = items.filter(it => !it._sent);
      list.innerHTML = draft.length ? draft.map(itemCard).join('') : `<div class="empty">
        <b>고칠 곳을 화면에서 눌러 주세요</b>
        <span>${ic('pin', 14)} 핀: 누른 자리에 표시 · ${ic('pen', 14)} 펜: 그려서 표시</span>
        <span>장면과 시간 주소(시:분:초:프레임)가 여기에 붙고, 바로 내용을 적을 수 있어요.</span>
        <span class="keys">Space 재생 · , . 한 프레임 · ← → 1초 · P 핀 · D 펜 · M 메모</span></div>`;
    } else {
      list.innerHTML = state.sent.length ? state.sent.slice().reverse().map(r => `<div class="group"><div class="group-head">${fmtDate(r.at)} · ${r.items.length}건 보냄${r.from ? ' · ' + esc(r.from) : ''}</div>${r.items.map(it => itemCard({ ...it, _sent: r.rid })).join('')}</div>`).join('')
        : '<div class="empty"><b>아직 보낸 요청이 없어요</b><span>작성을 마치면 오른쪽 위 "수정요청 보내기"를 눌러 주세요.</span></div>';
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
      toast(`삭제했어요 <button class="link" data-undo>되돌리기</button>`, 4000);
      const u = $('#toast [data-undo]'); u && u.addEventListener('click', () => { state.draft.push(gone); state.draft.sort((a, b) => a.t - b.t); save(); renderList(); });
      return;
    }
    if (e.target.closest('textarea,input,form')) return;
    const it = allItems().find(x => x.id === id); if (!it) return;
    selected = id; activeId = it._sent ? null : id;
    P.pause(); P.seek(it.t);
    if (it.th) P.showFreeze(it.th, it.t);
    $$('.item', list).forEach(c => c.classList.toggle('sel', c.dataset.id === id));
    V.render();
  });
  let txT;
  list.addEventListener('input', e => {
    const ta = e.target.closest('[data-tx]'); if (!ta) return;
    const it = state.draft.find(x => x.id === ta.closest('.item').dataset.id); if (!it) return;
    it.tx = ta.value; autoGrow(ta); clearTimeout(txT); txT = setTimeout(save, 300);
  });
  list.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.closest('[data-reply]'); const input = $('input', f); const b = input.value.trim(); if (!b) return;
    const id = f.closest('.item').dataset.id;
    const req = state.sent.find(r => r.items.some(it => it.id === id)); const it = req.items.find(x => x.id === id);
    it.rp = [...(it.rp || []), { by: 'c', n: state.from || '', b, at: Date.now() }];
    save(); await Store.submit(p.id, req); renderList(); toast('답글을 남겼어요');
  });
  $$('[data-tab]', app).forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; renderList(); }));
  const autoGrow = ta => { ta.style.height = 'auto'; ta.style.height = Math.min(220, ta.scrollHeight + 2) + 'px'; };

  // 보내기
  const menuRoot = $('[data-menu-root]', app), menu = $('.menu', menuRoot);
  $('[data-act=more]', app).addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', e => { if (!menuRoot.contains(e.target)) menu.hidden = true; });
  $('[data-act=send]', app).addEventListener('click', send);
  $$('[data-send]', app).forEach(b => b.addEventListener('click', () => { menu.hidden = true; fallback(b.dataset.send); }));
  $('[data-act=help]', app).addEventListener('click', help);
  const nb = $('[data-act=notice]', app); nb && nb.addEventListener('click', showNotice);

  function currentRequest() {
    if (state.draft.length) return { rid: 'draft', from: state.from || '', at: Date.now(), items: state.draft };
    const items = state.sent.flatMap(r => r.items);
    return items.length ? { rid: state.sent[state.sent.length - 1].rid, from: state.from || '', at: Date.now(), items } : null;
  }
  async function askName() {
    return modal({
      title: '수정요청 보내기',
      body: `<label class="field"><span>보내는 사람</span><input data-name value="${esc(state.from || '')}" placeholder="이름 또는 회사" autofocus maxlength="40"></label>
        <div class="send-sum">${state.draft.length}건${state.draft.filter(it => !it.tx.trim()).length ? ` · <em>내용이 빈 항목 ${state.draft.filter(it => !it.tx.trim()).length}건</em>` : ''}</div>`,
      actions: [{ label: '취소', value: null }, { label: `${ic('send')}보내기`, kind: 'primary', onClick: w => { state.from = $('[data-name]', w).value.trim(); }, value: 'go' }],
      onOpen: w => { const i = $('[data-name]', w); i.addEventListener('keydown', e => { if (e.key === 'Enter') $('.foot .primary', w).click(); }); },
    });
  }
  async function send() {
    if (!state.draft.length) { toast(state.sent.length ? '새로 작성한 수정 포인트가 없어요' : '먼저 화면에 핀을 찍거나 그려 주세요'); return; }
    if (await askName() !== 'go') return;
    const req = { rid: uid(8), from: state.from || '', at: Date.now(), items: state.draft.map(it => ({ ...it })) };
    let delivered = false;
    try { await Store.submit(p.id, req); delivered = true; } catch {}
    state.sent.push(req); state.draft = []; save(); tab = 'sent'; activeId = null; renderList();
    const link = await replyLink(p, req);
    const r = await modal({
      title: delivered ? '수정요청을 보냈어요' : '전송하지 못했어요',
      body: `<div class="sent-ok">${ic(delivered ? 'check' : 'close', 28)}<b>${req.items.length}건</b></div>
        <p class="note">${MODE === 'mock' ? '지금은 <b>서버 없는 시험 버전</b>이라 같은 브라우저의 디렉터 콘솔에만 바로 들어가요. 디렉터가 다른 기기라면 아래 방법 중 하나로 한 번 더 보내 주세요.' : '디렉터에게 전달되었어요.'}</p>
        <div class="fallbacks">
          <button class="btn" data-fb="msg">${ic('msg')}메시지로 보내기</button>
          <button class="btn" data-fb="html">${ic('file')}HTML 보내기</button>
          <button class="btn" data-fb="pdf">${ic('print')}PDF 보내기</button>
        </div>`,
      actions: [{ label: '닫기', kind: 'primary' }],
      onOpen: w => $$('[data-fb]', w).forEach(b => b.addEventListener('click', () => fallback(b.dataset.fb, req, link))),
    });
    void r;
  }
  async function fallback(kind, req = currentRequest(), link) {
    if (!req) { toast('보낼 수정 포인트가 없어요'); return; }
    if (!state.from && kind !== 'pdf') { if (await askName() !== 'go') return; req.from = state.from; save(); }
    const r = { ...req, rid: req.rid === 'draft' ? 'm' + uid(6) : req.rid, from: state.from || req.from };
    link = link || await replyLink(p, r);
    const name = safeName(`${p.t || '수정요청'}_수정요청_${new Date().toISOString().slice(0, 10)}`);
    if (kind === 'msg') {
      const text = requestMessage(p, r, link);
      const res = await shareOrCopy({ title: (p.t || '') + ' 수정요청', text });
      toast(res === 'copied' ? '메시지를 복사했어요. 카톡·문자에 붙여 넣어 주세요' : res === 'shared' ? '공유했어요' : '복사하지 못했어요');
    } else if (kind === 'html') {
      const res = await shareFile(name + '.html', reportHTML({ p, reqs: [r], link }));
      toast(res === 'downloaded' ? 'HTML 파일을 내려받았어요. 디렉터에게 보내 주세요' : '공유했어요');
    } else if (kind === 'pdf') {
      printHTML(reportHTML({ p, reqs: [r] })); toast("인쇄 창에서 대상을 'PDF로 저장'으로 골라 주세요", 4000);
    }
  }
  function showNotice() {
    return modal({
      title: p.t || '안내사항',
      body: `${p.by ? `<div class="eyebrow">From ${esc(p.by)}</div>` : ''}<div class="notice-body">${esc(p.n || '')}</div>${p.d ? `<div class="chip due">${ic('clock', 13)}${esc(dueLabel(p.d))}</div>` : ''}`,
      actions: [{ label: '확인하고 시작하기', kind: 'primary' }],
    });
  }
  function help() {
    return modal({
      title: '사용법', wide: true,
      body: `<ol class="steps"><li><b>찾기</b>재생하다가 고칠 장면에서 멈춰요. <kbd>,</kbd> <kbd>.</kbd>로 한 프레임씩 맞출 수 있어요.</li>
      <li><b>표시</b>핀(P)으로 누르거나 펜(D)으로 그려요. 장면 사진과 시간 주소가 오른쪽에 붙어요.</li>
      <li><b>적기</b>붙은 카드에 바로 내용을 적어요. 펜으로 이어 그린 획은 같은 카드에 합쳐져요.</li>
      <li><b>보내기</b>오른쪽 위 "수정요청 보내기". 안 되면 옆 화살표에서 메시지·HTML·PDF로 보내요.</li>
      <li><b>회신</b>디렉터가 단 댓글과 반영 상태는 "보낸 요청"에서 볼 수 있어요.</li></ol>
      <div class="keys-grid"><kbd>Space</kbd><span>재생/정지</span><kbd>, .</kbd><span>1프레임</span><kbd>← →</kbd><span>1초 (Shift 5초)</span><kbd>J L</kbd><span>5초</span><kbd>P D M</kbd><span>핀 · 펜 · 메모만</span><kbd>Esc</kbd><span>입력 끝내기</span></div>
      <p class="note dim">시간 주소는 시:분:초:프레임이에요. 프레임 수(${esc(P.fps ? fpsLabel(P.fps) : '재생하면 자동 측정')})는 영상에 맞춰 자동으로 정해져요.</p>`,
      actions: [{ label: '닫기', kind: 'primary' }],
    });
  }

  // 키보드
  document.onkeydown = e => {
    if (document.querySelector('.modal.open')) return;
    if (e.target.closest && e.target.closest('textarea,input,select')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === '?') { help(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    V.key(e);
  };
  // 같은 브라우저 디렉터 콘솔의 회신을 실시간 반영
  Store.onChange(k => { if (k === 'sd:inbox:' + p.id) { syncFromInbox(state, p.id); save(); renderList(); } });

  renderList();
  if (p.n && !sessionStorage.getItem('sd:seen:' + p.id)) { sessionStorage.setItem('sd:seen:' + p.id, '1'); showNotice(); }
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
  return `<div class="gate"><span class="wordmark"><b>SENSE</b><i>director</i></span><h2>${esc(title)}</h2><p>${esc(msg)}</p></div>`;
}

/** 핀 번호 4자리 */
function pinGate(app, p) {
  return new Promise(resolve => {
    app.innerHTML = `<div class="gate">
      <span class="wordmark"><b>SENSE</b><i>director</i></span>
      <div class="eyebrow">${p.by ? esc(p.by) + ' · ' : ''}Private review</div>
      <h2>${esc(p.t || '수정요청')}</h2>
      <p>디렉터에게 받은 핀 번호 4자리를 입력해 주세요.</p>
      <form class="pin-boxes" autocomplete="off">${[0, 1, 2, 3].map(i => `<input inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="${i + 1}번째 숫자" ${i === 0 ? 'autofocus' : ''}>`).join('')}</form>
      <div class="gate-msg" role="status" aria-live="polite"></div>
    </div>`;
    const boxes = $$('.pin-boxes input', app), msg = $('.gate-msg', app), form = $('.pin-boxes', app);
    let fails = +(sessionStorage.getItem('sd:fail:' + p.id) || 0), lockUntil = +(sessionStorage.getItem('sd:lock:' + p.id) || 0);
    const check = async () => {
      const pin = boxes.map(b => b.value).join('');
      if (pin.length < 4) return;
      if (Date.now() < lockUntil) { msg.textContent = `잠시 후 다시 시도해 주세요 (${Math.ceil((lockUntil - Date.now()) / 1000)}초)`; return; }
      if (await sha(p.s + pin) === p.ph) { form.classList.add('ok'); msg.textContent = ''; setTimeout(() => resolve(true), 260); return; }
      fails++; sessionStorage.setItem('sd:fail:' + p.id, fails);
      if (fails % 5 === 0) { lockUntil = Date.now() + 30000; sessionStorage.setItem('sd:lock:' + p.id, lockUntil); }
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      msg.textContent = fails % 5 === 0 ? '5번 틀려서 30초 동안 잠겼어요' : '번호가 맞지 않아요';
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

/* 디렉터 콘솔 — 영상 임베드, 프로젝트·안내사항·핀 설정, 링크 공유, 받은 수정요청에 댓글로 환류 */
import { $, $$, ic, esc, uid, tc, sha, modal, toast, dueLabel, fmtDate, copyText, shareOrCopy, parseSource, safeName, fpsLabel, unpack, srcText, srcKind, STD_FPS } from './util.js';
import { Store, MODE } from './store.js';
import { mountViewer, snapHTML, posterOf } from './viewer.js';
import { openZoom } from './zoom.js';
import { probe } from './player.js';
import { putMedia, fmtSize } from './media.js';
import { clientLink, feedbackMessage, reportHTML, printHTML, shareFile, parseIncoming, STATUS, noteLabel } from './exports.js';

const NOTICE_CHIPS = ['피드백은 마감일까지 부탁드립니다.', '수정할 장면에서 멈추고 핀을 찍은 뒤 내용을 적어 주세요.', '자막·색보정·음악은 각각 따로 적어 주시면 빨라요.', '음악은 저작권 확인 중이라 바뀔 수 있어요.', '최종본이 아닌 1차 편집본입니다.'];
const REPLY_CHIPS = ['반영하겠습니다', '확인했습니다', '다음 버전에 반영할게요', '논의가 필요해요', '원본 의도를 유지할게요'];
const pin4 = () => String(crypto.getRandomValues(new Uint16Array(1))[0] % 10000).padStart(4, '0');

let V = null; // 현재 재생 화면

export async function newProject(fields = {}) {
  const p = { id: uid(8), salt: uid(6), pin: pin4(), title: '', notice: '', due: '', by: localStorage.getItem('sd:director') || '', src: null, ar: [16, 9], fps: 0, createdAt: Date.now(), ...fields };
  p.pinHash = await sha(p.salt + p.pin);
  Store.saveProject(p);
  return p;
}

export async function renderDirector(app, params) {
  // 수정요청 링크(#r=)로 들어온 경우: 수신함으로 가져오기
  if (params.r) {
    try {
      const { p: pp, r } = await unpack(params.r);
      const id = importInto(pp, [r]);
      history.replaceState(null, '', '#p=' + id + '&tab=inbox');
      toast(`${esc(r.from || '클라이언트')}의 수정요청 ${r.items.length}건을 수신함에 넣었어요`, 3600);
      params = { p: id, tab: 'inbox' };
    } catch { toast('수정요청 링크를 읽지 못했어요'); history.replaceState(null, '', '#'); params = {}; }
  }
  Store.onChange(() => {});
  const projects = Store.projects();
  const cur = params.p ? Store.getProject(params.p) : null;
  if (V) { V.destroy(); V = null; }
  document.title = (cur ? (cur.title || '새 프로젝트') + ' · ' : '') + 'Sense Director · 디렉터 콘솔';

  app.innerHTML = `
  <header class="topbar">
    <a class="wordmark" href="#" aria-label="Sense Director 처음으로"><b>SENSE</b><i>director</i></a>
    <div class="ptitle"><div class="eyebrow">Director console</div></div>
    <div class="grow"></div>
    ${MODE === 'mock' ? '<span class="chip mock" title="서버 없이 이 브라우저와 링크로 주고받는 시험 버전">시험 버전 · 서버 없음</span>' : ''}
    <button class="btn ghost" data-act="import" title="수정요청 링크·HTML 가져오기">${ic('import')}가져오기</button>
    <button class="btn primary" data-act="new">${ic('plus')}새 프로젝트</button>
  </header>
  <div class="console">
    <nav class="plist" aria-label="프로젝트">
      <div class="plist-head">프로젝트 <b>${projects.length}</b></div>
      ${projects.map(pr => {
        const inbox = Store.inbox(pr.id), all = inbox.flatMap(r => r.items), open = all.filter(it => (it.st || 'open') === 'open').length;
        return `<a class="pitem${cur && cur.id === pr.id ? ' on' : ''}" href="#p=${pr.id}${open ? '&tab=inbox' : ''}">
          <span class="pt">${esc(pr.title || '제목 없음')}</span>
          <span class="pm">${pr.due ? esc(dueLabel(pr.due)) + ' · ' : ''}${all.length ? `요청 ${all.length}` : '요청 없음'}</span>
          ${open ? `<i class="badge" title="확인 안 한 요청">${open}</i>` : ''}</a>`;
      }).join('') || '<div class="plist-empty">아직 프로젝트가 없어요</div>'}
    </nav>
    <section class="pmain" data-main></section>
  </div>`;
  $('[data-act=new]', app).addEventListener('click', () => startNew());
  $('[data-act=import]', app).addEventListener('click', () => importDialog());
  const main = $('[data-main]', app);
  if (!cur) return renderHome(main, projects);
  renderProject(main, cur, params.tab || (Store.inbox(cur.id).length ? 'inbox' : 'setup'));
}

function renderHome(main) {
  main.innerHTML = `<div class="hero">
    <div class="eyebrow">New review</div>
    <h2>영상 링크를 붙여 넣으면<br>검수 링크가 바로 만들어져요</h2>
    <form class="hero-form" data-hero><input placeholder="유튜브 · 비메오 링크 또는 mp4 영상 주소" aria-label="영상 링크" autofocus><button class="btn primary">${ic('plus')}만들기</button></form>
    <label class="drop-file" data-drop>${ic('import', 18)}<span><b>영상 파일 올리기</b><small>mp4·mov·webm — 끌어 놓거나 눌러서 고르기</small></span><input type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv" hidden></label>
    <ol class="flow">
      <li><b>01</b><span>영상 임베드</span><small>화면비·프레임 수는 알아서 맞춰요</small></li>
      <li><b>02</b><span>안내사항 · 핀 번호</span><small>4자리 핀으로 클라이언트만 열어요</small></li>
      <li><b>03</b><span>링크 공유</span><small>카톡·메시지·QR</small></li>
      <li><b>04</b><span>수정요청 받기</span><small>장면·시간 주소·내용</small></li>
      <li><b>05</b><span>댓글로 환류</span><small>반영 상태와 답을 돌려보내요</small></li>
    </ol>
  </div>`;
  $('[data-hero]', main).addEventListener('submit', e => { e.preventDefault(); startNew($('input', main).value); });
  const drop = $('[data-drop]', main);
  $('input', drop).addEventListener('change', async e => { const f = e.target.files[0]; if (f) { const src = await uploadFile(f); if (src) startNew('', src); } });
  drop.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f && /^video\//.test(f.type || 'video/')) { const src = await uploadFile(f); if (src) startNew('', src); } });
}

/** 영상 파일 올리기 — 시험 버전: 서버 대신 이 브라우저에 저장 */
async function uploadFile(file) {
  if (file.type && !file.type.startsWith('video/')) { toast('영상 파일을 골라 주세요'); return null; }
  let setP;
  const done = modal({
    title: '영상 올리는 중', dismissible: false,
    body: `<div class="upload"><b>${esc(file.name)}</b><span class="dim">${fmtSize(file.size)}</span><div class="progress big"><i data-up></i></div><span class="up-pct" data-pct>0%</span></div>
      <p class="note dim">${MODE === 'mock' ? '시험 버전: 서버 대신 이 브라우저에 저장해요. 다른 기기의 클라이언트는 같은 파일을 직접 골라 연결해요.' : ''}</p>`,
    onOpen: (w, close) => { setP = (x, end) => { $('[data-up]', w).style.width = x * 100 + '%'; $('[data-pct]', w).textContent = Math.round(x * 100) + '%'; if (end) setTimeout(() => close('ok'), 250); }; },
  });
  try {
    const fid = 'f' + uid(10);
    const meta = await putMedia(fid, file, x => setP && setP(x));
    setP(1, true); await done;
    toast('영상을 올렸어요');
    return { k: 'file', ...meta };
  } catch { setP && setP(0, true); await done; toast('영상을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요'); return null; }
}

async function startNew(url = '', given = null) {
  const src = given || parseSource(url);
  if (url && !src) { toast('유튜브·비메오 링크나 영상 주소를 알아볼 수 없어요'); return; }
  const p = await newProject({ src });
  if (src) { const m = await probe(src); Object.assign(p, { title: p.title || m.title, ar: m.ar, fps: m.fps || 0, fpsHow: m.fps ? 'title' : '', poster: m.poster || '' }); Store.saveProject(p); }
  location.hash = '#p=' + p.id + '&tab=setup';
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
      toast(`수정요청 ${reqs.reduce((a, r) => a + r.items.length, 0)}건을 가져왔어요`);
      location.hash = '#p=' + id + '&tab=inbox';
      return true;
    } catch { toast('가져올 수 없는 형식이에요. 수정요청 링크나 HTML 파일인지 확인해 주세요'); return false; }
  };
  if (fileText) return handle(fileText);
  await modal({
    title: '수정요청 가져오기',
    body: `<p class="note">클라이언트가 메시지로 보낸 글(링크 포함)을 붙여 넣거나, 받은 HTML 파일을 골라 주세요. 화면 아무 곳에 파일을 끌어 놓아도 돼요.</p>
      <textarea class="paste" data-paste rows="5" placeholder="메시지 전체 또는 #r= 링크 붙여 넣기" autofocus></textarea>
      <label class="btn ghost file-btn">${ic('file')}HTML 파일 고르기<input type="file" accept=".html,.htm,.json" hidden data-file></label>`,
    actions: [{ label: '취소', value: null }, { label: '가져오기', kind: 'primary', onClick: w => { const v = $('[data-paste]', w).value; if (!v.trim()) { toast('붙여 넣은 내용이 없어요'); return false; } handle(v); } }],
    onOpen: (w, close) => { $('[data-file]', w).addEventListener('change', async e => { const f = e.target.files[0]; if (f && await handle(await f.text())) close('ok'); }); },
  });
}

/* ---------- 프로젝트 화면 ---------- */
const params_pane = p => (p.notes || []).length && !Store.inbox(p.id).length ? 'notes' : 'req';
function renderProject(main, p, tab) {
  const inbox = Store.inbox(p.id), all = inbox.flatMap(r => r.items);
  main.innerHTML = `
    <div class="phead">
      <input class="ptitle-in" data-f="title" value="${esc(p.title)}" placeholder="프로젝트 이름" aria-label="프로젝트 이름" spellcheck="false">
      <div class="tabs" role="tablist">
        <button role="tab" data-tab="inbox" class="${tab === 'inbox' ? 'on' : ''}">${ic('inbox')}수정요청 · 안내 <b>${all.length}</b></button>
        <button role="tab" data-tab="setup" class="${tab === 'setup' ? 'on' : ''}">${ic('sliders')}설정 · 공유</button>
      </div>
    </div>
    <div class="pbody ${tab}">
      <section class="left" data-viewer></section>
      <aside class="side" data-side></aside>
    </div>`;
  $$('[data-tab]', main).forEach(b => b.addEventListener('click', () => { location.hash = '#p=' + p.id + '&tab=' + b.dataset.tab; }));
  $('[data-f=title]', main).addEventListener('input', e => { p.title = e.target.value; Store.saveProject(p); const pt = $('.pitem.on .pt'); if (pt) pt.textContent = p.title || '제목 없음'; queueLink(); });

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
    viewerEl.innerHTML = `<div class="viewer"><div class="stage empty-stage"><div><b>영상을 넣어 주세요</b><span>오른쪽 "영상" 칸에 유튜브·비메오 링크나 mp4 주소를 붙여 넣거나 영상 파일을 올리면 여기서 바로 재생돼요.</span></div></div></div>`;
  }

  if (tab === 'setup') renderSetup($('[data-side]', main), p, main);
  else renderInbox($('[data-side]', main), p, () => selected, id => { selected = id; }, hooks, params_pane(p));

  document.onkeydown = e => {
    if (document.querySelector('.modal.open')) return;
    if (e.target.closest && e.target.closest('textarea,input,select')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    V && V.key(e);
  };

  function renderMeta() {
    const el = $('[data-meta]', main); if (!el || !V) return;
    const P = V.P;
    const how = P.fpsHow === 'measured' ? '측정됨' : P.fpsHow === 'title' ? '영상 정보' : P.fpsHow === 'set' ? '직접 지정' : P.live() ? '재생하면 측정' : '기본값';
    el.innerHTML = `<span class="chip">${srcKind(p.src)}</span><span class="chip">${P.ar[0]}:${P.ar[1]}${P.ar[0] < P.ar[1] ? ' 세로' : ''}</span>
      <label class="chip fps-pick ${P.fpsHow === 'measured' ? 'measured' : ''}" title="프레임 수 — 시간 주소의 프레임 번호 기준">
        <select data-fps-pick aria-label="프레임 수">${['', ...STD_FPS].map(f => `<option value="${f}" ${(f === '' ? !P.fps : f === P.fps) ? 'selected' : ''}>${f === '' ? '30fps (기본)' : fpsLabel(f)}</option>`).join('')}</select><span>${how}</span></label>
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
  const isFile = p.src && p.src.k === 'file';
  side.innerHTML = `
    <div class="card">
      <div class="card-title">영상</div>
      <div class="linkbox"><input class="field-in" data-f="src" value="${esc(isFile ? '' : srcText(p.src))}" placeholder="${isFile ? esc(p.src.name + ' · ' + fmtSize(p.src.size || 0)) : '유튜브 · 비메오 링크 또는 mp4 영상 주소'}" aria-label="영상 링크" spellcheck="false">
        <label class="btn" title="영상 파일 올리기">${ic('import')}파일<input type="file" data-upload accept="video/*,.mp4,.mov,.m4v,.webm,.mkv" hidden></label></div>
      <div class="meta-row" data-meta></div>
    </div>
    <div class="card">
      <div class="card-title">클라이언트 안내사항</div>
      <textarea class="field-in" data-f="notice" rows="5" placeholder="클라이언트가 처음 열 때 보이는 안내예요. 주의사항·마감·요청 방법을 적어 주세요.">${esc(p.notice)}</textarea>
      <div class="chips" data-chips>${NOTICE_CHIPS.map(c => `<button class="chipbtn" type="button">${esc(c)}</button>`).join('')}</div>
      <div class="two">
        <label class="field"><span>피드백 마감</span><input type="date" data-f="due" value="${esc(p.due || '')}"></label>
        <label class="field"><span>보내는 사람(디렉터)</span><input data-f="by" value="${esc(p.by || '')}" placeholder="이름·팀" maxlength="40"></label>
      </div>
    </div>
    <div class="card share">
      <div class="card-title">클라이언트 공유 ${ic('lock', 14)}</div>
      <div class="pinrow">
        <div class="pin-show" data-pin aria-label="핀 번호">${p.pin ? p.pin.split('').map(d => `<span>${d}</span>`).join('') : '<em>다른 기기에서 만든 프로젝트예요</em>'}</div>
        <div class="pin-act">
          <button class="btn small ghost" data-act="pin-new" title="새 번호로 바꾸면 이전 링크는 열리지 않아요">새 번호</button>
          <button class="btn small ghost" data-act="pin-edit">직접 입력</button>
        </div>
      </div>
      <label class="field"><span>클라이언트 링크</span><div class="linkbox"><input readonly data-link value="만드는 중…" aria-label="클라이언트 링크"><button class="btn icon" data-act="copy-link" title="주소 복사" aria-label="주소 복사">${ic('copy')}</button></div></label>
      <div class="share-btns">
        <button class="btn primary" data-act="copy-msg">${ic('msg')}카톡·메시지용 복사</button>
        <button class="btn" data-act="share">${ic('share')}공유하기</button>
        <button class="btn" data-act="qr">${ic('qr')}QR</button>
        <a class="btn" data-act="preview" target="_blank" rel="noopener">${ic('eye')}클라이언트 화면</a>
      </div>
      <div class="qr" data-qr hidden></div>
      ${(p.notes || []).length ? `<p class="note">${ic('pin', 13)} 디렉터 안내 <b>${p.notes.length}건</b>이 링크에 함께 들어가요.</p>` : ''}
      <p class="note dim">핀 번호는 링크와 따로 보내면 더 안전해요. 링크에는 핀 번호 대신 확인용 값만 들어가요.${MODE === 'mock' ? ' 시험 버전에서는 핀 확인이 브라우저 안에서만 이뤄져요.' : ''}</p>
    </div>
    <div class="card danger-zone"><button class="btn ghost danger small" data-act="delete">${ic('trash', 14)}프로젝트 삭제</button></div>`;

  const f = k => $(`[data-f=${k}]`, side);
  let link = '';
  async function refreshLink() {
    if (!p.src) { $('[data-link]', side).value = '영상 링크를 먼저 넣어 주세요'; link = ''; return; }
    link = await clientLink(p);
    $('[data-link]', side).value = link;
    $('[data-act=preview]', side).href = link;
    const q = $('[data-qr]', side); if (!q.hidden) drawQR(q, link);
  }
  main.addEventListener('linkchange', refreshLink);
  refreshLink();

  const changeSrc = async src => {
    p.src = src; p.fps = 0; p.fpsHow = ''; p.poster = ''; p.ar = src && src.k === 'yt' && src.short ? [9, 16] : [16, 9]; p.duration = 0;
    if (src) { const m = await probe(src); p.ar = m.ar; p.fps = m.fps || 0; p.fpsHow = m.fps ? 'title' : ''; p.poster = m.poster || ''; if (!p.title) p.title = m.title; }
    if (Store.inbox(p.id).length) toast('영상을 바꿨어요. 이미 받은 요청은 이전 영상 기준 시간이에요', 4200);
    const h = '#p=' + p.id + '&tab=setup'; if (location.hash === h) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = h;
  };
  f('src').addEventListener('change', e => {
    const src = parseSource(e.target.value);
    if (e.target.value && !src) { toast('유튜브·비메오 링크나 영상 주소를 알아볼 수 없어요'); return; }
    changeSrc(src);
  });
  $('[data-upload]', side).addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; const src = await uploadFile(file); if (src) changeSrc(src); });
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
    refreshLink(); toast('핀 번호를 바꿨어요. 새 링크를 보내 주세요');
  };
  $('[data-act=pin-new]', side).addEventListener('click', () => setPin(pin4()));
  $('[data-act=pin-edit]', side).addEventListener('click', async () => {
    let v = '';
    const r = await modal({ title: '핀 번호 직접 입력', body: '<input class="pin-input" inputmode="numeric" maxlength="4" placeholder="0000" autofocus data-pin-in>', actions: [{ label: '취소', value: null }, { label: '바꾸기', kind: 'primary', onClick: w => { v = $('[data-pin-in]', w).value; if (!/^\d{4}$/.test(v)) { toast('숫자 4자리로 입력해 주세요'); return false; } } }] });
    if (r && v) setPin(v);
  });
  const shareText = () => `[Sense Director] ${p.title || '영상'} 검수를 부탁드려요\n${p.due ? '마감: ' + dueLabel(p.due) + '\n' : ''}링크를 열고 핀 번호 ${p.pin || '(따로 안내)'}를 입력해 주세요.`;
  $('[data-act=copy-link]', side).addEventListener('click', async () => { if (!link) return; toast(await copyText(link) ? '주소를 복사했어요' : '복사하지 못했어요'); });
  $('[data-act=copy-msg]', side).addEventListener('click', async () => { if (!link) return; toast(await copyText(shareText() + '\n' + link) ? '안내 글과 링크를 복사했어요. 카톡에 붙여 넣어 주세요' : '복사하지 못했어요'); });
  $('[data-act=share]', side).addEventListener('click', async () => { if (!link) return; const r = await shareOrCopy({ title: p.title, text: shareText(), url: link }); if (r === 'copied') toast('공유 창이 없어 복사했어요'); });
  $('[data-act=qr]', side).addEventListener('click', () => { const q = $('[data-qr]', side); q.hidden = !q.hidden; if (!q.hidden && link) drawQR(q, link); });
  $('[data-act=delete]', side).addEventListener('click', async () => {
    const r = await modal({ title: '프로젝트를 삭제할까요?', body: '<p class="note">받은 수정요청과 댓글도 이 브라우저에서 함께 지워지고 되돌릴 수 없어요.</p>', actions: [{ label: '취소', value: null }, { label: '삭제', kind: 'danger', value: 'del' }] });
    if (r === 'del') { Store.deleteProject(p.id); location.hash = '#'; }
  });
}

let qrLib = null;
function drawQR(el, text) {
  const go = () => { el.innerHTML = ''; try { new window.QRCode(el, { text, width: 176, height: 176, colorDark: '#120e0e', colorLight: '#f4ecea', correctLevel: window.QRCode.CorrectLevel.L }); el.insertAdjacentHTML('beforeend', '<small>휴대폰 카메라로 비추면 바로 열려요</small>'); } catch { el.innerHTML = '<small>링크가 길어 QR로 만들 수 없어요. 안내사항을 줄여 보세요.</small>'; } };
  if (window.QRCode) return go();
  qrLib = qrLib || new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  qrLib.then(go).catch(() => { el.innerHTML = '<small>QR 도구를 불러오지 못했어요</small>'; });
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
    const it = { id: 'd' + uid(6), by: 'd', t: snap.t, x, y, s, tx: '', th: snap.img, rp: [], at: Date.now() };
    (p.notes || (p.notes = [])).push(it);
    activeNote = it.id; setSel(it.id); pane = 'notes'; saveNotes(); draw();
    const ta = $(`[data-id="${it.id}"] [data-ntx]`, side); if (ta) { ta.focus(); ta.closest('.item').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
  hooks.pin = a => addNote(a);
  hooks.memo = () => addNote({});
  hooks.stroke = pts => {
    const a = (p.notes || []).find(n => n.id === activeNote);
    if (a && V && V.P.paused() && Math.abs(a.t - V.P.time()) < 1 / V.P.effFps() + 0.02) { a.s = [...(a.s || []), pts]; saveNotes(); draw(); return; }
    addNote({ s: [pts] });
  };

  const draw = () => {
    const inbox = Store.inbox(p.id).sort((a, b) => b.at - a.at), all = inbox.flatMap(r => r.items), ns = notes();
    const cnt = k => all.filter(it => (it.st || 'open') === k).length, done = cnt('done');
    const fps = V ? V.P.effFps() : (p.fps || 30), poster = posterOf(p.src, p.poster);
    const missing = all.filter(it => !it.th).length + ns.filter(it => !it.th).length;
    const sendable = all.length || ns.length;
    side.innerHTML = `
      <div class="side-tabs" role="tablist">
        <button role="tab" class="${pane === 'req' ? 'on' : ''}" data-pane="req">받은 요청 <b>${all.length}</b></button>
        <button role="tab" class="${pane === 'notes' ? 'on' : ''}" data-pane="notes">내 안내 <b class="d">${ns.length}</b></button>
      </div>
      <div class="inbox-head">
        ${pane === 'req' ? `
        <div class="progress" title="반영 ${done} / ${all.length}"><i style="width:${all.length ? done / all.length * 100 : 0}%"></i></div>
        <div class="inbox-stats"><b>${done}</b><span>/ ${all.length} 반영</span><span class="dim">진행 ${cnt('doing')} · 보류 ${cnt('hold')} · 대기 ${cnt('open')}</span></div>`
        : `<p class="note-hint">${ic('pin', 14)}<span>영상에 핀·펜으로 표시하면 <b>디렉터 안내</b>가 돼요. 클라이언트 화면에 노란 표시로 보이고, 클라이언트가 답글을 달 수 있어요.</span></p>`}
        ${missing && V && V.canShare() ? `<button class="btn small ghost thumbs-btn" data-act="thumbs">${ic('cam', 14)}장면 사진 없는 ${missing}건 만들기</button>` : ''}
        <div class="thumb-progress" data-tp hidden><i></i><span></span></div>
        <div class="inbox-actions">
          ${pane === 'req' ? `<div class="seg small" role="group" aria-label="상태 필터">${['all', 'open', 'doing', 'done', 'hold'].map(k => `<button class="btn${filter === k ? ' on' : ''}" data-filter="${k}">${k === 'all' ? '전체' : STATUS[k]}</button>`).join('')}</div>` : '<span></span>'}
          <div class="split" data-menu-root>
            <button class="btn primary" data-act="feedback" ${sendable ? '' : 'disabled'} title="상태·댓글·디렉터 안내를 클라이언트에게">${ic('send')}${all.length ? '회신 보내기' : '안내 보내기'}</button>
            <button class="btn primary caret" data-act="fb-more" aria-label="보내는 방법" ${sendable ? '' : 'disabled'}>${ic('down', 14)}</button>
            <div class="menu" role="menu" hidden>
              <button data-fb="msg">${ic('msg')}<span><b>메시지로 보내기</b><small>안내·상태·댓글 요약 + 클라이언트 확인 링크</small></span></button>
              <button data-fb="html">${ic('file')}<span><b>HTML 보내기</b><small>장면 사진과 댓글이 담긴 파일</small></span></button>
              <button data-fb="pdf">${ic('print')}<span><b>PDF 보내기</b><small>인쇄 창에서 'PDF로 저장'</small></span></button>
            </div>
          </div>
        </div>
      </div>
      <div class="list">${pane === 'notes' ? (ns.length ? ns.map(it => noteCard(it, fps, poster)).join('') : `<div class="empty">
          <b>클라이언트에게 남길 안내가 없어요</b>
          <span>${ic('pin', 14)} 핀 · ${ic('pen', 14)} 펜으로 영상 위에 표시하고 내용을 적어 주세요.</span>
          <span>예: "이 컷은 색보정 전이에요", "자막 위치는 여기로 바뀔 예정"</span>
          <span class="dim">안내는 클라이언트 링크와 "안내 보내기"에 함께 담겨요.</span></div>`)
        : inbox.length ? inbox.map(r => {
          const its = r.items.filter(it => filter === 'all' || (it.st || 'open') === filter).sort((a, b) => a.t - b.t);
          if (!its.length) return '';
          return `<div class="group"><div class="group-head">${esc(r.from || '클라이언트')} · ${fmtDate(r.at)} · ${r.items.length}건</div>${its.map(it => card(it, r, label(it), fps, poster)).join('')}</div>`;
        }).join('') || '<div class="empty"><b>이 상태의 요청이 없어요</b></div>' : `<div class="empty">
          <b>아직 받은 수정요청이 없어요</b>
          <span>"설정 · 공유"에서 링크와 핀 번호를 클라이언트에게 보내 주세요.</span>
          <span>클라이언트가 메시지나 HTML 파일로 보냈다면 위의 "가져오기"를 쓰거나 파일을 이 화면에 끌어 놓으세요.</span>
          ${MODE === 'mock' ? '<span class="dim">시험 버전: 같은 브라우저에서 "클라이언트 화면"을 열어 보내면 여기에 바로 들어와요.</span>' : ''}</div>`}
      </div>`;
    bindMenu(side);
    if (V) V.render();
  };
  function card(it, r, n, fps, poster) {
    const st = it.st || 'open', sel = getSel() === it.id;
    return `<article class="item${sel ? ' sel' : ''} st-${st}" data-id="${it.id}" data-rid="${r.rid}">
      <div class="item-head"><span class="no">${n}</span><button class="tcbtn" data-seek title="이 시점으로">${tc(it.t, fps)}</button>
        <button class="icon-x" data-loop title="앞뒤 2초 반복 재생" aria-label="앞뒤 재생">${ic('loop', 15)}</button></div>
      <div data-zoom role="button" tabindex="0" aria-label="${n}번 크게 보기">${snapHTML(it, n, p.ar || [16, 9], poster)}</div>
      <p class="tx">${esc(it.tx || '(내용 없음)')}</p>
      ${statusSeg(st)}
      ${threadHTML(it, r.from)}
    </article>`;
  }
  function noteCard(it, fps, poster) {
    const n = label(it), sel = getSel() === it.id;
    const kind = it.x != null ? (it.s && it.s.length ? '핀 + 그림' : '핀') : it.s && it.s.length ? '그림' : '메모';
    return `<article class="item note${sel ? ' sel' : ''}" data-id="${it.id}" data-note>
      <div class="item-head"><span class="no d">${n}</span><button class="tcbtn" data-seek title="이 시점으로">${tc(it.t, fps)}</button><span class="kind">${kind}</span>
        <button class="icon-x" data-ndel aria-label="안내 삭제" title="삭제">${ic('trash', 15)}</button></div>
      <div data-zoom role="button" tabindex="0" aria-label="${n} 크게 보기">${snapHTML(it, n, p.ar || [16, 9], poster, V && V.needsShare() ? '장면 사진 없음 — 위 버튼으로 만들 수 있어요' : '장면 사진 없음')}</div>
      <textarea rows="2" placeholder="클라이언트에게 남길 안내를 적어 주세요" data-ntx>${esc(it.tx || '')}</textarea>
      ${(it.rp || []).length ? threadHTML(it, '클라이언트', true) : ''}
    </article>`;
  }
  function threadHTML(it, from, noteThread = false) {
    return `<div class="thread">${(it.rp || []).map(x => `<div class="rp ${x.by}"><b>${x.by === 'd' ? '나' : esc(x.n || from || '클라이언트')}</b><span>${esc(x.b)}</span><time>${fmtDate(x.at)}</time></div>`).join('')}
        ${noteThread ? '' : `<div class="qchips">${REPLY_CHIPS.map(c => `<button class="chipbtn" data-q>${esc(c)}</button>`).join('')}</div>`}
        <form class="reply" data-reply><input placeholder="${noteThread ? '답글' : '댓글로 답하기'}" aria-label="댓글"><button class="btn small" aria-label="댓글 달기">${ic('reply', 14)}</button></form>
      </div>`;
  }
  const statusSeg = st => `<div class="seg status" role="group" aria-label="반영 상태">${['open', 'doing', 'done', 'hold'].map(k => `<button class="btn st-${k}${st === k ? ' on' : ''}" data-st="${k}">${STATUS[k]}</button>`).join('')}</div>`;
  const update = (rid, id, f) => {
    const inbox = Store.inbox(p.id), r = inbox.find(x => x.rid === rid), it = r && r.items.find(x => x.id === id);
    if (!it) return; f(it); Store.saveInbox(p.id, inbox); draw();
  };
  const addReply = (rid, id, b) => update(rid, id, it => { it.rp = [...(it.rp || []), { by: 'd', n: p.by || '디렉터', b, at: Date.now() }]; if ((it.st || 'open') === 'open' && /반영하겠|반영할게/.test(b)) it.st = 'doing'; });
  const noteOf = id => (p.notes || []).find(n => n.id === id);
  const noteReply = (id, b) => { const n = noteOf(id); if (!n) return; n.rp = [...(n.rp || []), { by: 'd', n: p.by || '디렉터', b, at: Date.now() }]; saveNotes(); draw(); };
  const noteDelete = id => {
    const k = (p.notes || []).findIndex(n => n.id === id); if (k < 0) return;
    const [gone] = p.notes.splice(k, 1); saveNotes(); draw();
    toast(`안내를 지웠어요 <button class="link" data-undo>되돌리기</button>`, 4000);
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
        ? `<div class="zfrom d">디렉터 안내</div><label class="field"><span>안내 내용</span><textarea class="ztx-in" data-zntx rows="5" placeholder="클라이언트에게 남길 안내를 적어 주세요">${esc(it.tx || '')}</textarea></label>
          <div class="zacts"><button class="btn" data-zact="loop">${ic('loop', 14)}앞뒤 2초 재생</button><button class="btn ghost danger" data-zact="ndel">${ic('trash', 14)}삭제</button></div>
          ${threadHTML(it, '클라이언트', true)}`
        : `<div class="zfrom">${esc(it._from || '클라이언트')}</div><p class="ztx">${esc(it.tx || '(내용 없음)')}</p>
          ${statusSeg(it.st || 'open')}
          <div class="zacts"><button class="btn" data-zact="loop">${ic('loop', 14)}앞뒤 2초 재생</button></div>
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
  side.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-zoom]')) { e.preventDefault(); zoom(e.target.closest('.item').dataset.id); } });
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
        const ok = await modal({ title: '장면 사진 만들기', body: `<p class="note">이 탭 화면을 잠깐 공유해서 사진이 없는 ${items.filter(it => !it.th).length}개 장면을 자동으로 찍어요. 끝나면 공유는 바로 꺼져요.</p>`, actions: [{ label: '취소', value: null }, { label: `${ic('cam')}만들기`, kind: 'primary', value: 'go' }] });
        if (ok !== 'go') return;
      }
      const res = await V.makeThumbs(items, (i, n) => { tp.hidden = false; $('i', tp).style.width = i / n * 100 + '%'; $('span', tp).textContent = `장면 사진 만드는 중 ${i}/${n}`; });
      Store.saveInbox(p.id, inbox); saveNotes(); draw();
      toast(res.made ? `장면 사진 ${res.made}장을 만들었어요` : '장면 사진을 만들지 못했어요');
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
    if (e.target.closest('[data-zoom]')) { zoom(id); return; }
    setSel(id); if (isNote) activeNote = id;
    if (V) { V.P.pause(); V.P.seek(it.t); if (it.th) V.P.showFreeze(it.th, it.t); }
    $$('.item', side).forEach(c => c.classList.toggle('sel', c.dataset.id === id)); V && V.render();
  });
  side.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target.closest('[data-reply]'), cardEl = form.closest('.item'), b = $('input', form).value.trim(); if (!b) return;
    if (cardEl.hasAttribute('data-note')) { noteReply(cardEl.dataset.id, b); return; }
    addReply(cardEl.dataset.rid, cardEl.dataset.id, b);
    toast('댓글을 달았어요. 다 달았으면 "회신 보내기"로 돌려보내 주세요');
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
    const name = safeName(`${p.title || '프로젝트'}_${reqs.length ? '수정요청_회신' : '디렉터_안내'}_${new Date().toISOString().slice(0, 10)}`);
    if (kind === 'msg') { const r = await shareOrCopy({ title: p.title + (reqs.length ? ' 회신' : ' 안내'), text: feedbackMessage(p, reqs, link) }); toast(r === 'copied' ? '안내·회신 글과 확인 링크를 복사했어요. 카톡에 붙여 넣어 주세요' : r === 'shared' ? '공유했어요' : '복사하지 못했어요', 3600); }
    else if (kind === 'html') { await shareFile(name + '.html', reportHTML({ p, reqs, role: 'director', link })); toast('HTML을 내려받았어요'); }
    else printHTML(reportHTML({ p, reqs, role: 'director' }));
  }
  Store.onChange(k => {
    if (k === 'sd:inbox:' + p.id) { draw(); toast('수정요청이 새로 들어왔어요'); }
    else if (k === 'sd:projects') { const fresh = Store.getProject(p.id); if (fresh) { const before = JSON.stringify((p.notes || []).map(n => n.rp)); p.notes = fresh.notes || []; draw(); if (JSON.stringify(p.notes.map(n => n.rp)) !== before) toast('클라이언트가 안내에 답글을 달았어요'); } }
  });
  draw();
}

export { importDialog };

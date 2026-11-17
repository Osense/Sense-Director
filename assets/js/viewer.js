/* 재생 화면 — 무대(영상+주석), 도구, 재생 줄. 디렉터·클라이언트가 함께 쓴다. */
import { $, ic, tc, fpsLabel, esc, clamp } from './util.js';
import { createPlayer, Cap } from './player.js';
import { t, tn, lang, fmtDateL, fmtMD } from './i18n.js';

const r1 = n => Math.round(n * 10) / 10;

/** 스트로크를 SVG로 */
export function strokesSVG(strokes = [], cls = '') {
  if (!strokes.length) return '';
  const lines = strokes.map(s => { const pts = []; for (let i = 0; i < s.length; i += 2) pts.push(s[i] + ',' + s[i + 1]); return `<polyline points="${pts.join(' ')}"/>`; }).join('');
  // 투톤: 흰 테두리(o) 위에 본색(i)을 60% 굵기로 — 밝은 화면에서도 어두운 화면에서도 읽힌다
  return `<svg class="ann ${cls}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g class="o">${lines}</g><g class="i">${lines}</g></svg>`;
}
export const pinHTML = (it, n, extra = '') => it.x == null ? '' : `<span class="pin${it.y < 18 ? ' below' : ''}${it.by === 'd' ? ' d' : ''}${extra}" style="left:${it.x}%;top:${it.y}%"><b>${n}</b></span>`;

/** 대표 이미지(장면 사진이 없을 때 흐리게 깔아 둔다) */
export const posterOf = (src, given = '') => given || (src && src.k === 'yt' ? `https://i.ytimg.com/vi/${src.id}/hqdefault.jpg` : '');
/** 카드용 스냅샷: 이미지 위에 핀·그림을 다시 얹는다 */
export function snapHTML(it, n, ar = [16, 9], poster = '', emptyText = t('장면 사진 없음'), o = {}) {
  if (it.ar) ar = it.ar; // 문서는 쪽마다 크기가 다를 수 있다
  const img = it.th ? `<img src="${esc(it.th)}" alt="${n}${t('번 장면')}" loading="lazy">`
    : (poster ? `<img src="${esc(poster)}" alt="" class="fallback" loading="lazy">` : '') + `<span class="nosnap">${esc(emptyText)}</span>`;
  return `<div class="snap" style="aspect-ratio:${ar[0]}/${ar[1]}" title="${o.full ? t('누르면 이 장면으로 이동') : t('크게 보기')}">${img}${strokesSVG(it.s, it.by === 'd' ? 'd' : '')}${pinHTML(it, n)}${o.full
    ? `<button type="button" class="snap-full" data-full aria-label="${n} ${t('전체화면으로 보기')}" title="${t('전체화면으로 장면·수정사항 보기')}">${ic('expand', 15)}</button>`
    : `<span class="snap-zoom" aria-hidden="true">${ic('expand', 14)}</span>`}</div>`;
}

/**
 * mountViewer(root, src, opts)
 * opts.tools: 핀·펜 도구 표시
 * opts.items(): 화면에 다시 그릴 수정 포인트 목록
 * opts.onPin({x,y}), opts.onStroke(points), opts.onMeta(meta), opts.onReady(info), opts.onError(msg)
 */
export function mountViewer(root, src, opts = {}) {
  const DOC = !!src && src.k === 'doc';
  document.documentElement.classList.toggle('doc-mode', DOC);
  if (DOC) return mountDoc(root, src, opts);
  root.innerHTML = `
  <div class="viewer">
    <div class="stage" tabindex="-1"></div>
    ${opts.tools ? `<div class="toolbar">
      <div class="seg tools" role="group" aria-label="${t('주석 도구')}">
        <button class="btn on" data-tool="pin" title="${t('핀 (P)')}">${ic('pin')}${t('핀')}</button>
        <button class="btn" data-tool="pen" title="${t('펜 (D)')}">${ic('pen')}${t('펜')}<i class="swatch" aria-hidden="true"></i></button>
        <button class="btn" data-tool="hand" title="${t('손 (H) — 영상 플레이어를 직접 조작: 화질·자막·볼륨')}">${ic('hand')}${t('손')}</button>
      </div>
      <button class="btn ghost" data-act="memo" title="${t('핀 없이 지금 시점에 메모 (M)')}">${ic('note')}${t('메모만')}</button>
      <span class="tool-hint" data-hint>${t('화면을 누르면 영상이 멈추고 그 시점이 오른쪽에 붙어요')}</span>
    </div>` : ''}
    <div class="controls">
      <button class="btn icon play" data-act="play" aria-label="${t('재생 (Space)')}" title="${t('재생 / 정지 (Space, K)')}">${ic('play', 18)}</button>
      <button class="btn icon" data-act="prev" aria-label="${t('1프레임 뒤로')}" title="${t('1프레임 뒤로 ( , )')}">${ic('prev', 15)}</button>
      <button class="btn icon" data-act="next" aria-label="${t('1프레임 앞으로')}" title="${t('1프레임 앞으로 ( . )')}">${ic('next', 15)}</button>
      <div class="tc" data-tc title="${t('시:분:초:프레임')}">00:00:00:00</div>
      <div class="scrub"><div class="track"><i class="fill"></i><div class="marks"></div></div><input type="range" min="0" max="1" step="0.001" value="0" aria-label="${t('재생 위치')}"></div>
      <div class="dur" data-dur>00:00:00:00</div>
      <select class="speed" aria-label="${t('재생 속도')}" title="${t('재생 속도')}"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>
      <span class="chip fps" data-fps title="${t('프레임 수')}">fps</span>
    </div>
  </div>`;
  $('.viewer', root).dataset.mine = opts.mine || 'c';
  const stage = $('.stage', root), scrub = $('.scrub input', root), fill = $('.fill', root), marks = $('.marks', root);
  let tool = 'pin', dragging = false, live = null, lastT = 0;
  const V = { tool: () => tool, root, setTool };

  const P = createPlayer(stage, src, {
    onReady: info => { opts.onReady && opts.onReady(info); updateTime(P.time()); renderMarks(); },
    onState: playing => { $('[data-act=play]', root).innerHTML = ic(playing ? 'pause' : 'play', 18); render(); },
    onMeta: m => { updateFps(); opts.onMeta && opts.onMeta(m); render(); },
    onError: msg => { stage.insertAdjacentHTML('beforeend', `<div class="stage-err"><b>${t('영상을 열 수 없어요')}</b><span>${esc(msg)}</span></div>`); opts.onError && opts.onError(msg); },
    onTime: t => { lastT = t; updateTime(t); },
  }, !opts.tools); // 주석 도구가 없는 미리보기는 처음부터 플레이어 자체 컨트롤을 켠다
  V.P = P;
  const overlay = P.overlay;
  const ZM = videoZoom(root, stage, P, () => tool); // Ctrl + 휠 · 두 손가락 확대
  V.zoomAt = ZM.zoomAt; V.resetZoom = ZM.reset; V.zoom = ZM.z;
  stage.addEventListener('zoomgesture', () => { if (live) { live = null; render(); } });

  function updateFps() {
    const el = $('[data-fps]', root);
    const how = P.fpsHow === 'measured' ? t('재생하며 측정') : P.fpsHow === 'title' ? t('영상 정보') : t('측정 전 — 재생하면 자동으로 맞춰요');
    el.textContent = P.fps ? fpsLabel(P.fps) : '30fps?';
    el.title = t('프레임 수: ') + (P.fps ? fpsLabel(P.fps) : t('아직 모름(30 기준)')) + ' · ' + how;
    el.classList.toggle('measured', P.fpsHow === 'measured');
  }
  function updateTime(t) {
    const d = P.duration() || 0, f = P.effFps();
    $('[data-tc]', root).textContent = tc(t, f);
    $('[data-dur]', root).textContent = tc(d, f);
    if (!dragging && d) { scrub.max = d; scrub.value = t; fill.style.width = (t / d * 100) + '%'; }
    if (Math.abs(t - (V._drawnAt ?? -1)) > 0.02) render();
  }
  function renderMarks() {
    const d = P.duration(); if (!d || !opts.items) { marks.innerHTML = ''; return; }
    marks.innerHTML = opts.items().map((it, i) => `<i class="st-${it.by === 'd' ? 'd' : it.st || 'open'}" style="left:${clamp(it.t / d * 100, 0, 100)}%" title="${opts.label ? opts.label(it, i) : i + 1} · ${tc(it.t, P.effFps())}"></i>`).join('');
  }
  /** 지금 시점에 해당하는 핀·그림만 다시 그린다 */
  let lastHtml = null; // 마지막으로 그린 표시
  function render() {
    if (!opts.items) return;
    const t = P.time(), f = P.effFps(), paused = P.paused(), items = opts.items();
    V._drawnAt = t;
    const win = paused ? 0.5 / f + 0.02 : 0.8; // 재생 중에는 그 장면을 지난 뒤 잠깐만 보인다
    const sel = opts.selected && opts.selected();
    let html = '';
    items.forEach((it, i) => {
      const near = paused ? Math.abs(it.t - t) <= win : (t >= it.t - 0.05 && t <= it.t + win);
      if (!near && it.id !== sel) return;
      if (!near && it.id === sel && Math.abs(it.t - t) > win) return;
      html += strokesSVG(it.s, (it.id === sel ? 'sel ' : '') + (it.by === 'd' ? 'd' : '')) + pinHTML(it, opts.label ? opts.label(it, i) : i + 1, it.id === sel ? ' sel' : '');
    });
    if (live) html += strokesSVG([live], 'live' + (opts.mine === 'd' ? ' d' : ''));
    // 바뀐 것이 있을 때만 다시 그린다 — 재생 중 매 프레임 다시 그리면 핀 등장 애니메이션이 계속 되풀이되어 깜빡인다
    if (html !== lastHtml) { overlay.innerHTML = html; lastHtml = html; }
    renderMarks();
  }
  V.render = render; V.renderMarks = renderMarks;

  async function setTool(name) {
    const was = tool;
    tool = name;
    root.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === name));
    overlay.dataset.tool = name;
    const h = $('[data-hint]', root);
    if (h) h.textContent = name === 'pen' ? t('화면에 그리면 영상이 멈추고, 이어 그린 획은 같은 메모에 붙어요')
      : name === 'hand' ? (P.kind === 'yt' ? t('유튜브 화면을 직접 눌러 조작해요 — 화질·자막은 오른쪽 아래 톱니바퀴에서') : P.kind === 'vimeo' ? t('비메오 화면을 직접 조작해요 — 화질·자막은 플레이어 메뉴에서') : t('플레이어를 직접 조작해요 — 자막·전체 화면은 플레이어 메뉴에서'))
      : t('화면을 누르면 영상이 멈추고 그 시점이 오른쪽에 붙어요');
    // 손 도구일 때만 플레이어 자체 컨트롤을 켠다 (핀·펜일 때는 깨끗한 화면) — 플레이어 메뉴가 잘리지 않게 확대는 풀어 둔다
    if (name === 'hand') ZM.reset();
    if (opts.tools && (name === 'hand') !== (was === 'hand')) {
      root.classList.add('switching-tool');
      await P.setNative(name === 'hand');
      root.classList.remove('switching-tool');
    }
  }
  setTool(opts.tools ? 'pin' : 'none');

  // 확대했을 때는 더 촘촘하게 기록한다
  const pos = e => { const r = overlay.getBoundingClientRect(), k = ZM.z() > 1.5 ? 100 : 10, rr = n => Math.round(n * k) / k; return [rr(clamp((e.clientX - r.left) / r.width * 100, 0, 100)), rr(clamp((e.clientY - r.top) / r.height * 100, 0, 100))]; };
  if (opts.tools) {
    overlay.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !P.ready() || ZM.gesturing()) return;
      e.preventDefault();
      if (tool === 'pin') {
        // 터치는 손을 뗄 때 찍는다 — 두 번째 손가락이 오면 확대로
        if (e.pointerType === 'touch') { overlay._pin = { id: e.pointerId, at: pos(e) }; return; }
        const [x, y] = pos(e); opts.onPin && opts.onPin({ x, y }); return;
      }
      if (tool === 'pen') {
        if (!P.paused()) P.pause();
        overlay.setPointerCapture(e.pointerId); live = pos(e); render();
      }
    });
    overlay.addEventListener('pointermove', e => { if (!live || ZM.gesturing()) return; const [x, y] = pos(e); const n = live.length; if (Math.hypot(x - live[n - 2], y - live[n - 1]) > 0.35 / ZM.z()) { live.push(x, y); render(); } });
    const end = e => {
      if (overlay._pin && e && overlay._pin.id === e.pointerId) { const p = overlay._pin; overlay._pin = null; if (!ZM.gesturing() && e.type === 'pointerup') { const [x, y] = p.at; opts.onPin && opts.onPin({ x, y }); } return; }
      if (!live) return; const s = live; live = null; if (s.length < 4) s.push(s[0] + 0.1 / ZM.z(), s[1] + 0.1 / ZM.z()); opts.onStroke && opts.onStroke(s); render();
    };
    overlay.addEventListener('pointerup', end); overlay.addEventListener('pointercancel', end);
    root.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
    $('[data-act=memo]', root).addEventListener('click', () => opts.onMemo && opts.onMemo());
  }
  $('[data-act=play]', root).addEventListener('click', () => P.toggle());
  $('[data-act=prev]', root).addEventListener('click', () => P.step(-1));
  $('[data-act=next]', root).addEventListener('click', () => P.step(1));
  scrub.addEventListener('input', () => { dragging = true; const d = P.duration(); fill.style.width = (scrub.value / (d || 1) * 100) + '%'; $('[data-tc]', root).textContent = tc(+scrub.value, P.effFps()); });
  scrub.addEventListener('change', () => { dragging = false; P.seek(+scrub.value); });
  $('.speed', root).addEventListener('change', e => P.setRate(+e.target.value));
  marks.addEventListener('click', e => e.stopPropagation());
  updateFps();

  V.destroy = () => { P.destroy(); };
  /**
   * 장면 사진 한 번에 만들기 — 작업 중에는 화면 공유 없이, 보낼 때만.
   * 영상 주소·파일은 바로 찍고, 유튜브·비메오는 이 탭 화면 공유를 잠깐 켜서 찍은 뒤 끈다.
   */
  V.needsShare = () => !P.live();
  V.canShare = () => P.live() || Cap.supported();
  V.makeThumbs = async (items, onProgress = () => {}) => {
    const need = items.filter(it => !it.th);
    if (!need.length) return { made: 0, need: 0 };
    if (tool === 'hand') await setTool('pin'); // 장면 사진에 플레이어 메뉴가 찍히지 않게
    const live = P.live();
    const t0 = P.time(); P.pause();
    const z0 = ZM.save(); ZM.reset(); // 화면에서 찍는 장면 사진은 원래 크기로
    // 핀·그림 층을 먼저 숨긴 뒤 화면 공유를 시작한다 → 첫 프레임부터 깨끗한 장면
    stage.classList.add('capturing'); root.classList.add('thumbing'); P.hideFreeze();
    if (!live) {
      const fail = reason => { stage.classList.remove('capturing'); root.classList.remove('thumbing'); ZM.restore(z0); return { made: 0, need: need.length, reason }; };
      if (!Cap.supported()) return fail('unsupported');
      if (!await Cap.start(stage)) return fail(Cap.err === 'NotAllowedError' ? 'denied' : 'error');
    }
    let made = 0;
    try {
      for (let i = 0; i < need.length; i++) {
        onProgress(i, need.length);
        const img = await P.grabAt(need[i].t);
        if (img) { need[i].th = img; made++; }
      }
      onProgress(need.length, need.length);
    } finally {
      stage.classList.remove('capturing'); root.classList.remove('thumbing');
      if (!live) Cap.stop();
      P.seek(t0); P.pause(); ZM.restore(z0); render();
    }
    return { made, need: need.length };
  };
  /** 공통 단축키 */
  V.key = e => {
    const k = e.key;
    if (k === ' ' || k === 'k' || k === 'K') { e.preventDefault(); P.toggle(); return true; }
    if (k === ',') { P.step(-1); return true; }
    if (k === '.') { P.step(1); return true; }
    // 방향키: 한 프레임씩(멈춘 채로) · Shift와 함께면 1초
    if (k === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? P.seek(P.time() - 1) : P.step(-1); return true; }
    if (k === 'ArrowRight') { e.preventDefault(); e.shiftKey ? P.seek(P.time() + 1) : P.step(1); return true; }
    if (k === 'j' || k === 'J') { P.seek(P.time() - 5); return true; }
    if (k === 'l' || k === 'L') { P.seek(P.time() + 5); return true; }
    if (k === '+' || k === '=') { ZM.zoomAt(ZM.z() * 1.5); return true; }
    if (k === '-' || k === '_') { ZM.zoomAt(ZM.z() / 1.5); return true; }
    if (k === '0') { ZM.reset(); return true; }
    if (opts.tools && (k === 'p' || k === 'P')) { setTool('pin'); return true; }
    if (opts.tools && (k === 'd' || k === 'D')) { setTool('pen'); return true; }
    if (opts.tools && (k === 'm' || k === 'M')) { opts.onMemo && opts.onMemo(); return true; }
    if (opts.tools && (k === 'h' || k === 'H')) { setTool(tool === 'hand' ? 'pin' : 'hand'); return true; }
    return false;
  };
  V.loopAround = (t, pad = 2) => {
    const a = Math.max(0, t - pad), b = t + pad;
    P.seek(a); P.play();
    clearInterval(V._loop);
    V._loop = setInterval(() => { if (P.paused()) { clearInterval(V._loop); return; } if (P.time() >= b) { P.pause(); P.seek(t); clearInterval(V._loop); } }, 80);
  };
  return V;
}

/* ============================================================
   문서(PDF·PPT·사진) — 재생 줄 없이 표시 도구만.
   확대해서 세밀하게 그리고, 미니맵·쪽 목록으로 이동한다.
   ============================================================ */
const ZMIN = 1, ZMAX = 8;
function mountDoc(root, src, opts) {
  const unit = src.dt === 'pptx' || src.dt === 'canva' ? t('슬라이드') : src.dt === 'img' ? t('사진') : t('쪽');
  root.innerHTML = `
  <div class="viewer doc">
    <div class="docbody">
      <nav class="pages" data-pages aria-label="${t('쪽 목록')}" hidden></nav>
      <div class="stage" tabindex="-1"></div>
    </div>
    <div class="toolbar doc-bar">
      ${opts.tools ? `<div class="seg tools" role="group" aria-label="${t('주석 도구')}">
        <button class="btn on" data-tool="pin" title="${t('핀 (P)')}">${ic('pin')}${t('핀')}</button>
        <button class="btn" data-tool="pen" title="${t('펜 (D)')}">${ic('pen')}${t('펜')}<i class="swatch" aria-hidden="true"></i></button>
        <button class="btn" data-tool="hand" title="${t('이동 (H) — 확대한 화면을 끌어서 옮겨요')}">${ic('hand')}${t('이동')}</button>
      </div>
      <button class="btn ghost" data-act="memo" title="${t('핀 없이 이 쪽에 메모 (M)')}">${ic('note')}${t('메모만')}</button>` : ''}
      <span class="grow"></span>
      <div class="pager" data-pager>
        <button class="btn icon ghost" data-act="pprev" aria-label="${t('이전')}" title="${t('이전 (←)')}">${ic('chevL', 16)}</button>
        <span class="pnum"><b data-tc>1</b><span>/</span><span data-dur>1</span><small>${unit}</small></span>
        <button class="btn icon ghost" data-act="pnext" aria-label="${t('다음')}" title="${t('다음 (→)')}">${ic('chevR', 16)}</button>
      </div>
      <div class="zoomer seg" role="group" aria-label="${t('확대')}">
        <button class="btn icon" data-act="zout" aria-label="${t('축소')}" title="${t('축소 (-)')}">${ic('minus', 15)}</button>
        <button class="btn zpct" data-act="zfit" title="${t('화면에 맞추기 (0)')}" data-zpct>100%</button>
        <button class="btn icon" data-act="zin" aria-label="${t('확대')}" title="${t('확대 (+) — Ctrl + 휠, 두 손가락으로도')}">${ic('plus', 15)}</button>
      </div>
    </div>
    ${opts.tools ? `<div class="doc-hint" data-hint>${t('누르면 그 자리에 핀이 붙어요 · Ctrl + 휠이나 두 손가락으로 확대해 세밀하게 그려요')}</div>` : ''}
  </div>`;
  $('.viewer', root).dataset.mine = opts.mine || 'c';
  const stage = $('.stage', root), rail = $('[data-pages]', root);
  let tool = 'pin', live = null, z = 1, tx = 0, ty = 0, gesture = null;
  const V = { tool: () => tool, root, setTool };
  const P = createPlayer(stage, src, {
    onReady: () => { updatePage(); buildRail(); opts.onReady && opts.onReady({ duration: P.duration() }); },
    onMeta: m => { opts.onMeta && opts.onMeta(m); },
    onError: msg => { stage.insertAdjacentHTML('beforeend', `<div class="stage-err"><b>${t('문서를 열 수 없어요')}</b><span>${esc(msg)}</span></div>`); opts.onError && opts.onError(msg); },
    onTime: () => { resetZoom(); updatePage(); render(); },
  });
  V.P = P;
  const overlay = P.overlay, pan = $('.pan', stage);
  stage.insertAdjacentHTML('beforeend', `<div class="navmap" data-navmap hidden><img alt=""><i class="navrect"></i></div>`);
  const navmap = $('[data-navmap]', stage), navImg = $('img', navmap), navRect = $('.navrect', navmap);

  /* ---------- 쪽 ---------- */
  function updatePage() {
    if (!P.ready()) return;
    $('[data-tc]', root).textContent = P.time() + 1;
    $('[data-dur]', root).textContent = P.duration() + 1;
    $('[data-act=pprev]', root).disabled = P.time() <= 0;
    $('[data-act=pnext]', root).disabled = P.time() >= P.duration();
    $('[data-pager]', root).hidden = P.duration() < 1;
    rail.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('on', +b.dataset.page === P.time()));
    const on = rail.querySelector('.on'); on && on.scrollIntoView({ block: 'nearest' });
    navImg.removeAttribute('src'); navThumb();
  }
  const thumbs = new Map();
  const getThumb = i => thumbs.get(i) || (thumbs.set(i, P.thumb(i, 220).catch(() => '')), thumbs.get(i));
  async function navThumb() { const i = P.time(), u = await getThumb(i); if (i === P.time() && u) navImg.src = u; }
  async function buildRail() {
    const n = P.duration() + 1;
    if (n < 2) { rail.hidden = true; return; }
    rail.hidden = false;
    rail.innerHTML = Array.from({ length: n }, (_, i) => `<button type="button" data-page="${i}" class="${i === P.time() ? 'on' : ''}" aria-label="${tc(i, P.effFps())}"><span class="pthumb"><img alt="" hidden></span><span class="plabel">${i + 1}</span><i class="pcount" hidden></i></button>`).join('');
    railCounts();
    for (let i = 0; i < n; i++) { // 앞쪽부터 차례로 작은 그림을 만든다
      if (P.destroyed) return;
      const u = await getThumb(i), im = rail.querySelector(`[data-page="${i}"] img`);
      if (u && im) { im.src = u; im.hidden = false; }
    }
  }
  function railCounts() {
    if (rail.hidden || !opts.items) return;
    const c = {}; opts.items().forEach(it => { const k = Math.round(it.t); c[k] = (c[k] || 0) + 1; });
    rail.querySelectorAll('[data-page]').forEach(b => { const n = c[b.dataset.page] || 0, el = $('.pcount', b); el.hidden = !n; el.textContent = n; });
  }
  rail.addEventListener('click', e => { const b = e.target.closest('[data-page]'); if (b) P.seek(+b.dataset.page); });

  /* ---------- 핀·그림 ---------- */
  let lastDocHtml = null;
  function render() {
    if (!opts.items) return;
    const pg = P.time(), items = opts.items(), sel = opts.selected && opts.selected();
    let html = '';
    items.forEach((it, i) => {
      if (Math.round(it.t) !== pg) return;
      html += strokesSVG(it.s, (it.id === sel ? 'sel ' : '') + (it.by === 'd' ? 'd' : '')) + pinHTML(it, opts.label ? opts.label(it, i) : i + 1, it.id === sel ? ' sel' : '');
    });
    if (live) html += strokesSVG([live], 'live' + (opts.mine === 'd' ? ' d' : ''));
    if (html !== lastDocHtml) { overlay.innerHTML = html; lastDocHtml = html; }
    railCounts();
  }
  V.render = render; V.renderMarks = railCounts;

  function setTool(name) {
    tool = name;
    root.querySelectorAll('.toolbar [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === name));
    overlay.dataset.tool = name; stage.dataset.tool = name;
    const h = $('[data-hint]', root);
    if (h) h.textContent = name === 'pen' ? t('그려서 표시해요 — 이어 그린 획은 같은 메모에 붙어요 · 확대하면 더 세밀하게')
      : name === 'hand' ? t('끌어서 확대한 화면을 옮겨요 · 두 번 누르면 2배 / 맞춤')
      : t('누르면 그 자리에 핀이 붙어요 · Ctrl + 휠이나 두 손가락으로 확대해 세밀하게 그려요');
  }
  setTool(opts.tools ? 'pin' : 'hand');

  /* ---------- 확대·이동 ---------- */
  const boxOf = () => { const s = overlay.style; return { x: parseFloat(s.left) || 0, y: parseFloat(s.top) || 0, w: parseFloat(s.width) || 1, h: parseFloat(s.height) || 1 }; };
  function clampPan() {
    const b = boxOf(), cw = stage.clientWidth, ch = stage.clientHeight;
    const fit = (lo, size, view, cur) => size * z <= view ? view / 2 - z * (lo + size / 2) : Math.min(-z * lo, Math.max(view - z * (lo + size), cur));
    tx = fit(b.x, b.w, cw, tx); ty = fit(b.y, b.h, ch, ty);
  }
  function apply() {
    clampPan();
    pan.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
    pan.style.setProperty('--z', z);
    stage.classList.toggle('zoomed', z > 1.001);
    $('[data-zpct]', root).textContent = Math.round(z * 100) + '%';
    $('[data-act=zout]', root).disabled = z <= ZMIN + 0.001;
    $('[data-act=zin]', root).disabled = z >= ZMAX - 0.001;
    P.setZoom && P.setZoom(Math.min(4, Math.ceil(z * 2) / 2));
    updateNav();
  }
  function zoomAt(nz, cx = stage.clientWidth / 2, cy = stage.clientHeight / 2) {
    nz = clamp(nz, ZMIN, ZMAX);
    // 손가락·마우스 아래 지점이 그대로 있도록
    tx = cx - (cx - tx) * nz / z; ty = cy - (cy - ty) * nz / z; z = nz;
    apply();
  }
  function resetZoom() { z = 1; tx = 0; ty = 0; apply(); }
  V.zoomAt = zoomAt; V.resetZoom = resetZoom; V.zoom = () => z;
  function updateNav() {
    navmap.hidden = z <= 1.001;
    if (navmap.hidden) return;
    const b = boxOf(), cw = stage.clientWidth, ch = stage.clientHeight;
    navmap.style.aspectRatio = `${b.w} / ${b.h}`;
    const fx = v => clamp(((v - tx) / z - b.x) / b.w, 0, 1), fy = v => clamp(((v - ty) / z - b.y) / b.h, 0, 1);
    const l = fx(0), r = fx(cw), tp = fy(0), bt = fy(ch);
    Object.assign(navRect.style, { left: l * 100 + '%', top: tp * 100 + '%', width: (r - l) * 100 + '%', height: (bt - tp) * 100 + '%' });
  }
  // 미니맵: 누르거나 끌면 그 자리를 가운데로
  const navTo = e => {
    const r = navmap.getBoundingClientRect(), b = boxOf();
    const fx = clamp((e.clientX - r.left) / r.width, 0, 1), fy = clamp((e.clientY - r.top) / r.height, 0, 1);
    tx = stage.clientWidth / 2 - z * (b.x + fx * b.w); ty = stage.clientHeight / 2 - z * (b.y + fy * b.h); apply();
  };
  navmap.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); try { navmap.setPointerCapture(e.pointerId); } catch {} navmap._drag = true; navTo(e); });
  navmap.addEventListener('pointermove', e => { if (navmap._drag) navTo(e); });
  navmap.addEventListener('pointerup', () => { navmap._drag = false; });
  new ResizeObserver(() => apply()).observe(stage);

  // 휠: Ctrl(⌘)·트랙패드 집기 = 확대, 확대 중엔 이동, 아니면 쪽 넘기기
  let wheelAcc = 0, wheelAt = 0;
  stage.addEventListener('wheel', e => {
    if (!P.ready()) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) { zoomAt(z * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025) * (e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 50 ? 4 : 1)), e.clientX - r.left, e.clientY - r.top); return; }
    if (z > 1.001) { tx -= e.deltaX; ty -= e.deltaY; apply(); return; }
    if (Date.now() - wheelAt < 380) return;
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) > 90) { P.step(wheelAcc > 0 ? 1 : -1); wheelAcc = 0; wheelAt = Date.now(); }
  }, { passive: false });

  // 손가락 두 개 = 확대·이동, 이동 도구·가운데 버튼 = 끌어 옮기기
  const touches = new Map();
  let panDrag = null;
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('.navmap')) return;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size === 2) {
        live = null; render(); // 그리던 획은 버리고 확대로
        const [a, b] = [...touches.values()];
        gesture = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, tx, ty };
        e.stopPropagation(); e.preventDefault(); return;
      }
    }
    if (tool === 'hand' || e.button === 1) {
      e.preventDefault(); try { stage.setPointerCapture(e.pointerId); } catch {}
      panDrag = { x: e.clientX, y: e.clientY, tx, ty }; stage.classList.add('panning');
    }
  }, true);
  stage.addEventListener('pointermove', e => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (gesture && touches.size >= 2) {
      e.stopPropagation();
      const [a, b] = [...touches.values()], r = stage.getBoundingClientRect();
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const nz = clamp(gesture.z * d / (gesture.d || 1), ZMIN, ZMAX), ox = gesture.mx - r.left, oy = gesture.my - r.top;
      tx = ox - (ox - gesture.tx) * nz / gesture.z + (mx - gesture.mx); ty = oy - (oy - gesture.ty) * nz / gesture.z + (my - gesture.my); z = nz;
      apply(); return;
    }
    if (panDrag) { tx = panDrag.tx + e.clientX - panDrag.x; ty = panDrag.ty + e.clientY - panDrag.y; apply(); }
  }, true);
  const up = e => {
    touches.delete(e.pointerId);
    if (gesture) { if (touches.size < 2) gesture = null; e.stopPropagation(); }
    if (panDrag) { panDrag = null; stage.classList.remove('panning'); }
  };
  stage.addEventListener('pointerup', up, true); stage.addEventListener('pointercancel', up, true);
  stage.addEventListener('dblclick', e => { if (tool !== 'hand') return; const r = stage.getBoundingClientRect(); z > 1.001 ? resetZoom() : zoomAt(2, e.clientX - r.left, e.clientY - r.top); });

  /* ---------- 표시 도구 ---------- */
  // 확대할수록 더 촘촘하게 기록해 세밀한 선이 각지지 않게
  const pos = e => { const r = overlay.getBoundingClientRect(), k = z > 1.5 ? 100 : 10, rr = n => Math.round(n * k) / k; return [rr(clamp((e.clientX - r.left) / r.width * 100, 0, 100)), rr(clamp((e.clientY - r.top) / r.height * 100, 0, 100))]; };
  if (opts.tools) {
    overlay.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !P.ready() || gesture) return;
      e.preventDefault();
      if (tool === 'pin') {
        if (e.pointerType === 'touch') { overlay._pin = { id: e.pointerId, e: [e.clientX, e.clientY], at: pos(e) }; return; } // 두 번째 손가락이 오면 확대로
        const [x, y] = pos(e); opts.onPin && opts.onPin({ x, y }); return;
      }
      if (tool === 'pen') { overlay.setPointerCapture(e.pointerId); live = pos(e); render(); }
    });
    overlay.addEventListener('pointermove', e => {
      if (!live || gesture) return;
      const [x, y] = pos(e), n = live.length;
      if (Math.hypot(x - live[n - 2], y - live[n - 1]) > 0.35 / z) { live.push(x, y); render(); }
    });
    const end = e => {
      if (overlay._pin && e && overlay._pin.id === e.pointerId) { const p = overlay._pin; overlay._pin = null; if (!gesture && e.type === 'pointerup') { const [x, y] = p.at; opts.onPin && opts.onPin({ x, y }); } return; }
      if (!live) return; const s = live; live = null; if (s.length < 4) s.push(s[0] + 0.1 / z, s[1] + 0.1 / z); opts.onStroke && opts.onStroke(s); render();
    };
    overlay.addEventListener('pointerup', end); overlay.addEventListener('pointercancel', end);
    root.querySelectorAll('.toolbar [data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
    $('[data-act=memo]', root).addEventListener('click', () => opts.onMemo && opts.onMemo());
  }
  $('[data-act=pprev]', root).addEventListener('click', () => P.step(-1));
  $('[data-act=pnext]', root).addEventListener('click', () => P.step(1));
  $('[data-act=zin]', root).addEventListener('click', () => zoomAt(z * 1.5));
  $('[data-act=zout]', root).addEventListener('click', () => zoomAt(z / 1.5));
  $('[data-act=zfit]', root).addEventListener('click', () => resetZoom());

  V.destroy = () => P.destroy();
  // 캔바처럼 그림을 직접 읽을 수 없는 문서는 보낼 때 화면 공유로 찍는다
  V.needsShare = () => P.ready() && !P.live(); V.canShare = () => P.live() || Cap.supported();
  V.makeThumbs = async (items, onProgress = () => {}) => {
    const need = items.filter(it => !it.th);
    if (!need.length) return { made: 0, need: 0 };
    const live = P.live(), page0 = P.time();
    if (!live) {
      resetZoom(); stage.classList.add('capturing'); root.classList.add('thumbing');
      const fail = reason => { stage.classList.remove('capturing'); root.classList.remove('thumbing'); return { made: 0, need: need.length, reason }; };
      if (!Cap.supported()) return fail('unsupported');
      if (!await Cap.start(stage)) return fail(Cap.err === 'NotAllowedError' ? 'denied' : 'error');
    }
    try {
      for (let i = 0; i < need.length; i++) { onProgress(i, need.length); need[i].th = await P.grabAt(need[i].t); if (!need[i].ar) need[i].ar = P.pageAr(Math.round(need[i].t)); }
      onProgress(need.length, need.length);
    } finally {
      if (!live) { stage.classList.remove('capturing'); root.classList.remove('thumbing'); Cap.stop(); P.seek(page0); }
    }
    return { made: need.filter(x => x.th).length, need: need.length };
  };
  V.key = e => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'PageUp' || k === ',') { e.preventDefault(); P.step(-1); return true; }
    if (k === 'ArrowRight' || k === 'PageDown' || k === '.') { e.preventDefault(); P.step(1); return true; }
    if (k === 'Home') { P.seek(0); return true; }
    if (k === 'End') { P.seek(P.duration()); return true; }
    if (k === '+' || k === '=') { zoomAt(z * 1.5); return true; }
    if (k === '-' || k === '_') { zoomAt(z / 1.5); return true; }
    if (k === '0') { resetZoom(); return true; }
    if (opts.tools && (k === 'p' || k === 'P')) { setTool('pin'); return true; }
    if (opts.tools && (k === 'd' || k === 'D')) { setTool('pen'); return true; }
    if (opts.tools && (k === 'm' || k === 'M')) { opts.onMemo && opts.onMemo(); return true; }
    if (opts.tools && (k === 'h' || k === 'H')) { setTool(tool === 'hand' ? 'pin' : 'hand'); return true; }
    return false;
  };
  V.loopAround = x => P.seek(x); // 문서는 그 쪽으로 이동만
  apply();
  return V;
}

/* ============================================================
   영상 확대 — Ctrl(⌘) + 휠, 트랙패드 집기, 두 손가락, + − 0 키.
   확대 중에는 휠·가운데 버튼 끌기·미니맵으로 옮긴다. 핀·그림 좌표는 그대로 맞는다.
   ============================================================ */
function videoZoom(root, stage, P, getTool) {
  const pan = $('.pan', stage), overlay = P.overlay;
  let z = 1, tx = 0, ty = 0, gesture = null, drag = null;
  stage.insertAdjacentHTML('beforeend', `
    <div class="vzoom" data-vzoom hidden>
      <button type="button" class="btn icon ghost" data-vz="out" aria-label="${t('축소')}" title="${t('축소 (-)')}">${ic('minus', 14)}</button>
      <b data-vzpct>100%</b>
      <button type="button" class="btn icon ghost" data-vz="in" aria-label="${t('확대')}" title="${t('확대 (+)')}">${ic('plus', 14)}</button>
      <button type="button" class="btn ghost small" data-vz="fit" title="${t('화면에 맞추기 (0)')}">${t('맞춤')}</button>
    </div>
    <div class="navmap vnav" data-vnav hidden><canvas></canvas><i class="navrect"></i></div>`);
  const bar = $('[data-vzoom]', stage), nav = $('[data-vnav]', stage), navRect = $('.navrect', nav), navCv = $('canvas', nav);
  const box = () => { const s = overlay.style; return { x: parseFloat(s.left) || 0, y: parseFloat(s.top) || 0, w: parseFloat(s.width) || stage.clientWidth, h: parseFloat(s.height) || stage.clientHeight }; };
  function clampPan() {
    const b = box(), cw = stage.clientWidth, ch = stage.clientHeight;
    const fit = (lo, size, view, cur) => size * z <= view ? view / 2 - z * (lo + size / 2) : Math.min(-z * lo, Math.max(view - z * (lo + size), cur));
    tx = fit(b.x, b.w, cw, tx); ty = fit(b.y, b.h, ch, ty);
  }
  function apply() {
    if (z <= 1.001) { z = 1; tx = 0; ty = 0; } else clampPan();
    pan.style.transform = z === 1 ? '' : `translate(${tx}px, ${ty}px) scale(${z})`;
    pan.style.setProperty('--z', z);
    stage.classList.toggle('zoomed', z > 1);
    bar.hidden = z === 1; nav.hidden = z === 1;
    $('[data-vzpct]', bar).textContent = Math.round(z * 100) + '%';
    if (z > 1) updateNav();
  }
  function updateNav() {
    const b = box(), cw = stage.clientWidth, ch = stage.clientHeight;
    nav.style.aspectRatio = `${b.w} / ${b.h}`;
    const fx = v => clamp(((v - tx) / z - b.x) / b.w, 0, 1), fy = v => clamp(((v - ty) / z - b.y) / b.h, 0, 1);
    const l = fx(0), r = fx(cw), tp = fy(0), bt = fy(ch);
    Object.assign(navRect.style, { left: l * 100 + '%', top: tp * 100 + '%', width: (r - l) * 100 + '%', height: (bt - tp) * 100 + '%' });
    // 영상 파일은 지금 장면을 작게 그려 둔다 (유튜브·비메오는 틀만)
    const v = stage.querySelector('.media video');
    if (v && v.readyState >= 2) { try { navCv.width = 160; navCv.height = Math.round(160 * b.h / b.w); navCv.getContext('2d').drawImage(v, 0, 0, navCv.width, navCv.height); } catch {} }
  }
  function zoomAt(nz, cx = stage.clientWidth / 2, cy = stage.clientHeight / 2) {
    nz = clamp(nz, 1, 8);
    tx = cx - (cx - tx) * nz / z; ty = cy - (cy - ty) * nz / z; z = nz; apply();
  }
  const reset = () => { z = 1; apply(); };
  // 휠: Ctrl·⌘(트랙패드 집기 포함) = 확대 / 확대 중 휠 = 이동 / 그 밖에는 페이지 스크롤 그대로
  stage.addEventListener('wheel', e => {
    if (!P.ready() || getTool() === 'hand') return;
    const r = stage.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomAt(z * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025) * (e.ctrlKey && Math.abs(e.deltaY) < 50 ? 4 : 1)), e.clientX - r.left, e.clientY - r.top); return; }
    if (z > 1) { e.preventDefault(); tx -= e.deltaX; ty -= e.deltaY; apply(); }
  }, { passive: false });
  // 두 손가락 = 확대·이동, 가운데 버튼 끌기 = 이동
  const touches = new Map();
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('.vzoom, .vnav') || getTool() === 'hand') return;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        gesture = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, tx, ty };
        overlay._pin = null; stage.dispatchEvent(new CustomEvent('zoomgesture'));
        e.stopPropagation(); e.preventDefault(); return;
      }
    }
    if (e.button === 1 && z > 1) { e.preventDefault(); try { stage.setPointerCapture(e.pointerId); } catch {} drag = { x: e.clientX, y: e.clientY, tx, ty }; stage.classList.add('panning'); }
  }, true);
  stage.addEventListener('pointermove', e => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (gesture && touches.size >= 2) {
      e.stopPropagation();
      const [a, b] = [...touches.values()], r = stage.getBoundingClientRect();
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const nz = clamp(gesture.z * d / (gesture.d || 1), 1, 8), ox = gesture.mx - r.left, oy = gesture.my - r.top;
      tx = ox - (ox - gesture.tx) * nz / gesture.z + (mx - gesture.mx); ty = oy - (oy - gesture.ty) * nz / gesture.z + (my - gesture.my); z = nz; apply(); return;
    }
    if (drag) { tx = drag.tx + e.clientX - drag.x; ty = drag.ty + e.clientY - drag.y; apply(); }
  }, true);
  const up = e => { touches.delete(e.pointerId); if (gesture && touches.size < 2) { gesture = null; e.stopPropagation(); } if (drag) { drag = null; stage.classList.remove('panning'); } };
  stage.addEventListener('pointerup', up, true); stage.addEventListener('pointercancel', up, true);
  bar.addEventListener('click', e => { const b = e.target.closest('[data-vz]'); if (!b) return; e.stopPropagation(); b.dataset.vz === 'in' ? zoomAt(z * 1.5) : b.dataset.vz === 'out' ? zoomAt(z / 1.5) : reset(); });
  const navTo = e => { const r = nav.getBoundingClientRect(), b = box(); tx = stage.clientWidth / 2 - z * (b.x + clamp((e.clientX - r.left) / r.width, 0, 1) * b.w); ty = stage.clientHeight / 2 - z * (b.y + clamp((e.clientY - r.top) / r.height, 0, 1) * b.h); apply(); };
  nav.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); try { nav.setPointerCapture(e.pointerId); } catch {} nav._drag = true; navTo(e); });
  nav.addEventListener('pointermove', e => { if (nav._drag) navTo(e); });
  nav.addEventListener('pointerup', () => { nav._drag = false; });
  new ResizeObserver(() => { if (z > 1) apply(); }).observe(stage);
  // 재생 중 미니맵 장면 갱신
  const tick = setInterval(() => { if (!stage.isConnected) return clearInterval(tick); if (z > 1 && !P.paused()) updateNav(); }, 300);
  return { zoomAt, reset, z: () => z, gesturing: () => !!gesture, save: () => ({ z, tx, ty }), restore: s => { if (s) { z = s.z; tx = s.tx; ty = s.ty; apply(); } }, update: () => { if (z > 1) updateNav(); } };
}

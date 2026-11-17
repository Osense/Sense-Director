/* 재생 화면 — 무대(영상+주석), 도구, 재생 줄. 디렉터·클라이언트가 함께 쓴다. */
import { $, ic, tc, fpsLabel, esc, clamp } from './util.js';
import { createPlayer, Cap } from './player.js';

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
export function snapHTML(it, n, ar = [16, 9], poster = '', emptyText = '장면 사진 없음', o = {}) {
  const img = it.th ? `<img src="${esc(it.th)}" alt="${n}번 장면" loading="lazy">`
    : (poster ? `<img src="${esc(poster)}" alt="" class="fallback" loading="lazy">` : '') + `<span class="nosnap">${esc(emptyText)}</span>`;
  return `<div class="snap" style="aspect-ratio:${ar[0]}/${ar[1]}" title="${o.full ? '누르면 이 장면으로 이동' : '크게 보기'}">${img}${strokesSVG(it.s, it.by === 'd' ? 'd' : '')}${pinHTML(it, n)}${o.full
    ? `<button type="button" class="snap-full" data-full aria-label="${n} 전체화면으로 보기" title="전체화면으로 장면·수정사항 보기">${ic('expand', 15)}</button>`
    : `<span class="snap-zoom" aria-hidden="true">${ic('expand', 14)}</span>`}</div>`;
}

/**
 * mountViewer(root, src, opts)
 * opts.tools: 핀·펜 도구 표시
 * opts.items(): 화면에 다시 그릴 수정 포인트 목록
 * opts.onPin({x,y}), opts.onStroke(points), opts.onMeta(meta), opts.onReady(info), opts.onError(msg)
 */
export function mountViewer(root, src, opts = {}) {
  root.innerHTML = `
  <div class="viewer">
    <div class="stage" tabindex="-1"></div>
    ${opts.tools ? `<div class="toolbar">
      <div class="seg tools" role="group" aria-label="주석 도구">
        <button class="btn on" data-tool="pin" title="핀 (P)">${ic('pin')}핀</button>
        <button class="btn" data-tool="pen" title="펜 (D)">${ic('pen')}펜<i class="swatch" aria-hidden="true"></i></button>
        <button class="btn" data-tool="hand" title="손 (H) — 영상 플레이어를 직접 조작: 화질·자막·볼륨">${ic('hand')}손</button>
      </div>
      <button class="btn ghost" data-act="memo" title="핀 없이 지금 시점에 메모 (M)">${ic('note')}메모만</button>
      <span class="tool-hint" data-hint>화면을 누르면 영상이 멈추고 그 시점이 오른쪽에 붙어요</span>
    </div>` : ''}
    <div class="controls">
      <button class="btn icon play" data-act="play" aria-label="재생 (Space)" title="재생 / 정지 (Space, K)">${ic('play', 18)}</button>
      <button class="btn icon" data-act="prev" aria-label="1프레임 뒤로" title="1프레임 뒤로 ( , )">${ic('prev', 15)}</button>
      <button class="btn icon" data-act="next" aria-label="1프레임 앞으로" title="1프레임 앞으로 ( . )">${ic('next', 15)}</button>
      <div class="tc" data-tc title="시:분:초:프레임">00:00:00:00</div>
      <div class="scrub"><div class="track"><i class="fill"></i><div class="marks"></div></div><input type="range" min="0" max="1" step="0.001" value="0" aria-label="재생 위치"></div>
      <div class="dur" data-dur>00:00:00:00</div>
      <select class="speed" aria-label="재생 속도" title="재생 속도"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>
      <span class="chip fps" data-fps title="프레임 수">fps</span>
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
    onError: msg => { stage.insertAdjacentHTML('beforeend', `<div class="stage-err"><b>영상을 열 수 없어요</b><span>${esc(msg)}</span></div>`); opts.onError && opts.onError(msg); },
    onTime: t => { lastT = t; updateTime(t); },
  }, !opts.tools); // 주석 도구가 없는 미리보기는 처음부터 플레이어 자체 컨트롤을 켠다
  V.P = P;
  const overlay = P.overlay;

  function updateFps() {
    const el = $('[data-fps]', root);
    const how = P.fpsHow === 'measured' ? '재생하며 측정' : P.fpsHow === 'title' ? '영상 정보' : '측정 전 — 재생하면 자동으로 맞춰요';
    el.textContent = P.fps ? fpsLabel(P.fps) : '30fps?';
    el.title = '프레임 수: ' + (P.fps ? fpsLabel(P.fps) : '아직 모름(30 기준)') + ' · ' + how;
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
  function render() {
    if (!opts.items) return;
    const t = P.time(), f = P.effFps(), paused = P.paused(), items = opts.items();
    V._drawnAt = t;
    const win = paused ? 0.5 / f + 0.02 : 1.2;
    const sel = opts.selected && opts.selected();
    let html = '';
    items.forEach((it, i) => {
      const near = paused ? Math.abs(it.t - t) <= win : (t >= it.t - 0.05 && t <= it.t + win);
      if (!near && it.id !== sel) return;
      if (!near && it.id === sel && Math.abs(it.t - t) > win) return;
      html += strokesSVG(it.s, (it.id === sel ? 'sel ' : '') + (it.by === 'd' ? 'd' : '')) + pinHTML(it, opts.label ? opts.label(it, i) : i + 1, it.id === sel ? ' sel' : '');
    });
    if (live) html += strokesSVG([live], 'live' + (opts.mine === 'd' ? ' d' : ''));
    overlay.innerHTML = html;
    renderMarks();
  }
  V.render = render; V.renderMarks = renderMarks;

  async function setTool(t) {
    const was = tool;
    tool = t;
    root.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    overlay.dataset.tool = t;
    const h = $('[data-hint]', root);
    if (h) h.textContent = t === 'pen' ? '화면에 그리면 영상이 멈추고, 이어 그린 획은 같은 메모에 붙어요'
      : t === 'hand' ? (P.kind === 'yt' ? '유튜브 화면을 직접 눌러 조작해요 — 화질·자막은 오른쪽 아래 톱니바퀴에서' : P.kind === 'vimeo' ? '비메오 화면을 직접 조작해요 — 화질·자막은 플레이어 메뉴에서' : '플레이어를 직접 조작해요 — 자막·전체 화면은 플레이어 메뉴에서')
      : '화면을 누르면 영상이 멈추고 그 시점이 오른쪽에 붙어요';
    // 손 도구일 때만 플레이어 자체 컨트롤을 켠다 (핀·펜일 때는 깨끗한 화면)
    if (opts.tools && (t === 'hand') !== (was === 'hand')) {
      root.classList.add('switching-tool');
      await P.setNative(t === 'hand');
      root.classList.remove('switching-tool');
    }
  }
  setTool(opts.tools ? 'pin' : 'none');

  const pos = e => { const r = overlay.getBoundingClientRect(); return [r1(clamp((e.clientX - r.left) / r.width * 100, 0, 100)), r1(clamp((e.clientY - r.top) / r.height * 100, 0, 100))]; };
  if (opts.tools) {
    overlay.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !P.ready()) return;
      e.preventDefault();
      if (tool === 'pin') { const [x, y] = pos(e); opts.onPin && opts.onPin({ x, y }); return; }
      if (tool === 'pen') {
        if (!P.paused()) P.pause();
        overlay.setPointerCapture(e.pointerId); live = pos(e); render();
      }
    });
    overlay.addEventListener('pointermove', e => { if (!live) return; const [x, y] = pos(e); const n = live.length; if (Math.hypot(x - live[n - 2], y - live[n - 1]) > 0.35) { live.push(x, y); render(); } });
    const end = () => { if (!live) return; const s = live; live = null; if (s.length < 4) s.push(s[0] + 0.1, s[1] + 0.1); opts.onStroke && opts.onStroke(s); render(); };
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
    // 핀·그림 층을 먼저 숨긴 뒤 화면 공유를 시작한다 → 첫 프레임부터 깨끗한 장면
    stage.classList.add('capturing'); root.classList.add('thumbing'); P.hideFreeze();
    if (!live) {
      const fail = reason => { stage.classList.remove('capturing'); root.classList.remove('thumbing'); return { made: 0, need: need.length, reason }; };
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
      P.seek(t0); P.pause(); render();
    }
    return { made, need: need.length };
  };
  /** 공통 단축키 */
  V.key = e => {
    const k = e.key;
    if (k === ' ' || k === 'k' || k === 'K') { e.preventDefault(); P.toggle(); return true; }
    if (k === ',') { P.step(-1); return true; }
    if (k === '.') { P.step(1); return true; }
    if (k === 'ArrowLeft') { e.preventDefault(); P.seek(P.time() - (e.shiftKey ? 5 : 1)); return true; }
    if (k === 'ArrowRight') { e.preventDefault(); P.seek(P.time() + (e.shiftKey ? 5 : 1)); return true; }
    if (k === 'j' || k === 'J') { P.seek(P.time() - 5); return true; }
    if (k === 'l' || k === 'L') { P.seek(P.time() + 5); return true; }
    if (opts.tools && (k === 'p' || k === 'P')) { setTool('pin'); return true; }
    if (opts.tools && (k === 'd' || k === 'D')) { setTool('pen'); return true; }
    if (opts.tools && (k === 'm' || k === 'M')) { opts.onMemo && opts.onMemo(); return true; }
    if (opts.tools && (k === 'h' || k === 'H')) { setTool(tool === 'hand' ? 'pin' : 'hand'); return true; }
    return false;
  };
  /** 수정 포인트 앞뒤로 반복 재생 */
  V.loopAround = (t, pad = 2) => {
    const a = Math.max(0, t - pad), b = t + pad;
    P.seek(a); P.play();
    clearInterval(V._loop);
    V._loop = setInterval(() => { if (P.paused()) { clearInterval(V._loop); return; } if (P.time() >= b) { P.pause(); P.seek(t); clearInterval(V._loop); } }, 80);
  };
  return V;
}

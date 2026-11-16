/* 플레이어 — 유튜브와 영상 주소(mp4 등)를 같은 방식으로 다룬다.
   화면비·프레임 수는 묻지 않고 알아서 알아낸다. */
import { sleep, snapFps } from './util.js';

/* ---------- 유튜브 API ---------- */
let ytApi = null;
function loadYt() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApi) return ytApi;
  ytApi = new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev && prev(); res(); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytApi = null; rej(new Error('load')); };
    document.head.appendChild(s);
    setTimeout(() => { if (!(window.YT && window.YT.Player)) { ytApi = null; rej(new Error('timeout')); } }, 15000);
  });
  return ytApi;
}

/** 유튜브 영상 정보(제목·화면비·제목 속 fps)를 미리 알아낸다 */
export async function probeYouTube(src) {
  const out = { title: '', ar: src.short ? [9, 16] : [16, 9], fps: 0, how: src.short ? 'shorts' : 'default' };
  try {
    const r = await fetch('https://noembed.com/embed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + src.id));
    const j = await r.json();
    if (j.title) out.title = j.title;
    if (j.width && j.height && !src.short) { out.ar = j.height > j.width ? [9, 16] : [16, 9]; out.how = 'oembed'; }
    const m = (j.title || '').match(/(\d{2,3}(?:\.\d+)?)\s*fps/i);
    if (m) out.fps = snapFps(+m[1]);
  } catch {}
  return out;
}

/* ---------- 탭 화면 캡처: 유튜브 장면 스냅샷용 ---------- */
export const Cap = {
  stream: null, track: null, vid: null, active: false, cropped: false, err: '', stage: null, listeners: new Set(),
  supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia); },
  emit() { this.listeners.forEach(f => f(this)); },
  async start(stage) {
    this.stage = stage || this.stage;
    if (this.active) return true;
    if (!this.supported()) { this.err = 'unsupported'; this.emit(); return false; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser', frameRate: { ideal: 60 } }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude', systemAudio: 'exclude' });
      const track = stream.getVideoTracks()[0];
      const v = this.vid || (this.vid = document.createElement('video'));
      v.muted = true; v.playsInline = true; v.srcObject = stream; await v.play();
      this.cropped = false;
      if (window.CropTarget && track.cropTo && this.stage) { try { await track.cropTo(await CropTarget.fromElement(this.stage)); this.cropped = true; } catch {} }
      Object.assign(this, { stream, track, active: true, err: '' });
      track.addEventListener('ended', () => this.stop());
      this.emit(); return true;
    } catch (e) { this.err = (e && e.name) || 'error'; this.active = false; this.emit(); return false; }
  },
  stop() { if (this.stream) this.stream.getTracks().forEach(t => t.stop()); Object.assign(this, { stream: null, track: null, active: false }); if (this.vid) this.vid.srcObject = null; this.emit(); },
  /** 화면에서 영상 영역(rect)만 잘라 낸다 */
  grab(rect, width = 1280) {
    const v = this.vid;
    if (!this.active || !v || !v.videoWidth || !rect.width) return '';
    let kx, ky, ox, oy;
    if (this.cropped && this.stage) { const st = this.stage.getBoundingClientRect(); kx = v.videoWidth / st.width; ky = v.videoHeight / st.height; ox = st.left; oy = st.top; }
    else { kx = v.videoWidth / innerWidth; ky = v.videoHeight / innerHeight; ox = 0; oy = 0; }
    const sx = (rect.left - ox) * kx, sy = (rect.top - oy) * ky, sw = rect.width * kx, sh = rect.height * ky;
    const W = Math.min(width, Math.round(sw)) || width, H = Math.max(1, Math.round(W * sh / sw));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    try { c.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, W, H); return c.toDataURL('image/jpeg', 0.78); } catch { return ''; }
  },
};

/* 화면비를 가장 간단한 정수비로 (1280x720 → 16:9, 1080x1920 → 9:16) */
function ratio([w, h]) {
  const known = [[16, 9], [9, 16], [4, 3], [3, 4], [1, 1], [21, 9], [239, 100], [185, 100], [4, 5], [2, 1]];
  for (const [a, b] of known) if (Math.abs(w / h - a / b) < 0.012) return [a, b];
  const g = (a, b) => b ? g(b, a % b) : a, d = g(Math.round(w), Math.round(h)) || 1;
  return [Math.round(w / d), Math.round(h / d)];
}

/* ---------- 프레임 수 추정: 연속 프레임 간격의 하위 분위수 ---------- */
function estimate(intervals) {
  if (intervals.length < 12) return 0;
  const s = [...intervals].sort((a, b) => a - b);
  const q = s[Math.floor(s.length * 0.3)];
  const near = s.filter(x => Math.abs(x - q) / q < 0.25);
  const avg = near.reduce((a, b) => a + b, 0) / near.length;
  return snapFps(1 / avg);
}

/**
 * createPlayer(stage, src, hooks)
 * stage 안에 .media(영상), img.freeze(정지 화면), .overlay(주석)를 만든다.
 * hooks: onReady({title,duration}), onState(playing), onMeta({ar,fps,fpsHow}), onError(msg), onTime(t)
 */
export function createPlayer(stage, src, hooks = {}) {
  stage.innerHTML = '<div class="media"></div><img class="freeze" alt="" hidden><div class="overlay"></div>';
  const media = stage.querySelector('.media'), freeze = stage.querySelector('.freeze'), overlay = stage.querySelector('.overlay');
  const P = {
    kind: src.k, src, ar: src.k === 'yt' && src.short ? [9, 16] : [16, 9], fps: 0, fpsHow: '', title: '', _ready: false, stage, overlay, destroyed: false,
    ready() { return this._ready; },
    contentRect() { return overlay.getBoundingClientRect(); },
    setMeta(m) {
      if (m.ar) m.ar = ratio(m.ar);
      let changed = false;
      if (m.ar && (m.ar[0] !== this.ar[0] || m.ar[1] !== this.ar[1])) { this.ar = m.ar; changed = true; this.layout(); }
      if (m.fps && (!this.fps || m.force || (this.fpsHow !== 'measured' && m.how === 'measured'))) { this.fps = m.fps; this.fpsHow = m.how || 'auto'; changed = true; }
      if (m.title && !this.title) { this.title = m.title; changed = true; }
      if (changed) hooks.onMeta && hooks.onMeta({ ar: this.ar, fps: this.fps, fpsHow: this.fpsHow, title: this.title });
    },
    layout() {
      const cw = stage.clientWidth, ch = stage.clientHeight, [vw, vh] = this.ar;
      const s = Math.min(cw / vw, ch / vh), w = vw * s, h = vh * s;
      const css = { left: (cw - w) / 2 + 'px', top: (ch - h) / 2 + 'px', width: w + 'px', height: h + 'px' };
      Object.assign(overlay.style, css); Object.assign(freeze.style, css);
    },
    showFreeze(img, t) { freeze.src = img; freeze.dataset.t = t; freeze.hidden = false; },
    hideFreeze() { freeze.hidden = true; },
    effFps() { return this.fps || 30; },
    step(n) { this.pause(); this.seek(this.time() + n / this.effFps() + (n > 0 ? 0.0005 : -0.0005)); },
    toggle() { this.paused() ? this.play() : this.pause(); },
  };
  new ResizeObserver(() => P.layout()).observe(stage);
  P.layout();

  if (src.k === 'url') initVideo(P, media, src, hooks);
  else initYouTube(P, media, src, hooks, freeze);
  return P;
}

function initVideo(P, media, src, hooks) {
  const v = document.createElement('video');
  v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.src = src.url;
  media.appendChild(v);
  let triedNoCors = false;
  v.addEventListener('error', () => {
    if (!triedNoCors) { triedNoCors = true; v.removeAttribute('crossorigin'); v.src = src.url; return; }
    hooks.onError && hooks.onError('영상을 불러오지 못했어요. 링크가 영상 파일(mp4·webm)로 바로 열리는지 확인해 주세요.');
  });
  v.addEventListener('loadedmetadata', () => {
    P._ready = true; P.setMeta({ ar: [v.videoWidth || 16, v.videoHeight || 9] });
    hooks.onReady && hooks.onReady({ title: decodeURIComponent((src.url.split('/').pop() || '').split('?')[0]), duration: v.duration });
  });
  v.addEventListener('play', () => hooks.onState && hooks.onState(true));
  v.addEventListener('pause', () => hooks.onState && hooks.onState(false));
  v.addEventListener('timeupdate', () => hooks.onTime && hooks.onTime(v.currentTime));
  // 프레임 수 측정: 한 프레임씩 넘어갈 때의 영상 시간 간격
  const iv = []; let last = null;
  if ('requestVideoFrameCallback' in v) {
    const cb = (now, md) => {
      if (P.destroyed) return;
      if (last && md.presentedFrames === last.n + 1 && v.playbackRate === 1) { const d = md.mediaTime - last.t; if (d > 0.004 && d < 0.1) iv.push(d); }
      last = { n: md.presentedFrames, t: md.mediaTime };
      if (iv.length >= 30 && P.fpsHow !== 'measured') { const f = estimate(iv); if (f) P.setMeta({ fps: f, how: 'measured' }); }
      if (P.fpsHow !== 'measured') v.requestVideoFrameCallback(cb);
    };
    v.requestVideoFrameCallback(cb);
  }
  Object.assign(P, {
    el: v,
    time: () => v.currentTime || 0, duration: () => v.duration || 0, paused: () => v.paused,
    play() { v.play().catch(() => {}); }, pause() { v.pause(); },
    seek(t) { v.currentTime = Math.max(0, Math.min(v.duration || t, t)); },
    rate: () => v.playbackRate, setRate(r) { v.playbackRate = r; },
    setVolume(x) { v.volume = x; },
    async snapshot() {
      if (!v.paused) v.pause();
      const W = Math.min(1280, v.videoWidth || 1280), H = Math.round(W * (v.videoHeight || 9) / (v.videoWidth || 16));
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      try { c.getContext('2d').drawImage(v, 0, 0, W, H); return { t: v.currentTime, img: c.toDataURL('image/jpeg', 0.8) }; }
      catch { return { t: v.currentTime, img: '' }; }
    },
    needsCapture: () => false,
    destroy() { P.destroyed = true; v.pause(); v.removeAttribute('src'); v.load(); },
  });
}

function initYouTube(P, media, src, hooks, freeze) {
  let player = null, state = -1, dur = 0, wantPaused = false, busy = null;
  probeYouTube(src).then(m => { if (!P.destroyed) P.setMeta({ ar: m.ar, fps: m.fps, how: m.fps ? 'title' : '', title: m.title }); });
  const playing = () => state === 1 || state === 3;
  const run = f => { try { return f(); } catch { return undefined; } };

  // 탭 캡처가 켜져 있으면 화면 변화 간격으로 원본 프레임 수를 잰다
  const iv = []; let prevSig = null, prevAt = 0;
  const sig = document.createElement('canvas'); sig.width = 32; sig.height = 18;
  const sctx = sig.getContext('2d', { willReadFrequently: true });
  function measure() {
    if (P.destroyed) return;
    const cv = Cap.vid;
    if (Cap.active && cv && cv.videoWidth && playing() && run(() => player.getPlaybackRate()) === 1 && P.fpsHow !== 'measured') {
      const r = P.contentRect();
      const img = Cap.grab(r, 64);
      if (img) {
        const im = new Image();
        im.onload = () => {
          sctx.drawImage(im, 0, 0, 32, 18);
          const d = sctx.getImageData(0, 0, 32, 18).data; let s = 0;
          if (prevSig) for (let i = 0; i < d.length; i += 4) s += Math.abs(d[i] - prevSig[i]);
          const now = performance.now();
          if (prevSig && s > 300) { if (prevAt) { const dt = (now - prevAt) / 1000; if (dt > 0.008 && dt < 0.09) iv.push(dt); } prevAt = now; }
          prevSig = d;
          if (iv.length >= 40) { const f = estimate(iv); if (f) P.setMeta({ fps: f, how: 'measured' }); }
        };
        im.src = img;
      }
    }
    if (Cap.vid && 'requestVideoFrameCallback' in Cap.vid && Cap.active) Cap.vid.requestVideoFrameCallback(measure);
    else setTimeout(measure, 16);
  }
  setTimeout(measure, 500);

  const hideFreeze = () => P.hideFreeze();
  async function cleanGrab() {
    // 유튜브 정지 화면에는 버튼·제목이 덮이므로 아주 느리게 재생하는 순간을 잡는다
    const wasMuted = run(() => player.isMuted()), rate = run(() => player.getPlaybackRate()) || 1;
    if (!playing()) { run(() => { player.mute(); player.setPlaybackRate(0.25); player.playVideo(); }); }
    P.stage.classList.add('capturing'); hideFreeze();
    try {
      for (let i = 0; i < 60 && state !== 1; i++) await sleep(50);
      await sleep(state === 1 ? 90 : 0);
      const img = Cap.grab(P.contentRect(), 1280), t = run(() => player.getCurrentTime()) || 0;
      wantPaused = true; run(() => player.pauseVideo());
      if (img) P.showFreeze(img, t);
      return { t, img };
    } finally {
      P.stage.classList.remove('capturing');
      run(() => { player.pauseVideo(); player.setPlaybackRate(rate); if (!wasMuted) player.unMute(); });
    }
  }

  Object.assign(P, {
    time: () => run(() => player.getCurrentTime()) || 0,
    duration: () => { const d = run(() => player.getDuration()); if (d) dur = d; return dur; },
    paused: () => wantPaused || !playing(),
    play() { wantPaused = false; hideFreeze(); run(() => player.playVideo()); },
    pause() { wantPaused = true; run(() => player.pauseVideo()); },
    seek(t) {
      hideFreeze(); run(() => player.seekTo(Math.max(0, t), true));
      if (Cap.active && P.paused()) { clearTimeout(P._st); P._st = setTimeout(() => { if (!busy) busy = cleanGrab().finally(() => busy = null); }, 220); }
    },
    rate: () => run(() => player.getPlaybackRate()) || 1, setRate(r) { run(() => player.setPlaybackRate(r)); },
    setVolume(x) { run(() => player.setVolume(Math.round(x * 100))); },
    needsCapture: () => !Cap.active && Cap.supported(),
    async snapshot() {
      const t0 = P.time();
      if (!Cap.active) { P.pause(); return { t: t0, img: '' }; }
      if (busy) await busy;
      if (!freeze.hidden && Math.abs(+freeze.dataset.t - P.time()) < 0.06 && P.paused()) return { t: +freeze.dataset.t, img: freeze.src };
      if (playing()) { const img = Cap.grab(P.contentRect(), 1280), t = P.time(); P.pause(); if (img) P.showFreeze(img, t); return { t, img }; }
      busy = cleanGrab(); try { return await busy; } finally { busy = null; }
    },
    destroy() { P.destroyed = true; run(() => player.destroy()); },
  });

  loadYt().then(() => {
    if (P.destroyed) return;
    media.innerHTML = '<div class="ytframe"></div>';
    player = new YT.Player(media.firstChild, {
      width: '100%', height: '100%', videoId: src.id,
      playerVars: { enablejsapi: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1, fs: 0, iv_load_policy: 3, origin: location.origin },
      events: {
        onReady: e => {
          P._ready = true; dur = e.target.getDuration() || 0;
          const title = run(() => e.target.getVideoData().title) || '';
          P.setMeta({ title });
          hooks.onReady && hooks.onReady({ title, duration: dur });
        },
        onStateChange: e => {
          state = e.data;
          if (state === 1 && !P.stage.classList.contains('capturing')) hideFreeze();
          if (!P.stage.classList.contains('capturing')) hooks.onState && hooks.onState(playing() && !wantPaused);
        },
        onError: e => {
          const c = e.data;
          hooks.onError && hooks.onError(c === 100 ? '영상을 찾을 수 없어요. 삭제되거나 비공개로 바뀌었는지 확인해 주세요.'
            : (c === 101 || c === 150) ? '이 영상은 다른 사이트에서 재생(퍼가기)이 막혀 있어요. 유튜브 스튜디오에서 "퍼가기 허용"을 켜 주세요.'
              : c === 2 ? '링크 형식을 알아볼 수 없어요.' : '유튜브 재생 오류 (' + c + ')');
        },
      },
    });
  }).catch(() => hooks.onError && hooks.onError('유튜브 플레이어를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));

  // 시간 갱신
  const tick = () => { if (P.destroyed) return; if (P._ready && hooks.onTime) hooks.onTime(P.time()); setTimeout(tick, 120); };
  tick();
}

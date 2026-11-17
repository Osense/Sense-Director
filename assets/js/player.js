/* 플레이어 — 유튜브·비메오·영상 주소·영상 파일을 같은 방식으로 다룬다.
   화면비·프레임 수는 묻지 않고 알아서 알아낸다.
   작업 중에는 화면 공유를 쓰지 않는다(지연 없음). 장면 사진은 보낼 때 grabAt()으로 한 번에 만든다. */
import { sleep, snapFps, esc } from './util.js';
import { getMedia, putMedia, fmtSize } from './media.js';
import { initDoc, DOC_FPS } from './doc.js';
import { t, tn, lang, fmtDateL, fmtMD } from './i18n.js';

const loadScript = (src, ok) => new Promise((res, rej) => {
  if (ok()) return res();
  const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('load'));
  document.head.appendChild(s);
  setTimeout(() => ok() ? res() : rej(new Error('timeout')), 15000);
});
let ytApi = null;
function loadYt() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  return ytApi || (ytApi = new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev && prev(); res(); };
    loadScript('https://www.youtube.com/iframe_api', () => window.YT && window.YT.Player).catch(e => { ytApi = null; rej(e); });
  }));
}
const loadVimeo = () => loadScript('https://player.vimeo.com/api/player.js', () => window.Vimeo && window.Vimeo.Player);
const fpsFromTitle = t => { const m = (t || '').match(/(\d{2,3}(?:\.\d+)?)\s*fps/i); return m ? snapFps(+m[1]) : 0; };

/** 영상 정보(제목·화면비·대표 이미지·제목 속 fps)를 미리 알아낸다 */
export async function probe(src) {
  if (src.k === 'yt') {
    const out = { title: '', ar: src.short ? [9, 16] : [16, 9], fps: 0, poster: `https://i.ytimg.com/vi/${src.id}/hqdefault.jpg` };
    try {
      const j = await (await fetch('https://noembed.com/embed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + src.id))).json();
      if (j.title) out.title = j.title;
      if (j.width && j.height && !src.short && j.height > j.width) out.ar = [9, 16];
      out.fps = fpsFromTitle(j.title);
    } catch {}
    return out;
  }
  if (src.k === 'vimeo') {
    const out = { title: '', ar: [16, 9], fps: 0, poster: '' };
    try {
      const u = 'https://vimeo.com/' + src.id + (src.h ? '/' + src.h : '');
      const j = await (await fetch('https://vimeo.com/api/oembed.json?width=1280&url=' + encodeURIComponent(u))).json();
      out.title = j.title || ''; out.poster = j.thumbnail_url || '';
      if (j.width && j.height) out.ar = [j.width, j.height];
      out.fps = fpsFromTitle(j.title);
    } catch {}
    return out;
  }
  if (src.k === 'doc') return { title: (src.name || decodeURIComponent((src.url || '').split(/[?#]/)[0].split('/').pop() || '')).replace(/\.[^.]+$/, ''), ar: null, fps: DOC_FPS[src.dt] || -1, poster: '' };
  if (src.k === 'file') return { title: (src.name || '').replace(/\.[^.]+$/, ''), ar: [16, 9], fps: 0, poster: '' };
  return { title: decodeURIComponent((src.url.split('/').pop() || '').split('?')[0]).replace(/\.[^.]+$/, ''), ar: [16, 9], fps: 0, poster: '' };
}
export const probeYouTube = probe;

/* ---------- 탭 화면 캡처: 보낼 때 장면 사진을 한 번에 만들 때만 잠깐 쓴다 ---------- */
export const Cap = {
  stream: null, track: null, vid: null, active: false, cropped: false, err: '', stage: null,
  supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !matchMedia('(pointer:coarse)').matches; },
  async start(stage) {
    this.stage = stage || this.stage;
    if (this.active) return true;
    if (!this.supported()) { this.err = 'unsupported'; return false; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser', frameRate: { ideal: 30 } }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude', systemAudio: 'exclude' });
      const track = stream.getVideoTracks()[0];
      const v = this.vid || (this.vid = document.createElement('video'));
      v.muted = true; v.playsInline = true; v.srcObject = stream; await v.play();
      this.cropped = false;
      if (window.CropTarget && track.cropTo && this.stage) { try { await track.cropTo(await CropTarget.fromElement(this.stage)); this.cropped = true; } catch {} }
      Object.assign(this, { stream, track, active: true, err: '' });
      track.addEventListener('ended', () => this.stop());
      await sleep(250);
      return true;
    } catch (e) { this.err = (e && e.name) || 'error'; this.active = false; return false; }
  },
  /** 화면이 바뀐 뒤의 새 프레임을 기다린다(탭 캡처는 화면이 바뀔 때만 프레임을 보낸다) */
  fresh(n = 2, ms = 600) {
    const v = this.vid; if (!v || !('requestVideoFrameCallback' in v)) return sleep(120);
    return new Promise(res => { let k = 0; const f = () => { if (++k >= n) res(); else v.requestVideoFrameCallback(f); }; v.requestVideoFrameCallback(f); setTimeout(res, ms); });
  },
  stop() { if (this.stream) this.stream.getTracks().forEach(t => t.stop()); Object.assign(this, { stream: null, track: null, active: false }); if (this.vid) this.vid.srcObject = null; },
  /** 화면에서 영상 영역(rect)만 잘라 낸다 */
  grab(rect, width = 1280) {
    const v = this.vid;
    if (!this.active || !v || !v.videoWidth || !rect.width) return '';
    // 잘라 내기(cropTo)가 실제로 먹었는지는 프레임 모양으로 판단한다 — 성공했다고 해도 안 먹는 환경이 있다
    let kx, ky, ox, oy;
    const vr = v.videoWidth / v.videoHeight, st = this.stage && this.stage.getBoundingClientRect();
    const isCropped = st && st.width && Math.abs(vr - st.width / st.height) < Math.abs(vr - innerWidth / innerHeight);
    if (isCropped) { kx = v.videoWidth / st.width; ky = v.videoHeight / st.height; ox = st.left; oy = st.top; }
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
/* 프레임 수 추정: 연속 프레임 간격의 하위 분위수 */
function estimate(intervals) {
  if (intervals.length < 12) return 0;
  const s = [...intervals].sort((a, b) => a - b), q = s[Math.floor(s.length * 0.3)];
  const near = s.filter(x => Math.abs(x - q) / q < 0.25);
  return snapFps(1 / (near.reduce((a, b) => a + b, 0) / near.length));
}

/**
 * createPlayer(stage, src, hooks)
 * hooks: onReady({title,duration}), onState(playing), onMeta({ar,fps,fpsHow,title,poster}), onError(msg), onTime(t)
 */
export function createPlayer(stage, src, hooks = {}, startNative = false) {
  const inner = '<div class="media"></div><img class="freeze" alt="" hidden><div class="overlay"></div>';
  // 문서는 확대·이동할 수 있게 한 겹(.pan)으로 감싼다 — 핀·그림도 함께 따라간다
  stage.innerHTML = src.k === 'doc' ? `<div class="pan">${inner}</div>` : inner;
  const media = stage.querySelector('.media'), freeze = stage.querySelector('.freeze'), overlay = stage.querySelector('.overlay');
  const P = {
    kind: src.k, src, ar: src.k === 'yt' && src.short ? [9, 16] : [16, 9], fps: 0, fpsHow: '', title: '', poster: '', _ready: false, stage, overlay, destroyed: false,
    // 준비 전 기본 동작
    time: () => 0, duration: () => 0, paused: () => true, play() {}, pause() {}, seek() {}, rate: () => 1, setRate() {}, setVolume() {},
    async snapshot() { return { t: 0, img: '' }; }, async grabAt() { return ''; }, live: () => false, destroy() { P.destroyed = true; },
    native: () => false, async setNative() {},
    ready() { return this._ready; },
    contentRect() { return overlay.getBoundingClientRect(); },
    setMeta(m) {
      if (m.ar) m.ar = ratio(m.ar);
      let changed = false;
      if (m.ar && (m.ar[0] !== this.ar[0] || m.ar[1] !== this.ar[1])) { this.ar = m.ar; changed = true; this.layout(); }
      if (m.fps && (!this.fps || m.force || (this.fpsHow !== 'measured' && this.fpsHow !== 'set' && m.how === 'measured'))) { this.fps = m.fps; this.fpsHow = m.how || 'auto'; changed = true; }
      if (m.title && !this.title) { this.title = m.title; changed = true; }
      if (m.poster && !this.poster) { this.poster = m.poster; changed = true; }
      if (changed) hooks.onMeta && hooks.onMeta({ ar: this.ar, fps: this.fps, fpsHow: this.fpsHow, title: this.title, poster: this.poster });
    },
    layout() {
      const cw = stage.clientWidth, ch = stage.clientHeight, [vw, vh] = this.ar;
      const s = Math.min(cw / vw, ch / vh), w = vw * s, h = vh * s;
      const css = { left: (cw - w) / 2 + 'px', top: (ch - h) / 2 + 'px', width: w + 'px', height: h + 'px' };
      Object.assign(overlay.style, css); Object.assign(freeze.style, css);
      // 유튜브·비메오 플레이어는 영상 크기에 딱 맞춰 둔다(플레이어 자체 여백·흰 띠가 생기지 않게)
      if (this.kind === 'yt' || this.kind === 'vimeo') Object.assign(media.style, css, { right: 'auto', bottom: 'auto' });
    },
    showFreeze(img, t) { if (this.native()) return; freeze.src = img; freeze.dataset.t = t; freeze.hidden = false; },
    hideFreeze() { freeze.hidden = true; },
    effFps() { return this.fps || 30; },
    step(n) { this.pause(); this.seek(this.time() + n / this.effFps() + (n > 0 ? 0.0005 : -0.0005)); },
    toggle() { this.paused() ? this.play() : this.pause(); },
    /** 같은 장면(문서는 같은 쪽)인가 — 이어 그린 획을 한 카드로 묶을 때 */
    same(x) { return this.doc ? Math.round(x) === Math.round(this.time()) : Math.abs(x - this.time()) < 1 / this.effFps() + 0.02; },
  };
  new ResizeObserver(() => P.layout()).observe(stage);
  P.layout();
  if (src.k !== 'doc') probe(src).then(m => { if (!P.destroyed) P.setMeta({ ar: src.k === 'yt' || src.k === 'vimeo' ? m.ar : null, fps: m.fps, how: m.fps ? 'title' : '', title: m.title, poster: m.poster }); });

  P._startNative = startNative;
  if (src.k === 'doc') initDoc(P, media, src, hooks);
  else if (src.k === 'url') initVideo(P, media, src.url, hooks);
  else if (src.k === 'file') initFile(P, media, src, hooks);
  else if (src.k === 'vimeo') initVimeo(P, media, src, hooks);
  else initYouTube(P, media, src, hooks);
  return P;
}

/* ---------- 영상 파일(목업 업로드) ---------- */
async function initFile(P, media, src, hooks) {
  const blob = await getMedia(src.fid);
  if (P.destroyed) return;
  if (blob) return initVideo(P, media, URL.createObjectURL(blob), hooks);
  // 다른 기기: 서버가 없으니 같은 파일을 직접 골라 연결한다
  media.innerHTML = `<div class="file-missing">
    <b>${t('영상 파일을 이 기기에서 찾을 수 없어요')}</b>
    <span>${t('시험 버전이라 영상이 아직 서버에 올라가지 않아요. 디렉터에게 받은 같은 파일을 골라 주세요.')}</span>
    <span class="dim">${esc(src.name || '')}${src.size ? ' · ' + fmtSize(src.size) : ''}</span>
    <label class="btn primary">${t('파일 고르기')}<input type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv" hidden></label>
    <span class="warn" hidden></span></div>`;
  P.stage.classList.add('missing');
  const input = media.querySelector('input'), warn = media.querySelector('.warn');
  input.addEventListener('change', async () => {
    const f = input.files[0]; if (!f) return;
    if (src.size && f.size !== src.size) { warn.hidden = false; warn.textContent = `${t('파일 크기가 달라요(')}${fmtSize(f.size)}${t('). 다른 편집본이면 시간이 어긋날 수 있어요.')}`; await sleep(1800); }
    await putMedia(src.fid, f);
    P.stage.classList.remove('missing');
    initVideo(P, media, URL.createObjectURL(f), hooks);
  });
}

/* ---------- 영상 주소·파일 공통: <video> ---------- */
function initVideo(P, media, url, hooks) {
  media.innerHTML = '';
  const v = document.createElement('video');
  v.playsInline = true; v.preload = 'auto'; v.controls = !!P._startNative; if (!url.startsWith('blob:')) v.crossOrigin = 'anonymous'; v.src = url;
  media.appendChild(v);
  let retried = false;
  v.addEventListener('error', () => {
    if (!retried && v.crossOrigin) { retried = true; v.removeAttribute('crossorigin'); v.src = url; return; }
    hooks.onError && hooks.onError(t('영상을 불러오지 못했어요. 링크가 영상 파일(mp4·webm)로 바로 열리는지, 브라우저가 재생할 수 있는 형식인지 확인해 주세요.'));
  });
  v.addEventListener('loadedmetadata', () => {
    P._ready = true; P.setMeta({ ar: [v.videoWidth || 16, v.videoHeight || 9] });
    hooks.onReady && hooks.onReady({ title: P.title, duration: v.duration });
  });
  v.addEventListener('play', () => hooks.onState && hooks.onState(true));
  v.addEventListener('pause', () => hooks.onState && hooks.onState(false));
  v.addEventListener('timeupdate', () => hooks.onTime && hooks.onTime(v.currentTime));
  v.addEventListener('seeked', () => hooks.onTime && hooks.onTime(v.currentTime));
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
  const draw = () => {
    const W = Math.min(1280, v.videoWidth || 1280), H = Math.round(W * (v.videoHeight || 9) / (v.videoWidth || 16));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    try { c.getContext('2d').drawImage(v, 0, 0, W, H); return c.toDataURL('image/jpeg', 0.8); } catch { return ''; }
  };
  const seekTo = t => new Promise(res => { if (Math.abs(v.currentTime - t) < 0.001) return res(); v.addEventListener('seeked', () => res(), { once: true }); v.currentTime = t; setTimeout(res, 4000); });
  Object.assign(P, {
    el: v,
    time: () => v.currentTime || 0, duration: () => v.duration || 0, paused: () => v.paused,
    play() { v.play().catch(() => {}); }, pause() { v.pause(); },
    seek(t) { v.currentTime = Math.max(0, Math.min(v.duration || t, t)); },
    rate: () => v.playbackRate, setRate(r) { v.playbackRate = r; },
    setVolume(x) { v.volume = x; },
    native: () => v.controls,
    async setNative(on) { v.controls = !!on; },
    live: () => true, // 화면 공유 없이 바로 장면 사진을 찍을 수 있다
    async snapshot() { if (!v.paused) v.pause(); return { t: v.currentTime, img: draw() }; },
    async grabAt(t) { v.pause(); await seekTo(t); return draw(); },
    destroy() { P.destroyed = true; v.pause(); v.removeAttribute('src'); v.load(); },
  });
}

/* ---------- 유튜브 ---------- */
function initYouTube(P, media, src, hooks) {
  let player = null, state = -1, dur = 0, wantPaused = false, native = !!P._startNative, gen = 0;
  const playing = () => state === 1 || state === 3;
  const run = f => { try { return f(); } catch { return undefined; } };
  const waitState = async (ok, ms = 4000) => { for (let i = 0; i < ms / 40 && !ok(); i++) await sleep(40); return ok(); };
  Object.assign(P, {
    time: () => run(() => player.getCurrentTime()) || 0,
    duration: () => { const d = run(() => player.getDuration()); if (d) dur = d; return dur; },
    paused: () => wantPaused || !playing(),
    play() { wantPaused = false; P.hideFreeze(); run(() => player.playVideo()); },
    pause() { wantPaused = true; run(() => player.pauseVideo()); },
    seek(t) { P.hideFreeze(); run(() => player.seekTo(Math.max(0, t), true)); },
    rate: () => run(() => player.getPlaybackRate()) || 1, setRate(r) { run(() => player.setPlaybackRate(r)); },
    setVolume(x) { run(() => player.setVolume(Math.round(x * 100))); },
    async snapshot() { P.pause(); return { t: P.time(), img: '' }; },
    /** 보낼 때만: 그 시점부터 아주 느리게 재생하는 순간을 찍어 유튜브 정지 화면의 버튼·제목을 피한다 */
    async grabAt(t) {
      if (!Cap.active) return '';
      const muted = run(() => player.isMuted());
      run(() => { player.mute(); player.pauseVideo(); player.seekTo(t, true); player.setPlaybackRate(0.25); player.playVideo(); });
      wantPaused = false;
      await waitState(() => state === 1);
      await Cap.fresh(3, 700);
      const img = Cap.grab(P.contentRect(), 1280);
      wantPaused = true; run(() => { player.pauseVideo(); player.setPlaybackRate(1); if (!muted) player.unMute(); });
      return img;
    },
    /** 손 도구: 유튜브 자체 컨트롤(화질·자막·볼륨)을 켠 플레이어로 바꾼다. 위치·재생 상태·속도·자막을 이어받는다 */
    native: () => native,
    async setNative(on) {
      if (on === native || !player) return;
      const keep = {
        t: P.time(), paused: P.paused(), rate: P.rate(), muted: run(() => player.isMuted()), vol: run(() => player.getVolume()),
        quality: run(() => player.getPlaybackQuality()),
        cc: run(() => { const tr = player.getOption('captions', 'track'); return tr && tr.languageCode ? tr : null; }),
      };
      native = on;
      P.stage.classList.add('switching');
      await build(keep);
      P.stage.classList.remove('switching');
    },
    destroy() { P.destroyed = true; run(() => player.destroy()); },
  });
  function build(keep) {
    const my = ++gen;
    return new Promise(resolve => {
      run(() => player && player.destroy());
      player = null; state = -1;
      media.innerHTML = '<div class="ytframe"></div>';
      const vars = { enablejsapi: 1, controls: native ? 1 : 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: native ? 0 : 1, fs: 0, iv_load_policy: 3, origin: location.origin };
      if (keep && keep.cc) { vars.cc_load_policy = 1; vars.cc_lang_pref = keep.cc.languageCode; }
      if (keep && keep.t > 1) vars.start = Math.floor(keep.t);
      let restored = !keep;
      const restore = () => {
        if (restored) return; restored = true;
        run(() => { player.seekTo(keep.t, true); player.setPlaybackRate(keep.rate || 1); if (keep.vol != null) player.setVolume(keep.vol); if (keep.quality) player.setPlaybackQuality(keep.quality); });
        if (keep.cc) run(() => { player.loadModule('captions'); player.setOption('captions', 'track', { languageCode: keep.cc.languageCode }); });
        if (keep.paused) { wantPaused = true; run(() => { player.pauseVideo(); if (!keep.muted) player.unMute(); }); }
        else { wantPaused = false; run(() => { if (!keep.muted) player.unMute(); player.playVideo(); }); }
        resolve();
      };
      player = new YT.Player(media.firstChild, {
        width: '100%', height: '100%', videoId: src.id, playerVars: vars,
        events: {
          onReady: e => {
            if (my !== gen) return;
            P._ready = true; dur = e.target.getDuration() || 0;
            if (keep) {
              // 정지 상태였다면 그 장면이 화면에 나오도록 소리 없이 잠깐 재생한 뒤 멈춘다
              if (keep.paused) { run(() => { player.mute(); player.seekTo(keep.t, true); player.playVideo(); }); setTimeout(restore, 2500); }
              else restore();
              return resolve && null;
            }
            const title = run(() => e.target.getVideoData().title) || '';
            P.setMeta({ title }); hooks.onReady && hooks.onReady({ title, duration: dur }); resolve();
          },
          onStateChange: e => {
            if (my !== gen) return;
            state = e.data;
            if (keep && !restored && keep.paused && state === 1) restore();
            // 손 도구로 유튜브 버튼을 직접 눌러도 재생 상태를 따라간다
            if (restored && !P.stage.classList.contains('capturing')) { if (state === 1) wantPaused = false; else if (state === 2 || state === 0) wantPaused = true; }
            if (state === 1 && !P.stage.classList.contains('capturing')) P.hideFreeze();
            if (!P.stage.classList.contains('capturing') && restored) hooks.onState && hooks.onState(playing() && !wantPaused);
          },
          onError: e => {
            const c = e.data;
            hooks.onError && hooks.onError(c === 100 ? t('영상을 찾을 수 없어요. 삭제되거나 비공개로 바뀌었는지 확인해 주세요.')
              : (c === 101 || c === 150) ? t('이 영상은 다른 사이트에서 재생(퍼가기)이 막혀 있어요. 유튜브 스튜디오에서 "퍼가기 허용"을 켜 주세요.')
                : c === 2 ? t('링크 형식을 알아볼 수 없어요.') : t('유튜브 재생 오류 (') + c + ')');
            resolve();
          },
        },
      });
      setTimeout(resolve, 8000);
    });
  }
  loadYt().then(() => { if (!P.destroyed) build(null); })
    .catch(() => hooks.onError && hooks.onError(t('유튜브 플레이어를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')));
  const tick = () => { if (P.destroyed) return; if (P._ready && hooks.onTime) hooks.onTime(P.time()); setTimeout(tick, 120); };
  tick();
}

/* ---------- 비메오 ---------- */
function initVimeo(P, media, src, hooks) {
  let player = null, cur = 0, dur = 0, isPaused = true, rate = 1, native = !!P._startNative, gen = 0;
  const safe = p => p && p.catch ? p.catch(() => {}) : p;
  Object.assign(P, {
    time: () => cur, duration: () => dur, paused: () => isPaused,
    play() { P.hideFreeze(); isPaused = false; safe(player && player.play()); },
    pause() { isPaused = true; safe(player && player.pause()); },
    seek(t) { P.hideFreeze(); cur = Math.max(0, Math.min(dur || t, t)); hooks.onTime && hooks.onTime(cur); safe(player && player.setCurrentTime(cur)); },
    rate: () => rate, setRate(r) { safe(player && player.setPlaybackRate(r).then(() => { rate = r; })); },
    setVolume(x) { safe(player && player.setVolume(x)); },
    async snapshot() { P.pause(); return { t: cur, img: '' }; },
    async grabAt(t) {
      if (!Cap.active || !player) return '';
      const vol = await player.getVolume().catch(() => 1);
      await player.setVolume(0).catch(() => {});
      await player.setCurrentTime(t).catch(() => {});
      const started = new Promise(res => { const h = () => { player.off('timeupdate', h); res(); }; player.on('timeupdate', h); setTimeout(res, 4000); });
      await player.play().catch(() => {});
      await started; await Cap.fresh(2, 500);
      const img = Cap.grab(P.contentRect(), 1280);
      await player.pause().catch(() => {}); await player.setVolume(vol).catch(() => {});
      isPaused = true;
      return img;
    },
    native: () => native,
    /** 손 도구: 비메오 자체 컨트롤(화질·자막)을 켠 플레이어로 바꾼다 */
    async setNative(on) {
      if (on === native || !player) return;
      const keep = { t: cur, paused: isPaused, rate, vol: await player.getVolume().catch(() => 1), quality: await player.getQuality().catch(() => ''),
        track: await player.getTextTracks().then(ts => (ts.find(x => x.mode === 'showing') || null)).catch(() => null) };
      native = on;
      P.stage.classList.add('switching');
      await build(keep);
      P.stage.classList.remove('switching');
    },
    destroy() { P.destroyed = true; safe(player && player.destroy()); },
  });
  async function build(keep) {
    const my = ++gen;
    if (player) { const old = player; player = null; await old.destroy().catch(() => {}); }
    const q = new URLSearchParams({ controls: native ? '1' : '0', title: '0', byline: '0', portrait: '0', dnt: '1', playsinline: '1', autopause: '0', keyboard: native ? '1' : '0', pip: '0' });
    if (src.h) q.set('h', src.h);
    media.innerHTML = `<iframe src="https://player.vimeo.com/video/${encodeURIComponent(src.id)}?${q}" allow="autoplay; fullscreen; picture-in-picture" title="${t('Vimeo 영상')}"></iframe>`;
    const pl = new Vimeo.Player(media.firstChild);
    player = pl;
    pl.on('timeupdate', d => { if (my === gen) { cur = d.seconds; hooks.onTime && hooks.onTime(cur); } });
    pl.on('seeked', d => { if (my === gen) { cur = d.seconds; hooks.onTime && hooks.onTime(cur); } });
    pl.on('play', () => { if (my !== gen) return; isPaused = false; if (!P.stage.classList.contains('capturing')) hooks.onState && hooks.onState(true); });
    pl.on('pause', () => { if (my !== gen) return; isPaused = true; if (!P.stage.classList.contains('capturing')) hooks.onState && hooks.onState(false); });
    pl.on('error', e => hooks.onError && hooks.onError(t('비메오 재생 오류: ') + (e && e.message || t('알 수 없음'))));
    try {
      await pl.ready();
      if (keep) {
        await pl.setCurrentTime(keep.t).catch(() => {});
        if (keep.rate && keep.rate !== 1) await pl.setPlaybackRate(keep.rate).catch(() => {});
        await pl.setVolume(keep.vol).catch(() => {});
        if (keep.quality) await pl.setQuality(keep.quality).catch(() => {});
        if (keep.track) await pl.enableTextTrack(keep.track.language, keep.track.kind).catch(() => {});
        if (!keep.paused) await pl.play().catch(() => {});
        return;
      }
      const [d, w, h, title] = await Promise.all([pl.getDuration(), pl.getVideoWidth(), pl.getVideoHeight(), pl.getVideoTitle().catch(() => '')]);
      dur = d; P._ready = true;
      if (w && h) P.setMeta({ ar: [w, h] });
      P.setMeta({ title });
      hooks.onReady && hooks.onReady({ title, duration: d });
    } catch (e) {
      hooks.onError && hooks.onError(t('비메오 영상을 열 수 없어요. 비공개 영상이면 공유 링크 전체(뒤의 해시 포함)를 넣고, 퍼가기 설정에서 이 사이트를 허용해 주세요.'));
    }
  }
  loadVimeo().then(() => { if (!P.destroyed) build(null); })
    .catch(() => hooks.onError && hooks.onError(t('비메오 플레이어를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')));
}

/* 문서 검수 — PDF·PPT(.pptx)·사진을 '페이지가 시간인 플레이어'로 다룬다.
   P.time() = 지금 페이지(0부터), P.duration() = 마지막 페이지 번호.
   그래서 핀·그림·카드·보내기·받은함·보고서는 영상과 똑같이 돌아간다. */
import { esc, sleep, parseSource } from './util.js';
import { Cap } from './player.js';
import { getMedia, putMedia, putValue, fmtSize } from './media.js';
import { t } from './i18n.js';

/** 문서 종류별 프레임 자리 표시값 — tc()가 이 값을 보고 '3쪽'·'슬라이드 3'·'사진 3'으로 적는다 */
export const DOC_FPS = { pdf: -1, pptx: -2, img: -3, canva: -2 };
export const isDoc = src => !!src && src.k === 'doc';

const IMG_RE = /\.(jpe?g|png|webp|gif|avif|bmp)(\?|#|$)/i;
/** 파일 종류 알아내기 */
export function docType(file) {
  const n = (file.name || '').toLowerCase(), ty = file.type || '';
  if (ty === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.pptx') || ty.includes('presentationml')) return 'pptx';
  if (n.endsWith('.ppt') || ty === 'application/vnd.ms-powerpoint') return 'ppt-old';
  if (ty.startsWith('image/') || IMG_RE.test(n)) return 'img';
  return '';
}
/** 주소로 들어온 문서 */
export function docFromUrl(url) {
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (path.endsWith('.pdf')) return { k: 'doc', dt: 'pdf', url };
  if (path.endsWith('.pptx')) return { k: 'doc', dt: 'pptx', url };
  if (IMG_RE.test(path)) return { k: 'doc', dt: 'img', url };
  return null;
}
/* ---------- 링크 알아보기: 유튜브·비메오·캔바·사진·영상·PDF ---------- */
/** 구글 드라이브·드롭박스 공유 링크 → 바로 열리는 주소 */
export function directLink(u) {
  let m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{20,})/);
  if (m) return `https://lh3.googleusercontent.com/d/${m[1]}`;
  if (/^https?:\/\/(www\.)?dropbox\.com\//.test(u)) return u.replace(/([?&])dl=0/, '$1raw=1') + (/[?&](raw|dl)=1/.test(u) ? '' : (u.includes('?') ? '&raw=1' : '?raw=1'));
  return u;
}
/** 캔바 디자인 링크 → 임베드 주소 (공개 보기 링크·임베드를 켠 디자인) */
export function canvaFrom(u) {
  if (/^https?:\/\/(www\.)?canva\.link\//i.test(u)) return { error: 'canva-short', short: u };
  const m = u.match(/canva\.(?:com|cn)\/design\/([\w-]+)(?:\/([\w-]+))?\/(?:view|edit|watch)/i);
  if (!m) return null;
  return { k: 'doc', dt: 'canva', id: m[1], tk: m[2] || '', url: `https://www.canva.com/design/${m[1]}${m[2] ? '/' + m[2] : ''}/view?embed`, orig: u, n: 1, ar: [16, 9] };
}
/** 정말 사진으로 열리는가 (확장자가 없는 인터넷 사진 주소가 많다) */
export const isImageUrl = (u, ms = 8000) => new Promise(res => {
  const im = new Image(); let done = false;
  const end = v => { if (!done) { done = true; res(v); } };
  im.onload = () => end(im.naturalWidth > 0); im.onerror = () => end(false);
  setTimeout(() => end(false), ms); im.src = u;
});
/** 정말 영상으로 열리는가 */
export const isVideoUrl = (u, ms = 8000) => new Promise(res => {
  const v = document.createElement('video'); let done = false;
  const end = x => { if (!done) { done = true; v.removeAttribute('src'); v.load(); res(x); } };
  v.preload = 'metadata'; v.muted = true;
  v.onloadedmetadata = () => end(true); v.onerror = () => end(false);
  setTimeout(() => end(false), ms); v.src = u;
});
/** 붙여 넣은 글 → 소스. 사진 주소는 여러 개를 한 세트로 받을 수 있다 */
export async function resolveSource(text) {
  const urls = String(text || '').split(/\s+/).filter(u => /^https?:\/\//i.test(u));
  if (!urls.length) return parseSource(String(text || '').trim());
  if (urls.length === 1) {
    const u = urls[0], cv = canvaFrom(u);
    if (cv) return cv;
    const base = parseSource(directLink(u));
    if (base && base.k !== 'url') return base; // 유튜브·비메오·확장자로 알 수 있는 문서
    const d = directLink(u);
    if (/\.(mp4|m4v|mov|webm|ogv|m3u8)(\?|#|$)/i.test(d.split('#')[0])) return base; // 확장자로 영상이 분명하면 그대로
    if (await isImageUrl(d)) return { k: 'doc', dt: 'img', url: d };
    if (await isVideoUrl(d)) return base;
    return null; // 사진도 영상도 아니다
  }
  const list = urls.map(directLink), ok = await Promise.all(list.map(u => isImageUrl(u)));
  return ok.every(Boolean) ? { k: 'doc', dt: 'img', urls: list, n: list.length } : { error: 'mixed' };
}
export const docAccept = dt => dt === 'pdf' ? 'application/pdf,.pdf' : dt === 'pptx' ? '.pptx' : 'image/*';

/** 올리기(목업): 사진은 여러 장을 한 세트로 */
export async function putDoc(files, dt, onProgress = () => {}) {
  const fid = 'd' + Math.random().toString(36).slice(2, 12);
  const total = files.reduce((a, f) => a + f.size, 0) || 1; let done = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    await putMedia(i ? `${fid}_${i}` : fid, f, x => onProgress((done + x * f.size) / total));
    done += f.size;
  }
  const name = files.length > 1 ? files[0].name.replace(/\.[^.]+$/, '') + ` +${files.length - 1}` : files[0].name;
  return { k: 'doc', dt, fid, n: files.length, name, size: total };
}
const blobsOf = async src => {
  const out = [];
  for (let i = 0; i < (src.n || 1); i++) { const b = await getMedia(i ? `${src.fid}_${i}` : src.fid); if (!b) return null; out.push(b); }
  return out;
};

/* ---------- 라이브러리는 필요할 때만 ---------- */
const V = new URL('../vendor/', import.meta.url).href;
let pdfLib = null;
const loadPdf = () => pdfLib || (pdfLib = import(V + 'pdf.min.js').then(m => { m.GlobalWorkerOptions.workerSrc = V + 'pdf.worker.min.js'; return m; }));
const loadPptx = () => window.pptxPreview ? Promise.resolve(window.pptxPreview) : new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = V + 'pptx-preview.umd.js';
  s.onload = () => res(window.pptxPreview); s.onerror = () => rej(new Error('pptx lib')); document.head.appendChild(s);
});
let shotLib = null;
const loadShot = () => shotLib || (shotLib = import(V + 'modern-screenshot.js'));

const jpeg = c => { try { return c.toDataURL('image/jpeg', 0.82); } catch { return ''; } };
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

/* ---------- 렌더러: { count, size(i)→[w,h], mount(el), show(i, box, zoom), snap(i, W) } ---------- */
async function pdfRenderer(data) {
  const lib = await loadPdf();
  const doc = await lib.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [], sizes = [];
  const page = async i => pages[i] || (pages[i] = await doc.getPage(i + 1));
  for (let i = 0; i < doc.numPages; i++) { const vp = (await page(i)).getViewport({ scale: 1 }); sizes.push([vp.width, vp.height]); }
  let cv, task = null, gen = 0;
  async function draw(c, i, W) {
    const p = await page(i), vp1 = p.getViewport({ scale: 1 }), vp = p.getViewport({ scale: W / vp1.width });
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    const tk = p.render({ canvasContext: ctx, viewport: vp, canvas: c });
    return tk;
  }
  return {
    count: doc.numPages, size: i => sizes[i],
    mount(el) { el.innerHTML = '<canvas class="doc-canvas"></canvas>'; cv = el.firstChild; },
    async show(i, box, zoom = 1) {
      const my = ++gen;
      // 확대할수록 더 촘촘히 다시 그린다(흐려지지 않게) — 너무 큰 캔버스는 막는다
      const dpr = devicePixelRatio || 1, [w, h] = sizes[i];
      let W = box.w * dpr * zoom; const maxPx = 24e6; if (W * W * h / w > maxPx) W = Math.sqrt(maxPx * w / h);
      if (task) { try { task.cancel(); } catch {} }
      const off = canvasOf(1, 1);
      task = await draw(off, i, W);
      try { await task.promise; } catch { return; }
      if (my !== gen) return;
      cv.width = off.width; cv.height = off.height; cv.getContext('2d').drawImage(off, 0, 0);
    },
    async snap(i, W = 1280) { const c = canvasOf(1, 1); const tk = await draw(c, i, W); await tk.promise; return jpeg(c); },
  };
}

async function imgRenderer(urls) {
  const imgs = await Promise.all(urls.map(u => new Promise((res, rej) => {
    const im = new Image(); im.decoding = 'async';
    if (!u.startsWith('blob:') && !u.startsWith('data:')) im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => { if (im.crossOrigin) { im.removeAttribute('crossorigin'); im.src = u; im.crossOrigin = null; } else rej(new Error('img')); };
    im.src = u;
  })));
  let el;
  return {
    count: imgs.length, size: i => [imgs[i].naturalWidth || 1, imgs[i].naturalHeight || 1],
    mount(x) { el = x; el.innerHTML = '<img class="doc-img" alt="" draggable="false">'; },
    async show(i) { const im = el.firstChild; if (im.src !== imgs[i].src) im.src = imgs[i].src; },
    async snap(i, W = 1600) {
      const im = imgs[i], w = Math.min(W, im.naturalWidth), h = Math.round(w * im.naturalHeight / im.naturalWidth);
      const c = canvasOf(w, h); c.getContext('2d').drawImage(im, 0, 0, w, h);
      // 다른 사이트 사진이라 그림으로 뽑을 수 없으면 원래 사진 주소를 그대로 쓴다
      return jpeg(c) || (/^https?:/.test(im.src) ? im.src : '');
    },
  };
}

async function pptxRenderer(data) {
  const lib = await loadPptx();
  // 슬라이드 크기를 먼저 알아낸 뒤, 원래 크기로 그려 두고 화면에서는 비율만 맞춘다
  const host = document.createElement('div'); host.className = 'pptx-host';
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:960px;height:540px';
  document.body.appendChild(host);
  let pv = lib.init(host, { width: 960, height: 540, mode: 'slide' });
  await pv.preview(data.slice(0));
  const W = Math.round(pv.pptx.width) || 960, H = Math.round(pv.pptx.height) || 540;
  if (Math.abs(W - 960) > 1 || Math.abs(H - 540) > 1) {
    host.innerHTML = ''; host.style.width = W + 'px'; host.style.height = H + 'px';
    pv = lib.init(host, { width: W, height: H, mode: 'slide' }); await pv.preview(data.slice(0));
  }
  const n = pv.slideCount; let el, cur = -1;
  const go = i => { if (cur !== i) { pv.renderSingleSlide(i); cur = i; } };
  // 사진 찍기용 복사본 — 보이는 슬라이드가 깜빡이지 않게 따로 그린다
  let shot = null, queue = Promise.resolve();
  const snapper = async () => {
    if (shot) return shot;
    const h2 = document.createElement('div'); h2.className = 'pptx-host';
    h2.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;height:${H}px`;
    document.body.appendChild(h2);
    const p2 = lib.init(h2, { width: W, height: H, mode: 'slide' }); await p2.preview(data.slice(0));
    return (shot = { h2, p2, cur: 0 });
  };
  return {
    count: n, size: () => [W, H],
    mount(x) {
      el = x; el.innerHTML = ''; host.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0`;
      el.appendChild(host);
    },
    async show(i, box) { go(i); host.style.transform = `scale(${box.w / W})`; },
    snap(i, w = 1280) {
      // 한 번에 하나씩 (복사본 하나를 같이 쓰므로)
      const job = queue.then(async () => {
        const s2 = await snapper(), { domToJpeg } = await loadShot();
        if (s2.cur !== i) { s2.p2.renderSingleSlide(i); s2.cur = i; }
        try { return await domToJpeg(s2.h2.querySelector('.pptx-preview-slide-wrapper'), { quality: 0.82, scale: w / W, backgroundColor: '#fff' }); } catch { return ''; }
      });
      queue = job.catch(() => {});
      return job;
    },
    destroy() { try { pv.destroy(); } catch {} host.remove(); if (shot) shot.h2.remove(); },
  };
}

/* 캔바: 공개 보기·임베드 링크를 페이지 번호(#3)로 연다. 다른 회사 화면이라 그림·페이지 수는 읽을 수 없다
   → 페이지 수·화면비는 디렉터가 정하고, 장면 사진은 보낼 때 화면 공유로 찍는다 */
function canvaRenderer(src) {
  let iframe, cur = -1, loadedAt = 0, waiters = [];
  const n = Math.max(1, Math.min(300, +src.n || 1)), ar = src.ar || [16, 9];
  // 페이지 사진: 화면 공유로 한 번 찍어 두면 이 브라우저에 남는다 (쪽 목록·카드 사진에 바로 쓴다)
  const cache = new Map(), key = i => `canva:${src.id}:${ar.join('x')}:${i}`;
  const ready = Promise.all(Array.from({ length: n }, (_, i) => getMedia(key(i)).then(v => { if (typeof v === 'string' && v) cache.set(i, v); })));
  return {
    count: n, size: () => ar, cache, ready,
    get live() { return cache.size >= n; },
    capturable: true,
    remember(i, img) { if (!img) return; cache.set(i, img); putValue(key(i), img); },
    mount(el) {
      el.innerHTML = `<iframe class="canva-frame" title="Canva" allow="fullscreen; clipboard-write" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
      iframe = el.firstChild;
      iframe.addEventListener('load', () => { loadedAt = Date.now(); waiters.splice(0).forEach(f => f()); });
    },
    async show(i) {
      if (cur === i) return; cur = i; loadedAt = 0;
      iframe.src = `${src.url}&sdpage=${i + 1}#${i + 1}`; // 매번 새로 열어 그 페이지가 확실히 나오게
    },
    loaded: () => new Promise(res => { const go = () => setTimeout(res, 1400); loadedAt ? go() : (waiters.push(go), setTimeout(res, 6000)); }),
    async snap(i) { await ready; return cache.get(Math.round(i)) || ''; },
  };
}

/** 찍은 그림이 거의 한 가지 색인가 (캔바가 아직 그리기 전) */
const blankish = url => new Promise(res => {
  if (!url) return res(true);
  const im = new Image(); im.onload = () => {
    const c = canvasOf(24, 24), x = c.getContext('2d'); x.drawImage(im, 0, 0, 24, 24);
    const d = x.getImageData(0, 0, 24, 24).data; let mn = 765, mx = 0;
    for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; if (v < mn) mn = v; if (v > mx) mx = v; }
    res(mx - mn < 40);
  }; im.onerror = () => res(true); im.src = url;
});
/** 캔바 페이지를 찍는다 — 다 그려질 때까지 몇 번 다시 찍는다 */
async function grabCanva(P, w) {
  let img = '';
  for (let k = 0; k < 6; k++) {
    await Cap.fresh(3, 900);
    img = Cap.grab(P.contentRect(), w);
    if (!await blankish(img)) return img;
    await sleep(900);
  }
  return img;
}

/* ---------- 플레이어 ---------- */
export async function initDoc(P, media, src, hooks) {
  await null; // 화면을 다 만든 뒤에 이어서 (캔바처럼 내려받을 것이 없으면 바로 끝나므로)
  P.doc = true; P.fps = DOC_FPS[src.dt] || -1; P.fpsHow = 'doc';
  P.stage.classList.add('doc-stage');
  media.innerHTML = `<div class="doc-loading"><span class="spin"></span>${t('문서를 여는 중')}</div>`;
  let data;
  try {
    if (src.dt === 'canva') data = null; // 캔바는 그쪽 화면을 그대로 띄운다
    else if (src.dt === 'img' && (src.url || src.urls)) data = src.urls || [src.url]; // 인터넷 사진은 내려받지 않고 바로 띄운다
    else if (src.url) {
      const r = await fetch(src.url); if (!r.ok) throw new Error('http');
      data = await r.arrayBuffer();
    } else {
      const blobs = await blobsOf(src);
      if (P.destroyed) return;
      if (!blobs) return relink(P, media, src, hooks);
      data = src.dt === 'img' ? blobs.map(b => URL.createObjectURL(b)) : await blobs[0].arrayBuffer();
    }
  } catch { return hooks.onError && hooks.onError(t('문서를 불러오지 못했어요. 주소가 파일로 바로 열리는지(다른 사이트는 막혀 있을 수 있어요) 확인해 주세요.')); }
  let R;
  try { R = src.dt === 'canva' ? canvaRenderer(src) : src.dt === 'pdf' ? await pdfRenderer(data) : src.dt === 'pptx' ? await pptxRenderer(data) : await imgRenderer(data); }
  catch (e) { console.warn(e); return hooks.onError && hooks.onError(src.dt === 'pptx' ? t('PPT 파일을 열지 못했어요. PowerPoint에서 PDF로 저장해 올리면 정확하게 보여요.') : t('문서를 열지 못했어요. 파일이 손상되었는지 확인해 주세요.')); }
  if (P.destroyed) { R.destroy && R.destroy(); return; }
  R.mount(media);
  let page = 0, zoom = 1;
  const box = () => { const r = P.overlay.style; return { w: parseFloat(r.width) || 1, h: parseFloat(r.height) || 1 }; };
  const redraw = () => R.show(page, box(), zoom);
  let rt = 0; const redrawSoon = () => { clearTimeout(rt); rt = setTimeout(redraw, 160); };
  const setPage = (i, quiet) => {
    i = Math.max(0, Math.min(R.count - 1, Math.round(+i || 0)));
    const changed = i !== page; page = i;
    P.ar = R.size(i).map(x => Math.round(x)); P.layout(); redraw();
    if (changed || !quiet) { hooks.onTime && hooks.onTime(page); hooks.onPage && hooks.onPage(page); }
  };
  const baseLayout = P.layout.bind(P);
  P.layout = function () { baseLayout(); media.style.cssText = P.overlay.style.cssText; if (P._ready) redrawSoon(); };
  Object.assign(P, {
    renderer: R, pages: () => R.count,
    time: () => page, duration: () => R.count - 1, paused: () => true,
    play() {}, pause() {}, toggle() {}, rate: () => 1, setRate() {}, setVolume() {},
    seek: x => setPage(x), step: n => setPage(page + n),
    pageAr: i => R.size(i ?? page).map(x => Math.round(x)),
    setZoom(z) { if (z !== zoom) { zoom = z; redrawSoon(); } },
    live: () => R.live !== false, native: () => false, async setNative() {},
    async snapshot() { return { t: page, img: await R.snap(page), ar: P.pageAr(page) }; },
    async grabAt(x) {
      if (R.live !== false) return R.snap(Math.round(x));
      const have = R.cache && R.cache.get(Math.round(x)); if (have) return have;
      // 캔바: 그 페이지를 열고 화면 공유 장면에서 찍는다 (보낼 때 한 번)
      if (!Cap.active) return '';
      setPage(x); await R.loaded();
      const img = await grabCanva(P, 1280);
      R.remember && R.remember(Math.round(x), img);
      return img;
    },
    /** 캔바: 모든 페이지 사진을 한 번에 (화면 공유 중에 부른다) */
    canCaptureAll: !!R.capturable,
    async captureAll(onProgress = () => {}) {
      const back = page;
      for (let i = 0; i < R.count; i++) {
        onProgress(i, R.count); setPage(i); await R.loaded();
        R.remember(i, await grabCanva(P, 960));
      }
      onProgress(R.count, R.count); setPage(back);
    },
    thumb: (i, w = 240) => R.snap(i, w),
    destroy() { P.destroyed = true; R.destroy && R.destroy(); },
  });
  P._ready = true;
  setPage(0, true);
  P.setMeta({ ar: R.size(0), title: src.dt === 'canva' ? t('캔바 디자인') : (src.name || decodeURIComponent((src.url || (src.urls || [])[0] || '').split(/[?#]/)[0].split('/').pop() || '')).replace(/\.[^.]+$/, '') });
  hooks.onReady && hooks.onReady({ title: P.title, duration: R.count - 1, pages: R.count });
}

/* 다른 기기: 서버가 없으니 같은 파일을 직접 골라 연결한다 */
function relink(P, media, src, hooks) {
  media.innerHTML = `<div class="file-missing">
    <b>${t('문서 파일을 이 기기에서 찾을 수 없어요')}</b>
    <span>${t('시험 버전이라 파일이 아직 서버에 올라가지 않아요. 디렉터에게 받은 같은 파일을 골라 주세요.')}</span>
    <span class="dim">${esc(src.name || '')}${src.size ? ' · ' + fmtSize(src.size) : ''}</span>
    <label class="btn primary">${t('파일 고르기')}<input type="file" accept="${docAccept(src.dt)}" ${src.dt === 'img' && src.n > 1 ? 'multiple' : ''} hidden></label>
    <span class="warn" hidden></span></div>`;
  P.stage.classList.add('missing');
  media.style.cssText = '';
  const input = media.querySelector('input'), warn = media.querySelector('.warn');
  input.addEventListener('change', async () => {
    const fs = [...input.files]; if (!fs.length) return;
    const size = fs.reduce((a, f) => a + f.size, 0);
    if (src.size && size !== src.size) { warn.hidden = false; warn.textContent = `${t('파일 크기가 달라요(')}${fmtSize(size)}${t('). 다른 판이면 위치가 어긋날 수 있어요.')}`; await sleep(1800); }
    for (let i = 0; i < fs.length; i++) await putMedia(i ? `${src.fid}_${i}` : src.fid, fs[i]);
    P.stage.classList.remove('missing');
    initDoc(P, media, { ...src, n: fs.length }, hooks);
  });
}

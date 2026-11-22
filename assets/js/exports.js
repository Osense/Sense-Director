/* 링크·메시지·HTML·PDF 만들기 */
import { pack, appBase, tc, esc, fmtDate, dueLabel, logoMarkInline, WSNS_SITE } from './util.js';
import { snapHTML, posterOf } from './viewer.js';
import { t, tn, lang, fmtDateL, fmtMD } from './i18n.js';

export const STATUS = { open: t('대기'), doing: t('진행 중'), done: t('반영'), hold: t('보류') };

/** 클라이언트 링크에 담는 프로젝트 정보 (핀 번호 자체는 담지 않고 해시만) */
export const projectPayload = p => ({ v: 1, id: p.id, t: p.title, n: p.notice, d: p.due, src: p.src, ar: p.ar, fps: p.fps, dn: p.notes && p.notes.length ? p.notes.map(slimItem) : undefined, fh: p.fpsHow || '', pv: p.src && p.src.k === 'vimeo' ? p.poster || '' : undefined, ph: p.pinHash, s: p.salt, by: p.by || '' });
function slimItem(it) { return ({ id: it.id, t: Math.round(it.t * 1000) / 1000, x: it.x, y: it.y, s: it.s && it.s.length ? it.s : undefined, tx: it.tx || '', st: it.st, rp: it.rp && it.rp.length ? it.rp : undefined, ar: it.ar }); }
export const slimRequest = r => ({ rid: r.rid, from: r.from, at: r.at, items: r.items.map(slimItem), nr: r.nr && r.nr.length ? r.nr : undefined });
/** 디렉터 안내 번호: 시간순 D1, D2 … */
export const noteLabel = (notes, id) => 'D' + ((notes || []).slice().sort((a, b) => a.t - b.t).findIndex(x => x.id === id) + 1);

export async function clientLink(p, feedback) {
  let url = appBase() + '#c=' + await pack(projectPayload(p));
  if (feedback) url += '&f=' + await pack(feedback.map(slimRequest));
  return url;
}
export async function replyLink(payload, req) { return appBase() + '#r=' + await pack({ p: payload, r: slimRequest(req) }); }

const pinTxt = it => it.x != null ? `${t('핀 X')} ${it.x.toFixed(1)}% Y ${it.y.toFixed(1)}%` : it.s && it.s.length ? t('그림') : t('메모');
const pad2 = n => String(n).padStart(2, '0');

export function requestMessage(p, req, link) {
  const fps = p.fps || 30;
  const lines = [`${t('[Sense Director] 수정요청 ·')} ${p.t || p.title}`, `${t('보낸 사람:')} ${req.from || t('클라이언트')} · ${req.items.length}${t('건 ·')} ${fmtDate(req.at || Date.now())}`, ''];
  req.items.forEach((it, i) => { lines.push(`${pad2(i + 1)}  ${tc(it.t, fps)}  ${pinTxt(it)}${it.s && it.s.length && it.x != null ? t(' + 그림') : ''}`); lines.push(it.tx ? it.tx : t('(내용 없음)')); lines.push(''); });
  const dn = (p.dn || p.notes || []).slice().sort((a, b) => a.t - b.t);
  if (req.nr && req.nr.length) {
    lines.push(t('[디렉터 안내에 남긴 답글]'));
    req.nr.forEach(x => { const k = dn.findIndex(n => n.id === x.id); if (k < 0) return; lines.push(`D${k + 1}  ${tc(dn[k].t, fps)}`); x.rp.forEach(r => lines.push(t('답글: ') + r.b)); lines.push(''); });
  }
  if (link) lines.push(t('디렉터 수신함으로 바로 가져오기:'), link);
  return lines.join('\n');
}

export function feedbackMessage(p, reqs, link) {
  const fps = p.fps || 30, all = reqs.flatMap(r => r.items);
  const c = k => all.filter(it => (it.st || 'open') === k).length;
  const notes = (p.notes || []).slice().sort((a, b) => a.t - b.t);
  const lines = [`[Sense Director] ${all.length ? t('수정요청 회신') : t('디렉터 안내')} · ${p.title}`];
  if (all.length) lines.push(`${t('반영')} ${c('done')} ${t('· 진행')} ${c('doing')} ${t('· 보류')} ${c('hold')} ${t('· 대기')} ${c('open')} ${t('/ 총')} ${all.length}${t('건')}`);
  lines.push('');
  if (notes.length) {
    lines.push(`${t('[디렉터 안내')} ${notes.length}${t('건]')}`);
    notes.forEach((n, k) => { lines.push(`D${k + 1}  ${tc(n.t, fps)}  ${pinTxt(n)}`); lines.push(n.tx || t('(내용 없음)')); lines.push(''); });
    if (all.length) lines.push(t('[수정요청]'));
  }
  all.forEach((it, i) => {
    lines.push(`${pad2(i + 1)}  ${tc(it.t, fps)}  [${STATUS[it.st || 'open']}]`);
    if (it.tx) lines.push(t('요청: ') + it.tx);
    (it.rp || []).filter(r => r.by === 'd').forEach(r => lines.push(t('디렉터: ') + r.b));
    lines.push('');
  });
  if (link) lines.push(t('확인 링크 (핀 번호 필요):'), link);
  return lines.join('\n');
}

/** 혼자 열리는 HTML 보고서. 디렉터 콘솔에 끌어 놓으면 그대로 수신함으로 들어간다. */
export function reportHTML({ p, reqs, role = 'client', link = '', kind = '' }) {
  const fps = p.fps || 30, ar = p.ar || [16, 9], ytId = p.src && p.src.k === 'yt' ? p.src.id : '', poster = posterOf(p.src, p.pv || p.poster);
  const items = reqs.flatMap(r => r.items.map(it => ({ ...it, from: r.from })));
  const notes = role === 'director' ? (p.notes || []).slice().sort((a, b) => a.t - b.t) : [];
  const data = JSON.stringify({ kind: 'sense-director', v: 1, p: projectPayload(p), reqs }).replace(/</g, '\\u003c');
  const ytLink = t => ytId ? `https://youtu.be/${ytId}?t=${Math.floor(t)}` : p.src && p.src.k === 'vimeo' ? `https://vimeo.com/${p.src.id}${p.src.h ? '/' + p.src.h : ''}#t=${Math.floor(t)}s` : '';
  const noteCards = notes.map((it, k) => `
  <article class="card note">
    ${snapHTML(it, 'D' + (k + 1), ar, poster)}
    <div class="meta">
      <div class="row"><span class="no d">D${k + 1}</span><b class="tc">${tc(it.t, fps)}</b><span class="tag dn">${t('디렉터 안내')}</span>${ytLink(it.t) ? `<a href="${ytLink(it.t)}" target="_blank" rel="noopener">${t('이 시점 보기')}</a>` : ''}</div>
      <div class="pos">${esc(pinTxt(it))}</div>
      <p class="tx">${esc(it.tx || t('(내용 없음)'))}</p>
      ${(it.rp || []).map(r => `<div class="rp ${r.by === 'd' ? 'd' : 'c'}"><b>${r.by === 'd' ? t('디렉터') : esc(r.n || t('클라이언트'))}</b><span>${esc(r.b)}</span><time>${fmtDate(r.at)}</time></div>`).join('')}
    </div>
  </article>`).join('');
  const cards = items.map((it, i) => `
  <article class="card">
    ${snapHTML(it, i + 1, ar, poster)}
    <div class="meta">
      <div class="row"><span class="no">${pad2(i + 1)}</span><b class="tc">${tc(it.t, fps)}</b><span class="tag st-${it.st || 'open'}">${STATUS[it.st || 'open']}</span>${ytLink(it.t) ? `<a href="${ytLink(it.t)}" target="_blank" rel="noopener">${t('이 시점 보기')}</a>` : ''}</div>
      <div class="pos">${esc(pinTxt(it))}${it.from ? ' · ' + esc(it.from) : ''}</div>
      <p class="tx">${esc(it.tx || t('(내용 없음)'))}</p>
      ${(it.rp || []).map(r => `<div class="rp ${r.by === 'd' ? 'd' : 'c'}"><b>${r.by === 'd' ? t('디렉터') : esc(r.n || t('클라이언트'))}</b><span>${esc(r.b)}</span><time>${fmtDate(r.at)}</time></div>`).join('')}
    </div>
  </article>`).join('');
  const title = esc(p.t || p.title || t('수정요청'));
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="color-scheme" content="only light"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · ${kind === 'history' ? t('수정 내역서') : role === 'director' ? t('수정요청 회신') : t('수정요청')}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600;700&display=swap">
<style>
:root{color-scheme:only light;--bg:oklch(.985 .002 270);--panel:#fff;--raised:oklch(.975 .003 270);--line:oklch(.9 .006 270);--div:oklch(.93 .005 270);--text:oklch(.16 .01 270);--muted:oklch(.46 .015 270);--dim:oklch(.56 .015 270);--brand:oklch(.58 .2 285);--brand-2:oklch(.72 .14 210);--director:oklch(.6 .19 262);--ok:oklch(.6 .15 160);--warn:oklch(.66 .15 62);--mc:#ec4a24;--md:#2f6bff;--mono:'JetBrains Mono',ui-monospace,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 'Pretendard Variable',Pretendard,-apple-system,system-ui,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;word-break:keep-all;-webkit-font-smoothing:antialiased}
header{padding:28px clamp(16px,4vw,48px) 22px;border-bottom:1px solid var(--div);background:#fff;display:flex;flex-wrap:wrap;gap:14px 24px;align-items:flex-end}
.wm{display:inline-flex;align-items:center;gap:10px;color:inherit;text-decoration:none}.wm .mk{height:38px;width:auto}.wm em{font-style:normal;font-weight:700;background:linear-gradient(90deg,#7c5cf0,#38bcd8);-webkit-background-clip:text;background-clip:text;color:transparent}.wm b{display:block;font-size:15px;font-weight:700;letter-spacing:-.03em;line-height:1.1}.wm small{display:block;font-size:11px;font-weight:600;color:var(--director)}
.eb{font-size:12.5px;font-weight:600;color:var(--dim)}h1{margin:2px 0 0;font-size:26px;font-weight:800;letter-spacing:-.04em}
.sum{color:var(--muted);font-size:13px}.grow{flex:1}a{color:var(--brand);font-weight:600}
.notice{margin:20px clamp(16px,4vw,48px) 0;padding:14px 16px;border:1px solid var(--line);border-left:3px solid var(--director);border-radius:10px;background:#fff;white-space:pre-wrap;color:var(--muted)}
main{padding:20px clamp(16px,4vw,48px) 60px;display:grid;gap:14px}
.card{display:grid;grid-template-columns:minmax(220px,420px) 1fr;gap:20px;padding:14px;background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 1px 2px #1a1a2a0f;break-inside:avoid}
@media(max-width:700px){.card{grid-template-columns:1fr}}
.snap{position:relative;background:#0d0d12;border-radius:10px;overflow:hidden}.snap img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.snap img.fallback{opacity:.35}
.nosnap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#c9cad6;font-size:12px}
.ann{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.ann g{fill:none;stroke-linecap:round;stroke-linejoin:round}.ann polyline{vector-effect:non-scaling-stroke}.ann .o{stroke:#fff;stroke-width:5}.ann .i{stroke:var(--mc);stroke-width:3}.ann.d .i{stroke:var(--md)}
.pin{position:absolute;width:13px;height:13px;margin:-6.5px 0 0 -6.5px;border-radius:50%;background:var(--mc);border:2px solid #fff;box-shadow:0 0 0 1px #0000004d,0 2px 6px #0006}
.pin b{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);min-width:22px;height:21px;padding:0 6px;border-radius:11px;background:var(--mc);color:#fff;border:2px solid #fff;box-shadow:0 0 0 1px #0000004d;font:700 11px/17px var(--mono);text-align:center;white-space:nowrap}.pin.below b{bottom:auto;top:14px}
.pin.d,.pin.d b{background:var(--md)}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px}.no{font:700 12px/1.7 var(--mono);color:#fff;background:var(--mc);border-radius:6px;padding:0 7px}.no.d{background:var(--md)}
.tc{font:700 19px var(--mono);letter-spacing:-.02em}.row a{font-size:12.5px;margin-left:auto}
.tag{font-size:11.5px;font-weight:600;border:1px solid var(--line);border-radius:999px;padding:0 8px;color:var(--muted)}.st-done{color:var(--ok);border-color:var(--ok)}.st-doing{color:var(--warn);border-color:var(--warn)}.st-hold{color:var(--dim)}.tag.dn{color:var(--md);border-color:var(--md)}
.pos{font-size:12px;color:var(--dim);margin-top:4px}.tx{white-space:pre-wrap;margin:10px 0;font-size:15.5px}
.rp{display:grid;grid-template-columns:auto 1fr auto;gap:2px 10px;padding:8px 10px;margin-top:6px;border-radius:10px;background:var(--raised);border:1px solid var(--div);font-size:13.5px}.rp.d{border-left:3px solid var(--md)}.rp.c{border-left:3px solid var(--mc)}.rp b{font-size:12px}.rp.d b{color:var(--md)}.rp.c b{color:var(--mc)}.rp time{font:500 10.5px var(--mono);color:var(--dim)}.rp span{white-space:pre-wrap}
footer{padding:0 clamp(16px,4vw,48px) 40px;color:var(--dim);font-size:12px}
.card.note{border-left:3px solid var(--md)}.sec{margin:10px 0 0;font-size:13px;font-weight:700;color:var(--muted)}
.snap{cursor:zoom-in}.snap-zoom{position:absolute;right:6px;top:6px;display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:#ffffffe6;color:#17171f;box-shadow:0 2px 6px #0004}
.lb{position:fixed;inset:0;z-index:9;display:grid;place-items:center;padding:16px;background:#0e0e14f5;cursor:zoom-out}.lb .snap{width:min(100%,calc((100vh - 32px) * var(--ar)));cursor:zoom-out}.lb .snap-zoom{display:none}.lb .pin{transform:scale(1.25)}
@media print{.snap-zoom,.lb{display:none!important}:root{--bg:#fff}body{font-size:12px}header{padding:0 0 12px}main{padding:12px 0}.card{grid-template-columns:300px 1fr;box-shadow:none}.notice{margin:12px 0 0}.row a{display:none}footer{padding:0}@page{margin:14mm}}
</style></head><body>
<header><a class="wm" href="${WSNS_SITE}/" target="_blank" rel="noopener">${logoMarkInline('mk')}<span><b>${t('쎈스 디렉터')}</b><small>WSNS studio <em>[${t('웨스엔에스 스튜디오')}]</em></small></span></a><div class="grow"><div class="eb">${kind === 'history' ? t('수정 내역서') : role === 'director' ? t('디렉터 회신') : t('수정요청')}</div><h1>${title}</h1>
<div class="sum">${items.length}${t('건 ·')} ${esc(reqs.map(r => r.from).filter(Boolean).join(', ') || t('클라이언트'))} · ${fmtDate(Date.now())}${p.d ? ' · ' + esc(dueLabel(p.d)) : ''}</div></div>
${link ? `<a href="${esc(link)}">${role === 'director' ? t('클라이언트 화면에서 열기') : t('디렉터 수신함으로 가져오기')}</a>` : ''}</header>
${p.n && role === 'director' ? `<div class="notice">${esc(p.n)}</div>` : ''}
<main>${noteCards ? `<h2 class="sec">${t('디렉터 안내')} ${notes.length}${t('건')}</h2>${noteCards}${cards ? `<h2 class="sec">${t('수정요청')} ${items.length}${t('건')}</h2>` : ''}` : ''}${cards || (noteCards ? '' : t('<p>수정 포인트가 없습니다.</p>'))}</main>
<footer>${t('쎈스 디렉터 · WesNS — 이 파일을 디렉터 콘솔에 끌어 놓으면 수신함으로 들어갑니다.')}</footer>
<script type="application/json" id="sd-data">${data}</script>
<script>document.addEventListener('click',function(e){var lb=document.querySelector('.lb');if(lb){lb.remove();return;}var s=e.target.closest('.snap');if(!s)return;var w=document.createElement('div');w.className='lb';var c=s.cloneNode(true);w.style.setProperty('--ar',s.clientWidth/s.clientHeight);w.appendChild(c);document.body.appendChild(w);});document.addEventListener('keydown',function(e){if(e.key==='Escape'){var lb=document.querySelector('.lb');lb&&lb.remove();}});<\/script>
</body></html>`;
}

/** 인쇄 창에서 'PDF로 저장' */
export function printHTML(html) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  f.onload = () => { setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch {} setTimeout(() => f.remove(), 60000); }, 400); };
  f.srcdoc = html;
}

/** HTML 파일 공유: 휴대폰이면 공유 시트, 아니면 내려받기 */
export async function shareFile(name, html) {
  const file = new File([html], name, { type: 'text/html' });
  if (navigator.canShare && matchMedia('(pointer:coarse)').matches && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  return 'downloaded';
}

/** 파일·링크에서 수정요청 꺼내기 */
export async function parseIncoming(text) {
  text = String(text || '').trim();
  const m = text.match(/#r=([A-Za-z0-9_-]+)/);
  if (m) { const { unpack } = await import('./util.js'); return await unpack(m[1]); }
  const d = text.match(/<script type="application\/json" id="sd-data">([\s\S]*?)<\/script>/);
  const j = JSON.parse(d ? d[1] : text);
  if (j.kind === 'sense-director') return { p: j.p, reqs: j.reqs };
  throw new Error('format');
}

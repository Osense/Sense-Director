/* 링크·메시지·HTML·PDF 만들기 */
import { pack, appBase, tc, esc, fmtDate, dueLabel } from './util.js';
import { snapHTML } from './viewer.js';

export const STATUS = { open: '대기', doing: '진행 중', done: '반영', hold: '보류' };

/** 클라이언트 링크에 담는 프로젝트 정보 (핀 번호 자체는 담지 않고 해시만) */
export const projectPayload = p => ({ v: 1, id: p.id, t: p.title, n: p.notice, d: p.due, src: p.src, ar: p.ar, fps: p.fps, fh: p.fpsHow || '', ph: p.pinHash, s: p.salt, by: p.by || '' });
const slimItem = it => ({ id: it.id, t: Math.round(it.t * 1000) / 1000, x: it.x, y: it.y, s: it.s && it.s.length ? it.s : undefined, tx: it.tx || '', st: it.st, rp: it.rp && it.rp.length ? it.rp : undefined });
export const slimRequest = r => ({ rid: r.rid, from: r.from, at: r.at, items: r.items.map(slimItem) });

export async function clientLink(p, feedback) {
  let url = appBase() + '#c=' + await pack(projectPayload(p));
  if (feedback) url += '&f=' + await pack(feedback.map(slimRequest));
  return url;
}
export async function replyLink(payload, req) { return appBase() + '#r=' + await pack({ p: payload, r: slimRequest(req) }); }

const pinTxt = it => it.x != null ? `핀 X ${it.x.toFixed(1)}% Y ${it.y.toFixed(1)}%` : it.s && it.s.length ? '그림' : '메모';
const pad2 = n => String(n).padStart(2, '0');

export function requestMessage(p, req, link) {
  const fps = p.fps || 30;
  const lines = [`[Sense Director] 수정요청 · ${p.t || p.title}`, `보낸 사람: ${req.from || '클라이언트'} · ${req.items.length}건 · ${fmtDate(req.at || Date.now())}`, ''];
  req.items.forEach((it, i) => { lines.push(`${pad2(i + 1)}  ${tc(it.t, fps)}  ${pinTxt(it)}${it.s && it.s.length && it.x != null ? ' + 그림' : ''}`); lines.push(it.tx ? it.tx : '(내용 없음)'); lines.push(''); });
  if (link) lines.push('디렉터 수신함으로 바로 가져오기:', link);
  return lines.join('\n');
}

export function feedbackMessage(p, reqs, link) {
  const fps = p.fps || 30, all = reqs.flatMap(r => r.items);
  const c = k => all.filter(it => (it.st || 'open') === k).length;
  const lines = [`[Sense Director] 수정요청 회신 · ${p.title}`, `반영 ${c('done')} · 진행 ${c('doing')} · 보류 ${c('hold')} · 대기 ${c('open')} / 총 ${all.length}건`, ''];
  all.forEach((it, i) => {
    lines.push(`${pad2(i + 1)}  ${tc(it.t, fps)}  [${STATUS[it.st || 'open']}]`);
    if (it.tx) lines.push('요청: ' + it.tx);
    (it.rp || []).filter(r => r.by === 'd').forEach(r => lines.push('디렉터: ' + r.b));
    lines.push('');
  });
  if (link) lines.push('확인 링크 (핀 번호 필요):', link);
  return lines.join('\n');
}

/** 혼자 열리는 HTML 보고서. 디렉터 콘솔에 끌어 놓으면 그대로 수신함으로 들어간다. */
export function reportHTML({ p, reqs, role = 'client', link = '' }) {
  const fps = p.fps || 30, ar = p.ar || [16, 9], ytId = p.src && p.src.k === 'yt' ? p.src.id : '';
  const items = reqs.flatMap(r => r.items.map(it => ({ ...it, from: r.from })));
  const data = JSON.stringify({ kind: 'sense-director', v: 1, p: projectPayload(p), reqs }).replace(/</g, '\\u003c');
  const ytLink = t => ytId ? `https://youtu.be/${ytId}?t=${Math.floor(t)}` : '';
  const cards = items.map((it, i) => `
  <article class="card">
    ${snapHTML(it, i + 1, ar, ytId)}
    <div class="meta">
      <div class="row"><span class="no">${pad2(i + 1)}</span><b class="tc">${tc(it.t, fps)}</b><span class="tag st-${it.st || 'open'}">${STATUS[it.st || 'open']}</span>${ytLink(it.t) ? `<a href="${ytLink(it.t)}" target="_blank" rel="noopener">이 시점 보기</a>` : ''}</div>
      <div class="pos">${esc(pinTxt(it))}${it.from ? ' · ' + esc(it.from) : ''}</div>
      <p class="tx">${esc(it.tx || '(내용 없음)')}</p>
      ${(it.rp || []).map(r => `<div class="rp ${r.by === 'd' ? 'd' : 'c'}"><b>${r.by === 'd' ? '디렉터' : esc(r.n || '클라이언트')}</b><span>${esc(r.b)}</span><time>${fmtDate(r.at)}</time></div>`).join('')}
    </div>
  </article>`).join('');
  const title = esc(p.t || p.title || '수정요청');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · ${role === 'director' ? '수정요청 회신' : '수정요청'}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&family=IBM+Plex+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
:root{color-scheme:dark;--bg:#120e0e;--panel:#180f11;--raised:#1d1315;--line:#3a2628;--div:#2a1b1d;--text:#f4ecea;--muted:#b99598;--dim:#a68488;--accent:#ff5a5a;--amber:#ffb020;--ok:#7fc8a0;--mono:'JetBrains Mono','IBM Plex Sans KR',ui-monospace,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 'IBM Plex Sans','IBM Plex Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;word-break:keep-all;-webkit-font-smoothing:antialiased}
header{padding:28px clamp(16px,4vw,48px) 20px;border-bottom:1px solid var(--div);display:flex;flex-wrap:wrap;gap:12px 24px;align-items:flex-end}
.wm{font:500 12px var(--mono);letter-spacing:.14em}.wm b{color:var(--accent);font-weight:500}.wm i{font:italic 18px Georgia,serif;letter-spacing:-.03em}
.eb{font:500 10.5px var(--mono);letter-spacing:.12em;color:var(--dim);text-transform:uppercase}h1{margin:4px 0 0;font-size:24px;letter-spacing:-.03em}
.sum{color:var(--muted);font:500 12px var(--mono)}.grow{flex:1}a{color:var(--accent)}
.notice{margin:20px clamp(16px,4vw,48px) 0;padding:14px 16px;border:1px solid var(--div);border-left:2px solid var(--amber);border-radius:8px;background:var(--raised);white-space:pre-wrap;color:var(--muted)}
main{padding:20px clamp(16px,4vw,48px) 60px;display:grid;gap:14px}
.card{display:grid;grid-template-columns:minmax(220px,420px) 1fr;gap:18px;padding:14px;background:var(--panel);border:1px solid var(--div);border-radius:12px;break-inside:avoid}
@media(max-width:700px){.card{grid-template-columns:1fr}}
.snap{position:relative;background:#0b0808;border-radius:8px;overflow:hidden}.snap img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.snap img.fallback{opacity:.35}
.nosnap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--dim);font:500 11px var(--mono)}
.ann{position:absolute;inset:0;width:100%;height:100%}.ann g{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}.ann polyline{vector-effect:non-scaling-stroke}
.pin{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:var(--accent);border:2px solid var(--text);box-shadow:0 0 0 4px #ff5a5a33}
.pin b{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:var(--accent);color:#120e0e;border:2px solid var(--text);font:500 11px/18px var(--mono);text-align:center}.pin.below b{bottom:auto;top:16px}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px}.no{font:500 12px var(--mono);color:#120e0e;background:var(--accent);border-radius:5px;padding:0 6px}
.tc{font:500 18px var(--mono);letter-spacing:-.01em}.row a{font-size:12px;margin-left:auto}
.tag{font:500 10.5px var(--mono);letter-spacing:.06em;border:1px solid var(--line);border-radius:4px;padding:0 6px;color:var(--muted)}.st-done{color:var(--ok);border-color:var(--ok)}.st-doing{color:var(--amber);border-color:var(--amber)}.st-hold{color:var(--dim)}
.pos{font:500 11px var(--mono);color:var(--dim);margin-top:4px}.tx{white-space:pre-wrap;margin:10px 0;font-size:15.5px}
.rp{display:grid;grid-template-columns:auto 1fr auto;gap:2px 10px;padding:8px 10px;margin-top:6px;border-radius:8px;background:var(--raised);border:1px solid var(--div);font-size:13.5px}.rp.d{border-left:2px solid var(--accent)}.rp b{font-size:12px}.rp time{font:500 10.5px var(--mono);color:var(--dim)}.rp span{white-space:pre-wrap}
footer{padding:0 clamp(16px,4vw,48px) 40px;color:var(--dim);font:500 11px var(--mono);letter-spacing:.06em}
@media print{:root{color-scheme:light;--bg:#fff;--panel:#fff;--raised:#f6f3f2;--line:#ccc;--div:#ddd;--text:#111;--muted:#444;--dim:#666}body{font-size:12px}header{padding:0 0 12px}main{padding:12px 0}.card{grid-template-columns:300px 1fr;border-color:#ddd}.notice{margin:12px 0 0}.row a{display:none}footer{padding:0}@page{margin:14mm}}
</style></head><body>
<header><div><div class="wm"><b>SENSE</b> <i>director</i></div></div><div class="grow"><div class="eb">${role === 'director' ? 'Director feedback' : 'Revision request'}</div><h1>${title}</h1>
<div class="sum">${items.length}건 · ${esc(reqs.map(r => r.from).filter(Boolean).join(', ') || '클라이언트')} · ${fmtDate(Date.now())}${p.d ? ' · ' + esc(dueLabel(p.d)) : ''}</div></div>
${link ? `<a href="${esc(link)}">${role === 'director' ? '클라이언트 화면에서 열기' : '디렉터 수신함으로 가져오기'}</a>` : ''}</header>
${p.n && role === 'director' ? `<div class="notice">${esc(p.n)}</div>` : ''}
<main>${cards || '<p>수정 포인트가 없습니다.</p>'}</main>
<footer>SENSE DIRECTOR · OSNS.studio — 이 파일을 디렉터 콘솔에 끌어 놓으면 수신함으로 들어갑니다.</footer>
<script type="application/json" id="sd-data">${data}</script>
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

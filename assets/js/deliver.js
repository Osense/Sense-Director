/* 납품 — 최종본 보내기(30일 유지 링크), 수정 내역서, 납품 확인서, 완료 보관.
   지금은 목업: 최종본 파일은 이 브라우저(IndexedDB)에 두고, 받은 확인도 같은 브라우저로 주고받는다. */
import { $, esc, ic, uid, pack, appBase, modal, toast, copyText, shareOrCopy, safeName, fmtDate, logoMarkInline, WSNS_SITE, brandHTML, themeBtnHTML } from './util.js';
import { Store, MODE } from './store.js';
import { putMedia, getMedia, deleteMedia, fmtSize } from './media.js';
import { projectPayload, reportHTML, printHTML, shareFile, STATUS } from './exports.js';
import { KEEP_DAYS, fitsFileLimit, usedBytes, limitBytes } from './plans.js';
import { t, lang, fmtMD, langBtnHTML } from './i18n.js';

const DAY = 864e5;
export const daysLeft = d => Math.ceil((d.exp - Date.now()) / DAY);
export const expired = d => !d || d.gone || Date.now() >= d.exp;
const keepNote = () => t('이 링크는 {n}일간 유지됩니다. 이후 파일이 서버에서 삭제되므로 반드시 다운로드해 백업하세요.', { n: KEEP_DAYS });
const dayStr = ts => new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(ts));

/** 클라이언트에게 보내는 최종본 링크 */
export async function deliveryLink(p) {
  const d = p.delivery; if (!d) return '';
  return appBase() + '#c=' + await pack({ ...projectPayload(p), dl: { fid: d.fid, name: d.name, size: d.size, type: d.type, at: d.at, exp: d.exp, by: p.by || '' } }) + '&v=dl';
}
const deliveryMessage = (p, link) => [
  `[Sense Director] ${t('최종본 전달')} · ${p.title || ''}`,
  `${p.delivery.name} · ${fmtSize(p.delivery.size)}`,
  '',
  keepNote(),
  `${t('삭제 예정:')} ${dayStr(p.delivery.exp)}`,
  '',
  t('받기 (핀 번호 필요):'), link,
].join('\n');

/* ---------- 문서 ---------- */
const reqsOf = p => Store.inbox(p.id);
export const historyHTML = p => reportHTML({ p, reqs: reqsOf(p), role: 'director', kind: 'history' });

export function certificateHTML(p) {
  const reqs = reqsOf(p), all = reqs.flatMap(r => r.items), c = k => all.filter(it => (it.st || 'open') === k).length;
  const from = [...new Set(reqs.map(r => r.from).filter(Boolean))].join(', ') || t('클라이언트');
  const first = reqs.length ? Math.min(...reqs.map(r => r.at)) : p.createdAt;
  const d = p.delivery, ok = Store.delivery(p.id);
  const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="color-scheme" content="only light"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title || '')} · ${t('납품 확인서')}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
:root{color-scheme:only light;--line:#dcdde5;--dim:#6b6d7b;--text:#17171f;--brand:#6a4ee0}
*{box-sizing:border-box}body{margin:0;background:#f4f4f7;color:var(--text);font:15px/1.65 'Pretendard Variable',Pretendard,system-ui,sans-serif;word-break:keep-all}
.page{max-width:760px;margin:28px auto;padding:48px 52px;background:#fff;border:1px solid var(--line);border-radius:6px}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:26px}.top .mk{height:34px;width:auto}.top small{color:var(--dim);font-size:12px}
h1{margin:0 0 6px;text-align:center;font-size:30px;letter-spacing:.3em;font-weight:800}.sub{text-align:center;color:var(--dim);margin:0 0 28px;font-size:13px}
table{width:100%;border-collapse:collapse;margin:0 0 22px}th,td{border:1px solid var(--line);padding:10px 14px;text-align:left;vertical-align:top}th{width:28%;background:#f7f7fa;font-weight:600;font-size:13.5px;color:#3a3b47}
.stat{display:flex;gap:14px;flex-wrap:wrap}.stat span b{font-size:16px}
.stmt{margin:26px 0 34px;text-align:center;font-size:15.5px}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:26px}.sign div{border-top:1px solid var(--text);padding-top:8px;font-size:13px;color:var(--dim)}.sign b{display:block;color:var(--text);font-size:14px;margin-bottom:26px}
.ok{color:#127a52;font-weight:700}.wait{color:#b05a00;font-weight:600}
.date{text-align:center;margin-top:30px;font-size:15px}
@media print{body{background:#fff}.page{margin:0;border:0;padding:12mm 14mm}@page{margin:10mm}}
</style></head><body><div class="page">
<div class="top"><a href="${WSNS_SITE}/" target="_blank" rel="noopener">${logoMarkInline('mk')}</a><small>${t('쎈스 디렉터')} · WSNS studio</small></div>
<h1>${t('납품 확인서')}</h1><p class="sub">${t('아래 영상물의 최종본을 납품하였음을 확인합니다.')}</p>
<table>
${row(t('프로젝트'), `<b>${esc(p.title || t('제목 없음'))}</b>`)}
${row(t('납품처(클라이언트)'), esc(from))}
${row(t('제작(디렉터)'), esc(p.by || '—'))}
${row(t('최종본 파일'), d ? `${esc(d.name)} · ${fmtSize(d.size)}` : `<span class="wait">${t('아직 보내지 않음')}</span>`)}
${row(t('전달일'), d ? dayStr(d.at) : '—')}
${row(t('검수 기간'), `${dayStr(first)} ~ ${d ? dayStr(d.at) : dayStr(Date.now())}`)}
${row(t('수정요청 처리'), `<div class="stat"><span>${t('총')} <b>${all.length}</b>${t('건')}</span><span>${STATUS.done} <b>${c('done')}</b></span><span>${STATUS.doing} <b>${c('doing')}</b></span><span>${STATUS.hold} <b>${c('hold')}</b></span><span>${STATUS.open} <b>${c('open')}</b></span></div>`)}
${row(t('클라이언트 수령 확인'), ok && ok.okAt ? `<span class="ok">${t('확인 완료')}</span> · ${dayStr(ok.okAt)}${ok.by ? ' · ' + esc(ok.by) : ''}` : ok && ok.gotAt ? `${t('다운로드함')} · ${dayStr(ok.gotAt)}` : `<span class="wait">${t('확인 전')}</span>`)}
</table>
<p class="stmt">${t('위와 같이 최종본을 납품하고, 수정요청 처리 내역을 확인합니다.')}</p>
<div class="sign"><div><b>${t('납품자')}</b>${t('(서명)')}</div><div><b>${t('인수자')}</b>${t('(서명)')}</div></div>
<p class="date">${dayStr(Date.now())}</p>
</div></body></html>`;
}
const openHTML = html => { const u = URL.createObjectURL(new Blob([html], { type: 'text/html' })); const w = open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); return w; };

/* ---------- 디렉터: 납품 탭 ---------- */
export function renderDeliver(side, p, onChange) {
  const draw = async () => {
    const d = p.delivery, gone = d && expired(d);
    if (d && gone && !d.gone) { d.gone = true; deleteMedia(d.fid); Store.saveProject(p); }
    const ok = Store.delivery(p.id), all = reqsOf(p).flatMap(r => r.items), c = k => all.filter(it => (it.st || 'open') === k).length;
    side.innerHTML = `
    <div class="card dl-card">
      <div class="card-title">${ic('send', 16)}${t('최종본 보내기')}</div>
      ${!d ? `
        <label class="dl-drop" data-dl-drop tabindex="0">${ic('import', 22)}<b>${t('최종본 파일 고르기')}</b><span>${t('고화질 원본도 그대로 보낼 수 있어요. 구글 드라이브 없이 링크 하나로 전달돼요.')}</span><input type="file" data-dl-file hidden></label>`
      : `
        <div class="dl-file${gone ? ' gone' : ''}">${ic('file', 18)}<div><b>${esc(d.name)}</b><span>${fmtSize(d.size)} · ${t('보낸 날')} ${fmtMD(new Date(d.at))}</span></div>
          ${gone ? `<span class="tag">${t('삭제됨')}</span>` : `<span class="tag dday" title="${t('삭제 예정')} ${dayStr(d.exp)}">D-${daysLeft(d)}</span>`}</div>
        ${gone ? `<p class="note">${t('유지 기간이 지나 서버에서 삭제됐어요. 다시 보내려면 새 파일을 골라 주세요.')}</p>` : `
        <p class="keep-note">${ic('clock', 14)}<span>${keepNote()}<br><b>${t('삭제 예정:')} ${dayStr(d.exp)}</b></span></p>
        <div class="dl-acts">
          <button class="btn brand" data-dl="msg">${ic('msg')}${t('안내 글과 링크 복사')}</button>
          <button class="btn" data-dl="copy">${ic('link')}${t('링크만 복사')}</button>
          <button class="btn ghost" data-dl="open">${ic('newtab')}${t('받는 화면 보기')}</button>
        </div>`}
        <div class="dl-state">${ok && ok.okAt ? `<span class="ok">${ic('check', 14)}${t('클라이언트가 받았다고 확인했어요')} · ${fmtDate(ok.okAt)}${ok.by ? ' · ' + esc(ok.by) : ''}</span>`
          : ok && ok.gotAt ? `<span>${ic('check', 14)}${t('클라이언트가 내려받았어요')} · ${fmtDate(ok.gotAt)}</span>`
          : `<span class="dim">${t('아직 클라이언트가 받지 않았어요')}</span>`}</div>
        <button class="btn ghost small" data-dl="replace">${ic('sync', 14)}${t('다른 파일로 다시 보내기')}</button><input type="file" data-dl-file hidden>`}
      ${MODE === 'mock' ? `<p class="note dim">${t('시험 버전: 파일은 이 브라우저에만 저장돼요. 정식 서버를 연결하면 어느 기기에서든 링크로 받을 수 있어요.')}</p>` : ''}
    </div>
    <div class="card">
      <div class="card-title">${ic('list', 16)}${t('수정 내역서')}</div>
      <p class="note">${t('받은 수정요청과 반영 상태, 주고받은 댓글을 장면 사진과 함께 정리한 문서예요.')}</p>
      <div class="mini-stat"><span>${t('총')} <b>${all.length}</b></span><span class="st-done">${STATUS.done} <b>${c('done')}</b></span><span class="st-doing">${STATUS.doing} <b>${c('doing')}</b></span><span>${STATUS.hold} <b>${c('hold')}</b></span><span>${STATUS.open} <b>${c('open')}</b></span></div>
      <div class="dl-acts"><button class="btn" data-doc="history-view">${ic('eye')}${t('보기')}</button><button class="btn" data-doc="history-pdf">${ic('print')}PDF</button><button class="btn ghost" data-doc="history-html">${ic('file')}HTML</button></div>
    </div>
    <div class="card">
      <div class="card-title">${ic('check', 16)}${t('납품 확인서')}</div>
      <p class="note">${t('최종본 파일, 전달일, 수정요청 처리 결과, 클라이언트 수령 확인을 한 장으로 정리해요. 서명란이 있어 출력해 쓸 수 있어요.')}</p>
      <div class="dl-acts"><button class="btn" data-doc="cert-view">${ic('eye')}${t('보기')}</button><button class="btn" data-doc="cert-pdf">${ic('print')}PDF</button></div>
    </div>
    <div class="card done-card${p.done ? ' is-done' : ''}">
      <div class="card-title">${ic('inbox', 16)}${t('프로젝트 완료')}</div>
      ${p.done ? `<p class="note"><b>${t('완료 보관함에 있어요')}</b> · ${fmtDate(p.done)}. ${t('지우지 않고 링크·문서와 함께 보관돼요.')}</p>
        <button class="btn" data-done="reopen">${ic('undo', 14)}${t('다시 진행하기')}</button>`
      : `<p class="note">${t('검수가 끝나면 완료로 보관하세요. 프로젝트는 지워지지 않고 왼쪽 "완료 보관함"으로 옮겨져, 링크와 문서를 언제든 다시 볼 수 있어요.')}</p>
        <button class="btn brand" data-done="done">${ic('check', 14)}${t('완료로 보관하기')}</button>`}
    </div>`;
  };
  const pick = () => $('[data-dl-file]', side).click();
  side.addEventListener('click', async e => {
    if (e.target.closest('[data-dl-drop]')) { e.preventDefault(); pick(); return; }
    const a = e.target.closest('[data-dl]'), doc = e.target.closest('[data-doc]'), dn = e.target.closest('[data-done]');
    if (a) {
      const k = a.dataset.dl;
      if (k === 'replace') { pick(); return; }
      const link = await deliveryLink(p);
      if (k === 'copy') toast(await copyText(link) ? t('최종본 링크를 복사했어요') : t('복사하지 못했어요'));
      else if (k === 'msg') { const r = await shareOrCopy({ title: p.title, text: deliveryMessage(p, link) }); toast(r === 'copied' ? t('안내 글과 링크를 복사했어요. 카톡에 붙여 넣어 주세요') : r === 'shared' ? t('공유했어요') : t('복사하지 못했어요'), 3400); }
      else if (k === 'open') open(link, '_blank', 'noopener');
      return;
    }
    if (doc) {
      const k = doc.dataset.doc, name = safeName(`${p.title || t('프로젝트')}_${k.startsWith('cert') ? t('납품확인서') : t('수정내역서')}`);
      const html = k.startsWith('cert') ? certificateHTML(p) : historyHTML(p);
      if (k.endsWith('pdf')) printHTML(html); else if (k.endsWith('html')) { await shareFile(name + '.html', html); toast(t('HTML을 내려받았어요')); } else openHTML(html);
      return;
    }
    if (dn) { p.done = dn.dataset.done === 'done' ? Date.now() : 0; Store.saveProject(p); toast(p.done ? t('완료 보관함으로 옮겼어요') : t('다시 진행 중으로 옮겼어요')); onChange && onChange(); }
  });
  side.addEventListener('change', async e => {
    const inp = e.target.closest('[data-dl-file]'); if (!inp || !inp.files[0]) return;
    const f = inp.files[0]; inp.value = '';
    await sendFinal(p, f) && (Store.clearDelivery(p.id), draw(), onChange && onChange());
  });
  side.addEventListener('dragover', e => { if (e.target.closest('[data-dl-drop]')) { e.preventDefault(); e.stopPropagation(); } });
  side.addEventListener('drop', async e => {
    if (!e.target.closest('[data-dl-drop]')) return; e.preventDefault(); e.stopPropagation();
    const f = e.dataTransfer.files[0]; if (f && await sendFinal(p, f)) { Store.clearDelivery(p.id); draw(); onChange && onChange(); }
  });
  Store.onChangeAlso('deliver', k => { if (k === 'sd:dl:' + p.id && side.isConnected) draw(); });
  draw();
}

async function sendFinal(p, file) {
  if (!fitsFileLimit(file.size)) return false;
  const left = limitBytes() - usedBytes(Store.projects());
  if (file.size > left) { toast(t('이번 달 업로드 용량이 모자라요. 요금제 화면에서 용량을 추가할 수 있어요'), 4200); return false; }
  let setP;
  const done = modal({
    title: t('최종본 올리는 중'), dismissible: false,
    body: `<div class="upload"><b>${esc(file.name)}</b><span class="dim">${fmtSize(file.size)}</span><div class="progress big"><i data-up></i></div><span class="up-pct" data-pct>0%</span></div>
      <p class="note dim">${keepNote()}</p>`,
    onOpen: (w, close) => { setP = (x, end) => { $('[data-up]', w).style.width = x * 100 + '%'; $('[data-pct]', w).textContent = Math.round(x * 100) + '%'; if (end) setTimeout(() => close('ok'), 250); }; },
  });
  try {
    if (p.delivery && !p.delivery.gone) deleteMedia(p.delivery.fid);
    const meta = await putMedia('dl' + uid(10), file, x => setP && setP(x));
    const at = Date.now();
    p.delivery = { fid: meta.fid, name: meta.name, size: meta.size, type: meta.type, at, exp: at + KEEP_DAYS * DAY };
    Store.saveProject(p);
    setP(1, true); await done;
    toast(t('최종본을 올렸어요. 링크를 복사해 클라이언트에게 보내 주세요'), 3400);
    return true;
  } catch { setP && setP(0, true); await done; toast(t('파일을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요')); return false; }
}

/* ---------- 클라이언트: 최종본 받는 화면 ---------- */
export function renderDelivery(app, p) {
  const d = p.dl, gone = Date.now() >= d.exp;
  document.title = (p.t || t('최종본')) + ' · ' + t('최종본 받기');
  const ok = () => Store.delivery(p.id);
  const draw = () => {
    const s = ok();
    app.innerHTML = `
    <header class="topbar">${brandHTML('span', t('aria-label="쎈스 디렉터"'))}<div class="grow"></div>${langBtnHTML()}${themeBtnHTML()}</header>
    <main class="dl-page"><div class="dl-box">
      <div class="eyebrow">${t('최종본 전달')}${p.by ? ' · ' + esc(p.by) : ''}</div>
      <h1>${esc(p.t || t('제목 없는 프로젝트'))}</h1>
      <div class="dl-file big${gone ? ' gone' : ''}">${ic('file', 22)}<div><b>${esc(d.name)}</b><span>${fmtSize(d.size)} · ${t('보낸 날')} ${fmtMD(new Date(d.at))}</span></div></div>
      ${gone ? `<p class="keep-note gone">${ic('clock', 15)}<span><b>${t('유지 기간이 지나 파일이 삭제됐어요.')}</b><br>${t('디렉터에게 다시 보내 달라고 요청해 주세요.')}</span></p>`
      : `<button class="btn brand big" data-get>${ic('import', 18)}${t('내려받기')}</button>
        <p class="keep-note">${ic('clock', 15)}<span><b>${keepNote()}</b><br>${t('삭제 예정:')} ${dayStr(d.exp)} (D-${daysLeft(d)})</span></p>
        <div class="dl-confirm">${s && s.okAt ? `<span class="ok">${ic('check', 15)}${t('받았다고 디렉터에게 알렸어요')} · ${fmtDate(s.okAt)}</span>`
          : `<input class="field-in" data-who placeholder="${t('이름 (선택)')}" maxlength="30" value="${esc(Store.client(p.id).from || '')}"><button class="btn" data-ok>${ic('check', 15)}${t('잘 받았어요')}</button>`}</div>`}
    </div></main>`;
  };
  app.addEventListener('click', async e => {
    if (e.target.closest('[data-get]')) {
      const blob = await getMedia(d.fid);
      if (!blob) { toast(MODE === 'mock' ? t('시험 버전: 최종본은 디렉터가 올린 브라우저에서만 받을 수 있어요') : t('파일을 찾지 못했어요'), 4600); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = d.name; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      Store.saveDelivery(p.id, { gotAt: (ok() || {}).gotAt || Date.now() });
      toast(t('내려받기를 시작했어요. 꼭 백업해 두세요'));
    }
    if (e.target.closest('[data-ok]')) {
      const by = ($('[data-who]', app) || {}).value || '';
      Store.saveDelivery(p.id, { okAt: Date.now(), by: by.trim() }); draw(); toast(t('디렉터에게 받았다고 알렸어요'));
    }
  });
  draw();
}

/* 메신저처럼 보이는 오른쪽 작업창 — 상대 말은 왼쪽(프로필·이름), 내 말은 오른쪽, 시간은 말풍선 옆 */
import { esc, modal, $ } from './util.js';
import { replyKey } from './store.js';
import { t, fmtTime, fmtDay } from './i18n.js';

/** 이름 첫 글자 동그라미 */
export const avatar = (name, side) => `<span class="av ${side}" aria-hidden="true">${esc((String(name || '?').trim().charAt(0) || '?').toUpperCase())}</span>`;

/**
 * 한 줄의 대화
 * me: 내 말인가(오른쪽) · side: 'c' 클라이언트 / 'd' 디렉터 (색) · name: 상대 이름(왼쪽일 때 위에 표시)
 * body: 말풍선 안 HTML · at: 시간 · cls: 말풍선 추가 클래스 · after: 말풍선 아래(상태 등)
 */
export function msg({ me, side, name, body, at, cls = '', after = '', meta = '', attrs = '' }) {
  return `<div class="msg ${me ? 'me' : 'them'} ${side}" ${attrs}>
    ${me ? '' : avatar(name, side)}
    <div class="mcol">
      ${me ? '' : `<div class="mname">${esc(name || '')}</div>`}
      <div class="mrow"><div class="bubble ${cls}">${body}</div><span class="mtime">${meta}${at ? `<time>${fmtTime(at)}</time>` : ''}</span></div>
      ${after}
    </div>
  </div>`;
}

/** 댓글들을 대화로 — mineBy: 지금 화면 주인('c'|'d'), names: { c, d }. 우클릭으로 고치고 지울 수 있게 data-rk를 단다 */
export const replies = (rp, mineBy, names, pendingText) => (rp || []).map(r => msg({
  me: r.by === mineBy, side: r.by, name: r.by === 'd' ? (r.n || names.d) : (r.n || names.c),
  body: r.del ? `<span class="said-text gone">${t('삭제된 메시지예요')}</span>` : `<span class="said-text">${esc(r.b)}</span>`,
  at: r.pending ? 0 : r.at, cls: 'rp ' + r.by + (r.del ? ' gone' : ''),
  meta: (r.pending ? `<em>${pendingText || ''}</em>` : '') + (r.ed && !r.del ? `<em class="edited">${t('수정됨')}</em>` : ''),
  attrs: `data-rk="${esc(replyKey(r))}"${r.del ? ' data-gone' : ''}`,
})).join('');

/** 고쳐 쓰기 창 — 고친 글 또는 null */
export async function editText(title, value, placeholder = '') {
  let v = value;
  const r = await modal({
    title,
    body: `<textarea class="field-in edit-tx" data-edit rows="4" maxlength="2000" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`,
    actions: [{ label: t('취소'), value: null }, { label: t('고치기'), kind: 'primary', value: 'ok' }],
    onOpen: w => {
      const ta = $('[data-edit]', w); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      ta.addEventListener('input', () => { v = ta.value; });
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); v = ta.value; $('.foot .primary', w).click(); } });
    },
  });
  return r === 'ok' ? v.trim() : null;
}
/** 지울까요? */
export async function confirmDelete(title, body) {
  const r = await modal({ title, body: `<p class="note">${body}</p>`, actions: [{ label: t('취소'), value: null }, { label: t('삭제'), kind: 'danger', value: 'del' }] });
  return r === 'del';
}

/** 날짜 띠 (카톡처럼 가운데) */
export const dayLine = (ts, extra = '') => `<div class="group-head chat-day"><span>${ts ? fmtDay(ts) : ''}${extra ? (ts ? ' · ' : '') + extra : ''}</span></div>`;

/** 입력창 (둥근 칸 + 보내기) */
export const composer = (placeholder, label = t('보내기')) => `<form class="reply chat-in" data-reply><input placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"><button class="send-ic" aria-label="${esc(label)}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 12 20 4l-6 16-3-7z" fill="currentColor"/></svg></button></form>`;

/** 댓글을 단 뒤 — 입력창이 툭 밀려나지 않게: 새 말풍선은 살짝 올라오며 나타나고, 목록은 부드럽게 따라 내려간다 */
export async function glide(root, id, run) {
  const find = () => root.querySelector(`[data-id="${CSS.escape(id)}"] [data-reply]`);
  const f0 = find(), y0 = f0 ? f0.getBoundingClientRect().top : null;
  await run();
  const f = find(); if (!f) return;
  const msgs = f.closest('.item') ? f.closest('.item').querySelectorAll('.thread .msg') : [];
  const nb = msgs[msgs.length - 1]; if (nb) nb.classList.add('msg-new');
  const inp = f.querySelector('input'); if (inp) inp.focus({ preventScroll: true });
  if (y0 == null) return;
  const d = f.getBoundingClientRect().top - y0; if (Math.abs(d) < 2) return;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sc = scrollParent(f); if (sc) sc.scrollBy({ top: d, behavior: calm ? 'auto' : 'smooth' });
}
function scrollParent(el) {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return document.scrollingElement;
}

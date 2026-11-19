/* 메신저처럼 보이는 오른쪽 작업창 — 상대 말은 왼쪽(프로필·이름), 내 말은 오른쪽, 시간은 말풍선 옆 */
import { esc } from './util.js';
import { t, fmtTime, fmtDay } from './i18n.js';

/** 이름 첫 글자 동그라미 */
export const avatar = (name, side) => `<span class="av ${side}" aria-hidden="true">${esc((String(name || '?').trim().charAt(0) || '?').toUpperCase())}</span>`;

/**
 * 한 줄의 대화
 * me: 내 말인가(오른쪽) · side: 'c' 클라이언트 / 'd' 디렉터 (색) · name: 상대 이름(왼쪽일 때 위에 표시)
 * body: 말풍선 안 HTML · at: 시간 · cls: 말풍선 추가 클래스 · after: 말풍선 아래(상태 등)
 */
export function msg({ me, side, name, body, at, cls = '', after = '', meta = '' }) {
  return `<div class="msg ${me ? 'me' : 'them'} ${side}">
    ${me ? '' : avatar(name, side)}
    <div class="mcol">
      ${me ? '' : `<div class="mname">${esc(name || '')}</div>`}
      <div class="mrow"><div class="bubble ${cls}">${body}</div><span class="mtime">${meta}${at ? `<time>${fmtTime(at)}</time>` : ''}</span></div>
      ${after}
    </div>
  </div>`;
}

/** 댓글들을 대화로 — mineBy: 지금 화면 주인('c'|'d'), names: { c, d } */
export const replies = (rp, mineBy, names, pendingText) => (rp || []).map(r => msg({
  me: r.by === mineBy, side: r.by, name: r.by === 'd' ? (r.n || names.d) : (r.n || names.c),
  body: `<span class="said-text">${esc(r.b)}</span>`, at: r.pending ? 0 : r.at, cls: 'rp ' + r.by,
  meta: r.pending ? `<em>${pendingText || ''}</em>` : '',
})).join('');

/** 날짜 띠 (카톡처럼 가운데) */
export const dayLine = (ts, extra = '') => `<div class="group-head chat-day"><span>${ts ? fmtDay(ts) : ''}${extra ? (ts ? ' · ' : '') + extra : ''}</span></div>`;

/** 입력창 (둥근 칸 + 보내기) */
export const composer = (placeholder, label = t('보내기')) => `<form class="reply chat-in" data-reply><input placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"><button class="send-ic" aria-label="${esc(label)}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 12 20 4l-6 16-3-7z" fill="currentColor"/></svg></button></form>`;

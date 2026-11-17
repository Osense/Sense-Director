/* 사용 안내 — 프로젝트를 만들 때마다 애니메이션으로 보여 준다. '다시 보지 않기'를 고르면 자동으로는 뜨지 않는다.
   그림은 실제 화면을 줄여 HTML·CSS 애니메이션으로 그린다(밝은·다크 모드, 언어를 그대로 따른다). */
import { $, ic, esc } from './util.js';
import { t } from './i18n.js';

const OFF = 'sd:tour:off';
const isOff = () => { try { return localStorage.getItem(OFF) === '1'; } catch { return false; } };

const cur = cls => `<svg class="m-cur ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8-6.2 1.6L10 19z" fill="#17171f" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const pin = (cls, n, d) => `<span class="m-pin ${d ? 'd' : ''} ${cls}"><b>${n}</b></span>`;
const lines = (n, cls = '') => Array.from({ length: n }, (_, i) => `<i class="m-line ${cls}" style="--i:${i}"></i>`).join('');

/* 단계: 제목 · 설명 · 그림 */
const STEPS = () => [
  {
    k: 'add', title: t('1. 영상이나 문서를 넣어요'),
    text: t('유튜브·비메오 링크를 붙여 넣거나 영상·PDF·PPT·사진 파일을 올려요. 화면비와 프레임 수는 알아서 맞춰져요.'),
    tips: [t('사진은 여러 장을 한꺼번에 고르면 한 세트가 돼요'), t('예전 .ppt는 PowerPoint에서 .pptx나 PDF로 저장해 올려요')],
    vis: `<div class="tv s-add">
      <div class="m-input"><span class="m-type">youtu.be/aqz-KE-bpKQ</span><i class="m-caret"></i><b class="m-btn">${t('만들기')}</b></div>
      <div class="m-drop">${ic('import', 14)}<span>${t('파일 올리기')}</span><em>MP4 · PDF · PPTX · JPG</em></div>
      <div class="m-stage"><i class="m-playbtn"></i></div>
      <div class="m-chips"><span>16:9</span><span>30fps</span></div>
      ${cur('c1')}</div>`,
  },
  {
    k: 'setup', title: t('2. 안내사항과 핀 번호'),
    text: t('클라이언트가 처음 열 때 볼 안내와 마감일을 적어요. 4자리 핀 번호를 아는 사람만 검수 화면에 들어올 수 있어요.'),
    tips: [t('자주 쓰는 안내는 아래 칩을 눌러 바로 넣어요'), t('핀을 바꾸면 이전 링크는 더 이상 열리지 않아요')],
    vis: `<div class="tv s-setup">
      <div class="m-card"><div class="m-title">${t('클라이언트 안내사항')}</div>${lines(3, 'grow')}<div class="m-chipsrow"><span></span><span></span><span></span></div></div>
      <div class="m-card m-pinbox"><div class="m-title">${t('핀 번호')}</div><div class="m-digits"><b>4</b><b>8</b><b>1</b><b>7</b></div>${ic('lock', 16)}</div></div>`,
  },
  {
    k: 'share', title: t('3. 링크를 보내요'),
    text: t('링크 복사·카톡·메시지·QR로 클라이언트에게 보내요. 핀 번호는 링크와 따로 보내면 더 안전해요.'),
    tips: [t('‘클라이언트 화면’으로 받는 쪽 화면을 미리 볼 수 있어요')],
    vis: `<div class="tv s-share">
      <div class="m-link"><span>osense.github.io/Sense-Director/#c=…</span><b class="m-copy">${ic('copy', 13)}${t('링크 복사')}</b></div>
      <div class="m-toast">${t('링크를 복사했어요')}</div>
      <div class="m-bubble">${ic('msg', 13)}<span></span></div>
      <div class="m-phone"><div class="m-ph-top"></div><div class="m-digits sm"><b></b><b></b><b></b><b></b></div><div class="m-ph-btn"></div></div>
      ${cur('c3')}</div>`,
  },
  {
    k: 'mark', title: t('4. 클라이언트가 화면에 표시해요'),
    text: t('고칠 장면에서 핀으로 누르거나 펜으로 그리면, 오른쪽에 장면과 시간 주소(시:분:초:프레임)가 붙은 카드가 생기고 바로 내용을 적어요.'),
    tips: [t('클라이언트 표시는 버밀리온, 디렉터 표시는 파란색이에요'), t('같은 장면에 이어 그린 획은 한 카드로 합쳐져요')],
    vis: `<div class="tv s-mark">
      <div class="m-stage film"><div class="m-ov">${pin('p1', '01')}<svg class="m-stroke" viewBox="0 0 100 60" preserveAspectRatio="none"><path class="o" d="M58 40 C64 30, 74 30, 80 40 S 90 50, 84 52"/><path class="i" d="M58 40 C64 30, 74 30, 80 40 S 90 50, 84 52"/></svg></div>
        <div class="m-bar"><i></i><span>00:00:12:08</span></div></div>
      <div class="m-side"><div class="m-item a1"><div class="m-head"><em>01</em><code>00:00:12:08</code></div><div class="m-thumb"></div>${lines(2, 'type')}</div>
        <div class="m-item a2"><div class="m-head"><em>02</em><code>00:00:12:08</code></div>${lines(1, 'type')}</div></div>
      ${cur('c4')}</div>`,
  },
  {
    k: 'send', title: t('5. 수정요청을 보내고 받아요'),
    text: t('클라이언트가 오른쪽 위 ‘수정요청 보내기’를 누르면 디렉터 콘솔의 받은 요청에 들어와요. 장면 사진은 보낼 때 한 번에 만들어져요.'),
    tips: [t('서버 없는 시험 버전에서는 메시지·HTML·PDF로도 주고받아요'), t('받은 메시지나 HTML은 ‘가져오기’로 넣어요')],
    vis: `<div class="tv s-send">
      <div class="m-win left"><div class="m-wtop"><b class="m-sendbtn">${ic('send', 12)}${t('수정요청 보내기')}<em>2</em></b></div>${lines(3)}</div>
      <svg class="m-plane" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 21 4l-6.5 17-3.2-7.3z" fill="currentColor"/></svg>
      <div class="m-win right"><div class="m-wtop"><span>${t('받은 요청')}</span><em class="m-badge">2</em></div><div class="m-inrow r1"></div><div class="m-inrow r2"></div></div>
      ${cur('c5')}</div>`,
  },
  {
    k: 'reply', title: t('6. 상태와 댓글로 답해요'),
    text: t('요청마다 대기·진행 중·반영·보류를 고르고 댓글을 달아요. 썸네일을 누르면 그 장면으로 이동하고, 모서리 버튼으로 크게 봐요.'),
    tips: [t('‘회신 보내기’로 상태와 댓글을 클라이언트에게 돌려보내요'), t('빠른 답 칩: 반영할게요 · 확인했어요 · 다음 버전에 반영')],
    vis: `<div class="tv s-reply">
      <div class="m-item big"><div class="m-head"><em>01</em><code>00:00:12:08</code></div><div class="m-thumb">${pin('p0', '01')}</div>${lines(1)}
        <div class="m-seg"><span>${t('대기')}</span><span>${t('진행 중')}</span><span>${t('반영')}</span><span>${t('보류')}</span><i class="m-segon"></i></div>
        <div class="m-comment"><b>${t('디렉터')}</b><span>${t('반영할게요')}</span></div></div>
      <div class="m-prog"><i></i></div>
      ${cur('c6')}</div>`,
  },
  {
    k: 'notes', title: t('7. 디렉터도 표시해서 안내해요'),
    text: t('받은 요청 화면에서 디렉터가 핀·펜으로 표시하면 파란 ‘디렉터 안내’(D1, D2…)가 돼요. 클라이언트 화면에 파란 표시로 보이고 답글을 달 수 있어요.'),
    tips: [t('‘안내 보내기’로 링크에 담아 전해요')],
    vis: `<div class="tv s-notes">
      <div class="m-stage film"><div class="m-ov">${pin('p2', 'D1', true)}<svg class="m-stroke d" viewBox="0 0 100 60" preserveAspectRatio="none"><path class="o" d="M20 46 L44 46"/><path class="i" d="M20 46 L44 46"/></svg></div></div>
      <div class="m-phone wide"><div class="m-ph-top"></div><div class="m-ph-stage">${pin('p3', 'D1', true)}</div><div class="m-reply"></div></div>
      ${cur('c7')}</div>`,
  },
  {
    k: 'doc', title: t('8. 문서는 확대해서 세밀하게'),
    text: t('PDF·PPT·사진은 재생 줄 대신 쪽 넘기기와 확대가 있어요. Ctrl + 휠이나 두 손가락으로 확대하고, 오른쪽 아래 미니맵이나 이동(H) 도구로 보는 자리를 옮겨요.'),
    tips: [t('확대한 채로 그리면 더 촘촘하게 기록돼요'), t('왼쪽 쪽 목록에 쪽마다 요청 수가 보여요')],
    vis: `<div class="tv s-doc">
      <div class="m-rail"><i class="on"></i><i></i><i></i></div>
      <div class="m-page"><div class="m-zoom">${lines(4)}<div class="m-block"></div><svg class="m-stroke" viewBox="0 0 100 100" preserveAspectRatio="none"><path class="o" d="M44 54 Q50 50 56 54"/><path class="i" d="M44 54 Q50 50 56 54"/></svg></div>
        <div class="m-mini"><i></i></div></div>
      <div class="m-zchip"></div></div>`,
  },
  {
    k: 'view', title: t('9. 목록을 편하게 보기'),
    text: t('오른쪽 목록 위 ‘보기’에서 사진 + 내용 / 내용만을 골라요. 내용만 보기는 장면 사진을 숨겨 수정 내용을 한눈에 훑을 때 좋아요.'),
    tips: [t('키보드 V로 바꿔요 · 고른 보기는 기억돼요'), t('패널 경계를 끌어 영상·목록 크기를 바꿀 수 있어요')],
    vis: `<div class="tv s-view">
      <div class="m-toggle"><span>${t('사진 + 내용')}</span><span>${t('내용만')}</span><i></i></div>
      <div class="m-list"><div class="m-item"><div class="m-head"><em>01</em><code>00:00:03:12</code></div><div class="m-thumb"></div>${lines(1)}</div>
        <div class="m-item"><div class="m-head"><em>02</em><code>00:00:07:01</code></div><div class="m-thumb"></div>${lines(1)}</div>
        <div class="m-item"><div class="m-head"><em>03</em><code>00:00:11:20</code></div><div class="m-thumb"></div>${lines(1)}</div></div></div>`,
  },
];

let openNow = false;
/** 프로젝트를 만든 뒤 자동으로 (다시 보지 않기를 골랐으면 건너뛴다) */
export function maybeShowTour() { if (!isOff()) showTour(); }

export function showTour(start = 0) {
  if (document.querySelector('.modal.tour')) return; openNow = true;
  const steps = STEPS(); let i = Math.max(0, Math.min(steps.length - 1, start));
  const wrap = document.createElement('div');
  wrap.className = 'modal open tour';
  wrap.innerHTML = `<div class="box tour-box" role="dialog" aria-modal="true" aria-label="${t('쎈스 디렉터 사용 안내')}">
    <div class="tour-top"><span class="eyebrow">${t('사용 안내')}</span><span class="tour-count" data-count></span><button class="icon-x" data-tour="close" aria-label="${t('닫기')}">${ic('close', 16)}</button></div>
    <div class="tour-stage" data-vis></div>
    <div class="tour-copy" data-copy aria-live="polite"></div>
    <div class="tour-dots" data-dots role="tablist">${steps.map((s, k) => `<button type="button" role="tab" data-go="${k}" aria-label="${esc(s.title)}"></button>`).join('')}</div>
    <div class="tour-foot">
      <label class="tour-off"><input type="checkbox" data-off ${isOff() ? 'checked' : ''}><span>${t('다시 보지 않기')}</span></label>
      <span class="grow"></span>
      <button class="btn ghost" data-tour="prev">${t('이전')}</button>
      <button class="btn brand" data-tour="next"></button>
    </div></div>`;
  document.body.appendChild(wrap);
  const draw = () => {
    const s = steps[i];
    $('[data-vis]', wrap).innerHTML = s.vis; // 새로 넣어 애니메이션을 처음부터
    $('[data-copy]', wrap).innerHTML = `<h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>${s.tips ? `<ul>${s.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
    $('[data-count]', wrap).textContent = `${i + 1} / ${steps.length}`;
    wrap.querySelectorAll('[data-go]').forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-selected', k === i); });
    $('[data-tour=prev]', wrap).disabled = i === 0;
    $('[data-tour=next]', wrap).textContent = i === steps.length - 1 ? t('시작하기') : t('다음');
    wrap.dataset.step = s.k;
  };
  const close = () => {
    try { localStorage.setItem(OFF, $('[data-off]', wrap).checked ? '1' : '0'); } catch {}
    wrap.remove(); document.removeEventListener('keydown', onKey, true); openNow = false;
  };
  const go = k => { i = Math.max(0, Math.min(steps.length - 1, k)); draw(); };
  const onKey = e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'ArrowRight') { e.stopPropagation(); e.preventDefault(); i < steps.length - 1 ? go(i + 1) : close(); }
    else if (e.key === 'ArrowLeft') { e.stopPropagation(); e.preventDefault(); go(i - 1); }
  };
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('click', e => {
    if (e.target === wrap) return close();
    const b = e.target.closest('[data-tour]'), d = e.target.closest('[data-go]');
    if (d) return go(+d.dataset.go);
    if (!b) return;
    if (b.dataset.tour === 'close') close();
    else if (b.dataset.tour === 'prev') go(i - 1);
    else if (i === steps.length - 1) close(); else go(i + 1);
  });
  // 밀어서 넘기기(휴대폰)
  let sx = null;
  wrap.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  wrap.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1)); });
  draw();
  $('[data-tour=next]', wrap).focus();
}

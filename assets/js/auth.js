/* WesNS 로그인 (목업) — WesNS 사이트와 같은 저장 키(wesns.mock.user)를 쓴다.
   WSNS 홈페이지(https://wsns.studio, 소스 kwonohhwan-wes/WSNS)과는 주소가 달라 로그인이 공유되지 않는다.
   이 브라우저에서 한 번 로그인하면 다음부터 건너뛴다. 회원가입·계정 관리는 WSNS 웹으로 연결한다. */
import { $, esc, ic, brandHTML, themeBtnHTML, logoStacked, pronHTML, WSNS_HOME, WSNS_SITE } from './util.js';
import { t, lang, langBtnHTML } from './i18n.js';

const KEY = 'wesns.mock.user';
const SITE = WSNS_SITE;

export function getUser() {
  try { const u = JSON.parse(localStorage.getItem(KEY) || 'null'); return u && u.email ? u : null; } catch { return null; }
}
function signIn(email, provider = 'email') {
  const now = new Date().toISOString(), old = getUser();
  const u = old && old.email === email ? old : {
    id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
    name: provider === 'email' ? email.split('@')[0] : ({ google: 'Google user', kakao: 'Kakao user', naver: 'Naver user' })[provider] || provider,
    email, provider,
    marketing: { email: false, sms: false },
    consents: { terms: now, privacy: now, age14: now },
  };
  try { localStorage.setItem(KEY, JSON.stringify(u)); } catch {}
  return u;
}
export function signOut() { try { localStorage.removeItem(KEY); } catch {} location.hash = ''; location.reload(); }

const sitePath = p => `${SITE}${lang === 'en' ? '/en' : ''}${p}`;
const kakao = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 3C6.48 3 2 6.48 2 10.78c0 2.77 1.86 5.2 4.66 6.58l-.95 3.48c-.08.3.26.54.52.37l4.13-2.73c.54.06 1.08.1 1.64.1 5.52 0 10-3.48 10-7.8S17.52 3 12 3Z"/></svg>';
const google = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.5 5.5 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81Z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95h-4v3.1A12 12 0 0 0 12 24Z"/><path fill="#FBBC05" d="M5.27 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z"/><path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.59 1.8l3.43-3.43A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.27 6.6l4 3.1C6.22 6.86 8.87 4.75 12 4.75Z"/></svg>';
const naver = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M16.27 12.85 7.38 0H0v24h7.73V11.15L16.62 24H24V0h-7.73z"/></svg>';

let pending = null;
/** 로그인되어 있으면 바로 넘어가고, 아니면 로그인 화면을 띄워 로그인할 때까지 기다린다 */
export function requireLogin(app) {
  if (getUser()) return Promise.resolve(getUser());
  if (pending) { mount(app); return pending.promise; }
  let resolve; const promise = new Promise(r => (resolve = r));
  pending = { promise, resolve };
  mount(app);
  return promise;
}

function mount(app) {
  document.title = t('로그인') + ' · ' + t('쎈스 디렉터');
  app.innerHTML = `
  <div class="auth">
    <div class="auth-top">${brandHTML('span')}<div class="grow"></div>${langBtnHTML()}${themeBtnHTML()}</div>
    <form class="auth-card" novalidate>
      <div class="auth-head">
        <a class="auth-logo" href="${WSNS_HOME()}" target="_blank" rel="noopener" title="${t('WSNS studio 홈페이지')}">${logoStacked()}</a>
        <div class="gate-pron">${pronHTML()}</div>
        <div class="eyebrow">WesNS ${t('계정')}</div>
        <h1>${t('로그인')}</h1>
        <p>${t('WesNS 계정으로 로그인하고 쎈스 디렉터를 시작하세요.')}</p>
      </div>
      <div class="social">
        <button type="button" class="soc google" data-provider="google">${google}Google</button>
        <button type="button" class="soc kakao" data-provider="kakao">${kakao}${t('카카오')}</button>
        <button type="button" class="soc naver" data-provider="naver">${naver}${t('네이버')}</button>
      </div>
      <div class="divider"><span>${t('또는 이메일로 로그인')}</span></div>
      <label class="fld"><span>${t('이메일')}</span><input name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label>
      <label class="fld"><span>${t('비밀번호')}</span>
        <span class="pw"><input name="pw" type="password" autocomplete="current-password" placeholder="${t('8자 이상')}" required>
        <button type="button" class="btn ghost icon small" data-act="show" aria-label="${t('비밀번호 보기')}">${ic('eye', 16)}</button></span></label>
      <p class="auth-err" role="alert" hidden></p>
      <button type="submit" class="btn brand auth-submit">${t('로그인')}</button>
      <p class="auth-mock">${t('목업 화면입니다. 구글·카카오·네이버 버튼은 바로 로그인되고, 이메일은 아무 주소와 8자 이상의 비밀번호로 로그인할 수 있습니다. 정보는 이 브라우저에만 저장됩니다.')}</p>
      <p class="auth-foot">${t('아직 계정이 없으신가요?')} <a href="${sitePath('/signup')}" target="_blank" rel="noopener">${t('회원가입')}</a></p>
    </form>
  </div>`;
  const form = $('.auth-card', app), err = $('.auth-err', form);
  const done = u => { const p = pending; pending = null; p && p.resolve(u); };
  const fail = m => { err.textContent = m; err.hidden = false; };
  $('[name=email]', form).focus();
  form.addEventListener('click', e => {
    const s = e.target.closest('[data-provider]');
    if (s) { done(signIn(`${s.dataset.provider}-user@wesns.example`, s.dataset.provider)); return; }
    if (e.target.closest('[data-act=show]')) { const i = $('[name=pw]', form); i.type = i.type === 'password' ? 'text' : 'password'; }
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const email = $('[name=email]', form).value.trim(), pw = $('[name=pw]', form).value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(t('올바른 이메일 주소를 입력해 주세요.'));
    if (pw.length < 8) return fail(t('비밀번호는 8자 이상입니다.'));
    done(signIn(email));
  });
}

/** 상단 계정 버튼 + 메뉴 */
export function accountBtnHTML() {
  const u = getUser(); if (!u) return '';
  const init = esc((u.name || u.email || '?').trim().charAt(0).toUpperCase());
  return `<div class="acct" data-menu-root>
    <button class="btn ghost icon acct-btn" data-act="account" aria-haspopup="menu" title="${esc(u.email)}"><span class="avatar">${init}</span></button>
    <div class="menu acct-menu" role="menu" hidden>
      <div class="acct-who"><b>${esc(u.name || '')}</b><small>${esc(u.email)}</small></div>
      <button type="button" data-act="plan">${ic('sliders', 15)}<span><b>${t('요금제 · 저장 공간')}</b></span></button>
      <button type="button" data-href="${sitePath('/account')}">${ic('user', 15)}<span><b>${t('WesNS 계정 관리')}</b></span></button>
      <button type="button" data-act="logout">${ic('logout', 15)}<span><b>${t('로그아웃')}</b></span></button>
    </div></div>`;
}

// 계정 메뉴: 어느 화면에서든 같은 처리
addEventListener('click', e => {
  const btn = e.target.closest('[data-act=account]');
  document.querySelectorAll('.acct-menu').forEach(m => { if (!btn || !m.parentElement.contains(btn)) m.hidden = true; });
  if (btn) { const m = btn.parentElement.querySelector('.acct-menu'); m.hidden = !m.hidden; return; }
  const link = e.target.closest('.acct-menu [data-href]');
  if (link) { open(link.dataset.href, '_blank', 'noopener'); return; }
  if (e.target.closest('.acct-menu [data-act=logout]')) signOut();
});

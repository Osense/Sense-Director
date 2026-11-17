/* 언어팩 — 코드에는 한국어 원문을 쓰고 t()로 감싼다. 다른 언어는 assets/i18n/<언어>.js 사전에서 찾는다.
   사전에 없으면 원문(한국어)을 그대로 쓴다. 자리 표시: t('{n}건', { n: 3 })
   언어 설정은 WesNS 사이트와 같은 저장 키(wesns.lang)를 쓴다. */
import en from '../i18n/en.js';

export const LANGS = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
];
const PACKS = { en };
const KEY = 'wesns.lang';

function detect() {
  try { const v = localStorage.getItem(KEY); if (v && LANGS.some(l => l.code === v)) return v; } catch {}
  const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'ko';
  return /^ko\b/i.test(nav) ? 'ko' : 'en';
}
export let lang = detect();
const missing = new Set();
document.documentElement.lang = lang;

export function t(ko, params) {
  const pack = PACKS[lang];
  let s = pack && Object.prototype.hasOwnProperty.call(pack, ko) ? pack[ko] : ko;
  if (pack && s === ko && /[가-힣]/.test(ko) && !missing.has(ko)) { missing.add(ko); window.__i18nMissing = [...missing]; }
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m));
  return s;
}
/** 영어 복수형 같은 간단한 선택: tn(n, '{n}건', ...) → 사전에서 '{n}건|1' 키가 있으면 1일 때 그것을 쓴다 */
export function tn(n, ko, params = {}) {
  const pack = PACKS[lang];
  const one = n === 1 && pack && pack[ko + '|1'];
  return one ? one.replace(/\{(\w+)\}/g, (m, k) => (({ n, ...params })[k] ?? m)) : t(ko, { n, ...params });
}
export function setLang(code) {
  try { localStorage.setItem(KEY, code); } catch {}
  location.reload();
}
/** 날짜·시간 표기 */
export const fmtDateL = ts => new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: lang !== 'ko' }).format(new Date(ts));
export const fmtMD = d => new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', { month: 'numeric', day: 'numeric' }).format(d);

/** 언어 바꾸기 버튼 (한국어 ↔ English) */
export const langBtnHTML = () => {
  const next = lang === 'ko' ? 'en' : 'ko';
  return `<button class="btn ghost lang-btn" data-lang-set="${next}" title="${lang === 'ko' ? 'English' : '한국어'}" aria-label="${lang === 'ko' ? 'Switch to English' : '한국어로 보기'}"><svg class="ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg><span>${lang === 'ko' ? 'EN' : '한국어'}</span></button>`;
};
addEventListener('click', e => { const b = e.target.closest('[data-lang-set]'); if (b) setLang(b.dataset.langSet); });

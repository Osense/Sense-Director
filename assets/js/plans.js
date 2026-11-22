/* 요금제·저장 공간 — 지금은 목업(이 브라우저에 올린 파일 크기로 계산, 결제는 서버를 붙일 때 연결).
   무료 / 1플랜 / 2플랜은 프로젝트 수와 한 달 업로드 용량만 다르다. */
import { esc, ic, modal, toast } from './util.js';
import { fmtSize } from './media.js';
import { t } from './i18n.js';

const GB = 1 << 30;
export const KEEP_DAYS = 30; // 최종본 전달 링크 유지 기간
export const PLANS = [
  { id: 'free', name: () => t('무료'), price: 0, projects: 2, upload: 0, file: 0, desc: () => t('유튜브·비메오·캔바 링크, 사진·PDF로 검수') },
  { id: 'p1', name: () => t('1플랜'), price: 9900, projects: 10, upload: 50, file: 10, desc: () => t('영상 업로드와 최종본 전달까지') },
  { id: 'p2', name: () => t('2플랜'), price: 29900, projects: Infinity, upload: 100, file: 30, desc: () => t('프로젝트 무제한, 4K 원본도 넉넉하게') },
];
export const ADDONS = [{ gb: 50, price: 3900 }, { gb: 200, price: 9900 }];
/** 시험 버전은 1플랜 기준으로 보여 준다 */
export const currentPlan = () => PLANS.find(x => x.id === (localStorage.getItem('sd:plan') || 'p1')) || PLANS[1];
export const extraGB = () => +(localStorage.getItem('sd:extra-gb') || 0);
export const limitBytes = (pl = currentPlan()) => (pl.upload + extraGB()) * GB;
const won = n => n.toLocaleString('ko-KR') + t('원');

/** 이번 달 올린 양 — 영상 파일 + 최종본 */
export function usedBytes(projects) {
  const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
  let n = 0;
  projects.forEach(p => {
    if (p.src && p.src.k === 'file' && (p.src.at || p.createdAt || 0) >= +since) n += p.src.size || 0;
    if (p.delivery && !p.delivery.gone && p.delivery.at >= +since) n += p.delivery.size || 0;
  });
  return n;
}

export function meterHTML(projects) {
  const pl = currentPlan(), used = usedBytes(projects), lim = limitBytes(pl), pct = lim ? Math.min(100, used / lim * 100) : 100;
  const active = projects.filter(p => !p.done).length;
  return `<button type="button" class="meter-btn${pct >= 90 ? ' warn' : ''}" data-act="plan" title="${t('요금제 · 저장 공간')}">
    <span class="meter-top"><b>${esc(pl.name())}</b><span>${fmtSize(used)} / ${lim ? Math.round(lim / GB) + 'GB' : '—'}</span></span>
    <span class="meter"><i style="width:${pct}%"></i></span>
    <span class="meter-sub">${t('이번 달 업로드')} · ${t('프로젝트')} ${active}${pl.projects === Infinity ? '' : ' / ' + pl.projects}</span>
  </button>`;
}

export async function planDialog(projects) {
  const pl = currentPlan(), used = usedBytes(projects), lim = limitBytes(pl);
  const row = (label, f) => `<tr><th>${label}</th>${PLANS.map(x => `<td class="${x.id === pl.id ? 'on' : ''}">${f(x)}</td>`).join('')}</tr>`;
  await modal({
    title: t('요금제 · 저장 공간'), wide: true,
    body: `<div class="plan-now">
        <div><span class="dim">${t('지금 요금제')}</span><b>${esc(pl.name())}</b>${extraGB() ? `<span class="chip">+${extraGB()}GB</span>` : ''}</div>
        <div class="plan-meter"><span class="meter"><i style="width:${lim ? Math.min(100, used / lim * 100) : 100}%"></i></span><span>${t('이번 달 업로드')} <b>${fmtSize(used)}</b> / ${lim ? Math.round(lim / GB) + 'GB' : '—'}</span></div>
      </div>
      <div class="plan-table-wrap"><table class="plan-table">
        <thead><tr><th></th>${PLANS.map(x => `<th class="${x.id === pl.id ? 'on' : ''}"><b>${esc(x.name())}</b><span>${won(x.price)}${x.price ? t(' / 월') : ''}</span></th>`).join('')}</tr></thead>
        <tbody>
          ${row(t('진행 중 프로젝트'), x => x.projects === Infinity ? t('무제한') : x.projects + t('개'))}
          ${row(t('한 달 업로드'), x => x.upload ? x.upload + 'GB' : t('링크·사진·PDF만'))}
          ${row(t('파일 하나 최대'), x => x.file ? x.file + 'GB' : '—')}
          ${row(t('최종본 전달 링크'), x => x.upload ? KEEP_DAYS + t('일 유지') : '—')}
          ${row(t('수정 내역서·납품 확인서'), () => t('포함'))}
          ${row(t('완료 프로젝트 보관함'), () => t('포함'))}
          ${row(t('클라이언트'), () => t('무제한'))}
        </tbody></table></div>
      <div class="card-title addon-title">${t('용량 추가')}</div>
      <p class="note dim">${t('웹하드처럼 넉넉하게 쓰고 싶다면 이번 달 업로드 용량을 더할 수 있어요.')}</p>
      <div class="addons">${ADDONS.map(a => `<button type="button" class="addon" data-addon="${a.gb}"><b>+${a.gb}GB</b><span>${won(a.price)}${t(' / 월')}</span></button>`).join('')}</div>
      <p class="note dim">${t('시험 버전이라 결제는 아직 열려 있지 않아요. 정식 서버를 연결하면 이 화면에서 바로 바꿀 수 있어요.')}</p>`,
    actions: [{ label: t('닫기'), kind: 'primary', value: null }],
    onOpen: w => w.addEventListener('click', e => {
      const a = e.target.closest('[data-addon]'); if (!a) return;
      toast(t('결제는 정식 서버를 연결한 뒤 열려요. +{n}GB 용량 추가를 준비 중이에요', { n: a.dataset.addon }), 3600);
    }),
  });
}

/** 파일 하나 최대 크기 검사 — 넘으면 안내하고 false */
export function fitsFileLimit(size) {
  const pl = currentPlan();
  if (!pl.file) { toast(t('무료 요금제는 파일을 올릴 수 없어요. 링크로 검수하거나 요금제를 바꿔 주세요'), 4200); return false; }
  if (size > pl.file * GB) { toast(t('{plan}은 파일 하나에 {n}GB까지 올릴 수 있어요', { plan: pl.name(), n: pl.file }), 4200); return false; }
  return true;
}
export const BIG_FILE = 1.5 * GB;
/** 큰 영상: 클라이언트 쪽에서 끊길 수 있다고 먼저 알린다 */
export async function bigFileOk(file) {
  if (file.size < BIG_FILE) return true;
  const r = await modal({
    title: t('용량이 큰 파일이에요'),
    body: `<p class="big-warn">${ic('help', 16)}<span>${t('용량이 큰 파일은 클라이언트 확인 시 끊길 가능성이 있어요!')}</span></p>
      <p class="note">${esc(file.name)} · <b>${fmtSize(file.size)}</b></p>
      <p class="note dim">${t('검수용으로는 FHD(1080p) MP4로 내보내면 빠르고 용량도 아낄 수 있어요. 고화질 원본은 검수가 끝난 뒤 "최종본 보내기"로 전달해 주세요.')}</p>`,
    actions: [{ label: t('취소'), value: null }, { label: t('그래도 올리기'), kind: 'primary', value: 'go' }],
  });
  return r === 'go';
}

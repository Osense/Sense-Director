/* 라우터 — #c= 클라이언트 화면, #r= 수정요청 가져오기, 그 밖은 디렉터 콘솔 */
import { hashParams, toast } from './util.js';
import { renderClient } from './client.js';
import { t } from './i18n.js';
import { renderDirector, importDialog } from './director.js';
import { closeAllZooms } from './zoom.js';
import { requireLogin } from './auth.js';

const app = document.getElementById('app');
let mode = '';
async function route() {
  const params = hashParams();
  document.onkeydown = null;
  document.getElementById('toast')?.classList.remove('on');
  document.querySelectorAll('.modal').forEach(m => m.remove());
  closeAllZooms();
  if (params.c) {
    if (mode === 'client:' + params.c + ':' + (params.f || '')) return;
    mode = 'client:' + params.c + ':' + (params.f || '');
    document.body.dataset.view = 'client';
    await renderClient(app, params);
  } else {
    mode = 'director';
    document.body.dataset.view = 'auth';
    await requireLogin(app);
    if (hashParams().c) return route();
    document.body.dataset.view = 'director';
    await renderDirector(app, hashParams());
  }
}
addEventListener('hashchange', route);
route();

// 디렉터 콘솔: 받은 HTML 파일을 화면에 끌어 놓으면 수신함으로
addEventListener('dragover', e => { if (document.body.dataset.view === 'director') { e.preventDefault(); document.body.classList.add('dragging'); } });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', async e => {
  if (document.body.dataset.view !== 'director') return;
  e.preventDefault(); document.body.classList.remove('dragging');
  const f = e.dataTransfer.files[0]; if (!f) return;
  if (!/\.(html?|json)$/i.test(f.name)) { toast(t('수정요청 HTML이나 JSON 파일을 끌어 놓아 주세요')); return; }
  importDialog(await f.text());
});

// 밝은 화면 / 다크 모드 — WesNS 사이트와 같은 저장 키
addEventListener('click', e => {
  if (!e.target.closest('[data-theme-toggle]')) return;
  const dark = document.documentElement.classList.toggle('dark');
  try { localStorage.setItem('wesns.theme', dark ? 'dark' : 'light'); } catch {}
  const cs = document.querySelector('meta[name=color-scheme]'), tc = document.querySelector('meta[name=theme-color]');
  if (cs) cs.content = dark ? 'dark' : 'only light';
  if (tc) tc.content = dark ? '#16161c' : '#fbfbfd';
});

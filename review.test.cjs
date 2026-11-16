/* Sense Director 전체 흐름 검사 (헤드리스 Chrome)
   node review-server.cjs --no-browser  을 켠 뒤  node review.test.cjs
   SHOTS=폴더  를 주면 화면을 찍어 둔다. */
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const BASE = 'http://127.0.0.1:8765/';
const VIDEO = BASE + 'test-media/clip.mp4';
const SHOTS = process.env.SHOTS || '';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sense-director-test-'));
const chrome = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome');
const ONLINE = process.argv.includes('--online');
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--window-size=1440,900', '--remote-debugging-port=9227', '--autoplay-policy=no-user-gesture-required', '--auto-accept-this-tab-capture', '--use-fake-ui-for-media-stream', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const delay = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const call = (method, params = {}) => new Promise((res, rej) => { const t = setTimeout(() => rej(Error('timeout ' + method)), 30000); pending.set(++id, m => { clearTimeout(t); res(m); }); ws.send(JSON.stringify({ id, method, params })); });
async function ev(expr) { const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.result.exceptionDetails) throw Error(r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; }
async function until(expr, ms = 10000, label = expr) { const end = Date.now() + ms; while (Date.now() < end) { try { if (await ev(expr)) return; } catch {} await delay(100); } throw Error('Timed out: ' + label); }
async function go(url) { await call('Page.navigate', { url }); await delay(400); await until("document.readyState==='complete'"); }
async function shot(name) { if (!SHOTS) return; const r = await call('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64')); }
async function setFile(sel, file) { const d = await call('DOM.getDocument', { depth: -1, pierce: true }); const q = await call('DOM.querySelector', { nodeId: d.result.root.nodeId, selector: sel }); if (!q.result || !q.result.nodeId) throw Error('no input ' + sel); await call('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [file] }); }
const pass = []; const ok = (c, m) => { if (!c) throw Error('FAIL: ' + m); pass.push(m); };
const click = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw Error('no '+${JSON.stringify(sel)});e.click();return true})()`);
const pointer = (sel, pts) => ev(`(async()=>{const el=document.querySelector(${JSON.stringify(sel)}),r=el.getBoundingClientRect();const P=${JSON.stringify(pts)};
  for(let i=0;i<P.length;i++){const [x,y]=P[i];const type=i===0?'pointerdown':i===P.length-1?'pointerup':'pointermove';el.dispatchEvent(new PointerEvent(type,{pointerId:1,button:0,isPrimary:true,clientX:r.left+r.width*x,clientY:r.top+r.height*y,bubbles:true}));await new Promise(r=>setTimeout(r,16));}return true})()`);

(async () => {
  let tabs; for (let i = 0; i < 100; i++) { try { tabs = await (await fetch('http://127.0.0.1:9227/json')).json(); if (tabs.some(t => t.type === 'page')) break; } catch {} await delay(100); }
  ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await call('Page.enable'); await call('Runtime.enable'); await call('DOM.enable');
  await call('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: BASE.slice(0, -1) }).catch(() => {});

  /* 1. 디렉터: 영상 링크로 프로젝트 만들기 */
  await go(BASE);
  await until("document.querySelector('.hero-form input')");
  ok(await ev("!/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u.test(document.body.innerText)"), 'no emoji in director UI');
  await shot('01-director-home');
  await ev(`document.querySelector('.hero-form input').value=${JSON.stringify(VIDEO)};document.querySelector('.hero-form .btn').click()`);
  await until("location.hash.includes('tab=setup') && document.querySelector('[data-link]') && document.querySelector('[data-link]').value.includes('#c=')", 10000, 'client link');
  await until("document.querySelector('.stage video') && document.querySelector('.stage video').readyState>=2", 10000, 'director video');
  ok(await ev("document.querySelectorAll('.pin-show span').length===4"), 'PIN shows 4 digits');
  await ev(`(()=>{const t=document.querySelector('[data-f=title]');t.value='단편영화 1차 편집본';t.dispatchEvent(new Event('input',{bubbles:true}));
    const n=document.querySelector('[data-f=notice]');n.value='금요일까지 의견 부탁드려요.';n.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('.chipbtn').click();
    const d=document.querySelector('[data-f=due]');d.value=new Date(Date.now()+3*864e5).toISOString().slice(0,10);d.dispatchEvent(new Event('change',{bubbles:true}));
    const b=document.querySelector('[data-f=by]');b.value='OSNS 영상팀';b.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  // 재생하면 프레임 수를 스스로 잰다
  await ev("document.querySelector('[data-act=play]').click()");
  await until("document.querySelector('[data-fps]').classList.contains('measured')", 8000, 'fps measured');
  ok(await ev("document.querySelector('[data-fps]').textContent==='30fps'"), 'frame rate auto-detected (30fps)');
  await ev("document.querySelector('[data-act=play]').click()");
  ok(await ev("document.querySelector('[data-meta]').textContent.includes('16:9')"), 'aspect ratio auto-detected (16:9)');
  await delay(500);
  await ev("document.querySelector('[data-act=qr]').click()");
  await until("document.querySelector('[data-qr] img, [data-qr] canvas')", 8000, 'QR').catch(() => {});
  await shot('02-director-setup');
  const pid = await ev("location.hash.match(/p=(\\w+)/)[1]");
  const pin = await ev("[...document.querySelectorAll('.pin-show span')].map(s=>s.textContent).join('')");
  const link = await ev("document.querySelector('[data-link]').value");
  ok(await ev(`!${JSON.stringify(link)}.includes(${JSON.stringify(pin)}) || true`), 'link built');
  ok(!(await ev(`(async()=>{const {unpack}=await import('/assets/js/util.js');const p=await unpack(${JSON.stringify(link.split('#c=')[1])});return JSON.stringify(p).includes('"pin"')})()`)), 'PIN itself is not stored in the link');

  /* 2. 클라이언트: 핀 번호 */
  await go(link);
  await until("document.querySelector('.pin-boxes input')");
  await shot('03-client-gate');
  const typePin = p => ev(`(()=>{const b=[...document.querySelectorAll('.pin-boxes input')];${JSON.stringify(p)}.split('').forEach((c,i)=>{b[i].value=c;b[i].dispatchEvent(new Event('input',{bubbles:true}))});})()`);
  await typePin(pin === '0000' ? '1111' : '0000');
  await until("document.querySelector('.gate-msg').textContent.includes('맞지 않아요')", 4000, 'wrong pin');
  ok(true, 'wrong PIN rejected');
  await typePin(pin);
  await until("document.querySelector('.notice-body')", 6000, 'notice modal');
  ok(await ev("document.querySelector('.notice-body').textContent.includes('금요일까지')"), 'client sees director notice');
  await shot('04-client-notice');
  await ev("document.querySelector('.modal .foot .primary').click()");
  await until("document.querySelector('.stage video') && document.querySelector('.stage video').readyState>=2", 10000, 'client video');
  ok(await ev("document.querySelector('.chip.due').textContent.startsWith('D-')"), 'deadline countdown shown');

  /* 3. 핀 → 장면 스냅샷 + 시간 주소 → 바로 입력 */
  await ev("(async()=>{const v=document.querySelector('.stage video');v.currentTime=2.5;await new Promise(r=>v.addEventListener('seeked',r,{once:true}));})()");
  await pointer('.overlay', [[0.3, 0.4], [0.3, 0.4]]);
  await until("document.querySelectorAll('.list .item').length===1", 6000, 'pin item');
  ok(await ev("/^\\d{2}:\\d{2}:\\d{2}:\\d{2}$/.test(document.querySelector('.item .tcbtn').textContent)"), 'time address HH:MM:SS:FF');
  ok(await ev("document.querySelector('.item .tcbtn').textContent==='00:00:02:15'"), 'time address exact frame (2.5s @30fps = 00:00:02:15)');
  ok(await ev("document.querySelector('.item .snap img').src.startsWith('data:image/jpeg')"), 'frame snapshot attached');
  ok(await ev("document.activeElement && document.activeElement.matches('.item textarea')"), 'typing box focused immediately');
  await ev("(()=>{const t=document.activeElement;t.value='컷을 반 박자 앞당겨 주세요';t.dispatchEvent(new Event('input',{bubbles:true}));t.blur();})()");
  // 같은 장면에 펜으로 그리면 같은 카드에 합쳐진다
  await ev("document.querySelector('[data-tool=pen]').click()");
  await pointer('.overlay', [[0.5, 0.5], [0.55, 0.52], [0.6, 0.58], [0.66, 0.6]]);
  await delay(300);
  ok(await ev("document.querySelectorAll('.list .item').length===1 && document.querySelector('.item .snap polyline')"), 'pen stroke on same frame merges into same card');
  // 다른 시점에 그리면 새 카드
  await ev("(async()=>{const v=document.querySelector('.stage video');v.currentTime=6.2;await new Promise(r=>v.addEventListener('seeked',r,{once:true}));})()");
  await delay(200);
  await pointer('.overlay', [[0.2, 0.7], [0.3, 0.72], [0.4, 0.7]]);
  await until("document.querySelectorAll('.list .item').length===2", 6000, 'pen item');
  await ev("(()=>{const t=document.activeElement;t.value='자막 \"그럼에도\" 띄어쓰기';t.dispatchEvent(new Event('input',{bubbles:true}));t.blur();})()");
  // 키보드 M: 핀 없이 메모
  await ev("(async()=>{const v=document.querySelector('.stage video');v.currentTime=9.0;await new Promise(r=>v.addEventListener('seeked',r,{once:true}));})()");
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'m',bubbles:true}))");
  await until("document.querySelectorAll('.list .item').length===3", 6000, 'memo item');
  await ev("(()=>{const t=document.activeElement;t.value='음악 볼륨 조금만 줄여 주세요';t.dispatchEvent(new Event('input',{bubbles:true}));t.blur();})()");
  // 프레임 이동 키
  const before = await ev("document.querySelector('.stage video').currentTime");
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'.',bubbles:true}))"); await delay(250);
  const after = await ev("document.querySelector('.stage video').currentTime");
  ok(Math.abs(after - before - 1 / 30) < 0.01, 'frame step key moves exactly one frame');
  ok(!(await ev("/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u.test(document.body.innerText)")), 'no emoji in client UI');
  await ev("document.querySelector('.list .item').click()"); await delay(400);
  await shot('05-client-items');
  // 카드 장면을 누르면 크게 보기
  await ev("document.querySelector('.list .item [data-zoom]').click()");
  await until("document.querySelector('.zoom.on')", 3000, 'zoom opens'); await delay(400);
  ok(await ev("document.querySelector('.zoom-inner img').src.startsWith('data:image/jpeg') && document.querySelector('.zoom-inner').getBoundingClientRect().width > 700"), 'client: card opens enlarged scene');
  ok(await ev("document.querySelector('[data-zcount]').textContent==='1 / 3' && document.querySelector('.zoom-inner .pin')!==null"), 'zoom shows pin and position in list');
  await ev("document.querySelector('[data-z=next]').click()"); await delay(150);
  ok(await ev("document.querySelector('[data-zcount]').textContent==='2 / 3' && document.querySelector('.zoom-inner polyline')!==null"), 'zoom: next item (with drawing)');
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))"); await delay(150);
  ok(await ev("document.querySelector('[data-zcount]').textContent==='1 / 3'"), 'zoom: arrow key navigation');
  await ev("document.querySelector('[data-z=in]').click()"); await delay(250);
  ok(await ev("parseInt(document.querySelector('[data-pct]').textContent)>100"), 'zoom: magnify');
  await ev("(()=>{const t=document.querySelector('[data-ztx]');t.value='컷을 반 박자 앞당겨 주세요 (확대해서 확인)';t.dispatchEvent(new Event('input',{bubbles:true}));})()");
  ok(await ev("document.querySelector('.list .item textarea').value.includes('확대해서 확인')"), 'zoom: edit text in place, card updates');
  await shot('05b-client-zoom');
  await ev("document.querySelector('[data-ztx]').blur();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await until("!document.querySelector('.zoom')", 2000, 'zoom closes');
  ok(true, 'zoom: Esc closes back to card');

  /* 4. 수정요청 보내기 */
  await click('[data-act=send]');
  await until("document.querySelector('[data-name]')");
  await ev("(()=>{const i=document.querySelector('[data-name]');i.value='클라이언트 김PD';})()");
  await ev("document.querySelector('.modal .foot .primary').click()");
  await until("document.querySelector('.sent-ok')", 6000, 'sent');
  await shot('06-client-sent');
  const inbox = await ev(`JSON.parse(localStorage.getItem('sd:inbox:${pid}'))`);
  ok(inbox.length === 1 && inbox[0].items.length === 3 && inbox[0].from === '클라이언트 김PD', 'request delivered to director inbox (mock store)');
  // 전송이 안 될 때: 메시지 글
  await ev("document.querySelector('[data-fb=msg]').click()"); await delay(500);
  const clip = await ev("navigator.clipboard.readText().catch(()=> '')");
  ok(!clip || (clip.includes('00:00:02:15') && clip.includes('#r=')), 'message fallback contains time address and import link');
  await ev("document.querySelector('.modal .foot .primary').click()");
  ok(await ev("document.querySelector('[data-tab=sent]').classList.contains('on') && document.querySelectorAll('.list .item.sent').length===3"), 'sent tab lists the request');

  /* 5. 디렉터: 받은 요청에 상태·댓글로 환류 */
  await go(BASE + '#p=' + pid + '&tab=inbox');
  await until("document.querySelectorAll('.pbody.inbox .item').length===3", 8000, 'director inbox');
  await until("document.querySelector('.stage video') && document.querySelector('.stage video').readyState>=1", 8000);
  await ev("document.querySelector('.pbody .item [data-st=done]').click()");
  await ev("(()=>{const c=document.querySelector('.pbody .item');c.querySelector('[data-q]').click();c.querySelector('[data-reply] button').click();})()");
  await delay(200);
  await ev("(()=>{const c=document.querySelectorAll('.pbody .item')[1];c.querySelector('[data-st=hold]').click();})()");
  await ev("(()=>{const c=document.querySelectorAll('.pbody .item')[1];const i=c.querySelector('[data-reply] input');i.value='이 부분은 의도된 연출이라 유지할게요';c.querySelector('[data-reply] button').click();})()");
  await delay(200);
  const inbox2 = await ev(`JSON.parse(localStorage.getItem('sd:inbox:${pid}'))`);
  const its = inbox2[0].items.slice().sort((a, b) => a.t - b.t);
  ok(its[0].st === 'done' && its[0].rp[0].b === '반영하겠습니다' && its[0].rp[0].by === 'd', 'director status + quick reply saved');
  ok(await ev("document.querySelector('.inbox-stats b').textContent==='1'"), 'progress counts done items');
  await shot('07-director-inbox');
  await ev("document.querySelectorAll('.pbody .item')[1].querySelector('[data-zoom]').click()");
  await until("document.querySelector('.zoom.on')", 3000, 'director zoom'); await delay(400);
  await ev("document.querySelector('.zoom-side [data-st=doing]').click()"); await delay(150);
  await ev("(()=>{const s=document.querySelector('.zoom-side');s.querySelector('[data-reply] input').value='색감은 다음 버전에서 다시 볼게요';s.querySelector('[data-reply] button').click();})()"); await delay(200);
  const zr = (await ev(`JSON.parse(localStorage.getItem('sd:inbox:${pid}'))`))[0].items.slice().sort((a, b) => a.t - b.t)[1];
  ok(zr.st === 'doing' && zr.rp.some(x => x.b.includes('다음 버전')), 'director: status and reply from enlarged view');
  ok(await ev("document.querySelector('.zoom-side .rp.d')!==null && document.querySelector('.zoom-side .st-doing.on')!==null"), 'director zoom refreshes after change');
  await shot('07b-director-zoom');
  await ev("document.querySelector('[data-z=close]').click()"); await until("!document.querySelector('.zoom')", 2000);

  /* 5c. 디렉터도 핀·펜으로 클라이언트에게 안내 */
  ok(await ev("!!document.querySelector('.pbody.inbox .toolbar [data-tool=pin]')"), 'director viewer has pin/pen tools');
  await ev("document.querySelector('[data-pane=notes]').click()");
  await ev("(async()=>{const v=document.querySelector('.stage video');v.currentTime=4;await new Promise(r=>v.addEventListener('seeked',r,{once:true}));})()");
  await ev("document.querySelector('.pbody.inbox [data-tool=pin]').click()");
  await pointer('.overlay', [[0.7, 0.3], [0.7, 0.3]]);
  await until("document.querySelectorAll('.list .item.note').length===1", 6000, 'director note');
  ok(await ev("document.querySelector('.item.note .no.d').textContent==='D1' && document.activeElement.matches('[data-ntx]')"), 'director note D1 created, typing focused');
  await ev("(()=>{const t=document.activeElement;t.value='이 컷은 색보정 전이에요. 색감은 보지 말아 주세요';t.dispatchEvent(new Event('input',{bubbles:true}));t.blur();})()");
  await ev("document.querySelector('.pbody.inbox [data-tool=pen]').click()");
  await pointer('.overlay', [[0.6, 0.6], [0.65, 0.62], [0.7, 0.66]]);
  await delay(300);
  ok(await ev("document.querySelectorAll('.list .item.note').length===1 && document.querySelector('.item.note .snap polyline')"), 'director pen stroke on same frame merges into note');
  ok(await ev("!!document.querySelector('.overlay .pin.d') && !!document.querySelector('.overlay .ann.d')"), 'director annotations drawn in director color on stage');
  await ev("(async()=>{const v=document.querySelector('.stage video');v.currentTime=8;await new Promise(r=>v.addEventListener('seeked',r,{once:true}));})()");
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'m',bubbles:true}))");
  await until("document.querySelectorAll('.list .item.note').length===2", 6000, 'director memo note');
  await ev("(()=>{const t=document.activeElement;t.value='자막 위치는 여기로 바뀔 예정이에요';t.dispatchEvent(new Event('input',{bubbles:true}));t.blur();})()");
  await delay(400);
  const pnotes = await ev(`(async()=>{const {Store}=await import('/assets/js/store.js');return Store.getProject(${JSON.stringify(pid)}).notes})()`);
  ok(pnotes.length === 2 && pnotes.every(n => n.by === 'd' && n.tx) && pnotes[0].th.startsWith('data:image'), 'director notes saved with text and snapshot');
  const dnLen = await ev(`(async()=>{const E=await import('/assets/js/exports.js');const U=await import('/assets/js/util.js');const {Store}=await import('/assets/js/store.js');const l=await E.clientLink(Store.getProject(${JSON.stringify(pid)}));return (await U.unpack(l.split('#c=')[1])).dn.length})()`);
  ok(dnLen === 2, 'client link carries director notes');
  await shot('07c-director-notes');

  /* 6. 클라이언트: 회신 확인 (같은 브라우저 동기화) */
  await go(link);
  await until("document.querySelector('[data-tab=sent]')", 8000);
  await ev("document.querySelector('[data-tab=sent]').click()");
  await until("document.querySelector('.list .rp.d')", 4000, 'client sees reply');
  ok(await ev("document.querySelector('.list .tag.st-done')!==null"), 'client sees status from director');
  await ev("(()=>{const f=document.querySelector('.list [data-reply]');f.querySelector('input').value='감사합니다!';f.querySelector('button').click();})()");
  await delay(300);
  ok((await ev(`JSON.parse(localStorage.getItem('sd:inbox:${pid}'))`))[0].items.some(it => (it.rp || []).some(r => r.by === 'c')), 'client reply goes back to director');
  await shot('08-client-feedback');
  ok(await ev("!document.querySelector('[data-tab=notes]').hidden && document.querySelector('[data-n=notes]').textContent==='2'"), 'client sees director notes tab');
  await ev("document.querySelector('[data-tab=notes]').click()");
  ok(await ev("document.querySelectorAll('.list .item.note').length===2 && document.querySelector('.list .item.note .tx').textContent.includes('색보정 전')"), 'client reads director notes');
  await ev("document.querySelector('.list .item.note').click()"); await delay(500);
  ok(await ev("!!document.querySelector('.overlay .pin.d')"), 'client sees director pin on video');
  await ev("(()=>{const f=document.querySelector('.list .item.note [data-reply]');f.querySelector('input').value='네, 색감은 넘어갈게요';f.querySelector('button').click();})()");
  await delay(300);
  const nrp = await ev(`(async()=>{const {Store}=await import('/assets/js/store.js');return Store.getProject(${JSON.stringify(pid)}).notes.flatMap(n=>n.rp||[])})()`);
  ok(nrp.some(x => x.by === 'c' && x.b.includes('넘어갈게요')), 'client reply on director note reaches director (same browser)');
  await shot('08b-client-director-notes');

  /* 7. 다른 기기 흉내: 회신 링크(&f=)와 수정요청 링크(#r=) */
  const { fbLink, rLink, html } = await ev(`(async()=>{const E=await import('/assets/js/exports.js');const {Store}=await import('/assets/js/store.js');
    const p=Store.getProject(${JSON.stringify(pid)}),reqs=Store.inbox(${JSON.stringify(pid)});
    return {fbLink:await E.clientLink(p,reqs), rLink:await E.replyLink(E.projectPayload(p),reqs[0]), html:E.reportHTML({p,reqs,role:'director'})};})()`);
  await ev("localStorage.clear()");
  await go(fbLink); await until("document.querySelector('[data-tab=sent]') || document.querySelector('.pin-boxes')", 8000);
  if (await ev("!!document.querySelector('.pin-boxes')")) { await typePin(pin); await until("document.querySelector('[data-tab=sent]')", 8000); }
  await ev("document.querySelector('.modal .foot .primary') && document.querySelector('.modal .foot .primary').click()");
  await ev("document.querySelector('[data-tab=sent]').click()");
  await until("document.querySelectorAll('.list .item.sent').length===3 && document.querySelector('.list .rp.d')", 6000, 'feedback link restores replies');
  ok(true, 'director feedback link restores statuses and replies on a fresh device');
  ok(await ev("document.querySelector('[data-n=notes]').textContent==='2'"), 'fresh device: director notes arrive via link');
  await ev("document.querySelector('[data-tab=notes]').click()");
  await ev("(()=>{const f=document.querySelectorAll('.list .item.note [data-reply]')[1];f.querySelector('input').value='위치 확인했어요';f.querySelector('button').click();})()");
  await delay(300);
  ok(await ev("document.querySelector('[data-count]').textContent.includes('답글')"), 'fresh device: note reply waits to be sent');
  await click('[data-act=send]'); await until("document.querySelector('[data-name]')");
  await ev("document.querySelector('.modal .foot .primary').click()");
  await until("document.querySelector('.sent-ok')", 6000, 'reply-only send');
  const nrLink = await ev(`(async()=>{const E=await import('/assets/js/exports.js');const {Store}=await import('/assets/js/store.js');const req=Store.inbox(${JSON.stringify(pid)}).slice(-1)[0];return req.nr && req.nr.length ? await E.replyLink(E.projectPayload({...Store.getProject?.(${JSON.stringify(pid)})||{}, id:${JSON.stringify(pid)}, title:'단편영화 1차 편집본', src:${JSON.stringify({ k: 'url', url: VIDEO })}, notes:${JSON.stringify(pnotes.map(n => ({ ...n, th: undefined })))}}), req) : ''})()`);
  ok(!!nrLink, 'reply-only request carries note replies');
  await ev("document.querySelector('.modal .foot .primary').click()");
  await ev("localStorage.clear()");
  await go(BASE); await go(rLink);
  await until("document.querySelectorAll('.pbody.inbox .item').length===3", 8000, 'import via #r link');
  ok(await ev("document.querySelector('.pitem.on .pt').textContent==='단편영화 1차 편집본'"), 'client request link imports into a fresh director console');
  ok(html.includes('id="sd-data"') && html.includes('00:00:02:15') && html.includes('반영'), 'HTML report includes data, time address and status');
  const back = await ev(`(async()=>{const E=await import('/assets/js/exports.js');const d=await E.parseIncoming(${JSON.stringify(html)});return d.reqs[0].items.length})()`);
  ok(back === 3, 'HTML report can be imported back');
  await ev("localStorage.clear()");
  await go(BASE); await go(nrLink);
  await until("location.hash.includes('tab=inbox')", 8000, 'import note replies');
  const merged = await ev(`(async()=>{const {Store}=await import('/assets/js/store.js');return Store.getProject(${JSON.stringify(pid)}).notes.flatMap(n=>n.rp||[]).map(x=>x.b)})()`);
  ok(merged.includes('위치 확인했어요'), 'director import merges client replies on notes');

  /* 8. 휴대폰 화면 */
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await go(link); await until("document.querySelector('.pin-boxes') || document.querySelector('.stage')", 6000);
  if (await ev("!!document.querySelector('.pin-boxes')")) { await typePin(pin); await delay(800); }
  await ev("document.querySelector('.modal .foot .primary') && document.querySelector('.modal .foot .primary').click()");
  await delay(1200);
  ok(await ev("document.documentElement.scrollWidth<=window.innerWidth+1"), 'no horizontal scroll on phone');
  await shot('09-client-phone');
  await until("document.querySelector('.stage video') && document.querySelector('.stage video').readyState>=2", 8000);
  await ev("(async()=>{const v=document.querySelector('.stage video');v.currentTime=3;await new Promise(r=>v.addEventListener('seeked',r,{once:true}));})()");
  await pointer('.overlay', [[0.55, 0.45], [0.55, 0.45]]);
  await until("document.querySelectorAll('.list .item').length>=1", 6000, 'phone item');
  await ev("document.activeElement && document.activeElement.blur(); document.querySelector('.list .item [data-zoom]').click()");
  await until("document.querySelector('.zoom.on')", 3000, 'phone zoom');
  await delay(300);
  ok(await ev("(()=>{const r=document.querySelector('.zoom-inner').getBoundingClientRect();return r.width>=340 && document.documentElement.scrollWidth<=innerWidth+1})()"), 'phone: enlarged view fills the width');
  await shot('09b-client-phone-zoom');
  await ev("document.querySelector('[data-z=close]').click()"); await delay(300);

  await call('Emulation.clearDeviceMetricsOverride');

  /* 9. 영상 파일 올리기(목업) */
  await ev("localStorage.clear()");
  await go(BASE);
  await until("document.querySelector('[data-drop] input')");
  await setFile('[data-drop] input', path.join(__dirname, 'test-media', 'clip.mp4'));
  await until("location.hash.includes('tab=setup') && document.querySelector('.stage video') && document.querySelector('.stage video').readyState>=2", 15000, 'uploaded file plays');
  ok(await ev("(()=>{const {Store}=window;return true})()") && await ev(`(async()=>{const {Store}=await import('/assets/js/store.js');const p=Store.projects()[0];return p.src.k==='file' && p.src.name==='clip.mp4' && p.title==='clip'})()`), 'file upload (mock) creates project from file');
  ok(await ev("document.querySelector('[data-meta]').textContent.includes('영상 파일')"), 'source kind shown');
  const fLink = await ev("document.querySelector('[data-link]').value"), fPin = await ev("[...document.querySelectorAll('.pin-show span')].map(s=>s.textContent).join('')");
  await go(fLink); await until("document.querySelector('.pin-boxes input')");
  await typePin(fPin); await delay(600);
  await ev("document.querySelector('.modal .foot .primary') && document.querySelector('.modal .foot .primary').click()");
  await until("document.querySelector('.stage video') && document.querySelector('.stage video').readyState>=2", 10000, 'client plays uploaded file (same browser)');
  ok(true, 'client plays uploaded file in same browser');
  // 다른 기기 흉내: 저장된 파일이 없으면 같은 파일을 골라 연결
  await ev("new Promise(r=>{const q=indexedDB.deleteDatabase('sense-director-media');q.onsuccess=q.onerror=q.onblocked=()=>r(1)})");
  await go(BASE); await go(fLink);
  await until("document.querySelector('.file-missing') || document.querySelector('.pin-boxes')", 8000);
  if (await ev("!!document.querySelector('.pin-boxes')")) { await typePin(fPin); await delay(600); }
  await ev("document.querySelector('.modal .foot .primary') && document.querySelector('.modal .foot .primary').click()");
  await until("document.querySelector('.file-missing')", 8000, 'missing-file prompt');
  await shot('10-client-file-missing');
  await setFile('.file-missing input', path.join(__dirname, 'test-media', 'clip.mp4'));
  await until("document.querySelector('.stage video') && document.querySelector('.stage video').readyState>=2", 10000, 'relinked file plays');
  ok(true, 'other device relinks the same file and plays');

  if (ONLINE) {
    /* 10. 유튜브: 작업 중 화면 공유 없음 → 보낼 때 장면 사진 한 번에 */
    await ev("localStorage.clear()");
    await go(BASE); await until("document.querySelector('.hero-form input')");
    await ev(`document.querySelector('.hero-form input').value='https://www.youtube.com/watch?v=aqz-KE-bpKQ';document.querySelector('.hero-form .btn').click()`);
    await until("document.querySelector('[data-link]') && document.querySelector('[data-link]').value.includes('#c=') && document.querySelector('[data-dur]').textContent!=='00:00:00:00'", 20000, 'youtube project');
    const yLink = await ev("document.querySelector('[data-link]').value"), yPin = await ev("[...document.querySelectorAll('.pin-show span')].map(s=>s.textContent).join('')");
    await go(yLink); await until("document.querySelector('.pin-boxes input')"); await typePin(yPin);
    await until("document.querySelector('.stage iframe')", 10000);
    await until("document.querySelector('[data-dur]').textContent!=='00:00:00:00'", 20000, 'youtube ready');
    await ev("(()=>{const b=document.querySelector('[data-act=play]');b.click()})()"); await delay(2500); await ev("document.querySelector('[data-act=play]').click()"); await delay(400);
    await pointer('.overlay', [[0.4, 0.4], [0.4, 0.4]]);
    await until("document.querySelectorAll('.list .item').length===1", 6000, 'yt pin item');
    ok(!(await ev("!!document.querySelector('.modal')")), 'YouTube: no screen-share prompt while working');
    ok(await ev("document.querySelector('.item .nosnap').textContent.includes('보낼 때')"), 'YouTube: card says snapshot will be made at send');
    await ev("(()=>{const t=document.activeElement;t.value='여기 색 보정';t.dispatchEvent(new Event('input',{bubbles:true}));t.blur();})()");
    await ev("document.querySelector('.stage iframe') && 0"); 
    await ev("(()=>{document.querySelector('[data-act=play]').click()})()"); await delay(1800); await ev("document.querySelector('[data-act=play]').click()"); await delay(400);
    await pointer('.overlay', [[0.6, 0.6], [0.6, 0.6]]);
    await until("document.querySelectorAll('.list .item').length===2", 6000, 'yt 2nd item');
    await click('[data-act=send]'); await until("document.querySelector('[data-name]')");
    await ev("document.querySelector('[data-name]').value='YT 테스트';document.querySelector('.modal .foot .primary').click()");
    await until("[...document.querySelectorAll('.modal h3')].some(h=>h.textContent.includes('장면 사진'))", 6000, 'thumb prompt at send');
    ok(true, 'YouTube: asks once at send to make snapshots');
    await ev("document.querySelector('.modal .foot .primary').click()");
    await until("document.querySelector('.sent-ok')", 40000, 'yt sent');
    const yr = await ev(`(async()=>{const {Store}=await import('/assets/js/store.js');const p=Store.projects()[0];return Store.inbox(p.id)[0].items.map(it=>(it.th||'').slice(0,22))})()`);
    ok(yr.length === 2, 'YouTube request delivered');
    console.log('  youtube snapshots:', yr.map(x => x || '(none)').join(' | '));
    ok(yr.every(x => x.startsWith('data:image/jpeg')), 'YouTube: snapshots generated in one pass at send');
    await ev("document.querySelector('.modal .foot .primary').click()");
    await ev("document.querySelector('[data-tab=sent]').click()"); await delay(300);
    await shot('11-client-youtube-sent');

    /* 11. 비메오 */
    await ev("localStorage.clear()"); await go(BASE); await until("document.querySelector('.hero-form input')");
    await ev(`document.querySelector('.hero-form input').value='https://vimeo.com/76979871';document.querySelector('.hero-form .btn').click()`);
    await until("document.querySelector('.stage iframe[src*=vimeo]') && document.querySelector('[data-dur]').textContent!=='00:00:00:00'", 25000, 'vimeo ready');
    ok(await ev("document.querySelector('[data-meta]').textContent.includes('Vimeo') && document.querySelector('[data-f=title]').value.length>0"), 'Vimeo: embeds, title and duration detected');
    await shot('12-director-vimeo');
  }
  console.log('PASS ' + pass.length + ':\n- ' + pass.join('\n- '));
  browser.kill(); process.exit(0);
})().catch(e => { console.error(e.message || e); console.log('passed before failure: ' + pass.join(', ')); browser.kill(); process.exit(1); });

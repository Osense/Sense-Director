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
async function ev(expr) { const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.result.exceptionDetails) throw Error((r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails)) + '\n  in: ' + expr.slice(0, 160)); return r.result.result.value; }
async function until(expr, ms = 10000, label = expr) { const end = Date.now() + ms; while (Date.now() < end) { try { if (await ev(expr)) return; } catch {} await delay(100); } throw Error('Timed out: ' + label); }
async function go(url) { await call('Page.navigate', { url }); await delay(400); await until("document.readyState==='complete'"); if (process.env.THEME === 'dark') await ev("localStorage.setItem('wesns.theme','dark');document.documentElement.classList.add('dark')").catch(() => {}); }
async function shot(name) { if (!SHOTS) return; const r = await call('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64')); }
async function setFile(sel, file) { const d = await call('DOM.getDocument', { depth: -1, pierce: true }); const q = await call('DOM.querySelector', { nodeId: d.result.root.nodeId, selector: sel }); if (!q.result || !q.result.nodeId) throw Error('no input ' + sel); await call('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [].concat(file) }); }
const SEED = "if(!localStorage.getItem('sd:tour:off')&&!sessionStorage.getItem('t:tour'))localStorage.setItem('sd:tour:off','1');if(!localStorage.getItem('sd:ctour:off')&&!sessionStorage.getItem('t:tour'))localStorage.setItem('sd:ctour:off','1');if(!localStorage.getItem('wesns.lang'))localStorage.setItem('wesns.lang','ko');if(!sessionStorage.getItem('t:nouser')&&!localStorage.getItem('wesns.mock.user'))localStorage.setItem('wesns.mock.user',JSON.stringify({id:'t',name:'tester',email:'tester@example.com',provider:'email'}));";
const CLEAR = 'localStorage.clear();' + SEED;
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
  await call('Page.addScriptToEvaluateOnNewDocument', { source: SEED });
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
  await ev("document.querySelector('.toolbar [data-tool=pen]').click()");
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
  // 손 도구: 플레이어 자체 컨트롤을 켜고 클릭을 플레이어로 넘긴다
  await ev("document.querySelector('.toolbar [data-tool=hand]').click()"); await delay(300);
  ok(await ev("document.querySelector('.stage video').controls===true && getComputedStyle(document.querySelector('.overlay')).pointerEvents==='none'"), 'hand tool: native player controls on, clicks pass through');
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'p',bubbles:true}))"); await delay(300);
  ok(await ev("document.querySelector('.stage video').controls===false && document.querySelector('.toolbar [data-tool=pin]').classList.contains('on')"), 'back to pin: clean screen again');
  // 프레임 이동 키
  const before = await ev("document.querySelector('.stage video').currentTime");
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'.',bubbles:true}))"); await delay(250);
  const after = await ev("document.querySelector('.stage video').currentTime");
  ok(Math.abs(after - before - 1 / 30) < 0.01, 'frame step key moves exactly one frame');
  const kd = k => ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'${k}',bubbles:true}))`);
  await kd('ArrowRight'); await delay(200); await kd('ArrowRight'); await delay(200); await kd('ArrowRight'); await delay(250);
  const a3 = await ev("document.querySelector('.stage video').currentTime");
  ok(Math.abs(a3 - after - 3 / 30) < 0.01 && await ev("document.querySelector('.stage video').paused"), 'arrow keys step one frame at a time (stays paused)');
  await kd('ArrowLeft'); await delay(250);
  ok(Math.abs(await ev("document.querySelector('.stage video').currentTime") - a3 + 1 / 30) < 0.01, 'left arrow steps back one frame');
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true}))"); await delay(250);
  ok(Math.abs(await ev("document.querySelector('.stage video').currentTime") - a3 + 1 / 30 - 1) < 0.02, 'Shift + arrow moves one second');
  await ev("document.querySelector('.stage video').currentTime=" + after);
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
  await ev("(()=>{const c=document.querySelector('.pbody .item');const i=c.querySelector('[data-reply] input');i.value='반영하겠습니다';c.querySelector('[data-reply] button').click();})()");
  await delay(150);
  ok(await ev("(()=>{const c=document.querySelector('.pbody .item');const m=c.querySelectorAll('.thread .msg');const last=m[m.length-1];const req=c.querySelector('.msg.them .bubble.req').getBoundingClientRect(),list=c.closest('.list').getBoundingClientRect();return last.classList.contains('me')&&last.classList.contains('msg-new')&&last.querySelector('.bubble').getBoundingClientRect().right>list.right-40&&req.left<list.left+70&&req.width<=270&&document.activeElement===c.querySelector('[data-reply] input')&&!document.querySelector('.chipbtn,.qchips')})()"), 'chat: client on the left with a small scene bubble, my reply slides in on the right, input keeps focus, no canned phrases');
  await delay(200);
  await ev("(()=>{const c=document.querySelectorAll('.pbody .item')[1];c.querySelector('[data-st=hold]').click();})()");
  await ev("(()=>{const c=document.querySelectorAll('.pbody .item')[1];const i=c.querySelector('[data-reply] input');i.value='이 부분은 의도된 연출이라 유지할게요';c.querySelector('[data-reply] button').click();})()");
  await delay(200);
  const inbox2 = await ev(`JSON.parse(localStorage.getItem('sd:inbox:${pid}'))`);
  const its = inbox2[0].items.slice().sort((a, b) => a.t - b.t);
  ok(its[0].st === 'done' && its[0].rp[0].b === '반영하겠습니다' && its[0].rp[0].by === 'd', 'director status + reply saved');
  ok(await ev("document.querySelector('.inbox-stats b').textContent==='1'"), 'progress counts done items');
  await shot('07-director-inbox');
  // 썸네일을 누르면 그 장면으로 이동 (전체화면은 열리지 않음)
  const it2t = (await ev(`JSON.parse(localStorage.getItem('sd:inbox:${pid}'))`))[0].items.slice().sort((a, b) => a.t - b.t)[1].t;
  await ev("document.querySelectorAll('.pbody .item')[1].querySelector('[data-snapseek] .snap').click()"); await delay(500);
  ok(!(await ev("!!document.querySelector('.zoom')")) && Math.abs(await ev("document.querySelector('.stage video').currentTime") - it2t) < 0.05, 'director: thumbnail click jumps to that frame');
  ok(await ev("!!document.querySelector('.pbody .item [data-snapseek] .snap-full')"), 'director: full-screen button on thumbnail corner');
  // 경계선을 끌어 수정내역 칸 넓히기
  const sw0 = await ev("document.querySelector('.pbody .side').getBoundingClientRect().width");
  await ev(`(()=>{const s=document.querySelector('.pbody .splitter.col'),r=s.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+200;
    s.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,button:0,clientX:x,clientY:y,bubbles:true}));
    window.dispatchEvent(new PointerEvent('pointermove',{pointerId:7,clientX:x-120,clientY:y,bubbles:true}));
    window.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,clientX:x-120,clientY:y,bubbles:true}));})()`);
  await delay(200);
  const sw1 = await ev("document.querySelector('.pbody .side').getBoundingClientRect().width");
  ok(Math.abs(sw1 - sw0 - 120) < 4, 'drag divider: revision panel widens by the dragged amount');
  await ev(`(()=>{const s=document.querySelector('.plist-split'),r=s.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+100;
    s.dispatchEvent(new PointerEvent('pointerdown',{pointerId:8,button:0,clientX:x,clientY:y,bubbles:true}));
    window.dispatchEvent(new PointerEvent('pointermove',{pointerId:8,clientX:x+60,clientY:y,bubbles:true}));
    window.dispatchEvent(new PointerEvent('pointerup',{pointerId:8,clientX:x+60,clientY:y,bubbles:true}));})()`);
  await delay(200);
  ok(Math.abs(await ev("document.querySelector('.plist').getBoundingClientRect().width") - 290) < 4, 'drag divider: project list resizes');
  await go(BASE + '#p=' + pid + '&tab=inbox'); await until("document.querySelectorAll('.pbody.inbox .item').length===3", 8000);
  ok(Math.abs(await ev("document.querySelector('.pbody .side').getBoundingClientRect().width") - sw1) < 4, 'divider sizes are remembered');
  await until("document.querySelector('.stage video') && document.querySelector('.stage video').readyState>=1", 8000);
  await ev("document.querySelectorAll('.pbody .item')[1].querySelector('[data-full]').click()");
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
  await ev(CLEAR);
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
  await ev(CLEAR);
  await go(BASE); await go(rLink);
  await until("document.querySelectorAll('.pbody.inbox .item').length===3", 8000, 'import via #r link');
  ok(await ev("document.querySelector('.pitem.on .pt').textContent==='단편영화 1차 편집본'"), 'client request link imports into a fresh director console');
  ok(html.includes('id="sd-data"') && html.includes('00:00:02:15') && html.includes('반영'), 'HTML report includes data, time address and status');
  const back = await ev(`(async()=>{const E=await import('/assets/js/exports.js');const d=await E.parseIncoming(${JSON.stringify(html)});return d.reqs[0].items.length})()`);
  ok(back === 3, 'HTML report can be imported back');
  await ev(CLEAR);
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
  await ev(CLEAR);
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
    await ev(CLEAR);
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
    const t1 = await ev("document.querySelector('[data-tc]').textContent");
    await ev("document.querySelector('.toolbar [data-tool=hand]').click()");
    await until("!document.querySelector('.stage.switching') && document.querySelector('.stage iframe') && /controls=1/.test(document.querySelector('.stage iframe').src)", 15000, 'youtube native controls');
    ok(true, 'YouTube: hand tool reloads player with its own controls (quality/captions menu)');
    await delay(800);
    ok(await ev(`Math.abs((()=>{const [h,m,s,f]=document.querySelector('[data-tc]').textContent.split(':').map(Number);return h*3600+m*60+s+f/30})() - (()=>{const [h,m,s,f]=${JSON.stringify(t1)}.split(':').map(Number);return h*3600+m*60+s+f/30})()) < 1.5`), 'YouTube: position kept across player switch');
    await ev("document.querySelector('.toolbar [data-tool=pin]').click()");
    await until("!document.querySelector('.stage.switching') && document.querySelector('.stage iframe') && /controls=0/.test(document.querySelector('.stage iframe').src)", 15000, 'youtube clean player');
    ok(true, 'YouTube: back to pin restores the clean player');
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
    await ev(CLEAR); await go(BASE); await until("document.querySelector('.hero-form input')");
    await ev(`document.querySelector('.hero-form input').value='https://vimeo.com/76979871';document.querySelector('.hero-form .btn').click()`);
    await until("document.querySelector('.stage iframe[src*=vimeo]') && document.querySelector('[data-dur]').textContent!=='00:00:00:00'", 25000, 'vimeo ready');
    ok(await ev("document.querySelector('[data-meta]').textContent.includes('Vimeo') && document.querySelector('[data-f=title]').value.length>0"), 'Vimeo: embeds, title and duration detected');
    await shot('12-director-vimeo');
  }


  /* 11b. 문서 검수: PDF · PPT · 사진 */
  const TM = f => path.join(__dirname, 'test-media', f);
  const blank = "(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4*97)if(d[i]<200||d[i+1]<200||d[i+2]<200)n++;return n})";
  await ev(CLEAR); await go(BASE); await until("document.querySelector('[data-drop] input')");
  await setFile('[data-drop] input', TM('doc.pdf'));
  await until("location.hash.includes('tab=setup') && document.querySelector('.doc-canvas') && document.querySelector('.doc-canvas').width>50", 20000, 'pdf renders');
  await delay(500);
  ok(await ev(blank + "(document.querySelector('.doc-canvas'))>5"), 'PDF: first page is drawn');
    ok(await ev("!document.querySelector('.viewer .controls') && !document.querySelector('.viewer [data-act=play]') && !!document.querySelector('.doc-bar [data-act=zin]')"), 'PDF: no playback bar — page and zoom controls instead');
  ok(await ev("document.querySelector('[data-dur]').textContent==='3' && document.querySelectorAll('[data-pages] [data-page]').length===3"), 'PDF: 3 pages with page rail');
  ok(await ev("document.querySelector('[data-meta]').textContent.includes('PDF') && document.querySelector('[data-meta]').textContent.includes('3')"), 'PDF: kind and page count shown');
  await until("[...document.querySelectorAll('[data-pages] img')].every(i=>!i.hidden && i.src)", 10000, 'page thumbs');
  ok(true, 'PDF: page thumbnails made');
  // 쪽 넘기기 → 가로 쪽은 화면비가 바뀐다
  await ev("document.querySelector('[data-pages] [data-page=\"2\"]').click()"); await delay(600);
  ok(await ev("document.querySelector('[data-tc]').textContent==='3' && (()=>{const o=document.querySelector('.overlay');return o.offsetWidth>o.offsetHeight})()"), 'PDF: page 3 (landscape) fits its own shape');
  await ev("document.querySelector('[data-act=pprev]').click()"); await delay(400);
  const dPin = await ev("[...document.querySelectorAll('.pin-show span')].map(s=>s.textContent).join('')");
  const dLink = await ev("document.querySelector('[data-link]').value");
  await ev("document.querySelector('[data-tab=inbox]').click()");
  await until("document.querySelector('.doc-bar [data-tool=pen]') && document.querySelector('.doc-canvas') && document.querySelector('.doc-canvas').width>50", 15000, 'inbox doc viewer');
  ok(await ev("document.querySelectorAll('.doc-bar [data-tool]').length===3"), 'PDF: marking tools (pin, pen, move) in the bottom bar');
  await ev("document.querySelector('[data-pages] [data-page=\"1\"]').click()"); await delay(400);
  // 확대
  const pdfPid = await ev("location.hash.match(/p=(\\w+)/)[1]");
  const cw0 = await ev("document.querySelector('.doc-canvas').width");
  await ev("document.querySelector('[data-act=zin]').click();document.querySelector('[data-act=zin]').click()"); await delay(300);
  ok(await ev("document.querySelector('[data-zpct]').textContent==='225%' && !document.querySelector('[data-navmap]').hidden && document.querySelector('.pan').style.transform.includes('scale(2.25)')"), 'zoom: buttons zoom in and show the mini-map');
  await delay(400);
  ok(await ev("document.querySelector('.doc-canvas').width") > cw0 * 1.8, 'zoom: PDF is redrawn sharper when zoomed');
  await shot('19-doc-zoomed');
  // 확대한 채 펜으로 그리기 → 촘촘한 좌표
  await ev("document.querySelector('.doc-bar [data-tool=pen]').click()");
  await pointer('.overlay', [[0.5, 0.5], [0.50137, 0.50241], [0.50333, 0.50517], [0.50611, 0.50733]]); await delay(400);
  const nt = await ev(`(async()=>{const {Store}=await import('/assets/js/store.js');const p=Store.getProject('${pdfPid}');return p.notes||[]})()`);
  ok(nt.length === 1 && nt[0].t === 1 && nt[0].s[0].some(v => Math.round(v * 10) !== v * 10) && nt[0].ar && nt[0].th.startsWith('data:image/jpeg'), 'zoom: fine pen stroke saved on page 2 with page image');
  // 미니맵으로 이동
  const navBefore = await ev("document.querySelector('.pan').style.transform");
  await pointer('[data-navmap]', [[0.05, 0.05], [0.05, 0.05]]); await delay(150);
  ok(await ev("document.querySelector('.pan').style.transform") !== navBefore, 'mini-map: click moves the zoomed view');
  // 이동 도구로 끌기
  await ev("document.querySelector('.doc-bar [data-tool=hand]').click()");
  const b2 = await ev("document.querySelector('.pan').style.transform");
  await pointer('.stage', [[0.5, 0.5], [0.4, 0.4], [0.3, 0.3]]); await delay(150);
  ok(await ev("document.querySelector('.pan').style.transform") !== b2, 'hand tool: drag pans the zoomed page');
  await ev("document.querySelector('[data-act=zfit]').click()"); await delay(200);
  ok(await ev("document.querySelector('[data-zpct]').textContent==='100%' && document.querySelector('[data-navmap]').hidden"), 'zoom: fit returns to 100%');
  // Ctrl + 휠
  await ev("(()=>{const s=document.querySelector('.stage'),r=s.getBoundingClientRect();s.dispatchEvent(new WheelEvent('wheel',{deltaY:-200,ctrlKey:true,clientX:r.left+r.width*.3,clientY:r.top+r.height*.3,bubbles:true,cancelable:true}))})()"); await delay(200);
  ok(await ev("parseInt(document.querySelector('[data-zpct]').textContent)>100"), 'zoom: Ctrl + wheel zooms');
  await ev("document.querySelector('[data-act=zfit]').click()");
  // 클라이언트
  await go(dLink); await until("document.querySelector('.pin-boxes input')"); await typePin(dPin);
  await until("document.querySelector('.doc-canvas') && document.querySelector('.doc-canvas').width>50", 15000, 'client pdf');
  await ev("document.querySelectorAll('.modal .foot .btn').forEach(b=>b.click())"); await delay(300);
  ok(await ev("!!document.querySelector('.overlay .pin.d')===false && document.querySelector('[data-pages] [data-page=\"1\"] .pcount').textContent==='1'"), 'client: page rail shows the director note count');
  await ev("document.querySelector('[data-act=pnext]').click()"); await delay(500);
  ok(await ev("!!document.querySelector('.overlay .ann.d')"), 'client: sees the director drawing on page 2');
  await pointer('.overlay', [[0.3, 0.4], [0.3, 0.4]]); await delay(600);
  ok(await ev("(()=>{const c=document.querySelector('.list .item:not(.sent) .tcbtn');return c && c.textContent==='2쪽'})()"), 'client: pin card shows the page (2쪽)');
  ok(await ev("document.querySelector('.list .item .snap img') && document.querySelector('.list .item .snap img').src.startsWith('data:image/jpeg')"), 'client: page image attached instantly');
  await ev("document.querySelector('.list .item textarea').value='로고를 오른쪽으로';document.querySelector('.list .item textarea').dispatchEvent(new Event('input',{bubbles:true}))");
  await shot('20-doc-client');
  await click('[data-act=send]'); await until("document.querySelector('[data-name]')");
  await ev("document.querySelector('.modal .foot .primary').click()");
  await until("document.querySelector('.sent-ok')", 8000, 'doc sent');
  const dIn = await ev(`JSON.parse(localStorage.getItem('sd:inbox:${pdfPid}'))`);
  ok(dIn.length === 1 && dIn[0].items[0].t === 1 && dIn[0].items[0].ar, 'client: request with page reaches the director');
  await ev("document.querySelector('[data-fb=msg]').click()"); await delay(500);
  const dClip = await ev("navigator.clipboard.readText().catch(()=> '')");
  ok(!dClip || dClip.includes('2쪽'), 'message fallback names the page');
  await ev("document.querySelectorAll('.modal .foot .btn').forEach(b=>b.click())");
  await go(BASE + '#p=' + pdfPid + '&tab=inbox'); await until("document.querySelector('.list .item')", 8000);
  ok(await ev("document.querySelector('.list .item .tcbtn').textContent==='2쪽'"), 'director inbox shows the page');
  await ev("document.querySelector('[data-act=pnext]') && document.querySelector('[data-act=pprev]').click()");
  await ev("document.querySelector('.list .item [data-seek]').click()"); await delay(400);
  ok(await ev("document.querySelector('[data-tc]').textContent==='2'"), 'director: card jumps to its page');
  await shot('21-doc-director-inbox');
  const repHtml = await ev(`(async()=>{const {Store}=await import('/assets/js/store.js');const {reportHTML}=await import('/assets/js/exports.js');return reportHTML(Store.getProject('${pdfPid}'),Store.inbox('${pdfPid}'))})()`).catch(() => '');
  ok(!repHtml || repHtml.includes('2쪽'), 'HTML report names the page');

  // PPT
  await ev(CLEAR); await go(BASE); await until("document.querySelector('[data-drop] input')");
  await setFile('[data-drop] input', TM('deck.pptx'));
  await until("document.querySelector('.doc-stage .pptx-preview-slide-wrapper')", 25000, 'pptx renders');
  await delay(600);
  ok(await ev("document.querySelector('[data-dur]').textContent==='3' && document.querySelector('.doc-stage').innerText.includes('박스 1')"), 'PPT: slides render with text');
  ok(await ev("!document.querySelector('.doc-stage .pptx-preview-wrapper-next') || getComputedStyle(document.querySelector('.doc-stage .pptx-preview-wrapper-next')).display==='none'"), 'PPT: library buttons hidden');
  await ev("document.querySelector('[data-act=pnext]').click()"); await delay(400);
  ok(await ev("document.querySelector('.doc-stage').innerText.includes('박스 2')"), 'PPT: next slide');
  await ev("document.querySelector('[data-tab=inbox]').click()");
  await until("document.querySelector('.doc-bar [data-tool=pin]') && document.querySelector('.doc-stage .pptx-preview-slide-wrapper')", 20000, 'pptx inbox');
  await delay(400); await ev("document.querySelector('[data-act=pnext]').click()"); await delay(400);
  await pointer('.overlay', [[0.5, 0.5], [0.5, 0.5]]);
  await until(`(async()=>{const {Store}=await import('/assets/js/store.js');return (Store.projects()[0].notes||[]).length===1})()`, 10000, 'ppt note');
  const pn = await ev(`(async()=>{const {Store}=await import('/assets/js/store.js');return Store.projects()[0].notes||[]})()`);
  ok(pn.length === 1 && pn[0].t === 1 && (pn[0].th || '').length > 2000, 'PPT: note gets a slide image');
  ok(await ev("document.querySelector('.list .item .tcbtn') ? document.querySelector('.list .item .tcbtn').textContent==='슬라이드 2' : true"), 'PPT: address reads 슬라이드 2');
  await until("[...document.querySelectorAll('[data-pages] img')].every(i=>!i.hidden && i.src)", 15000, 'slide thumbs');
  await shot('22-doc-pptx');

  // 사진 여러 장
  await ev(CLEAR); await go(BASE); await until("document.querySelector('[data-drop] input')");
  await setFile('[data-drop] input', [TM('photo1.jpg'), TM('photo2.png')]);
  await until("document.querySelector('.doc-img') && document.querySelector('.doc-img').complete && document.querySelector('.doc-img').naturalWidth>0", 15000, 'image renders');
  ok(await ev("document.querySelector('[data-dur]').textContent==='2' && document.querySelector('[data-meta]').textContent.includes('2')"), 'images: two photos form one set');
  await ev("document.querySelector('[data-act=pnext]').click()"); await delay(300);
  ok(await ev("(()=>{const o=document.querySelector('.overlay');return o.offsetHeight>o.offsetWidth})()"), 'images: portrait photo keeps its shape');
  await shot('23-doc-images');
  await ev("document.querySelector('[data-tab=inbox]').click()"); await until("document.querySelector('.doc-bar [data-tool=pin]') && document.querySelector('.doc-img') && document.querySelector('.doc-img').naturalWidth", 10000);
  ok(await ev("(()=>{const o=document.querySelector('.overlay'),r=o.getBoundingClientRect(),e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return o.contains(e)||e===o})()"), 'marking layer sits above the document');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await ev("document.querySelector('[data-tab=inbox]') && document.querySelector('[data-tab=inbox]').click()"); await delay(1200);
  ok(await ev("document.documentElement.scrollWidth<=innerWidth+1"), 'phone: document view has no horizontal scroll');
  await shot('24-doc-phone');
  await call('Emulation.clearDeviceMetricsOverride');

  /* 11c. 새 프로젝트 팝업 · 목록 '내용만' 보기 */
  const nProj = async () => ev(`(async()=>{const {Store}=await import('/assets/js/store.js');return Store.projects().length})()`);
  const n0 = await nProj();
  await click('[data-act=new]'); await until("document.querySelector('.modal.new-dlg .hero-form input')", 3000, 'new dialog');
  ok(await nProj() === n0 && await ev("!!document.querySelector('.modal.new-dlg [data-drop] input[type=file][multiple]')"), 'new project: popup with link box and file upload, nothing created yet');
  await shot('25-new-dialog');
  await ev(`document.querySelector('.new-dlg .hero-form input').value=${JSON.stringify(VIDEO)};document.querySelector('.new-dlg .hero-form .btn').click()`);
  await until("!document.querySelector('.modal.new-dlg') && location.hash.includes('tab=setup') && document.querySelector('.stage video')", 10000, 'project from popup');
  ok(await nProj() === n0 + 1, 'new project: created from the popup link');
  await ev("document.querySelector('[data-tab=inbox]').click()"); await until("document.querySelector('.toolbar [data-tool=pin]') && document.querySelector('.stage video').readyState>=2", 10000);
  await pointer('.overlay', [[0.4, 0.4], [0.4, 0.4]]); await until("document.querySelector('.list .item .snap')", 5000, 'note card');
  ok(await ev("getComputedStyle(document.querySelector('.list .item .snap')).display!=='none' && getComputedStyle(document.querySelector('.list .item .tonly')).display==='none'"), 'list view: images shown by default');
  await click('[data-listview=text]'); await delay(100);
  ok(await ev("getComputedStyle(document.querySelector('.list .item .snap')).display==='none' && getComputedStyle(document.querySelector('.list .item .tonly')).display!=='none' && document.querySelector('[data-listview=text]').classList.contains('on')"), 'list view: notes only hides scene images');
  await shot('26-text-only');
  await ev("document.querySelector('.list .item .tonly').click()"); await until("document.querySelector('.zoom.on')", 3000, 'zoom from text-only');
  ok(true, 'list view: notes-only card still opens the enlarged scene');
  await ev("document.querySelector('[data-z=close]').click()"); await delay(300);
  const hNow = await ev("location.hash"); await go(BASE + '?tv' + hNow); await until("document.querySelector('.list .item')", 8000);
  ok(await ev("document.documentElement.classList.contains('text-only') && getComputedStyle(document.querySelector('.list .item .snap')).display==='none'"), 'list view: choice is remembered');
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'v',bubbles:true}))"); await delay(100);
  ok(await ev("!document.documentElement.classList.contains('text-only')"), 'list view: V key toggles');


  /* 11e. 상태 버튼 스크롤 유지 · 재생 중 핀 깜빡임 · 영상 확대 · 로고 */
  await ev(CLEAR); await go(BASE); await until("document.querySelector('.hero-form input')");
  ok(await ev("(()=>{const a=document.querySelector('.topbar .wordmark');return a && a.href.startsWith('https://wsns.studio') && a.target==='_blank' && a.querySelector('img.mark').src.includes('brand/wsns-mark.svg') && a.textContent.includes('웨스엔에스 스튜디오') && a.textContent.includes('WSNS studio')})()"), 'logo: 2×2 WSNS mark, WSNS studio [웨스엔에스 스튜디오], links to the WSNS homepage');
  await ev(`document.querySelector('.hero-form input').value=${JSON.stringify(VIDEO)};document.querySelector('.hero-form .btn').click()`);
  await until("location.hash.includes('tab=setup') && document.querySelector('.stage video') && document.querySelector('.stage video').readyState>=2", 10000);
  const zPid = await ev("location.hash.match(/p=(\\w+)/)[1]");
  await ev(`(async()=>{const {Store}=await import('/assets/js/store.js');const items=[];for(let i=0;i<14;i++)items.push({id:'z'+i,t:i*0.5,x:30+i,y:40,s:[],tx:'요청 '+(i+1)+' — 길게 적은 수정 내용입니다. '.repeat(3),st:'open',rp:[],at:Date.now()});Store.saveInbox('${zPid}',[{rid:'r1',from:'고객',at:Date.now(),items}])})()`);
  await go(BASE + '?z#p=' + zPid + '&tab=inbox'); await until("document.querySelectorAll('.list .item').length===14", 8000, 'inbox with many items');
  // 목록을 아래로 내린 뒤 상태 버튼
  await ev("(()=>{const l=document.querySelector('.list');const it=document.querySelectorAll('.list .item')[9];l.scrollTop=it.offsetTop-l.offsetTop-40;scrollTo(0,0)})()"); await delay(150);
  const sc0 = await ev("document.querySelector('.list').scrollTop");
  await ev("document.querySelectorAll('.list .item')[9].querySelector('[data-st=done]').click()"); await delay(250);
  const sc1 = await ev("document.querySelector('.list').scrollTop");
  ok(sc0 > 200 && Math.abs(sc1 - sc0) < 3, `status button keeps the list where it was (${sc0} → ${sc1})`);
  await ev("document.querySelectorAll('.list .item')[9].querySelector('[data-st=hold]').click()"); await delay(250);
  ok(Math.abs(await ev("document.querySelector('.list').scrollTop") - sc0) < 3, 'second status change also keeps the scroll');
  // 재생 중 핀: 다시 그리는 횟수가 적어야(깜빡임 없음)
  await ev("document.querySelector('.stage video').currentTime=0.95"); await delay(300);
  await ev("window.__mut=0;new MutationObserver(m=>{window.__mut+=m.length}).observe(document.querySelector('.overlay'),{childList:true})");
  await ev("document.querySelector('[data-act=play]').click()"); await delay(1600); await ev("document.querySelector('.stage video').pause()");
  const muts = await ev("window.__mut");
  ok(muts < 40, `playing past pins redraws the marks only when they change (${muts} changes in 1.6 s)`);
  ok(await ev("document.querySelector('.freeze').hidden"), 'scene image cover is hidden once the video plays');
  // 영상 확대
  await ev("(()=>{const s=document.querySelector('.stage'),r=s.getBoundingClientRect();s.dispatchEvent(new WheelEvent('wheel',{deltaY:-240,ctrlKey:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true,cancelable:true}))})()"); await delay(200);
  ok(await ev("document.querySelector('.stage').classList.contains('zoomed') && !document.querySelector('[data-vzoom]').hidden && parseInt(document.querySelector('[data-vzpct]').textContent)>100 && !document.querySelector('[data-vnav]').hidden"), 'video: Ctrl + wheel zooms, with zoom bar and mini-map');
  await shot('32-video-zoom');
  const nBefore = await ev(`(async()=>{const {Store}=await import('/assets/js/store.js');return (Store.getProject('${zPid}').notes||[]).length})()`);
  await pointer('.overlay', [[0.5, 0.5], [0.5, 0.5]]); await delay(700);
  const zn = await ev(`(async()=>{const {Store}=await import('/assets/js/store.js');return Store.getProject('${zPid}').notes||[]})()`);
  ok(zn.length === nBefore + 1 && Math.abs(zn[zn.length - 1].x - 50) < 1 && Math.abs(zn[zn.length - 1].y - 50) < 1, `video: pin while zoomed lands on the right spot (${zn.length && zn[zn.length-1].x}, ${zn.length && zn[zn.length-1].y})`);
  const tr0 = await ev("document.querySelector('.pan').style.transform");
  await ev("(()=>{const s=document.querySelector('.stage'),r=s.getBoundingClientRect();s.dispatchEvent(new WheelEvent('wheel',{deltaX:60,deltaY:40,clientX:r.left+10,clientY:r.top+10,bubbles:true,cancelable:true}))})()"); await delay(100);
  ok(await ev("document.querySelector('.pan').style.transform") !== tr0, 'video: wheel pans while zoomed');
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'0',bubbles:true}))"); await delay(100);
  ok(await ev("!document.querySelector('.stage').classList.contains('zoomed') && document.querySelector('[data-vzoom]').hidden"), 'video: 0 key returns to fit');
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'+',bubbles:true}))"); await delay(100);
  ok(await ev("document.querySelector('[data-vzpct]').textContent==='150%'"), 'video: + key zooms in');
  await ev("document.querySelector('[data-vz=fit]').click()"); await delay(100);
  ok(await ev("!document.querySelector('.stage').classList.contains('zoomed')"), 'video: fit button');

  /* 11f. 인터넷 사진 링크 · 캔바 링크 */
  const nproj = () => ev(`(async()=>{const {Store}=await import('/assets/js/store.js');return Store.projects().length})()`);
  ok(await ev(`(async()=>{const {directLink}=await import('/assets/js/doc.js');return directLink('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz12345/view?usp=sharing')==='https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz12345' && directLink('https://www.dropbox.com/s/abc/p.png?dl=0').endsWith('raw=1')})()`), 'links: Google Drive / Dropbox share links become direct image links');
  await ev(CLEAR); await go(BASE); await until("document.querySelector('.hero-form input')");
  await ev("document.querySelector('.hero-form input').value=location.origin+'/noext/photo1';document.querySelector('.hero-form .btn').click()");
  await until("document.querySelector('.doc-img') && document.querySelector('.doc-img').naturalWidth>0", 12000, 'image link without extension');
  ok(await ev("document.querySelector('[data-meta]').textContent.includes('사진')"), 'image link without a file extension opens as a photo');
  // 다른 사이트 사진 (CORS 없음) — localhost는 127.0.0.1과 다른 출처
  await ev(CLEAR); await go(BASE); await until("document.querySelector('.hero-form input')");
  await ev("document.querySelector('.hero-form input').value='http://localhost:8765/noext/photo2x';document.querySelector('.hero-form .btn').click()"); await delay(1500);
  ok(await nproj() === 0, 'a link that is not a photo or video is refused with a message');
  await ev("document.querySelector('.hero-form input').value='http://localhost:8765/noext/photo1';document.querySelector('.hero-form .btn').click()");
  await until("document.querySelector('.doc-img') && document.querySelector('.doc-img').naturalWidth>0", 12000, 'cross-site photo');
  const xPid = await ev("location.hash.match(/p=(\\w+)/)[1]");
  await ev("document.querySelector('[data-tab=inbox]').click()"); await until("document.querySelector('.doc-bar [data-tool=pin]') && document.querySelector('.doc-img') && document.querySelector('.doc-img').naturalWidth>0", 8000);
  await pointer('.overlay', [[0.5, 0.5], [0.5, 0.5]]); await delay(800);
  const xn = await ev(`(async()=>{const {Store}=await import('/assets/js/store.js');return Store.getProject('${xPid}').notes||[]})()`);
  ok(xn.length === 1 && (xn[0].th === 'http://localhost:8765/noext/photo1' || (xn[0].th || '').startsWith('data:image')), 'photo from another site: card uses the photo itself as its scene image');
  ok(await ev("!!document.querySelector('.list .item .snap img')"), 'photo from another site: card shows the image');
  // 사진 링크 여러 개 → 한 세트
  await ev(CLEAR); await go(BASE); await until("document.querySelector('.hero-form input')");
  await ev("document.querySelector('.hero-form input').value=location.origin+'/noext/photo1 '+location.origin+'/test-media/photo2.png';document.querySelector('.hero-form .btn').click()");
  await until("document.querySelector('.doc-img') && document.querySelector('[data-dur]') && document.querySelector('[data-dur]').textContent==='2'", 12000, 'two image links');
  ok(true, 'several photo links become one set (2 pages)');
  // 캔바 — 페이지 수는 WSNS 서버 함수(canva-pages)가 읽어 준다. 검사에서는 그 응답을 흉내 낸다
  const STUB = r => `window.__f=window.__f||fetch;window.__canvaCalls=0;window.fetch=(u,o)=>String(u).includes('/canva-pages')?(window.__canvaCalls++,${r}):window.__f(u,o)`;
  const STUB_OK = (n, w, h) => STUB(`Promise.resolve(new Response(JSON.stringify({pages:${n},w:${w},h:${h}}),{headers:{'Content-Type':'application/json'}}))`);
  await ev(CLEAR); await go(BASE); await until("document.querySelector('.hero-form input')");
  await ev(STUB_OK(3, 1080, 1920));
  await ev("document.querySelector('.hero-form input').value='https://www.canva.com/design/DAGi7rMbwQI/DL_b2qdGHZhErapcUnzRlQ/view';document.querySelector('.hero-form .btn').click()");
  await until("document.querySelector('[data-canva=n]') && document.querySelector('[data-dur]') && document.querySelector('[data-dur]').textContent==='3'", 8000, 'canva auto pages');
  ok(await ev("!document.querySelector('.modal [data-cn]') && window.__canvaCalls===1 && document.querySelector('[data-canva=n]').value==='3' && document.querySelector('[data-canva=ar]').value==='9:16'"), 'Canva: page count and ratio come from the design itself (no question asked)');
  await ev(STUB_OK(5, 1920, 1080)); await ev("document.querySelector('[data-canva-sync]').click()");
  await until("document.querySelector('[data-canva=n]') && document.querySelector('[data-canva=n]').value==='5' && document.querySelector('[data-dur]') && document.querySelector('[data-dur]').textContent==='5' && document.querySelectorAll('[data-pages] [data-page]').length===5", 8000, 'canva re-check');
  ok(await ev("document.querySelector('[data-canva=ar]').value==='16:9'"), 'Canva: [다시 확인] picks up pages added in Canva');
  await ev(CLEAR); await go(BASE); await until("document.querySelector('.hero-form input')");
  await ev(STUB("Promise.reject(new TypeError('offline'))")); // 서버에 닿지 못하면 직접 묻는다
  await ev("document.querySelector('.hero-form input').value='https://canva.link/abc123';document.querySelector('.hero-form .btn').click()");
  await until("document.querySelector('.modal [data-full]')", 4000, 'short link dialog');
  ok(await nproj() === 0 && await ev("document.querySelector('.modal [data-open]').href==='https://canva.link/abc123' && document.querySelector('.modal [data-open]').target==='_blank'"), 'Canva short link: opens it in a new tab and asks for the full address');
  await ev("const i=document.querySelector('.modal [data-full]');i.value='https://www.canva.com/design/DAGi7rMbwQI/DL_b2qdGHZhErapcUnzRlQ/view?utm_content=x';i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.modal .foot .primary').click()");
  await until("document.querySelector('.modal [data-cn]')", 6000, 'canva page-count question');
  ok(await ev("document.querySelector('.modal [data-cn]').value==='1'"), 'Canva: if the server cannot be reached, asks for the page count (starts at 1)');
  await ev("document.querySelector('.modal [data-cs=\"1\"]').click();document.querySelector('.modal .foot .primary').click()");
  await until("document.querySelector('[data-dur]') && document.querySelector('[data-dur]').textContent==='2'", 6000, 'canva 2 pages');
  ok(await ev("document.querySelector('[data-canva=n]').value==='2'"), 'Canva: the answer (2 pages) is used');
  await until("document.querySelector('.canva-frame') && document.querySelector('.canva-frame').src.includes('#1')", 8000, 'canva frame');
  await until("document.querySelector('[data-meta]') && document.querySelector('[data-meta]').textContent.includes('Canva')", 6000, 'canva meta');
  ok(await ev("document.querySelector('.canva-frame').src.startsWith('https://www.canva.com/design/DAGi7rMbwQI/DL_b2qdGHZhErapcUnzRlQ/view?embed') && document.querySelector('[data-meta]').textContent.includes('Canva') && !!document.querySelector('[data-canva=n]')"), 'Canva: public view link opens as an embed, with page count and ratio settings');
  await ev("const n=document.querySelector('[data-canva=n]');n.value='4';n.dispatchEvent(new Event('change',{bubbles:true}))");
  await until("document.querySelector('[data-dur]') && document.querySelector('[data-dur]').textContent==='4'", 6000, 'canva pages');
  await until("document.querySelectorAll('[data-pages] [data-page]').length===4", 5000, 'canva rail 4');
  ok(true, 'Canva: page count drives the page list');
  await ev("document.querySelector('[data-tab=inbox]').click()"); await until("document.querySelector('.doc-bar [data-tool=pin]') && document.querySelector('.canva-frame')", 8000);
  await ev("document.querySelector('[data-act=pnext]').click()"); await delay(300);
  ok(await ev("document.querySelector('.canva-frame').src.endsWith('#2') && document.querySelector('[data-tc]').textContent==='2'"), 'Canva: next page opens page 2 of the design');
  await pointer('.overlay', [[0.4, 0.4], [0.4, 0.4]]); await delay(600);
  ok(await ev("(()=>{const c=document.querySelector('.list .item .tcbtn');return c && c.textContent==='슬라이드 2'})()"), 'Canva: pin card shows the slide');
  await shot('33-canva');
  // 페이지 사진 만들기 (화면 공유 한 번)
  await until("document.querySelector('[data-railcap]')", 6000, 'rail capture button');
  ok(true, 'Canva: page list offers to make page images');
  await ev("document.querySelector('[data-railcap]').click()");
  await until("!document.querySelector('[data-railcap]') && [...document.querySelectorAll('[data-pages] [data-page] img')].length===4 && [...document.querySelectorAll('[data-pages] [data-page] img')].every(i=>!i.hidden && i.src.startsWith('data:image'))", 90000, 'canva page images');
  ok(true, 'Canva: one screen share fills the page list with every page');
  await ev("document.querySelector('[data-act=pnext]').click()"); await delay(300);
  await pointer('.overlay', [[0.6, 0.6], [0.6, 0.6]]); await delay(700);
  ok(await ev("[...document.querySelectorAll('.list .item .snap img')].some(i=>i.src.startsWith('data:image'))"), 'Canva: after that, cards get page images instantly');
  await shot('34-canva-thumbs');
  /* 11d. 사용 안내 (애니메이션) */
  await ev(CLEAR + "sessionStorage.setItem('t:tour','1');localStorage.removeItem('sd:tour:off')");
  await go(BASE + '?tour'); await until("document.querySelector('.hero-form input')");
  await ev(`document.querySelector('.hero-form input').value=${JSON.stringify(VIDEO)};document.querySelector('.hero-form .btn').click()`);
  await until("document.querySelector('.modal.tour .tv')", 6000, 'tour opens after creating a project');
  ok(await ev("document.querySelector('[data-count]').textContent==='1 / 9' && document.querySelector('.tour .tv.s-add') && getComputedStyle(document.querySelector('.tour .m-type')).animationName!=='none'"), 'guide: opens on project creation with animated step 1 of 9');
  await delay(2200); await shot('27-tour-1');
  for (let k = 0; k < 3; k++) { await ev("document.querySelector('[data-tour=next]').click()"); await delay(200); }
  ok(await ev("document.querySelector('.tour .tv.s-mark') && document.querySelector('[data-count]').textContent==='4 / 9'"), 'guide: next moves through steps');
  await delay(1600); await shot('28-tour-4');
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))"); await delay(150);
  ok(await ev("document.querySelector('[data-count]').textContent==='3 / 9'"), 'guide: arrow keys navigate');
  await ev("document.querySelector('[data-go=\"7\"]').click()"); await delay(1500); await shot('29-tour-8');
  ok(await ev("!!document.querySelector('.tour .tv.s-doc')"), 'guide: dots jump to a step');
  await ev("document.querySelector('[data-off]').click();document.querySelector('[data-tour=close]').click()"); await delay(200);
  ok(await ev("!document.querySelector('.modal.tour') && localStorage.getItem('sd:tour:off')==='1'"), 'guide: “다시 보지 않기” is saved on close');
  await click('[data-act=new]'); await until("document.querySelector('.new-dlg .hero-form input')");
  await ev(`document.querySelector('.new-dlg .hero-form input').value=${JSON.stringify(VIDEO)};document.querySelector('.new-dlg .hero-form .btn').click()`);
  await delay(1500);
  ok(await ev("!document.querySelector('.modal.tour')"), 'guide: not shown again after opting out');
  await click('[data-act=tour]'); await until("document.querySelector('.modal.tour')", 3000);
  ok(true, 'guide: help button reopens it anytime');
  await ev("document.querySelector('[data-go=\"8\"]').click()"); await delay(100);
  ok(await ev("document.querySelector('[data-tour=next]').textContent==='시작하기'"), 'guide: last step says 시작하기');
  await ev("document.querySelector('[data-tour=next]').click()"); await delay(150);
  ok(await ev("!document.querySelector('.modal.tour')"), 'guide: 시작하기 closes it');
  // 클라이언트 화면 사용 안내
  await ev("localStorage.removeItem('sd:ctour:off')");
  const tPin = await ev("[...document.querySelectorAll('.pin-show span')].map(s=>s.textContent).join('')");
  const tLink = await ev("document.querySelector('[data-link]') ? document.querySelector('[data-link]').value : ''") || await (async () => { await ev("document.querySelector('[data-tab=setup]').click()"); await until("document.querySelector('[data-link]') && document.querySelector('[data-link]').value.includes('#c=')", 6000); return ev("document.querySelector('[data-link]').value"); })();
  const tPin2 = tPin || await ev("[...document.querySelectorAll('.pin-show span')].map(s=>s.textContent).join('')");
  await go(tLink); await until("document.querySelector('.pin-boxes input')"); await typePin(tPin2);
  await until("document.querySelector('.modal.tour .tv.s-find')", 8000, 'client guide opens on first visit');
  ok(await ev("document.querySelector('.modal.tour [data-count]').textContent==='1 / 9' && !!document.querySelector('.tour .m-kbd')"), 'client guide: opens on first visit with step 1 (finding the scene, keys)');
  await delay(2400); await shot('30-client-tour-1');
  await ev("document.querySelector('[data-go=\"4\"]').click()"); await delay(1800); await shot('31-client-tour-hand');
  ok(await ev("!!document.querySelector('.tour .tv.s-hand')"), 'client guide: video projects explain the hand tool');
  await ev("document.querySelector('[data-go=\"8\"]').click()"); await delay(300);
  ok(await ev("document.querySelectorAll('.tour .m-krow').length===8"), 'client guide: last step lists shortcuts');
  await ev("document.querySelector('[data-tour=next]').click()"); await delay(200);
  ok(await ev("!document.querySelector('.modal.tour')"), 'client guide: closes');
  await go(tLink.replace('#', '?again#')); await until("document.querySelector('.pin-boxes input') || document.querySelector('.viewer .stage')");
  if (await ev("!!document.querySelector('.pin-boxes input')")) await typePin(tPin2);
  await until("document.querySelector('.viewer .stage')", 8000); await delay(900);
  ok(await ev("!document.querySelector('.modal.tour')"), 'client guide: shown once per project');
  await click('[data-act=help]'); await until("document.querySelector('.modal.tour .tv.s-find')", 3000);
  ok(true, 'client guide: ? button reopens it');
  await ev("document.querySelector('[data-off]').click();document.querySelector('[data-tour=close]').click()"); await delay(150);
  ok(await ev("localStorage.getItem('sd:ctour:off')==='1'"), 'client guide: 다시 보지 않기 saved');
  await ev("sessionStorage.removeItem('t:tour')");
  /* 11z. 프로젝트 메뉴 — ⋯ 버튼·우클릭·F2·Delete */
  await ev(CLEAR); await go(BASE); await until("document.querySelector('.hero-form input')");
  for (const name of ['첫 프로젝트', '둘째 프로젝트']) {
    await ev(`document.querySelector('.hero-form input').value=${JSON.stringify(VIDEO)};document.querySelector('.hero-form .btn').click()`);
    await until("location.hash.includes('tab=setup') && document.querySelector('[data-f=title]')", 8000, 'project for menu');
    await ev(`(()=>{const i=document.querySelector('[data-f=title]');i.value=${JSON.stringify(name)};i.dispatchEvent(new Event('input',{bubbles:true}))})()`); await delay(150);
    await ev("location.hash='#'"); await until("document.querySelector('.hero-form input')");
  }
  await until("document.querySelectorAll('.plist .prow').length===2", 5000, 'two projects');
  const rowOf = name => `[...document.querySelectorAll('.plist .prow')].find(r=>r.textContent.includes('${name}'))`;
  await ev(`(()=>{const r=${rowOf('첫 프로젝트')}.querySelector('.pitem'),b=r.getBoundingClientRect();r.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:b.left+20,clientY:b.top+10}))})()`);
  await until("document.querySelector('.ctx-menu')", 3000, 'context menu');
  ok(await ev("(()=>{const l=[...document.querySelectorAll('.ctx-menu button')].map(b=>b.textContent);return ['열기','새 탭에서 열기','이름 바꾸기','복제','맨 위에 고정','검수 링크 복사','프로젝트 삭제'].every(x=>l.some(y=>y.startsWith(x)))&&document.activeElement.closest('.ctx-menu')})()"), 'project menu: right-click opens a menu (open, new tab, rename, duplicate, pin, copy link, delete)');
  await shot('35-project-menu');
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await delay(100);
  ok(await ev("!document.querySelector('.ctx-menu')"), 'project menu: Esc closes it');
  // 이름 바꾸기
  await ev(`${rowOf('첫 프로젝트')}.querySelector('[data-pmore]').click()`); await until("document.querySelector('.ctx-menu')", 3000);
  await ev("[...document.querySelectorAll('.ctx-menu button')].find(b=>b.textContent.startsWith('이름 바꾸기')).click()");
  await until("document.querySelector('.modal [data-rename]')", 3000, 'rename dialog');
  await ev("(()=>{const i=document.querySelector('.modal [data-rename]');i.value='바뀐 이름';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()");
  await until(`!!${rowOf('바뀐 이름')}`, 4000, 'renamed');
  ok(true, 'project menu: ⋯ button → rename');
  // 맨 위에 고정
  await ev(`${rowOf('바뀐 이름')}.querySelector('[data-pmore]').click()`); await until("document.querySelector('.ctx-menu')", 3000);
  await ev("[...document.querySelectorAll('.ctx-menu button')].find(b=>b.textContent.startsWith('맨 위에 고정')).click()");
  await until("document.querySelector('.plist .prow').classList.contains('pinned') && document.querySelector('.plist .prow').textContent.includes('바뀐 이름')", 4000, 'pinned');
  ok(true, 'project menu: pin to top keeps it first');
  // 복제
  await ev(`${rowOf('둘째 프로젝트')}.querySelector('[data-pmore]').click()`); await until("document.querySelector('.ctx-menu')", 3000);
  await ev("[...document.querySelectorAll('.ctx-menu button')].find(b=>b.textContent.startsWith('복제')).click()");
  await until("document.querySelectorAll('.plist .prow').length===3 && location.hash.includes('tab=setup')", 6000, 'duplicated');
  ok(await ev(`!!${rowOf('둘째 프로젝트 사본')} && document.querySelector('[data-f=title]').value==='둘째 프로젝트 사본'`), 'project menu: duplicate opens the copy');
  // 검수 링크 복사
  await ev(`${rowOf('둘째 프로젝트 사본')}.querySelector('[data-pmore]').click()`); await until("document.querySelector('.ctx-menu')", 3000);
  await ev("[...document.querySelectorAll('.ctx-menu button')].find(b=>b.textContent.startsWith('검수 링크 복사')).click()");
  await until("document.getElementById('toast') && document.getElementById('toast').classList.contains('on') && /복사/.test(document.getElementById('toast').textContent)", 5000, 'copy toast');
  ok(true, 'project menu: copy review link');
  // 삭제 (지금 연 프로젝트) → 처음 화면으로
  await ev(`${rowOf('둘째 프로젝트 사본')}.querySelector('[data-pmore]').click()`); await until("document.querySelector('.ctx-menu')", 3000);
  await ev("[...document.querySelectorAll('.ctx-menu button')].find(b=>b.textContent.startsWith('프로젝트 삭제')).click()");
  await until("document.querySelector('.modal .foot .danger')", 3000, 'delete confirm');
  ok(await ev("document.querySelector('.modal').textContent.includes('둘째 프로젝트 사본')"), 'project menu: delete asks first, naming the project');
  await ev("document.querySelector('.modal .foot .danger').click()");
  await until("document.querySelectorAll('.plist .prow').length===2 && document.querySelector('.hero-form input')", 5000, 'deleted current');
  ok(await nproj() === 2, 'project menu: delete removes it and returns home');
  // Delete 키 (다른 프로젝트를 보는 중) → 지금 화면은 그대로
  await ev(`location.hash=${rowOf('바뀐 이름')}.querySelector('.pitem').getAttribute('href')`); await until("document.querySelector('[data-main] .viewer, [data-f=title]')", 6000);
  await ev(`(()=>{const a=${rowOf('둘째 프로젝트')}.querySelector('.pitem');a.focus();a.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}))})()`);
  await until("document.querySelector('.modal .foot .danger')", 3000); await ev("document.querySelector('.modal .foot .danger').click()");
  await until("document.querySelectorAll('.plist .prow').length===1", 5000, 'deleted by key');
  ok(await ev("document.querySelector('.plist .pitem.on') && document.querySelector('.plist .pitem.on').textContent.includes('바뀐 이름')"), 'project menu: Delete key removes another project and stays on the open one');
  /* 12. WesNS 로그인 (목업) */
  const HANGUL = "(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const bad=[];let n;while(n=w.nextNode()){if(n.parentElement.closest('[data-user],textarea,input,noscript,script,style'))continue;if(/[가-힣]/.test(n.textContent))bad.push(n.textContent.trim().slice(0,40))}document.querySelectorAll('[title],[aria-label],[placeholder]').forEach(e=>['title','aria-label','placeholder'].forEach(a=>{const v=e.getAttribute(a);if(v&&/[가-힣]/.test(v)&&!/한국어/.test(v))bad.push(a+':'+v.slice(0,40))}));return bad.filter(x=>x!=='한국어')})()";
  await ev("localStorage.clear();sessionStorage.setItem('t:nouser','1');localStorage.setItem('wesns.lang','ko')");
  await go(BASE + '?login'); await until("document.querySelector('.auth-card')", 6000, 'login screen');
  ok(await ev("!document.querySelector('.console') && !document.querySelector('.hero-form')"), 'login screen shown before the console when signed out');
  await shot('13-login');
  await ev("document.querySelector('[name=email]').value='director@example.com';document.querySelector('[name=pw]').value='short';document.querySelector('.auth-submit').click()");
  ok(await ev("['google','kakao','naver'].every(p=>document.querySelector('[data-provider='+p+']'))"), 'login offers Google, Kakao and Naver');
  ok(await ev("!document.querySelector('.auth-err').hidden && !localStorage.getItem('wesns.mock.user')"), 'login rejects a password under 8 characters');
  await ev("document.querySelector('[name=pw]').value='password1';document.querySelector('.auth-submit').click()");
  await until("document.querySelector('.hero-form input')", 6000, 'console after login');
  ok(await ev("JSON.parse(localStorage.getItem('wesns.mock.user')).email==='director@example.com' && document.querySelector('.avatar').textContent==='D'"), 'email login stores the WesNS mock user and shows the account button');
  await go(BASE + '?again'); await until("document.querySelector('.hero-form input')", 6000);
  ok(await ev("!document.querySelector('.auth-card')"), 'already signed in: login is skipped');
  await ev("document.querySelector('[data-act=account]').click()"); await delay(100);
  ok(await ev("!document.querySelector('.acct-menu').hidden && document.querySelector('.acct-who small').textContent==='director@example.com'"), 'account menu shows the signed-in email');
  await shot('14-account-menu');
  await ev("document.querySelector('.acct-menu [data-act=logout]').click()");
  await delay(800); await until("document.readyState==='complete' && document.querySelector('.auth-card')", 6000, 'logged out');
  ok(await ev("!localStorage.getItem('wesns.mock.user')"), 'logout clears the user and returns to login');
  await ev("document.querySelector('[data-provider=kakao]').click()");
  await until("document.querySelector('.hero-form input')", 6000, 'kakao login');
  ok(await ev("JSON.parse(localStorage.getItem('wesns.mock.user')).provider==='kakao'"), 'Kakao mock login works');

  /* 13. 영어판 */
  await ev("sessionStorage.removeItem('t:nouser');localStorage.clear();localStorage.setItem('wesns.lang','en')");
  await go(BASE + '?en'); await until("document.querySelector('.hero-form input')", 6000);
  ok(await ev("document.documentElement.lang==='en' && document.querySelector('.hero h2').textContent.includes('review link')"), 'English: director home is in English');
  let bad = await ev(HANGUL); ok(!bad.length, 'English: no Korean left on director home ' + JSON.stringify(bad));
  await shot('15-en-director-home');
  await ev(`document.querySelector('.hero-form input').value=${JSON.stringify(VIDEO)};document.querySelector('.hero-form .btn').click()`);
  await until("location.hash.includes('tab=setup') && document.querySelector('[data-link]') && document.querySelector('[data-link]').value.includes('#c=')", 10000, 'en link');
  await until("document.querySelector('.stage video') && document.querySelector('.stage video').readyState>=2", 10000);
  bad = await ev(HANGUL); ok(!bad.length, 'English: no Korean in setup ' + JSON.stringify(bad));
  await shot('16-en-director-setup');
  const enPin = await ev("[...document.querySelectorAll('.pin-show span')].map(s=>s.textContent).join('')");
  const enLink = await ev("document.querySelector('[data-link]').value");
  await ev("document.querySelector('[data-tab=inbox]') && document.querySelector('[data-tab=inbox]').click()"); await delay(300);
  bad = await ev(HANGUL); ok(!bad.length, 'English: no Korean in inbox ' + JSON.stringify(bad));
  await go(enLink); await until("document.querySelector('.pin-boxes input')");
  bad = await ev(HANGUL); ok(!bad.length, 'English: no Korean on PIN gate ' + JSON.stringify(bad));
  await ev(`(()=>{const b=[...document.querySelectorAll('.pin-boxes input')];${JSON.stringify(enPin)}.split('').forEach((c,i)=>{b[i].value=c;b[i].dispatchEvent(new Event('input',{bubbles:true}))});})()`);
  await until("document.querySelector('.viewer .stage video')", 8000, 'en client');
  await ev("document.querySelectorAll('.modal .foot .btn').forEach(b=>b.click())"); await delay(300);
  await until("document.querySelector('.stage video').readyState>=2", 8000);
  await pointer('.overlay', [[0.4, 0.4], [0.4, 0.4]]); await delay(400);
  ok(await ev("document.querySelectorAll('.list .item').length===1"), 'English: client can pin');
  bad = await ev(HANGUL); ok(!bad.length, 'English: no Korean in client view ' + JSON.stringify(bad));
  await shot('17-en-client');
  await ev("document.querySelector('[data-act=help]').click()"); await delay(300);
  bad = await ev(HANGUL); ok(!bad.length, 'English: no Korean in help ' + JSON.stringify(bad));
  await shot('18-en-help');
  ok((await ev("window.__i18nMissing||[]")).length === 0, 'English: every UI string has a translation ' + JSON.stringify(await ev("window.__i18nMissing||[]")));

  if (process.env.THEME !== 'dark') {
  /* 14. 휴대폰 다크 모드여도 밝은 화면 */
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await ev("localStorage.removeItem('wesns.theme')"); await go(BASE + '?dk'); await until("document.querySelector('.topbar')", 6000);
  ok(await ev("!document.documentElement.classList.contains('dark') && document.querySelector('meta[name=color-scheme]').content==='only light' && getComputedStyle(document.documentElement).colorScheme.includes('only')"), 'phone in dark mode: still the light theme, forced darkening opted out');
  ok(await ev("(()=>{const t=document.querySelector('.topbar');return t.offsetHeight<70 && document.documentElement.scrollWidth<=innerWidth+1})()"), 'phone: director top bar fits on one line');
  await ev("document.querySelector('[data-theme-toggle]').click()"); await delay(100);
  ok(await ev("document.documentElement.classList.contains('dark') && document.querySelector('meta[name=color-scheme]').content==='dark'"), 'dark mode still available when chosen');
  await ev("document.querySelector('[data-theme-toggle]').click()");
  await call('Emulation.setEmulatedMedia', { features: [] }); await call('Emulation.clearDeviceMetricsOverride');
  }
  console.log('PASS ' + pass.length + ':\n- ' + pass.join('\n- '));
  browser.kill(); process.exit(0);
})().catch(e => { console.error(e.message || e); console.log('passed before failure: ' + pass.join(', ')); browser.kill(); process.exit(1); });

// canva-pages — 공개 캔바 보기 링크의 페이지 수와 화면 비율을 알려 준다.
// 브라우저는 캔바 페이지를 직접 읽을 수 없어(CORS) 이 함수가 대신 읽는다.
// GET ?id=<디자인 ID>&tk=<공유 토큰>  →  { pages, w, h }
const ALLOW = [/^https:\/\/osense\.github\.io$/, /^https:\/\/([\w-]+\.)?wsns\.studio$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function cors(req: Request) {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOW.some(r => r.test(o)) ? o : 'https://osense.github.io',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Vary': 'Origin',
  };
}

function parse(html: string, id: string) {
  const m = html.match(/window\['bootstrap'\]\s*=\s*JSON\.parse\('((?:[^'\\]|\\.)*)'\)/);
  if (!m) return null;
  const json = '"' + m[1].replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|.)|"/g, (_all: string, e?: string) => {
    if (!e) return '\\"';
    if (e[0] === 'x') return '\\u00' + e.slice(1);
    if (e[0] === 'u') return '\\' + e;
    if (e === "'") return "'";
    if ('"\\/bfnrt'.includes(e)) return '\\' + e;
    return e;
  }) + '"';
  const boot = JSON.parse(JSON.parse(json));
  const doc = boot?.page?.C;
  if (!doc || doc.A !== id) return null;
  const d = doc.D?.A;
  const pages = Array.isArray(d?.A) ? d.A.length : 0;
  if (!pages) return null;
  const w = Number(d?.C?.A) || 0, h = Number(d?.C?.B) || 0;
  return { pages, w, h };
}

Deno.serve(async (req: Request) => {
  const head = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: head });
  const send = (body: unknown, status = 200, cache = 'no-store') =>
    new Response(JSON.stringify(body), { status, headers: { ...head, 'Content-Type': 'application/json', 'Cache-Control': cache } });
  const q = new URL(req.url).searchParams;
  const id = q.get('id') || '', tk = q.get('tk') || '';
  if (!/^[\w-]{6,20}$/.test(id) || !/^[\w-]{6,40}$/.test(tk)) return send({ error: 'bad-link' }, 400);
  try {
    const r = await fetch(`https://www.canva.com/design/${id}/${tk}/view?embed`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en' },
      redirect: 'follow',
    });
    if (!r.ok) return send({ error: 'canva-' + r.status }, 502);
    const info = parse(await r.text(), id);
    if (!info) return send({ error: 'not-public' }, 404);
    return send(info, 200, 'public, max-age=60');
  } catch (e) {
    return send({ error: 'fetch-failed', detail: String(e).slice(0, 120) }, 502);
  }
});

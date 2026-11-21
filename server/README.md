# 서버 함수 (Supabase Edge Functions)

Supabase 프로젝트 **WSNS** (`fsmygjpmriblcbpeqjgq`, 서울)에 올라가 있는 함수의 원본입니다.
주소는 `assets/js/util.js`의 `WSNS_API`에 있습니다.

| 함수 | 하는 일 |
|---|---|
| `canva-pages` | 공개 캔바 보기 링크의 페이지 수와 화면비를 읽어 줍니다. 브라우저는 캔바 페이지를 직접 읽을 수 없어서(CORS) 서버가 대신 읽습니다. `GET ?id=<디자인 ID>&tk=<공유 토큰>` → `{ pages, w, h }` |

다시 올리기: `supabase functions deploy canva-pages --no-verify-jwt --project-ref fsmygjpmriblcbpeqjgq`

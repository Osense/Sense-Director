# 서버 함수 (Supabase Edge Functions)

Supabase 프로젝트 **WSNS** (`fsmygjpmriblcbpeqjgq`, 서울)에 올라가 있는 함수의 원본입니다.
주소는 `assets/js/util.js`의 `WSNS_API`에 있습니다.

| 함수 | 하는 일 |
|---|---|
| `canva-pages` | 공개 캔바 보기 링크의 페이지 수와 화면비를 읽어 줍니다. 브라우저는 캔바 페이지를 직접 읽을 수 없어서(CORS) 서버가 대신 읽습니다. `GET ?id=<디자인 ID>&tk=<공유 토큰>` → `{ pages, w, h }` |

다시 올리기: `supabase functions deploy canva-pages --no-verify-jwt --project-ref fsmygjpmriblcbpeqjgq`

## DB 설계 초안

`schema.sql` — 서버를 붙일 때 쓸 표 설계입니다. 지금 브라우저 목업(`assets/js/store.js`)이 같은 모양으로 저장하므로, 서버를 붙일 때는 `store.js`의 함수만 바꾸면 화면 코드는 그대로 씁니다.

- `folders` — `parent_id`로 하위 폴더(앱에서는 3단계까지). 폴더를 지우면 안의 폴더·프로젝트는 지워지지 않고 한 단계 위로 올라갑니다(트리거).
- `projects.folder_id` — 프로젝트는 폴더 하나에 들어갑니다(없으면 맨 위).
- `requests` / `items` / `replies` — 수정요청, 핀·그림 항목, 댓글
- `deliveries`, `plans`, `uploads` — 최종본 수령 기록, 요금제, 월 업로드 사용량

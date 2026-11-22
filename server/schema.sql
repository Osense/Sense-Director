-- 쎈스 디렉터 서버 DB 설계 초안 (Supabase / PostgreSQL)
-- 지금 앱은 브라우저 localStorage 목업(assets/js/store.js)이고, 같은 모양으로 맞춰 두었다.
-- 서버를 붙일 때는 store.js의 함수만 이 표를 읽고 쓰도록 바꾸면 된다.
-- 여러 앱이 한 Supabase 프로젝트(WSNS)를 같이 쓰므로 쎈스 디렉터 표는 director 스키마에 둔다.

create schema if not exists director;

-- 폴더: 프로젝트를 묶는다. parent_id로 하위 폴더(앱에서는 3단계까지)
create table director.folders (
  id          text primary key,                       -- 앱에서 만든 id (uid)
  owner_id    uuid not null references auth.users(id) on delete cascade,
  parent_id   text references director.folders(id) on delete set null,  -- null = 맨 위
  name        text not null check (char_length(name) between 1 and 60),
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on director.folders (owner_id, parent_id);
-- 폴더를 지우면 안의 것은 한 단계 위로 (앱 Store.deleteFolder와 같은 규칙) — 트리거로 처리
create or replace function director.folder_lift() returns trigger language plpgsql as $$
begin
  update director.folders  set parent_id = old.parent_id where parent_id = old.id;
  update director.projects set folder_id = old.parent_id where folder_id = old.id;
  return old;
end $$;
create trigger folder_lift before delete on director.folders for each row execute function director.folder_lift();

-- 프로젝트
create table director.projects (
  id          text primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  folder_id   text references director.folders(id) on delete set null,
  title       text not null default '',
  notice      text not null default '',
  due         date,
  director    text not null default '',               -- 디렉터 표시 이름(by)
  src         jsonb,                                  -- { k: 'yt'|'vimeo'|'file'|'doc'|'canva', ... }
  ar          integer[] not null default '{16,9}',
  fps         numeric not null default 0,
  pin_salt    text not null,
  pin_hash    text not null,                          -- 핀 번호 자체는 저장하지 않는다
  pinned      boolean not null default false,
  done_at     timestamptz,                            -- 완료 보관함
  delivery    jsonb,                                  -- 최종본 { key, name, size, type, at, exp }
  notes       jsonb not null default '[]',            -- 디렉터 안내 메모
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on director.projects (owner_id, folder_id);
create index on director.projects (owner_id, done_at);

-- 클라이언트가 보낸 수정요청 묶음과 항목
create table director.requests (
  id          text primary key,                       -- rid
  project_id  text not null references director.projects(id) on delete cascade,
  from_name   text not null default '',
  sent_at     timestamptz not null default now()
);
create table director.items (
  id          text primary key,
  request_id  text not null references director.requests(id) on delete cascade,
  project_id  text not null references director.projects(id) on delete cascade,
  t           numeric not null,                       -- 시간(초) 또는 쪽 번호
  kind        text not null,                          -- pin | draw | note ...
  data        jsonb not null,                         -- 좌표·그림 선
  text        text not null default '',
  status      text not null default 'open' check (status in ('open','doing','done','hold')),
  thumb_key   text,                                   -- R2에 둔 장면 사진
  created_at  timestamptz not null default now()
);
create index on director.items (project_id);
create table director.replies (
  id          text primary key,
  item_id     text not null references director.items(id) on delete cascade,
  side        text not null check (side in ('director','client')),
  name        text not null default '',
  body        text not null,
  created_at  timestamptz not null default now()
);

-- 최종본 수령 기록
create table director.deliveries (
  project_id  text primary key references director.projects(id) on delete cascade,
  got_at      timestamptz,
  ok_at       timestamptz,
  by_name     text not null default ''
);

-- 요금제·용량
create table director.plans (
  owner_id    uuid primary key references auth.users(id) on delete cascade,
  plan        text not null default 'free' check (plan in ('free','p1','p2')),
  extra_gb    integer not null default 0,
  renews_at   timestamptz
);
create table director.uploads (                         -- 이번 달 사용량 = 이 표의 합
  id          bigserial primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  project_id  text references director.projects(id) on delete set null,
  key         text not null,                          -- R2 객체 위치
  size        bigint not null,
  purpose     text not null check (purpose in ('video','doc','final')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz                              -- 30일 뒤 자동 삭제
);
create index on director.uploads (owner_id, created_at);

-- 보안 규칙(RLS): 디렉터는 자기 것만. 클라이언트는 링크의 핀 검증을 거치는 Edge Function으로만 접근
alter table director.folders  enable row level security;
alter table director.projects enable row level security;
create policy own_folders  on director.folders  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_projects on director.projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

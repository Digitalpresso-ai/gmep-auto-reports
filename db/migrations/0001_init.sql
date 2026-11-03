-- 브라우저는 DB에 직접 접근하지 않는다. 서버만 서비스 키로 접속하므로
-- 모든 테이블에 RLS를 켜고 정책을 두지 않아 anon/authenticated 접근을 막는다.

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- null이면 아직 초기 비밀번호를 발급하지 않아 로그인할 수 없다
  password_hash text,
  must_change_password boolean not null default true,
  traveler text not null default '',
  business_intro text not null default '',
  proposal_text text not null default '',
  proposal_filename text,
  daily_generate_limit integer not null default 5 check (daily_generate_limit >= 0),
  daily_revise_limit integer not null default 15 check (daily_revise_limit >= 0),
  monthly_token_limit bigint check (monthly_token_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  -- 쿠키의 원문 토큰이 아니라 SHA-256 해시를 저장한다
  token_hash text primary key,
  company_id uuid not null references companies(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_company_id_idx on sessions(company_id);

create table login_attempts (
  company_id uuid primary key references companies(id) on delete cascade,
  failed_count integer not null default 0,
  locked_until timestamptz
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  report_date date not null,
  title text not null default '',
  body_html text not null default '',
  schedule_text text not null default '',
  notes text not null default '',
  updated_at timestamptz not null default now(),
  unique (company_id, report_date)
);

create table report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  position integer not null check (position >= 0),
  storage_path text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  unique (report_id, position)
);

create table ai_usage (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('generate', 'revise')),
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  success boolean not null
);
create index ai_usage_company_created_idx on ai_usage(company_id, created_at);

create table app_settings (
  key text primary key,
  value jsonb not null
);

alter table companies enable row level security;
alter table sessions enable row level security;
alter table login_attempts enable row level security;
alter table reports enable row level security;
alter table report_photos enable row level security;
alter table ai_usage enable row level security;
alter table app_settings enable row level security;

-- 사진·일정·교육자료는 관리자가 날짜별로 한 번 등록하고 모든 회사가 같이 쓴다(SHARED-1~3).
-- 회사는 그 위에 일정 복사본·사진 선택·추가 사진·특이사항만 초안으로 둔다(FUNC-17).

alter table companies add constraint companies_business_intro_length check (char_length(business_intro) <= 5000);

create table shared_days (
  report_date date primary key,
  schedule_text text not null default '',
  updated_at timestamptz not null default now()
);

-- 일정 이미지는 AI에 이미지 블록으로 보내고, 사진은 회사가 골라 보고서에 넣는다
create table shared_files (
  id uuid primary key default gen_random_uuid(),
  report_date date not null references shared_days(report_date) on delete cascade,
  kind text not null check (kind in ('schedule_image', 'photo')),
  storage_path text not null,
  filename text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  created_at timestamptz not null default now()
);
create index shared_files_date_idx on shared_files(report_date, kind, created_at);

-- 원본 파일은 저장하지 않고 브라우저에서 추출한 텍스트만 둔다(FUNC-5)
create table shared_materials (
  id uuid primary key default gen_random_uuid(),
  report_date date not null references shared_days(report_date) on delete cascade,
  kind text not null check (kind in ('schedule', 'education')),
  filename text not null,
  text_content text not null,
  created_at timestamptz not null default now()
);
create index shared_materials_date_idx on shared_materials(report_date, kind, created_at);

create table company_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  report_date date not null,
  storage_path text not null,
  filename text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  created_at timestamptz not null default now()
);
create index company_photos_company_date_idx on company_photos(company_id, report_date, created_at);

-- schedule_text가 null이면 아직 손대지 않은 것이라 그날 공통 일정을 그대로 보여 준다.
-- 회사가 한 번 고치면 값이 생기고 이후 공통 일정이 바뀌어도 유지한다(SHARED-2).
-- selected_photos는 [{"source":"shared"|"company","id":uuid}] 선택 순서 배열이다.
create table drafts (
  company_id uuid not null references companies(id) on delete cascade,
  report_date date not null,
  schedule_text text,
  selected_photos jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_photos) = 'array'),
  notes text not null default '',
  updated_at timestamptz not null default now(),
  primary key (company_id, report_date)
);

-- 보고서 사진은 초안의 선택을 그대로 쓴다. 선택을 두 곳에 두지 않으려고 비어 있는 이 표를 지운다.
drop table report_photos;

-- 관리자는 회사 계정과 분리된 단일 계정이다(AUTH-12)
create table admins (
  id integer primary key check (id = 1),
  password_hash text not null,
  failed_count integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table admin_sessions (
  token_hash text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- 같은 회사가 동시에 두 번 생성해 하루 한도를 넘지 않도록 진행 중인 생성을 하나만 둔다(AI-9)
create table ai_inflight (
  company_id uuid primary key references companies(id) on delete cascade,
  started_at timestamptz not null default now()
);

alter table shared_days enable row level security;
alter table shared_files enable row level security;
alter table shared_materials enable row level security;
alter table company_photos enable row level security;
alter table drafts enable row level security;
alter table admins enable row level security;
alter table admin_sessions enable row level security;
alter table ai_inflight enable row level security;

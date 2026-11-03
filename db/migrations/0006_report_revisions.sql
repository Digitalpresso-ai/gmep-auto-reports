-- 회사가 보고서에 낸 AI 수정 요청을 순서대로 둔다(FUNC-10). 다음 수정 때 지난 요청 전체를 현재 보고서와 함께 AI에 보내
-- "아까 바꾼 부분" 같은 요청을 이어서 처리한다. 성공한 수정만 기록하고, 보고서를 다시 만들면 지운다.
create table report_revisions (
  id bigint generated always as identity primary key,
  report_id uuid not null references reports(id) on delete cascade,
  request text not null check (char_length(request) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index report_revisions_report_idx on report_revisions(report_id, id);

alter table report_revisions enable row level security;

-- 기안문·교육자료 원본도 보관해 다시 내려받게 한다(2026-11-03 사용자 결정, FUNC-1·FUNC-5).
-- AI에는 지금처럼 추출 텍스트만 보낸다. 원본은 Storage에 두고 경로만 저장한다.
-- 경로 검사를 DB에도 두어, 다른 회사·다른 날짜 폴더를 가리키는 값이 저장되지 않게 한다(AUTH-8).

alter table companies add column proposal_storage_path text;
alter table companies add constraint companies_proposal_storage_path_check
  check (proposal_storage_path is null or proposal_storage_path like 'companies/' || id::text || '/proposal/%');

alter table shared_materials add column storage_path text;
alter table shared_materials add constraint shared_materials_storage_path_check
  check (storage_path is null or storage_path like 'shared/' || to_char(report_date, 'YYYY-MM-DD') || '/materials/%');

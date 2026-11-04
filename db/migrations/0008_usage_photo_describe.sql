-- 관리자가 올린 공통 사진의 설명 호출(PHOTO-1)도 토큰을 쓰므로 기록한다(AI-12). 공통 사진은 어느 회사의 것도 아니라
-- 회사 없이 기록하고, 회사별 하루 횟수·월 토큰 한도(AI-9·AI-10)에는 넣지 않는다. 생성·수정은 계속 회사가 있어야 한다.
alter table ai_usage alter column company_id drop not null;
alter table ai_usage drop constraint ai_usage_kind_check;
alter table ai_usage add constraint ai_usage_kind_check check (kind in ('generate', 'revise', 'photo_describe'));
alter table ai_usage add constraint ai_usage_company_check check ((kind = 'photo_describe') = (company_id is null));

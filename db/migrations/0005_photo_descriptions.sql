-- 공통 사진마다 관리자 업로드 때 AI로 한 번 만든 설명을 둔다(PHOTO-1). 19개사가 같은 사진을 쓰므로 회사별 생성마다 사진을 AI에 보내지 않고
-- 이 설명만 보내 보고서 어느 섹션 옆에 둘지 고르게 한다(PHOTO-2, AI-6). null은 아직 설명을 만들지 않은 사진이다.
alter table shared_files add column description text check (description is null or char_length(description) <= 2000);

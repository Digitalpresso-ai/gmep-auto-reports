-- input_tokens는 캐시에서 읽은·캐시에 쓴 입력까지 합친 값이다(AI-12). 캐시 읽기는 기본 입력 단가의 0.1배, 1시간 캐시 쓰기는 2배라
-- 실제 비용을 계산하고 캐시가 맞는지 확인하려면 두 값을 따로 둔다(AI-13).
alter table ai_usage
  add column cache_read_tokens integer not null default 0,
  add column cache_write_tokens integer not null default 0;

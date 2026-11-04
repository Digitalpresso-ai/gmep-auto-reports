// 서비스의 날짜·시각 기준 시간대. 보고 일자 기본값, 하루 사용 횟수·월 토큰을 다시 세는 시점, 화면의 시각 표시가 모두 이 값을 따른다.
// 행사 장소가 바뀌면 이 값(IANA 시간대 이름)만 바꾼다. 서머타임은 Intl이 계산한다.
export const TIME_ZONE = "Europe/Berlin";

const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** 현지 날짜(YYYY-MM-DD) */
export function zonedToday(now = new Date()): string {
  return dateFormat.format(now);
}

/** 현지 시각(HH:MM) */
export function formatTime(at: Date | string): string {
  const p = Object.fromEntries(timeFormat.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute}`;
}

function zonedFields(at: Date) {
  const p = Object.fromEntries(partsFormat.formatToParts(at).map((x) => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day, offsetMs: Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000 };
}

// 현지 달력의 y-m-d 0시를 UTC 시각으로 바꾼다. 0시의 시차는 지금 시차와 다를 수 있어(서머타임 바뀌는 날) 한 번 더 구한다.
function zonedMidnight(y: number, m: number, d: number): Date {
  const wall = Date.UTC(y, m - 1, d);
  const guess = wall - zonedFields(new Date(wall)).offsetMs;
  return new Date(wall - zonedFields(new Date(guess)).offsetMs);
}

/** 오늘 현지 0시 */
export function zonedDayStart(now = new Date()): Date {
  const { y, m, d } = zonedFields(now);
  return zonedMidnight(y, m, d);
}

/** 이번 달 현지 1일 0시 */
export function zonedMonthStart(now = new Date()): Date {
  const { y, m } = zonedFields(now);
  return zonedMidnight(y, m, 1);
}

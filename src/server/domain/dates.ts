// 독일 시간 기준 시각 계산. 행사가 독일에서 열려 하루 사용 횟수와 월 토큰 합계는 독일 자정에 다시 센다(AI-9, AI-10).
// 서머타임(3월·10월 마지막 일요일)이 있어 고정 시차를 쓰지 않고 Intl로 그 시각의 시차를 구한다.
const BERLIN = "Europe/Berlin";
const berlinParts = new Intl.DateTimeFormat("en-US", {
  timeZone: BERLIN,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

function berlinFields(at: Date) {
  const p = Object.fromEntries(berlinParts.formatToParts(at).map((x) => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day, offsetMs: Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000 };
}

// 독일 달력의 y-m-d 0시를 UTC 시각으로 바꾼다. 0시의 시차는 지금 시차와 다를 수 있어 한 번 더 구한다.
function berlinMidnight(y: number, m: number, d: number): Date {
  const wall = Date.UTC(y, m - 1, d);
  const guess = wall - berlinFields(new Date(wall)).offsetMs;
  return new Date(wall - berlinFields(new Date(guess)).offsetMs);
}

export function berlinDayStart(now = new Date()): Date {
  const { y, m, d } = berlinFields(now);
  return berlinMidnight(y, m, d);
}

export function berlinMonthStart(now = new Date()): Date {
  const { y, m } = berlinFields(now);
  return berlinMidnight(y, m, 1);
}

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// 다음 달에 같은 날이 없으면(1/31 → 2/31) 그 달 마지막 날로 맞춘다
export function retentionUntil(programEndDate: string): string {
  const [y, m, d] = programEndDate.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

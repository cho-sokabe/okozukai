// 日付の計算。日付は時刻なしの "YYYY-MM-DD" の文字で持つ（設計書 A-02）。
// 計算は UTC の Date で行い、時差による1日ずれを起こさない。

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDate(s) {
  if (typeof s !== "string") return false;
  const m = RE.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function parse(s) {
  const m = RE.exec(s);
  if (!m) throw new TypeError(`日付の形が違います: ${s}`);
  return { y: +m[1], m: +m[2], d: +m[3] };
}

export function fmt(y, m, d) {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const toUtc = s => { const { y, m, d } = parse(s); return Date.UTC(y, m - 1, d); };
const fromUtc = t => { const x = new Date(t); return fmt(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()); };

export function addDays(s, n) {
  return fromUtc(toUtc(s) + n * 86400000);
}

/** b − a の日数 */
export function diffDays(a, b) {
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

/** 0=日曜 … 6=土曜 */
export function weekday(s) {
  return new Date(toUtc(s)).getUTCDay();
}

/** 月を n か月ずらした年・月 */
export function addMonths(y, m, n) {
  const i = y * 12 + (m - 1) + n;
  return { y: Math.floor(i / 12), m: (i % 12) + 1 };
}

/** その月の「day 日」。その月にない日（29〜31日）は末日にする（D-012） */
export function clampedDay(y, m, day) {
  return fmt(y, m, Math.min(day, daysInMonth(y, m)));
}

export function min(a, b) { return a <= b ? a : b; }
export function max(a, b) { return a >= b ? a : b; }

/** 端末の今日（ローカル時刻）を "YYYY-MM-DD" で */
export function today(now = new Date()) {
  return fmt(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

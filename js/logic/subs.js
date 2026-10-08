// サブスクの予定日と自動記録（設計書 L-11・P-02）
import { parse, addMonths, clampedDay, max, addDays } from "./date.js";

/** from〜to（両端を含む）にあるサブスクの予定日。開始日より前・止めた日より後は出さない */
export function dueDates(sub, from, to) {
  if (from > to) return [];
  const out = [];
  let { y, m } = parse(from);
  const last = parse(to);
  while (y < last.y || (y === last.y && m <= last.m)) {
    const d = clampedDay(y, m, sub.day);
    if (d >= from && d <= to && d >= sub.startDate && (!sub.stopDate || d <= sub.stopDate)) out.push(d);
    ({ y, m } = addMonths(y, m, 1));
  }
  return out;
}

/** 今日より後（today を含まない）〜to のサブスクの予定 [{date, sub}] */
export function upcoming(subs, today, to) {
  const out = [];
  for (const s of subs) for (const d of dueDates(s, addDays(today, 1), to)) out.push({ date: d, sub: s });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const runKey = (subId, date) => `${subId}|${date}`;

/**
 * 今日までの予定日のうち、まだ自動記録していない分を出金として作る（P-02）。
 * 記録する範囲は「サブスクを登録した日と開始日の遅い方」から今日まで（A-18）。
 * subRuns に記録済みの日は、記録を消していても作らない（A-11）。
 * 返す { records, runs } は、呼んだ側が1回の保存でまとめて書く（P-03）。
 */
export function autoRecord(subs, subRuns, today, { newId, now }) {
  const done = new Set(subRuns.map(r => runKey(r.subId, r.dueDate)));
  const records = [], runs = [];
  for (const s of subs) {
    const from = max(s.startDate, s.createdOn || s.startDate);
    for (const d of dueDates(s, from, today)) {
      if (done.has(runKey(s.id, d))) continue;
      records.push({ id: newId(), kind: "out", date: d, amount: s.amount, name: s.name, icon: s.icon, subId: s.id, memo: "", createdAt: now, updatedAt: now });
      runs.push({ subId: s.id, dueDate: d });
    }
  }
  return { records, runs };
}

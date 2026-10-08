// カレンダーの日の金額と色（設計書 L-09・A-08）
import { addDays, weekday } from "./date.js";
import { dueDates } from "./subs.js";

/**
 * その日に出す金額と色。出さない日は null。
 * color: "red" 超過 / "gray" 目安以内 / "blue" サブスク / "plan" 使用予定
 * dayBudget はその日を含む期間の1日の目安（切り捨て前の値。A-14）
 */
export function dayMark(date, records, subs, dayBudget, today) {
  const outs = records.filter(r => r.date === date && r.kind === "out");
  if (outs.length) {
    const amount = outs.reduce((a, r) => a + r.amount, 0);
    if (outs.every(r => r.subId)) return { amount, color: "blue" };
    return { amount, color: amount > dayBudget ? "red" : "gray" };
  }
  const plans = records.filter(r => r.date === date && r.kind === "plan");
  if (plans.length) return { amount: plans.reduce((a, r) => a + r.amount, 0), color: "plan" };
  if (date > today) {
    const due = subs.filter(s => dueDates(s, date, date).length);
    if (due.length) return { amount: due.reduce((a, s) => a + s.amount, 0), color: "blue" };
  }
  return null;
}

/** 期間の始まりの週（日曜）から終わりの週（土曜）までの日付。期間の外の日は inPeriod=false */
export function gridDays(period) {
  const first = addDays(period.start, -weekday(period.start));
  const last = addDays(period.end, 6 - weekday(period.end));
  const out = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push({ date: d, inPeriod: d >= period.start && d <= period.end });
  return out;
}

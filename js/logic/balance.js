// 残高・使用額・1日あたりの額など（設計書 L-04〜L-08）
import { diffDays } from "./date.js";
import { upcoming } from "./subs.js";

const inRange = (r, p) => r.date >= p.start && r.date <= p.end;
const sum = list => list.reduce((a, r) => a + r.amount, 0);

/**
 * 期間 period の集計。today はその期間の中の日。
 * records: T-01、subs: T-03
 */
export function summarize(period, records, subs, today) {
  const rs = records.filter(r => inRange(r, period));
  const spent = sum(rs.filter(r => r.kind === "out"));            // 実際の支払額
  const income = sum(rs.filter(r => r.kind === "in"));
  const planRecords = sum(rs.filter(r => r.kind === "plan"));      // 日付が過ぎていても、使っていない予定は入れる
  const subsAhead = upcoming(subs, today, period.end).reduce((a, x) => a + x.sub.amount, 0);
  const planTotal = planRecords + subsAhead;
  const used = spent + planTotal;                                  // 使用額
  const base = period.fixedAmount + income;
  const balance = base - used;                                     // 予定を引いた残高（nokori）
  const ratio = base > 0 ? Math.min(1, Math.max(0, balance / base)) : 0;
  const daysLeft = diffDays(today, period.end) + 1;
  const overspent = balance < 0;
  const perDay = overspent ? 0 : Math.floor(balance / daysLeft);
  const dayBudget = period.fixedAmount / period.days;
  return {
    spent, income, planRecords, subsAhead, planTotal, used, balance,
    ratio, percent: Math.round(ratio * 1000) / 10,
    daysLeft, daysRatio: daysLeft / period.days,
    perDay, overspent,
    dayBudget, dayBudgetShown: Math.floor(dayBudget),
  };
}

/** カテゴリ（名前）ごとの出金を多い順に。top を超えた分は「ほか」にまとめる（A-09） */
export function byName(period, records, top = 5) {
  const m = new Map();
  for (const r of records) if (r.kind === "out" && inRange(r, period)) m.set(r.name, (m.get(r.name) || 0) + r.amount);
  const list = [...m].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  if (list.length <= top) return list;
  const rest = list.slice(top).reduce((a, x) => a + x.amount, 0);
  return [...list.slice(0, top), { name: "ほか", amount: rest }];
}

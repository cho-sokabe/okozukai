// 余り貯金（設計書 L-10・L-12）
import { listPeriods, periodAny, neighborPeriod } from "./period.js";
import { addDays } from "./date.js";

/**
 * 数え始めの期間の始まりの日。指定がなければ、はじめての設定をした期間（D-068）。
 * 指定の日を含む期間の始まりにそろえる。
 */
export function savingsFrom(history, from) {
  if (!history || !history.length) return null;
  if (from) return periodAny(history, from).start;
  const first = history.reduce((a, h) => (h.changedOn < a.changedOn ? h : a));
  return periodAny(history, first.changedOn).start;
}

/**
 * 数え始め（from）から、終わった期間（終わりの日が今日より前）ごとの余りと、その合計。
 * 余り = 固定額 + 入金 − 実際の支払額。マイナスの期間はそのまま引く（D-013・D-043）。
 * 使っていない使用予定は入れない（A-15）。
 * はじめての設定より前の期間は、数え始めにそこを選んだときだけ入れる（D-066・D-068）。その期間の固定額は、はじめての設定の固定額。
 */
export function savings(history, records, today, from = null) {
  const start = savingsFrom(history, from);
  const periods = [];
  if (start) {
    // はじめての設定より前の期間（数え始めにそこが選ばれているとき）
    for (let p = periodAny(history, start); p && p.beforeSetup && p.end < today; p = neighborPeriod(history, p, 1)) periods.push(p);
    for (const p of listPeriods(history, addDays(today, -1))) if (p.start >= start && p.end < today) periods.push(p);
  }
  const rows = periods.map(p => {
    let income = 0, spent = 0;
    for (const r of records) {
      if (r.date < p.start || r.date > p.end) continue;
      if (r.kind === "in") income += r.amount;
      else if (r.kind === "out") spent += r.amount;
    }
    return { start: p.start, end: p.end, fixedAmount: p.fixedAmount, income, spent, remain: p.fixedAmount + income - spent, beforeSetup: !!p.beforeSetup };
  });
  return { from: start, rows, total: rows.reduce((a, r) => a + r.remain, 0) };
}

// 余り貯金（設計書 L-10）
import { listPeriods } from "./period.js";
import { addDays } from "./date.js";

/**
 * 終わった期間（終わりの日が今日より前）ごとの余りと、その合計。
 * 余り = 固定額 + 入金 − 実際の支払額。マイナスの期間はそのまま引く（D-013・D-043）。
 * 使っていない使用予定は入れない（A-15）。
 */
export function savings(history, records, today) {
  const periods = listPeriods(history, addDays(today, -1)).filter(p => p.end < today);
  const rows = periods.map(p => {
    let income = 0, spent = 0;
    for (const r of records) {
      if (r.date < p.start || r.date > p.end) continue;
      if (r.kind === "in") income += r.amount;
      else if (r.kind === "out") spent += r.amount;
    }
    return { start: p.start, end: p.end, fixedAmount: p.fixedAmount, income, spent, remain: p.fixedAmount + income - spent };
  });
  return { rows, total: rows.reduce((a, r) => a + r.remain, 0) };
}

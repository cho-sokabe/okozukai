// 入力の決まり（設計書 A-03・A-05・A-07、D-033）

export const MAX_AMOUNT = 9999999;
export const MAX_MEMO = 40;
export const MAX_CATEGORY_NAME = 10;

/** 数字キーを押したときの金額。7桁を超える入力は受け付けない */
export function pressKey(amount, key) {
  if (key === "back") return Math.floor(amount / 10);
  const next = Number(String(amount) + key);
  if (!Number.isInteger(next) || next > MAX_AMOUNT) return amount;
  return next;
}

export const canSave = amount => Number.isInteger(amount) && amount >= 1 && amount <= MAX_AMOUNT;

/** 文字数の上限で切る（絵文字なども1文字として数える） */
export function cut(text, max) {
  return Array.from(text || "").slice(0, max).join("");
}

/**
 * 保存するときの種類。先の日付（明日以降）の出金は使用予定にする。入金はそのまま。
 * 使用予定は、日付が今日以前に直されても使用予定のまま（「使った」で出金にする。D-009）
 */
export function kindForSave(kind, date, today) {
  if (kind === "out" && date > today) return "plan";
  return kind;
}

/** 使用予定の「使った」。日付が先のままなら今日の日付で出金にする（A-07） */
export function markUsed(plan, today, now) {
  return { ...plan, kind: "out", date: plan.date > today ? today : plan.date, updatedAt: now };
}

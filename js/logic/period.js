// 期間の計算（設計書 L-01〜L-03）。
// 設定の履歴（T-05）は「変えた日・固定額・月の開始日」の写しを、変えるたびに1件足したもの。
// 最初の1件が「はじめての設定」。
import { parse, addDays, diffDays, addMonths, clampedDay } from "./date.js";

/** 開始日 sd のとき、date を含む期間の始まり */
function startContaining(date, sd) {
  const { y, m } = parse(date);
  const here = clampedDay(y, m, sd);
  if (here <= date) return here;
  const p = addMonths(y, m, -1);
  return clampedDay(p.y, p.m, sd);
}

/** 期間の始まり s（開始日 sd）の次の期間の始まり */
function nextStart(s, sd) {
  const { y, m } = parse(s);
  const n = addMonths(y, m, 1);
  return clampedDay(n.y, n.m, sd);
}

/** from 以降で最初に来る「開始日 sd の日」 */
function firstStartOnOrAfter(from, sd) {
  const { y, m } = parse(from);
  const here = clampedDay(y, m, sd);
  if (here >= from) return here;
  const n = addMonths(y, m, 1);
  return clampedDay(n.y, n.m, sd);
}

function sorted(history) {
  return history.map((h, i) => [h, i]).sort((a, b) => (a[0].changedOn < b[0].changedOn ? -1 : a[0].changedOn > b[0].changedOn ? 1 : a[1] - b[1])).map(x => x[0]);
}

/** 固定額（L-02）: 期間の終わりの日以前に変えられた設定のうち、いちばん新しいもの */
function fixedFor(hist, end) {
  let v = null;
  for (const h of hist) if (h.changedOn <= end) v = h.fixedAmount;
  return v;
}

/**
 * はじめての設定の期間から、date を含む期間までを順に返す（L-01）。
 * 返す各期間: { start, end, days, startDay, fixedAmount }
 */
export function listPeriods(history, untilDate) {
  if (!history || !history.length) return [];
  const hist = sorted(history);
  const first = hist[0];
  let sd = first.startDay;
  let s = startContaining(first.changedOn, sd);
  // はじめての設定をした日を含む期間からが対象（その期間の、設定より前の日も含む）
  if (untilDate < s) return [];
  const out = [];
  for (let guard = 0; guard < 2400; guard++) {
    const natural = addDays(nextStart(s, sd), -1);
    // この期間の中で開始日が変えられていたら、終わりをのばす（D-017・D-019）。
    // のびた先でさらに変えられていたら、最後の変更を使う（A-12）。
    let end = natural, newSd = sd;
    for (;;) {
      const inside = hist.filter(h => h !== first && h.changedOn >= s && h.changedOn <= end);
      const last = inside.length ? inside[inside.length - 1].startDay : sd;
      const e2 = last === sd ? natural : addDays(firstStartOnOrAfter(addDays(natural, 1), last), -1);
      if (e2 === end && last === newSd) break;
      end = e2; newSd = last;
    }
    out.push({ start: s, end, days: diffDays(s, end) + 1, startDay: sd, fixedAmount: fixedFor(hist, end) });
    if (end >= untilDate) return out;
    s = addDays(end, 1);
    sd = newSd;
  }
  throw new Error("期間の計算が終わりません");
}

/** date を含む期間（はじめての設定より前なら null） */
export function periodOf(history, date) {
  const list = listPeriods(history, date);
  const p = list[list.length - 1];
  return p && p.start <= date && date <= p.end ? p : null;
}

/**
 * date を含む期間。はじめての設定より前の日なら、はじめての設定の開始日・固定額で区切った期間を返す
 * （カレンダー・集計で過去に戻れるようにするため。I-006）。その期間には beforeSetup: true を付ける。
 */
export function periodAny(history, date) {
  const p = periodOf(history, date);
  if (p) return p;
  const first = sorted(history)[0];
  const s = startContaining(date, first.startDay);
  const end = addDays(nextStart(s, first.startDay), -1);
  return { start: s, end, days: diffDays(s, end) + 1, startDay: first.startDay, fixedAmount: first.fixedAmount, beforeSetup: true };
}

/** date を含む期間の、前（-1）または次（+1）の期間（はじめての設定より前にも戻れる） */
export function neighborPeriod(history, period, dir) {
  if (dir < 0) return periodAny(history, addDays(period.start, -1));
  return periodAny(history, addDays(period.end, 1));
}

/**
 * 月の開始日を今日 newStartDay に変えたら、今の期間と次の期間がどうなるか（S-10 の表示）。
 * 履歴は変えずに、変えたつもりで計算する。
 */
export function previewStartDay(history, today, newStartDay) {
  const cur = periodOf(history, today);
  const latest = sorted(history).at(-1);
  const trial = [...history, { changedOn: today, fixedAmount: latest.fixedAmount, startDay: newStartDay }];
  const now = periodOf(trial, today);
  const next = periodOf(trial, addDays(now.end, 1));
  return { before: cur, current: now, next };
}

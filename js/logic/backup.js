// バックアップの形（設計書 P-04）
import { isDate } from "./date.js";

export const APP = "okodukaityo";
export const SCHEMA_VERSION = 1;
const TABLES = ["records", "categories", "subs", "subRuns", "settings"];

export const fileName = today => `${APP}-${today}.json`;

export function buildBackup(data, now) {
  const out = {};
  for (const t of TABLES) out[t] = data[t] || [];
  // アプリの設定のうち、引き継ぐもの（余り貯金の数え始め。D-068）。前の版のファイルにはないので、なくても読める
  out.meta = (data.meta || []).filter(m => m.key === "savingsFrom");
  return { app: APP, schemaVersion: SCHEMA_VERSION, exportedAt: now, data: out };
}

const isAmount = v => Number.isInteger(v) && v >= 1 && v <= 9999999;
const isText = v => typeof v === "string" && v.length > 0;

/**
 * 読み込むファイルの中身を確かめる。
 * 返り値 { ok: true, backup, counts } または { ok: false, reason }
 */
export function readBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, reason: "ファイルの形が違います（このアプリで書き出したファイルを選んでください）" }; }
  if (!obj || typeof obj !== "object" || obj.app !== APP) return { ok: false, reason: "このアプリで書き出したファイルではありません" };
  if (!Number.isInteger(obj.schemaVersion)) return { ok: false, reason: "ファイルの形が違います（版がありません）" };
  if (obj.schemaVersion > SCHEMA_VERSION) return { ok: false, reason: "新しい版のアプリで書き出したファイルです。アプリを新しくしてから読み込んでください" };
  const d = obj.data;
  if (!d || typeof d !== "object") return { ok: false, reason: "ファイルの形が違います（中身がありません）" };
  for (const t of TABLES) if (!Array.isArray(d[t])) return { ok: false, reason: `ファイルの形が違います（${t} がありません）` };

  const bad = [];
  d.records.forEach((r, i) => {
    const why = [];
    if (!isText(r.id)) why.push("ID");
    if (!["out", "in", "plan"].includes(r.kind)) why.push("種類");
    if (!isDate(r.date)) why.push("日付");
    if (!isAmount(r.amount)) why.push("金額");
    if (!isText(r.name)) why.push("名前");
    if (why.length) bad.push(`記録 ${i + 1} 件目（${why.join("・")}）`);
  });
  d.subs.forEach((s, i) => {
    if (!isText(s.id) || !isText(s.name) || !isAmount(s.amount) || !(s.day >= 1 && s.day <= 31) || !isDate(s.startDate) || (s.stopDate && !isDate(s.stopDate))) bad.push(`サブスク ${i + 1} 件目`);
  });
  d.subRuns.forEach((r, i) => { if (!isText(r.subId) || !isDate(r.dueDate)) bad.push(`サブスクの記録済み ${i + 1} 件目`); });
  d.categories.forEach((c, i) => { if (!isText(c.id) || !isText(c.name)) bad.push(`カテゴリ ${i + 1} 件目`); });
  if (d.meta !== undefined && (!Array.isArray(d.meta) || d.meta.some(m => !m || m.key !== "savingsFrom" || !isDate(m.value)))) bad.push("余り貯金の数え始め");
  if (!d.settings.length) bad.push("設定がありません");
  d.settings.forEach((s, i) => { if (!isDate(s.changedOn) || !isAmount(s.fixedAmount) || !(s.startDay >= 1 && s.startDay <= 31)) bad.push(`設定 ${i + 1} 件目`); });
  if (bad.length) return { ok: false, reason: "中身に正しくない所があります: " + bad.slice(0, 5).join("、") + (bad.length > 5 ? ` ほか ${bad.length - 5} 件` : "") };

  return { ok: true, backup: obj, counts: { records: d.records.length, categories: d.categories.length, subs: d.subs.length } };
}

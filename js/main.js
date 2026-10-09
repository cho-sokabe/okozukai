// 画面と操作（設計書 4章 S-01〜S-13、7章 P-01〜P-05）
import * as db from "./db.js";
import { icon, ICON_CHOICES, DEFAULT_CATEGORIES } from "./icons.js";
import { today as todayOf, addDays, parse, weekday } from "./logic/date.js";
import { periodOf, periodAny, listPeriods, neighborPeriod, previewStartDay } from "./logic/period.js";
import { summarize, byName } from "./logic/balance.js";
import { dayMark, gridDays } from "./logic/calendar.js";
import { autoRecord, upcoming } from "./logic/subs.js";
import { savings, savingsFrom } from "./logic/savings.js";
import { pressKey, canSave, cut, kindForSave, markUsed, MAX_MEMO, MAX_CATEGORY_NAME } from "./logic/entry.js";
import { buildBackup, readBackup, fileName } from "./logic/backup.js";

// ---------- 状態 ----------
const D = { records: [], categories: [], subs: [], subRuns: [], settings: [], meta: {} };
const ui = {
  tab: "home",          // home / calendar / settings
  page: null,           // { name: "summary" | "categories" | "sub" | "savings", ... }
  sheet: null,          // 下から出る画面
  dialog: null,         // 確かめる画面
  cal: { start: null, sel: null },
  sum: { start: null, pick: null },
  catEdit: false,
  catDraft: { name: "", icon: ICON_CHOICES[0] },
  welcome: { amount: 0, startDay: 1 },
  toast: null,
};
let TODAY = todayOf();

const app = document.getElementById("app");
const $ = sel => app.querySelector(sel);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const yen = n => Math.abs(n).toLocaleString("ja-JP");
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const nowIso = () => new Date().toISOString();
const md = d => { const p = parse(d); return `${p.m}/${p.d}`; };
const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const ic = (name, size) => `<i class="c">${icon(name, size)}</i>`;
const cats = () => [...D.categories].sort((a, b) => a.order - b.order);
const hist = () => D.settings;
const latestSetting = () => D.settings[D.settings.length - 1];
const curPeriod = () => periodOf(hist(), TODAY) || periodOf(hist(), D.settings[0].changedOn);
const spentIn = p => D.records.filter(r => r.kind === "out" && r.date >= p.start && r.date <= p.end).reduce((a, r) => a + r.amount, 0);
const span = p => `${md(p.start)} – ${md(p.end)}`;

// ---------- 保存 ----------
async function reload() { Object.assign(D, await db.loadAll()); }
async function commit(ops) {
  try { await db.write(ops); }
  catch (e) { toast("保存できませんでした。もう一度やり直してください。"); await reload(); render(); throw e; }
  await reload();
}
const put = (store, obj) => ({ store, put: obj });
const del = (store, key) => ({ store, del: key });

/** サブスクの自動記録（P-02） */
async function autoRun() {
  if (!D.settings.length) return;
  const { records, runs } = autoRecord(D.subs, D.subRuns, TODAY, { newId: uid, now: nowIso() });
  if (records.length) await commit([...records.map(r => put("records", r)), ...runs.map(r => put("subRuns", r))]);
}

function toast(text) {
  ui.toast = text;
  render();
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { ui.toast = null; render(); }, 2600);
}

// ---------- 部品 ----------
function ringSvg(p, t) {
  const R0 = 130, C = 2 * Math.PI * R0, r2 = R0 - 12, C2 = 2 * Math.PI * r2;
  return `<svg class="ring" viewBox="0 0 272 272" aria-hidden="true">
    <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A7C2DC"/><stop offset="1" stop-color="#B7D7C3"/></linearGradient></defs>
    <circle cx="136" cy="136" r="${R0}" fill="none" stroke="#EEEEEB" stroke-width="3"/>
    ${p > 0 ? `<circle class="ring-money" cx="136" cy="136" r="${R0}" fill="none" stroke="url(#rg)" stroke-width="3" stroke-linecap="round" stroke-dasharray="${C * p} ${C}" transform="rotate(-90 136 136)"/>` : ""}
    <circle class="ring-days" cx="136" cy="136" r="${r2}" fill="none" stroke="#D3D2CD" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="${C2 * t} ${C2}" transform="rotate(-90 136 136)"/>
  </svg>`;
}

export function appIcon(size) {
  const C = 2 * Math.PI * 34, C2 = 2 * Math.PI * 25;
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true" style="border-radius:22%">
    <defs><linearGradient id="ai" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FBDD9"/><stop offset="1" stop-color="#AFD3BC"/></linearGradient></defs>
    <rect width="100" height="100" fill="#FAFAF8"/>
    <circle cx="50" cy="50" r="34" fill="none" stroke="#ECEBE7" stroke-width="7"/>
    <circle cx="50" cy="50" r="34" fill="none" stroke="url(#ai)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C * .7} ${C}" transform="rotate(-90 50 50)"/>
    <circle cx="50" cy="50" r="25" fill="none" stroke="#CFCEC9" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${C2 * .78} ${C2}" transform="rotate(-90 50 50)"/>
  </svg>`;
}

function row(r) {
  const cls = r.kind === "in" ? "in" : r.kind === "plan" ? "plan" : "";
  const tag = r.subId ? '<span class="tag sub">サブスク</span>' : r.kind === "plan" ? '<span class="tag plan">使用予定</span>' : r.kind === "in" ? '<span class="tag in">入金</span>' : "";
  return `<button class="r" data-a="open" data-id="${esc(r.id)}">${ic(r.icon, 15)}<span class="nm">${esc(r.name)}${tag}${r.memo ? `<span class="memo">${esc(r.memo)}</span>` : ""}</span><span class="am ${cls}">${r.kind === "in" ? "+" : ""}${yen(r.amount)}<span class="yen">円</span></span></button>`;
}

const keypad = () => `<div class="keys">${["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0"].map(k => `<button data-a="key" data-k="${k}">${k}</button>`).join("")}<button data-a="key" data-k="back" aria-label="1文字消す">${icon("delete", 22)}</button></div>`;

function dock(fab) {
  const t = [["home", "残高", "wallet"], ["calendar", "カレンダー", "calendar-days"], ["settings", "設定", "settings"]];
  return `<nav class="dock"><div class="tabs">${t.map(([k, n, i]) => `<button data-a="tab" data-t="${k}" class="${ui.tab === k && !ui.page ? "on" : ""}">${icon(i, 20)}${n}</button>`).join("")}</div>${fab ? `<button class="fab" data-a="new" aria-label="記録する">${icon("plus", 26)}</button>` : ""}</nav>`;
}

function iconPicker(selected) {
  const pages = [];
  for (let i = 0; i < ICON_CHOICES.length; i += 12) pages.push(ICON_CHOICES.slice(i, i + 12));
  return `<div class="icons"><div class="pages" data-dots="icondots">${pages.map(pg => `<div class="g">${pg.map(n => `<button class="${n === selected ? "on" : ""}" data-a="pickicon" data-icon="${n}" aria-label="${n}">${icon(n, 19)}</button>`).join("")}</div>`).join("")}</div><div class="dots" id="icondots">${pages.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div></div>`;
}

function barChart(data, { ref = null, w = 300, h = 120, negRed = false, pick = null, pickKey = "" } = {}) {
  if (!data.length) return `<p class="empty">まだありません</p>`;
  const max = Math.max(1, ...data.map(d => Math.abs(d.v)), ref || 0);
  const hasNeg = data.some(d => d.v < 0);
  const base = hasNeg ? h * .72 : h;
  const scale = (base - 14) / max;
  const bw = 10, gap = (w - 20) / Math.max(data.length, 1);
  let g = `<line x1="0" x2="${w}" y1="${base}" y2="${base}" stroke="#ECEBE8" stroke-width="1"/>`;
  if (ref) g += `<line x1="0" x2="${w}" y1="${base - ref * scale}" y2="${base - ref * scale}" stroke="#C4C3BF" stroke-width="1" stroke-dasharray="3 3"/><text x="${w}" y="${base - ref * scale - 4}" text-anchor="end">固定額 ${yen(ref)}</text>`;
  data.forEach((d, i) => {
    const x = 14 + i * gap + gap / 2 - bw / 2, hh = Math.max(Math.abs(d.v) * scale, d.v ? 1 : 0), r = Math.min(4, hh);
    const y = d.v >= 0 ? base - hh : base;
    const col = negRed && d.v < 0 ? "#D65A4C" : "#86A8C8";
    const path = d.v >= 0
      ? `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z`
      : `M${x},${base} V${y + hh - r} Q${x},${y + hh} ${x + r},${y + hh} H${x + bw - r} Q${x + bw},${y + hh} ${x + bw},${y + hh - r} V${base} Z`;
    g += `<path d="${path}" fill="${col}" ${d.part ? 'fill-opacity=".45"' : ""}/>`;
    g += `<rect class="hit" x="${x - gap / 2 + bw / 2}" y="0" width="${gap}" height="${h}" data-a="pickbar" data-key="${pickKey}" data-i="${i}"><title>${esc(d.k)} ${d.v < 0 ? "−" : ""}${yen(d.v)}円</title></rect>`;
    g += `<text x="${x + bw / 2}" y="${h + 14}" text-anchor="middle">${esc(d.k)}</text>`;
    const show = pick === null ? i === data.length - 1 : pick === i;
    if (show) g += `<text class="val" x="${x + bw / 2}" y="${d.v >= 0 ? y - 5 : y + hh + 12}" text-anchor="middle">${d.v < 0 ? "−" : ""}${yen(d.v)}</text>`;
  });
  return `<svg viewBox="0 -6 ${w} ${h + 22}" role="img" aria-label="棒グラフ">${g}</svg>`;
}

// ---------- 画面 ----------
function welcomeView() {
  const w = ui.welcome;
  return `<div class="screen">
    <div class="welcome"><div class="logo">${appIcon(76)}</div><div class="name">OKOZUKAI</div><div class="q">1か月に使えるお小遣い</div>
      <div class="amt num" id="amt">${w.amount.toLocaleString("ja-JP")}<span class="yen">円</span></div></div>
    <div class="fieldrow"><button class="r" data-a="welcomeday">月の開始日<span class="v">毎月${w.startDay}日</span><span class="chev">${icon("chevron-right", 18)}</span></button></div>
    ${keypad()}
    <button class="save" data-a="start" id="savebtn" ${canSave(w.amount) ? "" : "disabled"}>はじめる</button>
  </div>`;
}

function homeView() {
  const per = curPeriod();
  const s = summarize(per, D.records, D.subs, TODAY);
  const sv = savings(hist(), D.records, TODAY, D.meta.savingsFrom).total;
  const list = cats();
  const pages = [];
  for (let i = 0; i < list.length; i += 8) pages.push(list.slice(i, i + 8));
  const todays = D.records.filter(r => r.date === TODAY).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const p = parse(TODAY);
  return `<div class="screen" data-key="home">
    <div class="top"><span class="spaced">${p.y} / ${String(p.m).padStart(2, "0")} / ${String(p.d).padStart(2, "0")}</span><small>${span(per)}</small></div>
    <div class="ringwrap">${ringSvg(s.ratio, s.daysRatio)}
      <div class="ringin">
        <div class="cap">nokori</div>
        <div class="big num ${s.balance < 0 ? "minus" : ""}" id="nokori">${s.balance < 0 ? "−" : ""}${yen(s.balance)}<span class="yen">円</span></div>
        <div class="pct num">${s.percent.toFixed(1)}%</div>
        <div class="perday ${s.overspent ? "over" : ""}" id="perday">${s.overspent ? "使いすぎ" : `1日 ${yen(s.perDay)}円`}</div>
        <hr>
        <div class="mini"><span><i class="c">${icon("wallet", 13)}</i><span class="num" id="used">${yen(s.used)}</span><small>円</small></span><i class="sep"></i><span><i class="c">${icon("calendar", 13)}</i><span class="num" id="daysleft">${s.daysLeft}</span><small>days</small></span></div>
      </div>
    </div>
    <div class="pair">
      <div><span>実際の支払額</span><b class="num" id="spent">${yen(s.spent)}<span class="yen">円</span></b></div>
      <button data-a="page" data-p="savings"><span>余り貯金 ›</span><b class="num ${sv < 0 ? "minus" : ""}" id="savings">${sv < 0 ? "−" : ""}${yen(sv)}<span class="yen">円</span></b></button>
    </div>
    ${list.length ? `<div class="quick" data-dots="qdots">${pages.map(pg => `<div class="pg">${pg.map(c => `<button class="q" data-a="quick" data-id="${esc(c.id)}">${ic(c.icon, 19)}<span>${esc(c.name)}</span></button>`).join("")}</div>`).join("")}</div>
    <div class="dots" id="qdots">${pages.length > 1 ? pages.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("") : ""}</div>` : `<p class="empty">カテゴリがありません。設定の「カテゴリ」から追加できます。</p>`}
    <div class="label">今日</div>
    <div class="rows" id="todaylist">${todays.length ? todays.map(row).join("") : `<p class="empty">まだ記録はありません</p>`}</div>
  </div>${dock(true)}`;
}

function calendarView() {
  const per = periodAny(hist(), ui.cal.start || TODAY);
  const sel = ui.cal.sel || TODAY;
  const budgets = new Map();
  const budgetOf = date => {
    const p = periodAny(hist(), date);
    if (!budgets.has(p.start)) budgets.set(p.start, p.fixedAmount / p.days);
    return budgets.get(p.start);
  };
  const cells = gridDays(per).map(({ date, inPeriod }) => {
    const b = budgetOf(date);
    const m = b === null ? null : dayMark(date, D.records, D.subs, b, TODAY);
    const cls = [inPeriod ? "" : "other", date === TODAY ? "today" : "", date === sel ? "sel" : ""].join(" ");
    return `<button class="d ${cls}" data-a="day" data-d="${date}"><span class="n">${parse(date).d}</span>${m ? `<span class="a ${m.color}">${yen(m.amount)}</span>` : ""}</button>`;
  }).join("");
  const recs = D.records.filter(r => r.date === sel).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const subsAhead = sel > TODAY ? upcoming(D.subs, addDays(sel, -1), sel) : [];
  const total = recs.filter(r => r.kind !== "in").reduce((a, r) => a + r.amount, 0) + subsAhead.reduce((a, x) => a + x.sub.amount, 0);
  const sp = parse(sel), pp = parse(per.start);
  const prev = neighborPeriod(hist(), per, -1);
  return `<div class="screen" data-key="calendar">
    <div class="top"><span class="spaced">CALENDAR</span><button class="chipbtn" data-a="page" data-p="summary">${icon("chart-column", 15)}集計</button></div>
    <div class="mnav"><div class="m"><button data-a="calnav" data-dir="-1" ${prev ? "" : "disabled"} aria-label="前の期間">${icon("chevron-left", 20)}</button><b>${pp.y} / ${String(pp.m).padStart(2, "0")}</b><button data-a="calnav" data-dir="1" aria-label="次の期間">${icon("chevron-right", 20)}</button></div><div class="t num" id="caltotal">${yen(spentIn(per))}<span class="yen">円</span></div></div>
    <div class="cal"><div class="wk">${"SMTWTFS".split("").map(w => `<div>${w}</div>`).join("")}</div><div class="grid">${cells}</div></div>
    <div class="legend"><span style="color:var(--red)">超過</span><span style="color:var(--blue)">サブスク</span><span style="color:var(--plan)">使用予定</span><em id="daybudget">1日の目安 ${yen(Math.floor(per.fixedAmount / per.days))}円</em></div>
    <div class="dayhead"><span class="spaced">${String(sp.m).padStart(2, "0")} / ${String(sp.d).padStart(2, "0")} ${WD[weekday(sel)]}</span><b class="num">${yen(total)}<span class="yen">円</span></b></div>
    <div class="rows" id="daylist">${recs.map(row).join("")}${subsAhead.map(x => `<div class="r">${ic(x.sub.icon, 15)}<span class="nm">${esc(x.sub.name)}<span class="tag sub">サブスク</span><span class="memo">引き落とし予定</span></span><span class="am">${yen(x.sub.amount)}<span class="yen">円</span></span></div>`).join("")}${!recs.length && !subsAhead.length ? `<p class="empty">この日の記録はありません</p>` : ""}</div>
  </div>${dock(true)}`;
}

function summaryPage() {
  const per = periodAny(hist(), ui.sum.start || TODAY);
  const rs = D.records.filter(r => r.date >= per.start && r.date <= per.end);
  const income = rs.filter(r => r.kind === "in").reduce((a, r) => a + r.amount, 0);
  const plans = rs.filter(r => r.kind === "plan").reduce((a, r) => a + r.amount, 0) + upcoming(D.subs, TODAY >= per.start ? TODAY : addDays(per.start, -1), per.end).reduce((a, x) => a + x.sub.amount, 0);
  const all = listPeriods(hist(), per.end).slice(-6);
  const bars = all.map(p => ({ k: `${parse(p.start).m}月`, v: spentIn(p), part: p.start <= TODAY && TODAY <= p.end }));
  const cat = byName(per, D.records);
  const mx = Math.max(1, ...cat.map(c => c.amount));
  const pp = parse(per.start);
  const prev = neighborPeriod(hist(), per, -1);
  return `<div class="screen" data-key="summary">
    <div class="navbar"><button class="circ" data-a="back" aria-label="戻る">${icon("chevron-left", 20)}</button><div class="ttl">集計</div><div class="ghost"></div></div>
    <div class="mnav"><div class="m"><button data-a="sumnav" data-dir="-1" ${prev ? "" : "disabled"} aria-label="前の期間">${icon("chevron-left", 20)}</button><b>${pp.y} / ${String(pp.m).padStart(2, "0")}</b><button data-a="sumnav" data-dir="1" aria-label="次の期間">${icon("chevron-right", 20)}</button></div><span style="font-size:11px;color:var(--gray)">${span(per)}</span></div>
    <div class="grp" id="sumtable">
      <div class="r">固定額<span class="v num">${yen(per.fixedAmount)}円</span></div>
      <div class="r">入金<span class="v num">+${yen(income)}円</span></div>
      <div class="r">出金<span class="v num">${yen(spentIn(per))}円</span></div>
      <div class="r">使用予定<span class="v num">${yen(plans)}円</span></div>
    </div>
    <div class="chart" id="spentchart"><h4><span>期間ごとの出金</span><span>過去${bars.length}期間</span></h4>${barChart(bars, { ref: per.fixedAmount, pick: ui.sum.pick, pickKey: "sum" })}</div>
    <div class="chart" id="catchart"><h4><span>カテゴリ別の出金</span><span>${pp.m}月</span></h4>${cat.length ? cat.map(c => `<div class="hbar"><span class="nm">${esc(c.name)}</span><span class="b" style="width:${c.amount / mx * 100}%"></span><span>${yen(c.amount)}円</span></div>`).join("") : `<p class="empty">まだ出金はありません</p>`}</div>
  </div>${dock(false)}`;
}

function savingsPage() {
  const sv = savings(hist(), D.records, TODAY, D.meta.savingsFrom);
  const label = r => (parse(r.start).d === 1 ? `${parse(r.start).m}月` : `${md(r.start)}〜${md(r.end)}`);
  const bars = sv.rows.slice(-12).map(r => ({ k: label(r), v: r.remain }));
  return `<div class="screen" data-key="savings">
    <div class="navbar"><button class="circ" data-a="back" aria-label="戻る">${icon("chevron-left", 20)}</button><div class="ttl">余り貯金</div><div class="ghost"></div></div>
    <div class="sv"><span>これまでの余り</span><b class="num ${sv.total < 0 ? "minus" : ""}" id="svtotal">${sv.total < 0 ? "−" : ""}${yen(sv.total)}<span class="yen">円</span></b><small id="svfrom">${periodLabel(sv.from)} から数えています</small></div>
    <div class="chart" id="svchart"><h4><span>期間ごとの余り</span><span>過去${bars.length}期間</span></h4>${barChart(bars, { negRed: true, h: 110, pick: ui.sum.pick, pickKey: "sv" })}</div>
    <div class="label">内訳</div>
    <div class="grp rows" id="svlist">${sv.rows.length ? sv.rows.slice().reverse().map(r => `<div class="r"><span class="nm">${label(r)}${r.remain < 0 ? "の不足" : "の余り"}</span><span class="am ${r.remain >= 0 ? "in" : "minus"}">${r.remain < 0 ? "−" : "+"}${yen(r.remain)}<span class="yen">円</span></span></div>`).join("") : `<p class="empty">まだ終わった期間はありません</p>`}</div>
  </div>${dock(false)}`;
}

function settingsView() {
  const s = latestSetting();
  return `<div class="screen" data-key="settings">
    <div class="top"><span class="spaced">SETTINGS</span></div>
    <div class="label">お小遣い</div>
    <div class="grp">
      <button class="r" data-a="fixed">固定額<span class="v num" id="setfixed">${yen(s.fixedAmount)}円</span><span class="chev">${icon("chevron-right", 18)}</span></button>
      <button class="r" data-a="startday">月の開始日<span class="v" id="setday">毎月${s.startDay}日</span><span class="chev">${icon("chevron-right", 18)}</span></button>
      <button class="r" data-a="savingsfrom">余り貯金の数え始め<span class="v" id="setsvfrom">${periodLabel(savingsFrom(hist(), D.meta.savingsFrom))} から</span><span class="chev">${icon("chevron-right", 18)}</span></button>
    </div>
    <div class="label">記録</div>
    <div class="grp"><button class="r" data-a="page" data-p="categories">カテゴリ<span class="v">${D.categories.length}件</span><span class="chev">${icon("chevron-right", 18)}</span></button></div>
    <div class="label">サブスク</div>
    <div class="grp" id="sublist">${D.subs.map(x => `<button class="r" data-a="editsub" data-id="${esc(x.id)}">${ic(x.icon, 16)}${esc(x.name)}<span class="v">${x.stopDate ? `${md(x.stopDate)}で止めた` : `毎月${x.day}日`}　${yen(x.amount)}円</span></button>`).join("")}
      <button class="r add" data-a="newsub">${icon("plus", 18)}追加</button></div>
    <div class="label">バックアップ</div>
    <div class="grp">
      <button class="r" data-a="export">ファイルに書き出す<span class="chev" style="margin-left:auto">${icon("chevron-right", 18)}</span></button>
      <button class="r" data-a="import">ファイルから読み込む<span class="chev" style="margin-left:auto">${icon("chevron-right", 18)}</span></button>
    </div>
    <input type="file" id="importfile" accept="application/json,.json" hidden>
  </div>${dock(false)}`;
}

function categoriesPage() {
  const d = ui.catDraft;
  const list = cats();
  return `<div class="screen" data-key="categories">
    <div class="navbar"><button class="circ" data-a="back" aria-label="戻る">${icon("chevron-left", 20)}</button><div class="ttl">カテゴリ</div><button class="pillbtn" data-a="catedit">${ui.catEdit ? "完了" : "編集"}</button></div>
    <div class="label">追加</div>
    <label class="field">${icon(d.icon, 22)}<input id="catname" placeholder="名前" maxlength="${MAX_CATEGORY_NAME}" value="${esc(d.name)}" autocomplete="off"></label>
    <div class="label">アイコン</div>
    ${iconPicker(d.icon)}
    <button class="addbtn" data-a="addcat" id="addcat" ${d.name.trim() ? "" : "disabled"}>追加</button>
    <div class="label">一覧</div>
    <div class="grp" id="catlist">${list.map((c, i) => `<div class="r">${ic(c.icon, 16)}${esc(c.name)}${ui.catEdit ? `<span class="tools"><button data-a="catup" data-id="${esc(c.id)}" ${i ? "" : "disabled"} aria-label="上へ">${icon("chevron-up", 18)}</button><button data-a="catdown" data-id="${esc(c.id)}" ${i < list.length - 1 ? "" : "disabled"} aria-label="下へ">${icon("chevron-down", 18)}</button><button class="del" data-a="catdel" data-id="${esc(c.id)}" aria-label="消す">${icon("trash-2", 18)}</button></span>` : ""}</div>`).join("") || `<p class="empty">カテゴリがありません</p>`}</div>
  </div>${dock(false)}`;
}

function subPage() {
  const d = ui.page.draft;
  const isNew = !d.id;
  return `<div class="screen" data-key="sub">
    <div class="navbar"><button class="circ" data-a="back" aria-label="戻る">${icon("chevron-left", 20)}</button><div class="ttl">${isNew ? "サブスクの追加" : "サブスクの編集"}</div><div class="ghost"></div></div>
    <label class="field">${icon(d.icon, 22)}<input id="subname" placeholder="名前" maxlength="${MAX_CATEGORY_NAME}" value="${esc(d.name)}" autocomplete="off"></label>
    <div class="label">アイコン</div>
    ${iconPicker(d.icon)}
    <div class="fieldrow">
      <button class="r" data-a="subamount">金額<span class="v num">${d.amount ? yen(d.amount) + "円" : "—"}</span><span class="chev">${icon("chevron-right", 18)}</span></button>
      <button class="r" data-a="subday">引き落とし日<span class="v">毎月${d.day}日</span><span class="chev">${icon("chevron-right", 18)}</span></button>
      <label class="r">開始日<span class="v">${d.startDate.replaceAll("-", " / ")}</span><span class="chev">${icon("chevron-right", 18)}</span><input type="date" id="substart" value="${d.startDate}"></label>
      ${d.stopDate ? `<div class="r">止めた日<span class="v">${d.stopDate.replaceAll("-", " / ")}</span></div>` : ""}
    </div>
    ${isNew ? `<button class="addbtn" data-a="savesub" ${d.name.trim() && d.amount ? "" : "disabled"}>追加</button>`
      : `<div class="btnrow"><button class="del" data-a="delsub">消す</button><button data-a="stopsub">${d.stopDate ? "再開する" : "止める"}</button><button class="main" data-a="savesub" ${d.name.trim() && d.amount ? "" : "disabled"}>保存</button></div>`}
  </div>${dock(false)}`;
}

// ---------- 下から出る画面 ----------
function dateLabel(date) {
  const p = parse(date), t = parse(TODAY);
  const base = p.y === t.y ? `${String(p.m).padStart(2, "0")} / ${String(p.d).padStart(2, "0")}` : `${p.y} / ${String(p.m).padStart(2, "0")} / ${String(p.d).padStart(2, "0")}`;
  return date === TODAY ? `今日 ${base}` : base;
}

function entrySheet(s) {
  const planned = s.kind === "out" && s.date > TODAY;
  const list = cats();
  return `<div class="dim" data-a="close"></div>
  <div class="sheet tall" role="dialog" aria-label="記録"><div class="grab"></div><button class="x" data-a="close" aria-label="閉じる">${icon("x", 20)}</button>
    <div class="stabs"><button class="${s.kind === "out" ? "on" : ""}" data-a="kind" data-k="out">出金</button><button class="${s.kind === "in" ? "on" : ""}" data-a="kind" data-k="in">入金</button></div>
    <div class="amt num" id="amt">${s.amount.toLocaleString("ja-JP")}<span class="yen">円</span></div>
    <div class="inrow">
      <label class="datebox ${planned ? "planned" : ""}">${icon("calendar", 16)}<span id="datelabel">${dateLabel(s.date)}${planned ? "　使用予定" : ""}</span><input type="date" id="entrydate" value="${s.date}" aria-label="日付"></label>
      <label class="memo">${icon("pencil", 16)}<input id="memo" placeholder="メモを入力" maxlength="${MAX_MEMO}" value="${esc(s.memo)}" autocomplete="off"></label>
    </div>
    ${s.kind === "out" && list.length ? `<div class="cats">${list.map(c => `<button class="${c.id === s.catId ? "on" : ""}" data-a="entrycat" data-id="${esc(c.id)}">${ic(c.icon, 19)}${esc(c.name)}</button>`).join("")}</div>` : ""}
    ${keypad()}
    ${s.mode === "edit"
      ? `<div class="btnrow" style="margin-top:12px"><button class="del" data-a="delrec">消す</button><button class="main" data-a="saveentry" id="savebtn" ${canSave(s.amount) ? "" : "disabled"}>${planned ? "予定に入れる" : "保存"}</button></div>`
      : `<button class="save" data-a="saveentry" id="savebtn" ${canSave(s.amount) ? "" : "disabled"}>${planned ? "予定に入れる" : "保存"}</button>`}
  </div>`;
}

function planSheet(s) {
  return `<div class="dim" data-a="close"></div>
  <div class="sheet" role="dialog" aria-label="使用予定"><div class="grab"></div><button class="x" data-a="close" aria-label="閉じる">${icon("x", 20)}</button>
    <div class="stitle plan">使用予定</div>
    <button class="amt num" id="amt" data-a="togglekeys">${s.amount.toLocaleString("ja-JP")}<span class="yen">円</span></button>
    <div class="inrow">
      <label class="datebox planned">${icon("calendar", 16)}<span>${dateLabel(s.date)}</span><input type="date" id="entrydate" value="${s.date}" aria-label="日付"></label>
      <label class="memo">${icon("pencil", 16)}<input id="memo" placeholder="メモを入力" maxlength="${MAX_MEMO}" value="${esc(s.memo)}" autocomplete="off"></label>
    </div>
    <div class="grp" style="border:1px solid var(--line)"><div class="r">${ic(s.icon, 16)}${esc(s.name)}</div></div>
    ${s.keys ? keypad() : ""}
    <div class="btnrow" style="margin-top:18px"><button class="del" data-a="delrec">消す</button><button data-a="saveplan" id="savebtn" ${canSave(s.amount) ? "" : "disabled"}>保存</button><button class="main" data-a="useplan" id="usebtn" ${canSave(s.amount) ? "" : "disabled"}>使った</button></div>
  </div>`;
}

function amountSheet(s, title, hint, label) {
  return `<div class="dim" data-a="close"></div>
  <div class="sheet" role="dialog" aria-label="${title}"><div class="grab"></div><button class="x" data-a="close" aria-label="閉じる">${icon("x", 20)}</button>
    <div class="stitle">${title}</div>
    <div class="amt num" id="amt">${s.amount.toLocaleString("ja-JP")}<span class="yen">円</span></div>
    ${hint ? `<div class="hint">${hint}</div>` : ""}
    ${keypad()}
    <button class="save" data-a="saveamount" id="savebtn" ${canSave(s.amount) ? "" : "disabled"}>${label}</button>
  </div>`;
}

function startDayPreview(day) {
  const v = previewStartDay(hist(), TODAY, day);
  const nextText = day === 1 ? "毎月1日 – 月末" : `毎月${day}日 – 翌月${day - 1}日`;
  return `<div><span>今の期間</span>${span(v.current)}（${v.current.days}日）</div><div><span>次の期間から</span>${nextText}</div>`;
}

function daySheet(s) {
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  return `<div class="dim" data-a="close"></div>
  <div class="sheet" role="dialog" aria-label="${s.title}"><div class="grab"></div><button class="x" data-a="close" aria-label="閉じる">${icon("x", 20)}</button>
    <div class="stitle">${s.title}</div>
    <div class="wheelwrap"><div class="wheel" id="wheel"><div class="pad"></div>${days.map(d => `<button class="${d === s.day ? "on" : ""}" data-a="wheelday" data-day="${d}">${d}日</button>`).join("")}<div class="pad"></div></div></div>
    ${s.preview ? `<div class="preview" id="dayprev">${startDayPreview(s.day)}</div><div class="hint" style="margin-top:0">今の期間の固定額は1か月分のままです</div>` : ""}
    ${s.note ? `<div class="hint" style="margin-top:0">${s.note}</div>` : ""}
    <button class="save" data-a="saveday">保存</button>
  </div>`;
}

/** 期間の名前: 1日始まりなら「2026/10」、それ以外は「2026/9/25〜」 */
function periodLabel(start) {
  if (!start) return "";
  const p = parse(start);
  return p.d === 1 ? `${p.y}/${p.m}` : `${p.y}/${p.m}/${p.d}〜`;
}

/** 余り貯金の数え始めを選ぶ画面（D-068）。今の期間から60期間（5年）前まで */
function periodSheet(s) {
  return `<div class="dim" data-a="close"></div>
  <div class="sheet" role="dialog" aria-label="${s.title}"><div class="grab"></div><button class="x" data-a="close" aria-label="閉じる">${icon("x", 20)}</button>
    <div class="stitle">${s.title}</div>
    <div class="wheelwrap"><div class="wheel" id="wheel"><div class="pad"></div>${s.items.map((st, i) => `<button class="${i === s.idx ? "on" : ""}" data-a="wheelperiod" data-i="${i}">${periodLabel(st)}</button>`).join("")}<div class="pad"></div></div></div>
    <div class="hint" style="margin-top:0">選んだ期間から余り貯金に数えます。それより前の記録は消えません。<br>はじめての設定より前の期間は、はじめての設定の固定額で数えます。</div>
    <button class="save" data-a="savefrom">保存</button>
  </div>`;
}

function dialogView(d) {
  return `<div class="dim top"></div><div class="dialog" role="alertdialog" aria-label="${esc(d.title)}"><h3>${esc(d.title)}</h3>${d.body ? `<p>${esc(d.body)}</p>` : ""}
    <div class="btnrow">${d.ok ? `<button data-a="dlgcancel">やめる</button><button class="${d.danger ? "del" : "main"}" data-a="dlgok">${esc(d.ok)}</button>` : `<button class="main" data-a="dlgcancel">閉じる</button>`}</div></div>`;
}

// ---------- 描く ----------
let lastKey = null;
function render() {
  const sc = $(".screen");
  const keep = sc ? { key: sc.dataset.key, top: sc.scrollTop } : null;
  let html;
  if (!D.settings.length) html = welcomeView();
  else if (ui.page) html = { summary: summaryPage, savings: savingsPage, categories: categoriesPage, sub: subPage }[ui.page.name]();
  else html = { home: homeView, calendar: calendarView, settings: settingsView }[ui.tab]();
  const s = ui.sheet;
  if (s) html += s.type === "entry" ? entrySheet(s) : s.type === "plan" ? planSheet(s) : s.type === "amount" ? amountSheet(s, s.title, s.hint, s.label) : s.type === "period" ? periodSheet(s) : daySheet(s);
  if (ui.dialog) html += dialogView(ui.dialog);
  if (ui.toast) html += `<div class="toast" role="status">${esc(ui.toast)}</div>`;
  app.innerHTML = html;
  const nsc = $(".screen");
  if (nsc && keep && keep.key === nsc.dataset.key) nsc.scrollTop = keep.top;
  lastKey = nsc && nsc.dataset.key;
  hookDots();
  checkScrolly();
  const wheel = $("#wheel");
  if (wheel && s && s.day) { wheel.scrollTop = (s.day - 1) * 36; }
  if (wheel && s && s.type === "period") { wheel.scrollTop = s.idx * 36; }
}

function hookDots() {
  app.querySelectorAll("[data-dots]").forEach(el => {
    const dots = document.getElementById(el.dataset.dots);
    if (!dots) return;
    el.addEventListener("scroll", () => {
      const i = Math.round(el.scrollLeft / el.clientWidth);
      [...dots.children].forEach((d, k) => d.classList.toggle("on", k === i));
    }, { passive: true });
  });
}

/** 金額だけ書きかえる（メモを打っている途中を消さないため） */
function updateAmount(v) {
  const a = $("#amt");
  if (a) a.innerHTML = `${v.toLocaleString("ja-JP")}<span class="yen">円</span>`;
  app.querySelectorAll("#savebtn, #usebtn").forEach(b => { b.disabled = !canSave(v); });
}

// ---------- 操作 ----------
function openEntry(opts) {
  const list = cats();
  const c = opts.catId ? list.find(x => x.id === opts.catId) : list[0];
  ui.sheet = { type: "entry", mode: "new", kind: "out", amount: 0, date: opts.date || TODAY, memo: "", catId: c && c.id, name: c ? c.name : "出金", icon: c ? c.icon : "tag" };
  render();
}

function openRecord(id) {
  const r = D.records.find(x => x.id === id);
  if (!r) return;
  if (r.kind === "plan") ui.sheet = { type: "plan", id: r.id, amount: r.amount, date: r.date, memo: r.memo || "", name: r.name, icon: r.icon, catId: r.categoryId, keys: false, rec: r };
  else ui.sheet = { type: "entry", mode: "edit", id: r.id, kind: r.kind, amount: r.amount, date: r.date, memo: r.memo || "", catId: r.categoryId, name: r.name, icon: r.icon, rec: r };
  render();
}

async function saveEntry() {
  const s = ui.sheet;
  s.memo = ($("#memo") || {}).value ?? s.memo;
  if (!canSave(s.amount)) return;
  const kind = kindForSave(s.kind, s.date, TODAY);
  const now = nowIso();
  const old = s.rec || {};
  const rec = {
    ...old, id: s.id || uid(), kind, date: s.date, amount: s.amount, memo: cut(s.memo, MAX_MEMO),
    name: s.kind === "in" ? "入金" : s.name, icon: s.kind === "in" ? "japanese-yen" : s.icon,
    createdAt: old.createdAt || now, updatedAt: now,
  };
  if (s.kind === "in") delete rec.categoryId; else if (s.catId) rec.categoryId = s.catId;
  ui.sheet = null;
  await commit([put("records", rec)]);
  render();
}

function confirmDialog(d) { ui.dialog = d; render(); }

const handlers = {
  tab: t => { ui.tab = t.dataset.t; ui.page = null; ui.sheet = null; if (ui.tab === "calendar") ui.cal = { start: null, sel: null }; render(); },
  page: t => { ui.page = { name: t.dataset.p }; ui.sum.pick = null; if (t.dataset.p === "summary") ui.sum.start = ui.cal.start; render(); },
  back: () => { ui.page = null; ui.catEdit = false; render(); },
  new: () => openEntry({ date: ui.tab === "calendar" && ui.cal.sel ? ui.cal.sel : TODAY }),
  quick: t => openEntry({ catId: t.dataset.id }),
  open: t => openRecord(t.dataset.id),
  close: () => { ui.sheet = null; render(); },
  kind: t => { ui.sheet.memo = $("#memo").value; ui.sheet.kind = t.dataset.k; render(); },
  entrycat: t => {
    const c = D.categories.find(x => x.id === t.dataset.id);
    Object.assign(ui.sheet, { catId: c.id, name: c.name, icon: c.icon, memo: $("#memo").value });
    app.querySelectorAll(".cats button").forEach(b => b.classList.toggle("on", b === t));
  },
  key: t => {
    const s = ui.sheet || ui.welcome;
    s.amount = pressKey(s.amount, t.dataset.k);
    updateAmount(s.amount);
  },
  togglekeys: () => { ui.sheet.memo = $("#memo").value; ui.sheet.keys = !ui.sheet.keys; render(); },
  saveentry: () => saveEntry(),
  delrec: () => {
    const s = ui.sheet;
    confirmDialog({ title: "この記録を消しますか？", body: `${md(s.rec.date)} ${s.rec.name} ${yen(s.rec.amount)}円\n消すと元に戻せません。`, ok: "消す", danger: true,
      onOk: async () => { ui.sheet = null; await commit([del("records", s.id)]); } });
  },
  saveplan: async () => {
    const s = ui.sheet;
    const rec = { ...s.rec, amount: s.amount, date: s.date, memo: cut($("#memo").value, MAX_MEMO), updatedAt: nowIso() };
    ui.sheet = null;
    await commit([put("records", rec)]);
    render();
  },
  useplan: async () => {
    const s = ui.sheet;
    const rec = markUsed({ ...s.rec, amount: s.amount, date: s.date, memo: cut($("#memo").value, MAX_MEMO) }, TODAY, nowIso());
    ui.sheet = null;
    await commit([put("records", rec)]);
    render();
  },
  day: t => { ui.cal.sel = t.dataset.d; render(); },
  calnav: t => {
    const per = periodAny(hist(), ui.cal.start || TODAY);
    const n = neighborPeriod(hist(), per, +t.dataset.dir);
    if (!n) return;
    ui.cal.start = n.start;
    ui.cal.sel = n.start <= TODAY && TODAY <= n.end ? TODAY : n.start;
    render();
  },
  sumnav: t => {
    const per = periodAny(hist(), ui.sum.start || TODAY);
    const n = neighborPeriod(hist(), per, +t.dataset.dir);
    if (!n) return;
    ui.sum.start = n.start; ui.sum.pick = null;
    render();
  },
  pickbar: t => { ui.sum.pick = +t.dataset.i; render(); },
  fixed: () => {
    const per = curPeriod();
    ui.sheet = { type: "amount", what: "fixed", title: "固定額", amount: latestSetting().fixedAmount, hint: `今の期間（${span(per)}）から、この額になります`, label: "保存" };
    render();
  },
  startday: () => { ui.sheet = { type: "day", what: "startday", title: "月の開始日", day: latestSetting().startDay, preview: true }; render(); },
  welcomeday: () => { ui.sheet = { type: "day", what: "welcomeday", title: "月の開始日", day: ui.welcome.startDay, note: "この日から次の同じ日の前日までを1か月として数えます" }; render(); },
  subamount: () => { ui.sheet = { type: "amount", what: "subamount", title: "金額", amount: ui.page.draft.amount || 0, label: "決める" }; render(); },
  subday: () => { ui.sheet = { type: "day", what: "subday", title: "引き落とし日", day: ui.page.draft.day, note: "その日がない月は、月末に引き落とします" }; render(); },
  savingsfrom: () => {
    const items = [];
    for (let p = curPeriod(), i = 0; p && i < 61; p = neighborPeriod(hist(), p, -1), i++) items.unshift(p.start);
    const cur = savingsFrom(hist(), D.meta.savingsFrom);
    const idx = Math.max(0, items.indexOf(cur));
    ui.sheet = { type: "period", title: "余り貯金の数え始め", items, idx };
    render();
  },
  wheelperiod: t => { const w = $("#wheel"); w.scrollTo({ top: +t.dataset.i * 36, behavior: "smooth" }); setPeriodIdx(+t.dataset.i); },
  savefrom: async () => {
    const s = ui.sheet;
    ui.sheet = null;
    await commit([put("meta", { key: "savingsFrom", value: s.items[s.idx] })]);
    render();
  },
  wheelday: t => { const w = $("#wheel"); w.scrollTo({ top: (+t.dataset.day - 1) * 36, behavior: "smooth" }); setDay(+t.dataset.day); },
  saveday: async () => {
    const s = ui.sheet;
    ui.sheet = null;
    if (s.what === "startday") {
      if (s.day !== latestSetting().startDay) await commit([put("settings", { changedOn: TODAY, fixedAmount: latestSetting().fixedAmount, startDay: s.day })]);
    } else if (s.what === "welcomeday") ui.welcome.startDay = s.day;
    else if (s.what === "subday") ui.page.draft.day = s.day;
    render();
  },
  saveamount: async () => {
    const s = ui.sheet;
    if (!canSave(s.amount)) return;
    ui.sheet = null;
    if (s.what === "fixed") {
      if (s.amount !== latestSetting().fixedAmount) await commit([put("settings", { changedOn: TODAY, fixedAmount: s.amount, startDay: latestSetting().startDay })]);
    } else if (s.what === "subamount") ui.page.draft.amount = s.amount;
    render();
  },
  start: async () => {
    const w = ui.welcome;
    if (!canSave(w.amount)) return;
    const now = nowIso();
    await commit([
      put("settings", { changedOn: TODAY, fixedAmount: w.amount, startDay: w.startDay }),
      ...DEFAULT_CATEGORIES.map(([name, ic2], i) => put("categories", { id: uid(), name, icon: ic2, order: i })),
      put("meta", { key: "createdAt", value: now }),
    ]);
    db.askPersist();
    ui.tab = "home";
    render();
  },
  // カテゴリ
  pickicon: t => {
    const target = ui.page.name === "sub" ? ui.page.draft : ui.catDraft;
    target.icon = t.dataset.icon;
    syncNameField();
    render();
  },
  addcat: async () => {
    syncNameField();
    const d = ui.catDraft;
    const name = cut(d.name.trim(), MAX_CATEGORY_NAME);
    if (!name) return;
    const order = D.categories.reduce((a, c) => Math.max(a, c.order), -1) + 1;
    ui.catDraft = { name: "", icon: d.icon };
    await commit([put("categories", { id: uid(), name, icon: d.icon, order })]);
    render();
  },
  catedit: () => { syncNameField(); ui.catEdit = !ui.catEdit; render(); },
  catup: t => moveCat(t.dataset.id, -1),
  catdown: t => moveCat(t.dataset.id, +1),
  catdel: t => {
    const c = D.categories.find(x => x.id === t.dataset.id);
    syncNameField();
    confirmDialog({ title: "このカテゴリを消しますか？", body: `${c.name}\nこれまでの記録は、名前とアイコンのまま残ります。`, ok: "消す", danger: true,
      onOk: () => commit([del("categories", c.id)]) });
  },
  // サブスク
  newsub: () => { ui.page = { name: "sub", draft: { name: "", icon: "clapperboard", amount: 0, day: parse(TODAY).d, startDate: TODAY } }; render(); },
  editsub: t => { const x = D.subs.find(s => s.id === t.dataset.id); ui.page = { name: "sub", draft: { ...x } }; render(); },
  savesub: async () => {
    syncNameField();
    const d = ui.page.draft;
    if (!d.name.trim() || !d.amount) return;
    const sub = { ...d, name: cut(d.name.trim(), MAX_CATEGORY_NAME), createdOn: d.createdOn || TODAY };
    if (!sub.id) sub.id = uid();
    ui.page = null;
    await commit([put("subs", sub)]);
    await autoRun();
    render();
  },
  stopsub: () => {
    syncNameField();
    const d = ui.page.draft;
    if (d.stopDate) { delete d.stopDate; render(); return; }
    confirmDialog({ title: "このサブスクを止めますか？", body: `${d.name}\n今日より後は自動で記録しません。これまでの記録は残ります。`, ok: "止める", danger: true,
      onOk: async () => { const sub = { ...d, stopDate: TODAY }; ui.page = null; await commit([put("subs", sub)]); } });
  },
  delsub: () => {
    syncNameField();
    const d = ui.page.draft;
    confirmDialog({ title: "このサブスクを消しますか？", body: `${d.name}\n一覧から消えます。これまでの記録は残ります。`, ok: "消す", danger: true,
      onOk: async () => { ui.page = null; await commit([del("subs", d.id)]); } });
  },
  // バックアップ
  export: () => exportBackup(),
  import: () => $("#importfile").click(),
  // 確かめる画面
  dlgcancel: () => { ui.dialog = null; render(); },
  dlgok: async () => { const d = ui.dialog; ui.dialog = null; render(); await d.onOk(); render(); },
};

function setPeriodIdx(i) {
  if (!ui.sheet || ui.sheet.type !== "period" || ui.sheet.idx === i) return;
  ui.sheet.idx = i;
  app.querySelectorAll("#wheel button").forEach(b => b.classList.toggle("on", +b.dataset.i === i));
}

function setDay(day) {
  if (!ui.sheet || ui.sheet.type !== "day" || ui.sheet.day === day) return;
  ui.sheet.day = day;
  app.querySelectorAll("#wheel button").forEach(b => b.classList.toggle("on", +b.dataset.day === day));
  const pv = $("#dayprev");
  if (pv) pv.innerHTML = startDayPreview(day);
}

function syncNameField() {
  const c = $("#catname"); if (c) ui.catDraft.name = c.value;
  const s = $("#subname"); if (s && ui.page && ui.page.draft) ui.page.draft.name = s.value;
}

async function moveCat(id, dir) {
  syncNameField();
  const list = cats();
  const i = list.findIndex(c => c.id === id), j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await commit(list.map((c, k) => put("categories", { ...c, order: k })));
  render();
}

async function exportBackup() {
  const data = { records: D.records, categories: D.categories, subs: D.subs, subRuns: D.subRuns, settings: D.settings,
    meta: D.meta.savingsFrom ? [{ key: "savingsFrom", value: D.meta.savingsFrom }] : [] };
  const text = JSON.stringify(buildBackup(data, nowIso()), null, 1);
  const name = fileName(TODAY);
  const file = new File([text], name, { type: "application/json" });
  try {
    // ファイルだけを渡す。題名も渡すと、iPhone の「ファイルに保存」で題名のテキストまで保存されてしまう（B-003）
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`${name} を書き出しました`);
}

async function importBackup(file) {
  const text = await file.text();
  const r = readBackup(text);
  if (!r.ok) { confirmDialog({ title: "読み込めませんでした", body: r.reason }); return; }
  const b = r.backup;
  const when = typeof b.exportedAt === "string" ? b.exportedAt.slice(0, 10).replaceAll("-", "/") : "日付なし";
  confirmDialog({
    title: "今のデータを全部置きかえますか？",
    body: `${file.name}\n記録 ${r.counts.records}件・カテゴリ ${r.counts.categories}件・サブスク ${r.counts.subs}件\n（${when} に書き出したもの）\n今のデータは消えて、元に戻せません。`,
    ok: "置きかえる", danger: true,
    onOk: async () => {
      const ops = [];
      for (const s of ["records", "categories", "subs", "subRuns", "settings"]) {
        ops.push({ store: s, clear: true });
        for (const x of b.data[s]) ops.push(put(s, x));
      }
      // 余り貯金の数え始め（ファイルにあればそれに、なければ初めの状態に戻す）
      const from = (b.data.meta || []).find(m => m.key === "savingsFrom");
      ops.push(from ? put("meta", from) : del("meta", "savingsFrom"));
      await commit(ops);
      ui.tab = "home"; ui.page = null;
      toast("読み込みました");
    },
  });
}

// ---------- できごと ----------
app.addEventListener("click", e => {
  const t = e.target.closest("[data-a]");
  if (!t || t.disabled) return;
  const h = handlers[t.dataset.a];
  if (h) { e.preventDefault(); h(t, e); }
});
app.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "entrydate" && t.value) { ui.sheet.memo = $("#memo").value; ui.sheet.date = t.value; render(); }
  else if (t.id === "substart" && t.value) { syncNameField(); ui.page.draft.startDate = t.value; render(); }
  else if (t.id === "importfile" && t.files[0]) { importBackup(t.files[0]); t.value = ""; }
});
app.addEventListener("input", e => {
  const t = e.target;
  if (t.id === "memo" && ui.sheet) ui.sheet.memo = t.value;
  else if (t.id === "catname") { ui.catDraft.name = t.value; const b = $("#addcat"); if (b) b.disabled = !t.value.trim(); }
  else if (t.id === "subname") { ui.page.draft.name = t.value; app.querySelectorAll('[data-a="savesub"]').forEach(b => { b.disabled = !(t.value.trim() && ui.page.draft.amount); }); }
});
// 日を回したら、まん中の日を選ぶ
app.addEventListener("scroll", e => {
  if (e.target.id !== "wheel") return;
  clearTimeout(setDay.t);
  const w = e.target;
  setDay.t = setTimeout(() => {
    const i = Math.round(w.scrollTop / 36);
    if (ui.sheet && ui.sheet.type === "period") setPeriodIdx(Math.min(ui.sheet.items.length - 1, Math.max(0, i)));
    else setDay(Math.min(31, Math.max(1, i + 1)));
  }, 90);
}, true);
// 下から出る画面の中身が入りきらないときだけ、たてにすべらせられるようにする（キーボードが出て高さが変わったときも判定し直す）
function checkScrolly() {
  const sh = $(".sheet");
  if (sh) sh.classList.toggle("scrolly", sh.scrollHeight > sh.clientHeight + 1);
}
(window.visualViewport || window).addEventListener("resize", checkScrolly);

// 下から出る画面を下に引いて閉じる（B-001: 指に合わせて1コマごとに動かし、離したらすべるように閉じる）
let drag = null;
app.addEventListener("touchstart", e => {
  const sh = e.target.closest(".sheet");
  if (!sh || (sh.classList.contains("scrolly") && sh.scrollTop > 0) || e.target.closest(".wheel, .cats, input")) return;
  sh.classList.remove("settle", "closing");
  drag = { sh, dim: $(".dim:not(.top)"), y: e.touches[0].clientY, dy: 0, t: performance.now(), v: 0, raf: 0 };
}, { passive: true });
app.addEventListener("touchmove", e => {
  if (!drag) return;
  const y = e.touches[0].clientY, now = performance.now();
  const dy = Math.max(0, y - drag.y);
  drag.v = (dy - drag.dy) / Math.max(1, now - drag.t);   // 1ms あたりの速さ
  drag.dy = dy; drag.t = now;
  if (!drag.raf) drag.raf = requestAnimationFrame(() => {
    if (!drag) return;
    drag.raf = 0;
    drag.sh.style.transform = `translate3d(0, ${drag.dy}px, 0)`;
    if (drag.dim) drag.dim.style.opacity = String(Math.max(0, 1 - drag.dy / (drag.sh.offsetHeight || 1)));
  });
}, { passive: true });
function endDrag() {
  if (!drag) return;
  const d = drag;
  drag = null;
  cancelAnimationFrame(d.raf);
  const close = d.dy > 90 || (d.dy > 24 && d.v > 0.6);
  d.sh.classList.add(close ? "closing" : "settle");
  if (d.dim) d.dim.classList.add(close ? "closing" : "settle");
  d.sh.style.transform = close ? "translate3d(0, 100%, 0)" : "";
  if (d.dim) d.dim.style.opacity = close ? "0" : "";
  if (close) setTimeout(() => { ui.sheet = null; render(); }, 220);
  else setTimeout(() => { d.sh.classList.remove("settle"); if (d.dim) d.dim.classList.remove("settle"); }, 220);
}
app.addEventListener("touchend", endDrag);
app.addEventListener("touchcancel", endDrag);

// 日付が変わったまま開きっぱなしでも、前に出てきたら計算し直す（A-16）
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible") return;
  const t = todayOf();
  if (t !== TODAY) { TODAY = t; ui.cal = { start: null, sel: null }; }
  await autoRun();
  render();
});

// ---------- 起動（P-01） ----------
async function boot() {
  try {
    await reload();
    TODAY = todayOf();
    await autoRun();
    render();
  } catch (e) {
    app.innerHTML = `<div class="screen"><p class="empty" style="padding-top:60px">データを読み込めませんでした。アプリを開き直してください。</p></div>`;
    console.error(e);
  }
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(() => {});
}
boot();

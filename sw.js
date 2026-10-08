// Service Worker（設計書 8章・P-05）
// アプリのファイルをすべて端末に保存し、開くときは保存したものを使う（ネットを待たない）。
// 新しい版を置いたら VERSION を上げる。次にネットにつながった状態で開いたときに裏で取り込み、
// その次に開いたときから新しい版になる。
const VERSION = "okz-v1";
const FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/main.js",
  "./js/db.js",
  "./js/icons.js",
  "./js/logic/date.js",
  "./js/logic/period.js",
  "./js/logic/balance.js",
  "./js/logic/calendar.js",
  "./js/logic/subs.js",
  "./js/logic/savings.js",
  "./js/logic/entry.js",
  "./js/logic/backup.js",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))));
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});

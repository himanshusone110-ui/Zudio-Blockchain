// ZUDIO Wallet Service Worker
const CACHE_NAME = 'zudio-wallet-v1';
const ASSETS = [
  '/',
  '/wallet.html',
  '/index.html',
  '/explorer.html',
  '/style.css',
  '/logo.png?v=2',
  '/vault.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network first strategy
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

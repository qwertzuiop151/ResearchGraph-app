// Service worker of ResearchGraph. Its only job is to make the app installable (browsers ask for a registered worker).
// It caches nothing: every request goes to the network unchanged, so a new version of the app is live with the next start.
// Page loads are answered explicitly from the network, because some browsers only offer installation when the worker responds to them;
// all other requests (data sync, icons) are left to the browser.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') event.respondWith(fetch(event.request));
});

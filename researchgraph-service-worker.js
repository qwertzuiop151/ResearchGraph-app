// Service worker of ResearchGraph. Its only job is to make the app installable (browsers ask for a registered worker).
// It caches nothing: every request goes to the network unchanged, so a new version of the app is live with the next start.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

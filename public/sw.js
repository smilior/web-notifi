self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "テスト通知";
  const options = {
    body: data.body || "Web Push通知のテストです",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url;
  const urlToOpen = targetUrl
    ? "/r?to=" + encodeURIComponent(targetUrl)
    : "/";
  event.waitUntil(clients.openWindow(urlToOpen));
});

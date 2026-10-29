const CACHE_NAME = "plan-zajec-v6.3.1";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon.svg"];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE_NAME).then(function(c){ return c.addAll(ASSETS); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener("fetch", function(e){
  e.respondWith(
    caches.match(e.request).then(function(r){
      if (r) return r;
      return fetch(e.request).then(function(res){
        if (res.ok && e.request.method === "GET" && new URL(e.request.url).origin === location.origin) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function(c){ c.put(e.request, copy); });
        }
        return res;
      }).catch(function(){ return caches.match("./"); });
    })
  );
});

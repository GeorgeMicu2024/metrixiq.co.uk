const STATIC_CACHE="metrixiq-static-v6";
const STATIC_ASSETS=["/manifest.webmanifest","/favicon.svg"];

self.addEventListener("install",(event)=>{
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache)=>cache.addAll(STATIC_ASSETS)).catch(()=>undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate",(event)=>{
  event.waitUntil(
    caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key!==STATIC_CACHE).map((key)=>caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch",(event)=>{
  const request=event.request;
  if(request.method!=="GET")return;

  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  const cacheable =
    url.pathname==="/manifest.webmanifest" ||
    url.pathname==="/favicon.svg" ||
    url.pathname.startsWith("/_next/static/");

  if(!cacheable)return;

  event.respondWith(
    caches.match(request).then((cached)=>{
      if(cached)return cached;
      return fetch(request).then((response)=>{
        if(!response||!response.ok)return response;
        const copy=response.clone();
        caches.open(STATIC_CACHE).then((cache)=>cache.put(request,copy));
        return response;
      });
    })
  );
});

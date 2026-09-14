const CACHE='expedientes-medicos-static-v4';
const ASSETS=['./','./index.html','./styles.css?v=2','./app.js?v=2','./config.js?v=2','./manifest.webmanifest','./icon-192.png','./icon-512.png'];

self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',e=>e.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
));

self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin!==self.location.origin)return;
  if(u.pathname.startsWith('/api/'))return;

  if(e.request.mode==='navigate'){
    e.respondWith(
      fetch(e.request)
        .then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put('./index.html',c));return r;})
        .catch(()=>caches.match('./index.html'))
    );
    return;
  }

  // config.js siempre intenta red primero para evitar que una versión anterior congele la configuración.
  if(u.pathname.endsWith('/config.js')){
    e.respondWith(
      fetch(e.request)
        .then(resp=>{const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return resp;})
        .catch(()=>caches.match(e.request))
    );
    return;
  }

  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{
    const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return resp;
  })));
});

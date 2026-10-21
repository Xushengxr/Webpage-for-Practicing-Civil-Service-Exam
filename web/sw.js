'use strict';
const CACHE='xingce-offline-v1-'+encodeURIComponent(self.registration.scope);
const base=new URL('./',self.location.href);
const SHELL=['./','index.html','style.css','mobile.css','print.css','core.js','app.js','print.js','pwa.js','manifest.webmanifest','data/index.js','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(p=>new URL(p,base).href)))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
  const relative=decodeURIComponent(url.pathname.slice(base.pathname.length));
  if(request.mode!=='navigate'&&!SHELL.includes(relative)&&!/^data\/q-[a-f0-9]{2}\.js$/.test(relative)&&!relative.startsWith('images/'))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),cached=await cache.match(request);
    if(cached&&(relative.startsWith('images/')||/^data\/q-/.test(relative)))return cached;
    try{const response=await fetch(request);if(response.ok)await cache.put(request,response.clone()).catch(()=>{});return response;}
    catch(error){if(cached)return cached;if(request.mode==='navigate'){const home=await cache.match(new URL('./',base).href);if(home)return home;}throw error;}
  })());
});

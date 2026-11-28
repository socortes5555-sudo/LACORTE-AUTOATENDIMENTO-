// Escopo exclusivo do cliente online; sem cache de dados pessoais.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;if(req.mode==='navigate'||['script','style'].includes(req.destination))event.respondWith(fetch(new Request(req,{cache:'no-store'})));});

// Intencionalmente sem cache ou interceptação de requisições.
// O sistema LaCorte exige conexão com o Supabase em tempo real.
// Manter as páginas e scripts sempre atualizados evita telas antigas.
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

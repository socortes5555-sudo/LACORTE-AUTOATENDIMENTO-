// LaCorte PWA: instalação sem alterar autenticação, fila ou layout.
// Não há armazenamento offline de clientes, relatórios ou sessões.
(() => {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', {
      scope: './',
      updateViaCache: 'none'
    }).catch(() => {
      console.warn('Não foi possível habilitar a instalação do aplicativo LaCorte.');
    });
  }, { once: true });
})();

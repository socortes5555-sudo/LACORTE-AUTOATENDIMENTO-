// LaCorte PWA: instalação sem alterar autenticação, fila ou layout.
// Não há armazenamento offline de clientes, relatórios ou sessões.
(() => {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  window.addEventListener('load', () => {
    // Escopo sempre relativo à URL REAL, sem herdar <base href>.
    // /cliente/ e /equipe/ devem permanecer aplicativos independentes.
    const pageBase = new URL('./', window.location.href);
    navigator.serviceWorker.register(new URL('service-worker.js', pageBase).href, {
      scope: pageBase.href,
      updateViaCache: 'none'
    }).catch(() => {
      console.warn('Não foi possível habilitar a instalação do aplicativo LaCorte.');
    });
  }, { once: true });
})();

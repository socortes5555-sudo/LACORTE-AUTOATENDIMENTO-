// Os aplicativos e o navegador usam a mesma publicação, sem dados offline.
(() => {
  const version = document.querySelector('meta[name="lacorte-release"]')?.content;
  const releaseUrl = new URL('version.json', document.baseURI);
  let registration, checking=false, lastCheck=0;
  function showUpdate(next) {
    if(document.getElementById('lacorte-update'))return;
    const notice=document.createElement('div');
    notice.id='lacorte-update';
    notice.setAttribute('role','status');
    notice.style.cssText='position:fixed;bottom:16px;left:16px;right:16px;z-index:10000;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:#181818;color:#fff;border:1px solid #ff7900;border-radius:12px;font:14px system-ui;box-shadow:0 4px 24px #0006';
    const label=document.createElement('span');label.textContent='Atualização disponível para a LaCorte.';
    const button=document.createElement('button');button.type='button';button.textContent='Atualizar agora';
    button.style.cssText='border:0;border-radius:8px;background:#ff7900;color:#111;padding:10px 14px;font:600 14px system-ui;cursor:pointer';
    button.addEventListener('click',()=>{
      const destination=new URL(window.location.href);
      destination.searchParams.set('_lacorte_version',next);
      window.location.replace(destination.href);
    });
    notice.append(label,button);document.body.append(notice);
  }
  async function checkUpdate() {
    if(!version || checking || document.visibilityState==='hidden' || Date.now()-lastCheck<15000)return;
    checking=true;lastCheck=Date.now();
    try {
      const url=new URL(releaseUrl);url.searchParams.set('_',String(Date.now()));
      const response=await fetch(url,{cache:'no-store'});
      if(!response.ok)return;
      const latest=await response.json();
      if(typeof latest.version==='string' && latest.version!==version)showUpdate(latest.version);
      if(registration)await registration.update();
    } catch { /* Uma falha de conexão não interrompe o atendimento em andamento. */ }
    finally { checking=false; }
  }
  window.addEventListener('load',async()=>{
    if('serviceWorker' in navigator && location.protocol==='https:'){
      const pageBase=new URL('./',window.location.href);
      try {
        registration=await navigator.serviceWorker.register(new URL('service-worker.js',pageBase).href,{scope:pageBase.href,updateViaCache:'none'});
      } catch { console.warn('Não foi possível habilitar a instalação do aplicativo LaCorte.'); }
    }
    void checkUpdate();
    window.setInterval(()=>void checkUpdate(),60000);
  },{once:true});
  window.addEventListener('pageshow',()=>void checkUpdate());
  window.addEventListener('focus',()=>void checkUpdate());
  window.addEventListener('online',()=>void checkUpdate());
  document.addEventListener('visibilitychange',()=>void checkUpdate());
})();

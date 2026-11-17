import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
const source=readFileSync('pwa.js','utf8');
const flush=()=>new Promise(setImmediate);
function app({latest='new',hidden=false,fail=false,scoped='equipe'}={}){
 const events={},nodes=new Map(),timers=[],requests=[],registrations=[];
 let navigated,updates=0;
 function element(tag){return {tag,style:{},children:[],setAttribute(){},append(...children){this.children.push(...children);},addEventListener(name,handler){this[name]=handler;}};}
 const document={baseURI:'https://example.test/LACORTE/',visibilityState:hidden?'hidden':'visible',
 querySelector:()=>({content:'old'}),getElementById:id=>nodes.get(id),createElement:element,
 body:{append(node){nodes.set(node.id,node);}},addEventListener(name,handler){events[name]=handler;}};
 const location={protocol:'https:',href:'https://example.test/LACORTE/'+scoped+'/?tab=team#profile',replace:destination=>navigated=destination};
 const registration={update:async()=>updates++};
 const ctx={URL,Date,console,document,location,navigator:{serviceWorker:{register:async(url,options)=>{registrations.push({url,options});return registration;}}},
 window:{location,addEventListener(name,handler){events[name]=handler;},setInterval(handler){timers.push(handler);}},
 fetch:async(url,options)=>{requests.push({url:String(url),options});if(fail)throw Error('offline');return {ok:true,json:async()=>({version:latest})};}};
 vm.runInNewContext(source,ctx);
 return {events,nodes,document,requests,registrations,timers,get navigated(){return navigated;},get updates(){return updates;}};
}
test('aplicativo detecta versão nova sem interromper a tela em uso',async()=>{
 const env=app();await env.events.load();await flush();
 assert.equal(env.navigated,undefined);assert.equal(env.requests[0].options.cache,'no-store');
 assert.match(env.requests[0].url,/LACORTE\/version.json\?_/);
 const notice=env.nodes.get('lacorte-update');assert.ok(notice);
 notice.children[1].click();
 const destination=new URL(env.navigated);assert.equal(destination.searchParams.get('_lacorte_version'),'new');
 assert.equal(destination.searchParams.get('tab'),'team');assert.equal(destination.hash,'#profile');
 assert.equal(env.updates,1);
});
test('versão atual não oferece atualização desnecessária',async()=>{
 const env=app({latest:'old'});await env.events.load();await flush();assert.equal(env.nodes.size,0);
});
test('falha de internet preserva a tela e não força navegação',async()=>{
 const env=app({fail:true});await env.events.load();await flush();assert.equal(env.navigated,undefined);assert.equal(env.nodes.size,0);
});
test('aplicativo oculto aguarda retorno à tela',async()=>{
 const env=app({hidden:true});await env.events.load();await flush();assert.equal(env.requests.length,0);
 env.document.visibilityState='visible';await env.events.visibilitychange();await flush();assert.equal(env.requests.length,1);
 assert.ok(env.events.focus);assert.ok(env.events.pageshow);assert.ok(env.events.online);assert.equal(env.timers.length,1);
});
test('atualização mantém registros de service worker separados para cliente e equipe',async()=>{
 for(const scoped of ['cliente','equipe']){
  const env=app({scoped});await env.events.load();await flush();
  assert.equal(env.registrations[0].url,'https://example.test/LACORTE/'+scoped+'/service-worker.js');
  assert.equal(env.registrations[0].options.scope,'https://example.test/LACORTE/'+scoped+'/');
 }
});
test('navegador e aplicativo apontam para os mesmos arquivos e publicação',()=>{
 const release=JSON.parse(readFileSync('version.json','utf8')).version;
 for(const page of ['index.html','cliente/index.html','barbeiros.html','equipe/index.html']){
  const html=readFileSync(page,'utf8');assert.ok(html.includes('name="lacorte-release" content="'+release+'"'));
  for(const match of html.matchAll(/(?:src|href)="([^"\s]+[?&]v=([^"\s]+))"/g))assert.equal(match[2],release,page+': '+match[1]);
  assert.match(html,/connect-src 'self'/);
 }
 execFileSync(process.execPath,['scripts/release.mjs','--check']);
});
test('worker evita cache em navegação e recursos sem interceptar o Supabase',()=>{
 for(const path of ['service-worker.js','cliente/service-worker.js','equipe/service-worker.js']){
  const events={},requests=[];
  class NetworkRequest{constructor(request,options){this.url=request.url;this.cache=options.cache;}}
  vm.runInNewContext(readFileSync(path,'utf8'),{URL,Request:NetworkRequest,fetch:request=>{requests.push(request);return Promise.resolve({});},self:{location:{origin:'https://example.test'},addEventListener:(name,handler)=>events[name]=handler}});
  for(const request of [
   {method:'GET',url:'https://example.test/LACORTE/equipe/',mode:'navigate'},
   {method:'GET',url:'https://example.test/LACORTE/admin.js',destination:'script'}
  ])events.fetch({request,respondWith(){}});
  events.fetch({request:{method:'POST',url:'https://project.supabase.co/rest/v1/barbers'},respondWith(){assert.fail('API interceptada');}});
  assert.equal(requests.length,2);assert.ok(requests.every(request=>request.cache==='no-store'));
 }
});

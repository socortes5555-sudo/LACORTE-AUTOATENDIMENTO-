import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
const dir=existsSync('dist/app.js')?'dist/':'';
const app=readFileSync(dir+'app.js','utf8');
const callback=app.slice(app.indexOf('async function handleStaffAuthCallback(){'),app.indexOf('async function initLaCorte(){'));
function context({hash='',search='',role='barber',error=null}={}){
 const events=[];
 const user={id:'fixture'};
 const ctx={URLSearchParams,document:{title:'Profissional'},window:{location:{hash,search,pathname:'/barbeiros.html'},history:{replaceState(){events.push('clean')}}},
 db:{auth:{setSession:async()=>{events.push('session');return {data:{user},error}},verifyOtp:async()=>({data:{user},error}),exchangeCodeForSession:async()=>({data:{user},error}),signOut:async()=>events.push('out')},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:role?{role}:null})})})})},
 renderStaffLogin:()=>events.push('login'),renderStaffPasswordOnly:()=>events.push('password'),renderStaffPasswordReset:async()=>events.push('reset')};
 vm.createContext(ctx);vm.runInContext(callback,ctx);return {ctx,events};
}
test('confirmação por link remove tokens e abre criar senha',async()=>{
 const {ctx,events}=context({hash:'#access_token=fixture&refresh_token=fixture&type=magiclink'});
 assert.equal(await ctx.handleStaffAuthCallback(),true);assert.deepEqual(events,['clean','session','password']);
});
test('recuperação abre redefinir senha',async()=>{
 const {ctx,events}=context({hash:'#access_token=fixture&refresh_token=fixture&type=recovery'});
 await ctx.handleStaffAuthCallback();assert.deepEqual(events,['clean','session','reset']);
});
test('link vencido informa erro e nunca abre painel ou senha',async()=>{
 const {ctx,events}=context({hash:'#error=access_denied&error_code=otp_expired'});
 await ctx.handleStaffAuthCallback();assert.deepEqual(events,['clean','login']);
});
test('conta sem papel profissional é desconectada',async()=>{
 const {ctx,events}=context({hash:'#access_token=fixture&refresh_token=fixture',role:null});
 await ctx.handleStaffAuthCallback();assert.deepEqual(events,['clean','session','out','login']);
});
test('token inválido não concede acesso',async()=>{
 const {ctx,events}=context({hash:'#access_token=fixture&refresh_token=fixture',error:{message:'invalid'}});
 await ctx.handleStaffAuthCallback();assert.deepEqual(events,['clean','session','login']);
});
test('login comum não força alteração de senha',async()=>{
 const {ctx,events}=context();assert.equal(await ctx.handleStaffAuthCallback(),false);assert.deepEqual(events,[]);
});
test('confirmação por token_hash também abre criação de senha',async()=>{
 const {ctx,events}=context({search:'?token_hash=fixture&type=email'});await ctx.handleStaffAuthCallback();assert.deepEqual(events,['clean','password']);
});
test('callback no endereço antigo preserva parâmetros ao ir ao profissional',()=>{
 let destination;const location={href:'https://example.test/LACORTE-AUTOATENDIMENTO-/',pathname:'/LACORTE-AUTOATENDIMENTO-/',search:'',hash:'#access_token=fixture&refresh_token=fixture',replace:value=>destination=value};
 vm.runInNewContext(readFileSync(dir+'auth-route.js','utf8'),{URL,URLSearchParams,window:{location}});
 assert.equal(destination,'https://example.test/LACORTE-AUTOATENDIMENTO-/barbeiros.html#access_token=fixture&refresh_token=fixture');
});
test('todos os recursos locais referenciados existem',()=>{
 for(const page of ['index.html','barbeiros.html']){
  const html=readFileSync(dir+page,'utf8');for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
   const path=match[1].split('?')[0];if(!path.startsWith('http'))assert.ok(existsSync(dir+path),path);
  }
 }
});

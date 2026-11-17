import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync('app.js','utf8');
const dateSource=app.slice(app.indexOf('function localQueueDate(){'),app.indexOf('function formatDateTime('));
function businessDate(value){const NativeDate=Date;const ctx={Intl,Date:class extends NativeDate{constructor(){super(value);}}};vm.createContext(ctx);vm.runInContext(dateSource,ctx);return ctx.localQueueDate();}
test('a data muda à meia-noite de Brasília, sem antecipar para meia-noite UTC',()=>{
 assert.equal(businessDate('2026-11-17T00:20:00Z'),'2026-11-16');
 assert.equal(businessDate('2026-11-17T02:59:59Z'),'2026-11-16');
 assert.equal(businessDate('2026-11-17T03:00:00Z'),'2026-11-17');
 assert.equal(businessDate('2026-11-17T03:01:00Z'),'2026-11-17');
});
test('a consulta da fila filtra o dia no servidor e descarta respostas antigas',async()=>{
 const filters=[];const values={lacorte_queue:[{id:'old',queue_date:'2026-11-16',customer_id:'a'},{id:'current',queue_date:'2026-11-17',customer_id:'b'}],customers:[],lacorte_queue_items:[],lacorte_queue_declines:[]};
 const ctx={localQueueDate:()=> '2026-11-17',barbers:[],db:{from(table){const query={select:()=>query,in:()=>query,eq:(key,value)=>{filters.push([table,key,value]);return query;},order:()=>query,then:resolve=>resolve({data:values[table],error:null})};return query;}}};
 vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('async function loadQueueRows(){'),app.indexOf('let queueRealtimeChannel')),ctx);
 const rows=await ctx.loadQueueRows();assert.deepEqual(Array.from(rows,r=>r.id),['current']);assert.deepEqual(filters,[['lacorte_queue','queue_date','2026-11-17']]);
});
function rollover({role='admin',view='fila',professional='queue',modal=false,embedded=false}={}){
 let day='2026-11-16';const calls=[],events={};let blocked=modal;
 const embeddedNode={};
 const ctx={localQueueDate:()=>day,state:{role},adminView:view,professionalView:professional,
 content:{querySelector:selector=>selector==='.payment-dialog-backdrop'?(blocked?{}:null):(embedded?embeddedNode:null)},
 renderAdminQueue:target=>calls.push(target?'embedded':'admin-queue'),renderAdminOverview:()=>calls.push('overview'),renderBarberQueue:()=>calls.push('barber-queue'),
 window:{addEventListener:(name,fn)=>events[name]=fn},document:{visibilityState:'visible',addEventListener:(name,fn)=>events[name]=fn}};
 vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('let queueRealtimeChannel'),app.indexOf('function stopQueueRealtime()')),ctx);
 vm.runInContext("displayedQueueDay='2026-11-16'",ctx);
 return {calls,events,advance(){day='2026-11-17';},unblock(){blocked=false;},refresh:ctx.refreshQueueOnDayChange};
}
test('fila do administrador renova uma vez na virada, sem ir para a visão geral',()=>{
 const env=rollover();env.refresh();assert.equal(env.calls.length,0);env.advance();env.refresh();env.refresh();assert.deepEqual(env.calls,['admin-queue']);
});
test('aplicativo suspenso renova a fila ao voltar para primeiro plano',()=>{
 const env=rollover({role:'barber'});env.advance();env.events.visibilitychange();assert.deepEqual(env.calls,['barber-queue']);
});
test('visão geral e fila embutida também renovam',()=>{
 const overview=rollover({view:'overview'});overview.advance();overview.refresh();assert.deepEqual(overview.calls,['overview']);
 const settings=rollover({view:'settings',embedded:true});settings.advance();settings.refresh();assert.deepEqual(settings.calls,['embedded']);
});
test('virada aguarda fechamento do diálogo e preserva formulários de cadastro',()=>{
 const env=rollover({modal:true});env.advance();env.refresh();assert.equal(env.calls.length,0);env.unblock();env.refresh();assert.deepEqual(env.calls,['admin-queue']);
 const management=rollover({view:'manage'});management.advance();management.refresh();assert.equal(management.calls.length,0);
});

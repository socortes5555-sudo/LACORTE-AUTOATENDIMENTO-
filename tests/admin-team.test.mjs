import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

const source = readFileSync('supabase/functions/lacorte-admin-team/index.ts','utf8')
  .replace(/^import .*;\n/, '').replace('export async function', 'async function');
function setup(options = {}) {
  const events = [];
  const tables = {
    barbers: [{id:'barbeiro-1',active:true},{id:'barbeiro-jose-conceicao',email:'staff@example.test',active:true}],
    lacorte_user_roles: [{user_id:'owner',role:options.actorRole || 'admin',barber_id:'barbeiro-1'}, {user_id:'staff',role:'barber',barber_id:'barbeiro-jose-conceicao'}],
    appointments: [],lacorte_queue: [],lacorte_queue_declines: [],lacorte_queue_decline_resolutions: []
  };
  if(options.history)tables.lacorte_queue.push({barber_id:'barbeiro-jose-conceicao'});
  const db = {from(table) {
    const filters=[];let action='select',values;
    const query = {
      select(){return query;},eq(key,value){filters.push([key,value]);return query;},limit(){return query;},
      insert(value){action='insert';values=value;return query;},
      delete(){action='delete';return query;},update(value){action='update';values=value;return query;},
      async execute(single) {
        const rows=tables[table] || [];
        let matches=rows.filter(row=>filters.every(([key,value])=>row[key]===value));
        if(action==='insert') { rows.push(values);matches=[values];events.push('insert:'+table); }
        if(action==='delete') {
          events.push('delete:'+table);
          if(!options.noDelete || table!=='barbers')tables[table]=rows.filter(row=>!matches.includes(row));
          else matches=[];
        }
        if(action==='update')matches.forEach(row=>Object.assign(row,values));
        return {data:single?matches[0] || null:matches,error:null};
      },
      maybeSingle(){return query.execute(true);},single(){return query.execute(true);},
      then(resolve,reject){return query.execute(false).then(resolve,reject);}
    };
    return query;
  },auth:{admin:{
    async deleteUser(id){events.push('deleteUser:'+id);if(options.deleteError)return {error:{message:'failed'}};tables.lacorte_user_roles=tables.lacorte_user_roles.filter(row=>row.user_id!==id);return {error:null};},
    async getUserById(){return {data:{user:{email:'staff@example.test'}},error:null};},
    async createUser(){events.push('createUser');return {data:{user:{id:'new-user'}},error:null};}
  }}};
  const auth={auth:{
    async getUser(){return {data:{user:{id:'owner'}},error:null};},
    async signInWithOtp(input){events.push('send');assert.equal(input.options.shouldCreateUser,false);assert.ok(tables.lacorte_user_roles.some(row=>row.role==='barber'));return {error:options.sendError?{message:'email rate limit exceeded'}:null};}
  }};
  let handler;
  const ctx={Response,crypto:{randomUUID},createClient:(url,key)=>key==='service'?db:auth,Deno:{env:{get:key=>key==='SUPABASE_SERVICE_ROLE_KEY'?'service':'anon'},serve:fn=>handler=fn}};
  vm.runInNewContext(source,ctx);
  return {tables,events,async request(body){const response=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,...await response.json()};}};
}
test('exclui José e sua conta vinculada, preservando o administrador',async()=>{
 const env=setup();const result=await env.request({action:'delete',id:'barbeiro-jose-conceicao'});
 assert.equal(result.ok,true);assert.equal(result.deleted_id,'barbeiro-jose-conceicao');
 assert.deepEqual(env.events,['deleteUser:staff','delete:barbers']);
 assert.deepEqual(env.tables.barbers.map(b=>b.id),['barbeiro-1']);
 assert.equal(env.tables.lacorte_user_roles[0].user_id,'owner');
});
test('nunca exclui o administrador',async()=>{
 const env=setup();assert.equal((await env.request({action:'delete',id:'barbeiro-1'})).status,403);assert.deepEqual(env.events,[]);
});
test('barbeiro não pode gerenciar a equipe',async()=>{
 const env=setup({actorRole:'barber'});assert.equal((await env.request({action:'delete',id:'barbeiro-jose-conceicao'})).status,403);assert.deepEqual(env.events,[]);
});
test('exclusão sem linha afetada nunca informa sucesso',async()=>{
 const env=setup({noDelete:true});assert.equal((await env.request({action:'delete',id:'barbeiro-jose-conceicao'})).ok,undefined);
});
test('falha ao excluir conta não remove cadastro nem informa sucesso',async()=>{
 const env=setup({deleteError:true});assert.equal((await env.request({action:'delete',id:'barbeiro-jose-conceicao'})).status,400);assert.equal(env.tables.barbers.length,2);
});
test('histórico impede exclusão antes de tocar no acesso',async()=>{
 const env=setup({history:true});assert.equal((await env.request({action:'delete',id:'barbeiro-jose-conceicao'})).status,409);assert.deepEqual(env.events,[]);
});
test('convite pode ser reenviado sem duplicar o cadastro',async()=>{
 const env=setup();const result=await env.request({action:'resend_invite',id:'barbeiro-jose-conceicao'});
 assert.equal(result.invite_sent,true);assert.deepEqual(env.events,['send']);assert.equal(env.tables.barbers.length,2);
});
test('falha do e-mail é informada sem alegar convite enviado',async()=>{
 const env=setup({sendError:true});const result=await env.request({action:'resend_invite',id:'barbeiro-jose-conceicao'});
 assert.equal(result.invite_sent,false);assert.match(result.message,/NÃO foi enviado/);
});
test('cadastro vincula o acesso antes de enviar a confirmação',async()=>{
 const env=setup();const result=await env.request({action:'create',first_name:'Novo',last_name:'Teste',age:25,email:'new@example.test',commission:50});
 assert.equal(result.ok,true);assert.deepEqual(env.events,['insert:barbers','createUser','insert:lacorte_user_roles','send']);
});

const admin=readFileSync('admin.js','utf8');
const helper=admin.slice(admin.indexOf('async function runAdminTeamAction('),admin.indexOf('async function renderAdminManagement('));
function runFrontend(result,body){const ctx={db:{functions:{invoke:async()=>result}}};vm.createContext(ctx);vm.runInContext(helper,ctx);return ctx.runAdminTeamAction(body);}
test('painel não trata resposta vazia como sucesso',async()=>{
 await assert.rejects(runFrontend({data:null,error:null},{action:'delete',id:'staff'}),/não confirmou/);
});
test('painel exibe mensagem real do servidor em HTTP 409',async()=>{
 await assert.rejects(runFrontend({error:{message:'non 2xx',context:{json:async()=>({error:'Este barbeiro tem histórico.'})}}},{action:'delete',id:'staff'}),/tem histórico/);
});
test('painel exige confirmação da exclusão do mesmo barbeiro',async()=>{
 await assert.rejects(runFrontend({data:{ok:true,deleted_id:'outro'}},{action:'delete',id:'staff'}),/não confirmou/);
});

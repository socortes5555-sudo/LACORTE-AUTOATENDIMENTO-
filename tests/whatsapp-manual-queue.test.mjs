import test from "node:test";import assert from "node:assert/strict";import {requestWhatsAppOrder,whatsappMessage,whatsappShareUrl,listPendingWhatsAppOrders,approveWhatsAppOrder,myWhatsAppOrders} from "../integrations/whatsapp-manual-queue.mjs";
const db={rpc:async(name,args)=>({data:name==="lacorte_whatsapp_request"?[{order_id:"abc",service_name:"Degradê",amount:45}]:name==="lacorte_whatsapp_approve"?[{ticket_number:7,queue_id:"queue"}]:[],error:null})};
test("cria pedido e usa serviço escolhido",async()=>assert.equal((await requestWhatsAppOrder(db,"corte")).order_id,"abc"));
test("mensagem exige comprovante e não promete liberação",()=>{const s=whatsappMessage({order_id:"abc",service_name:"Degradê",amount:45});assert.match(s,/comprovante/);assert.match(s,/não libera a senha/);assert.match(whatsappShareUrl({order_id:"abc",service_name:"Degradê",amount:45}),/^https:\/\/api.whatsapp.com/);});
test("aprovação retorna senha gerada pelo servidor",async()=>assert.equal((await approveWhatsAppOrder(db,"abc")).ticket_number,7));
test("consultas retornam arrays",async()=>{assert.deepEqual(await listPendingWhatsAppOrders(db),[]);assert.deepEqual(await myWhatsAppOrders(db),[])});
test("falhas de banco são propagadas",async()=>{await assert.rejects(approveWhatsAppOrder({rpc:async()=>({error:new Error("Sem permissão")})},"abc"),/Sem permissão/)});

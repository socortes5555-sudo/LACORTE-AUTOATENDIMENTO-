// Fluxo autenticado de pedidos Pix manuais para a LaCorte.
// Requer migração 20261127221000_whatsapp_manual_queue.sql.
// Nunca use este módulo no totem público sem autenticação individual.
export async function requestWhatsAppOrder(db, serviceId) {
 if (!db || !serviceId) throw new Error("Sessão e serviço obrigatórios");
 const {data,error}=await db.rpc("lacorte_whatsapp_request",{p_service_id:serviceId});
 if(error) throw error;
 const order=data?.[0];
 if(!order?.order_id) throw new Error("Pedido não registrado");
 return order;
}
export function whatsappMessage({order_id,service_name,amount,customerName}) {
 if(!order_id || !service_name || !Number.isFinite(Number(amount))) throw new Error("Pedido inválido");
 return ["✂️ LACORTE BARBEARIA","Solicitação de entrada na fila online",
 "Pedido: "+order_id,"Cliente: "+String(customerName||"Cliente"),
 "Serviço: "+service_name,"Valor: "+Number(amount).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),
 "Vou pagar usando a chave Pix já informada nesta conversa e enviar o comprovante.",
 "Sei que o envio do comprovante não libera a senha; aguardo a confirmação da barbearia."].join("\n");
}
export function whatsappShareUrl(order) {
 return "https://api.whatsapp.com/send?text="+encodeURIComponent(whatsappMessage(order));
}
export async function listPendingWhatsAppOrders(db) {
 if(!db) throw new Error("Sessão obrigatória");
 const {data,error}=await db.rpc("lacorte_whatsapp_pending");
 if(error) throw error;
 return data||[];
}
export async function approveWhatsAppOrder(db,orderId) {
 if(!db || !orderId) throw new Error("Pedido inválido");
 const {data,error}=await db.rpc("lacorte_whatsapp_approve",{p_order_id:orderId});
 if(error) throw error;
 if(!data?.[0]?.ticket_number) throw new Error("Senha não gerada");
 return data[0];
}
export async function myWhatsAppOrders(db) {
 if(!db) throw new Error("Sessão obrigatória");
 const {data,error}=await db.rpc("lacorte_whatsapp_my_orders");
 if(error) throw error;
 return data||[];
}

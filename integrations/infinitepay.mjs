// Adaptador de checkout InfinitePay para execução exclusiva no servidor.
// Não expor este módulo no navegador. Nenhuma cobrança é criada por importação.
export const INFINITEPAY_API = "https://api.checkout.infinitepay.io";
export const INFINITEPAY_HANDLE = "lacorte_";
export function buildCheckoutPayload({orderId,items,redirectUrl,webhookUrl}) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(orderId)) throw new Error("ID do pedido inválido");
  if (!Array.isArray(items) || !items.length || items.length > 20) throw new Error("Itens inválidos");
  const normalized=items.map(item=>{
    if (!Number.isSafeInteger(item.priceCents) || item.priceCents < 100 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10 || typeof item.description !== "string" || !item.description.trim() || item.description.length > 120) throw new Error("Item inválido");
    return {description:item.description.trim(),price:item.priceCents,quantity:item.quantity};
  });
  const payload={handle:INFINITEPAY_HANDLE,order_nsu:orderId,items:normalized};
  if (redirectUrl) { const u=new URL(redirectUrl); if(u.protocol!=="https:") throw new Error("Retorno exige HTTPS"); payload.redirect_url=u.href; }
  if (webhookUrl) { const u=new URL(webhookUrl); if(u.protocol!=="https:") throw new Error("Webhook exige HTTPS"); payload.webhook_url=u.href; }
  return payload;
}
export function verifyPaymentResult(result,{expectedAmountCents,orderNsu,captureMethod="pix"}){
  // order_nsu precisa ser conferido no evento/retorno antes da consulta.
  if (!orderNsu || !Number.isSafeInteger(expectedAmountCents) || expectedAmountCents<=0) return false;
  return result?.success===true && result?.paid===true &&
    result?.capture_method===captureMethod && result?.amount===expectedAmountCents &&
    Number.isSafeInteger(result?.paid_amount) && result.paid_amount>=expectedAmountCents;
}
export async function createCheckout(payload,{fetcher=fetch,apiKey}={}){
  const headers={"Content-Type":"application/json"};
  if(apiKey) headers["X-Api-Key"]=apiKey;
  const response=await fetcher(INFINITEPAY_API+"/links",{method:"POST",headers,body:JSON.stringify(payload)});
  if(!response.ok) throw new Error("Falha ao criar checkout InfinitePay ("+response.status+")");
  const data=await response.json();
  const url=data.url ?? data.checkout_url;
  if(typeof url!=="string" || !url.startsWith("https://")) throw new Error("URL de checkout ausente");
  return {url,response:data};
}
export async function checkPayment({orderNsu,transactionNsu,slug},{fetcher=fetch,apiKey}={}){
  if(!orderNsu || !transactionNsu || !slug) throw new Error("Identificadores de pagamento incompletos");
  const headers={"Content-Type":"application/json"};
  if(apiKey) headers["X-Api-Key"]=apiKey;
  const response=await fetcher(INFINITEPAY_API+"/payment_check",{method:"POST",headers,body:JSON.stringify({handle:INFINITEPAY_HANDLE,order_nsu:orderNsu,transaction_nsu:transactionNsu,slug})});
  if(!response.ok) throw new Error("Consulta InfinitePay indisponível ("+response.status+")");
  return await response.json();
}

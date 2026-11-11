import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set(["https://socortes5555-sudo.github.io", "https://lacorte-previa-totem-pr2.wildalbatross1.chatgpt.site"]);
const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signLookup(customerId: string, expires: number, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(customerId + ":" + expires),
  );
  return base64url(new Uint8Array(signature));
}

async function verifyLookup(token: string, secret: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [customerId, expiresText, signature] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) return null;
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires < Date.now() || expires > Date.now() + 11 * 60 * 1000) return null;
  const expected = await signLookup(customerId, expires, secret);
  if (signature !== expected) return null;
  return customerId;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const isAllowedOrigin = origin !== null && allowedOrigins.has(origin);
  const responseHeaders = isAllowedOrigin ? { ...corsHeaders, "Access-Control-Allow-Origin": origin } : corsHeaders;
  function reply(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...responseHeaders, "Content-Type": "application/json" },
    });
  }
  if (req.method === "OPTIONS") {
    if (!isAllowedOrigin) return new Response("Origin não permitido.", { status: 403 });
    return new Response("ok", { headers: responseHeaders });
  }
  if (req.method !== "POST") return reply(405, { error: "Método não permitido." });
  if (!isAllowedOrigin) return reply(403, { error: "Origem não permitida." });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return reply(400, { error: "Solicitação inválida." });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply(500, { error: "Serviço indisponível." });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Limite por IP (Cloudflare) para reduzir enumeração, cadastros automatizados e abuso da fila.
  async function hashRateKey(value: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const clientIp = req.headers.get("cf-connecting-ip") || "unknown";
  const ipHash = await hashRateKey("ip:" + clientIp);
  const rateLimits: Record<string, { limit: number; window: number }> = {
    register: { limit: 15, window: 3600 },
    identify: { limit: 90, window: 600 },
    plan: { limit: 120, window: 600 },
    queue: { limit: 40, window: 600 },
  };
  const currentLimit = rateLimits[String(payload.action)];
  if (currentLimit) {
    const rate = await admin.rpc("lacorte_kiosk_rate_limit", {
      p_key_hash: ipHash,
      p_action: String(payload.action),
      p_limit: currentLimit.limit,
      p_window_seconds: currentLimit.window,
    });
    if (rate.error) return reply(503, { error: "Autoatendimento temporariamente indisponível. Tente novamente." });
    if (rate.data !== true) return reply(429, { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
  }

  if (payload.action === "identify") {
    const identifierHash = await hashRateKey("identifier:" + String(payload.identifier || "").trim().toLocaleLowerCase("pt-BR"));
    const identifierRate = await admin.rpc("lacorte_kiosk_rate_limit", {
      p_key_hash: identifierHash,
      p_action: "identify_identifier",
      p_limit: 6,
      p_window_seconds: 600,
    });
    if (identifierRate.error) return reply(503, { error: "Autoatendimento temporariamente indisponível. Tente novamente." });
    if (identifierRate.data !== true) return reply(429, { error: "Muitas tentativas para esse cadastro. Aguarde alguns minutos." });
  }

  if (payload.action === "register") {
    const firstName = String(payload.first_name || "").trim().replace(/\s+/g, " ");
    const lastName = String(payload.last_name || "").trim().replace(/\s+/g, " ");
    const rawPhone = String(payload.phone || "");
    let digits = rawPhone.replace(/\D/g, "");
    if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
    const phone = [10, 11].includes(digits.length) ? "+55" + digits : "";
    const birthDate = String(payload.birth_date || "");
    if (firstName.length < 2 || firstName.length > 80 || lastName.length < 2 || lastName.length > 100) {
      return reply(400, { error: "Informe nome e sobrenome válidos." });
    }
    if (!phone) return reply(400, { error: "Informe um telefone brasileiro válido com DDD." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || birthDate > new Date().toISOString().slice(0, 10)) {
      return reply(400, { error: "Informe uma data de nascimento válida." });
    }

    const { data: phoneExists, error: existingError } = await admin.rpc("lacorte_customer_phone_exists", {
      p_phone: phone,
    });
    if (existingError) return reply(500, { error: "Não foi possível verificar o telefone. Tente novamente." });
    if (phoneExists === true) return reply(409, { error: "Esse telefone já possui cadastro. Toque em “Já tenho cadastro” para localizar seus dados." });

    const { data: customer, error: insertError } = await admin
      .from("customers")
      .insert({
        first_name: firstName,
        last_name: lastName,
        phone,
        birth_date: birthDate,
        email: null,
        user_id: null,
        must_change_password: false,
      })
      .select("id,first_name,last_name,phone,birth_date")
      .single();
    if (insertError) {
      if (insertError.code === "23505") return reply(409, { error: "Esse telefone já possui cadastro. Toque em “Já tenho cadastro” para localizar seus dados." });
      return reply(400, { error: "Não foi possível salvar seu cadastro. Confira os dados e tente novamente." });
    }

    const expires = Date.now() + 10 * 60 * 1000;
    const signature = await signLookup(String(customer.id), expires, serviceKey);
    return reply(200, {
      customer: { id: customer.id, first_name: customer.first_name, last_name: customer.last_name, phone: customer.phone },
      lookup_token: String(customer.id) + "." + String(expires) + "." + signature,
    });
  }

  if (payload.action === "identify") {
    const identifier = String(payload.identifier || "").trim();
    const digits = identifier.replace(/\D/g, "");
    const isPhone = digits.length >= 10;
    if (identifier.length < 5 || identifier.length > 120) {
      return reply(400, { error: "Digite nome e sobrenome completos ou telefone com DDD." });
    }
    if (isPhone && ![10, 11, 12, 13].includes(digits.length)) {
      return reply(400, { error: "Telefone inválido. Informe o DDD." });
    }
    if (!isPhone && identifier.split(/\s+/).filter(Boolean).length < 2) {
      return reply(400, { error: "Digite nome e sobrenome completos." });
    }

    const { data, error } = await admin.rpc("lacorte_find_customer_for_kiosk", {
      p_identifier: identifier,
    });
    if (error) {
      const isPhoneLookup = digits.length >= 10;
      const message = error.message.includes("mais de um cadastro")
        ? (isPhoneLookup
          ? "Esse telefone está vinculado a mais de um cadastro. Procure a equipe LaCorte para corrigir a duplicidade."
          : "Encontramos nomes parecidos. Use seu telefone com DDD para localizar seu cadastro.")
        : "Não foi possível localizar esse cadastro. Confira os dados ou procure a equipe.";
      return reply(400, { error: message });
    }
    const match = Array.isArray(data) ? data[0] : data;
    if (!match) return reply(404, { error: "Cadastro não encontrado. Confira os dados ou procure a equipe." });
    const { data: customer, error: customerError } = await admin
      .from("customers")
      .select("id,first_name,last_name,phone,birth_date")
      .eq("id", match.id)
      .single();
    if (customerError || !customer) return reply(500, { error: "Não foi possível carregar os dados do cadastro." });

    const expires = Date.now() + 10 * 60 * 1000;
    const signature = await signLookup(String(customer.id), expires, serviceKey);
    return reply(200, {
      customer: {
        id: customer.id,
        first_name: customer.first_name,
        last_name: customer.last_name,
        phone: customer.phone,
      },
      lookup_token: String(customer.id) + "." + String(expires) + "." + signature,
    });
  }

  if (payload.action === "plan") {
    const customerId = await verifyLookup(String(payload.lookup_token || ""), serviceKey);
    if (!customerId) return reply(401, { error: "Sua identificação expirou. Localize seu cadastro novamente." });
    const { data: customer, error: customerError } = await admin.from("customers")
      .select("id").eq("id", customerId).is("deleted_at", null).maybeSingle();
    if (customerError) return reply(500, { error: "Não foi possível consultar o cadastro." });
    if (!customer) return reply(404, { error: "Cadastro não encontrado. Faça um novo cadastro." });
    const { data: plan, error: planError } = await admin
      .from("lacorte_customer_plans")
      .select("id,plan_id,plan_name,monthly_price,start_date,expires_at,included_cuts,used_cuts,status")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (planError) return reply(500, { error: "Não foi possível consultar seu plano." });
    let benefits: string[] = [];
    if (plan?.plan_id) {
      const { data: catalogPlan, error: catalogError } = await admin
        .from("lacorte_plans")
        .select("benefits")
        .eq("id", plan.plan_id)
        .maybeSingle();
      if (catalogError) return reply(500, { error: "Não foi possível consultar os benefícios do plano." });
      if (Array.isArray(catalogPlan?.benefits)) benefits = catalogPlan.benefits;
    }
    return reply(200, { plan, benefits });
  }

  if (payload.action === "queue") {
    const token = String(payload.lookup_token || "");
    const customerId = await verifyLookup(token, serviceKey);
    if (!customerId) return reply(401, { error: "Sua identificação expirou. Volte e localize seu cadastro novamente." });

    if (payload.participants !== undefined) {
      if (typeof payload.request_id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.request_id)) {
        return reply(400, { error: 'Solicitação inválida. Revise os serviços e tente novamente.' });
      }
      const { data, error } = await admin.rpc('lacorte_create_queue_group_kiosk', {
        p_customer_id: customerId,
        p_request_id: payload.request_id,
        p_participants: payload.participants,
      });
      if (error) return reply(400, { error: error.message || 'Não foi possível entrar na fila.' });
      if (!data) return reply(500, { error: 'A fila não retornou a senha do atendimento.' });
      return reply(200, data);
    }

    const serviceIds = payload.service_ids;
    if (!Array.isArray(serviceIds) || serviceIds.length < 1 || serviceIds.length > 13 ||
        serviceIds.some((id) => typeof id !== "string" || id.length > 80) ||
        new Set(serviceIds).size !== serviceIds.length) {
      return reply(400, { error: "Selecione serviços válidos." });
    }

    const { data, error } = await admin.rpc("lacorte_create_queue_entry_kiosk", {
      p_customer_id: customerId,
      p_service_ids: serviceIds,
    });
    if (error) return reply(400, { error: error.message || "Não foi possível entrar na fila." });
    const entry = Array.isArray(data) ? data[0] : data;
    if (!entry) return reply(500, { error: "A fila não retornou a senha do atendimento." });
    return reply(200, {
      ticket_number: entry.ticket_number,
      total_amount: entry.total_amount,
      queue_date: entry.queue_date,
    });
  }

  return reply(400, { error: "Ação inválida." });
});

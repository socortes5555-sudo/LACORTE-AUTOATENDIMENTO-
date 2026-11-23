import { createClient } from "npm:@supabase/supabase-js@2";
import { currentBrazilDate, isValidBirthDate, isValidEmail, normalizeEmail, normalizeBrazilPhone, normalizePersonName, signCustomerClaim, verifyCustomerClaim } from "./validation.mjs";

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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const authClient = anonKey ? createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) : null;

  // Limite por IP (Cloudflare) para reduzir enumeração, cadastros automatizados e abuso da fila.
  async function hashRateKey(value: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const clientIp = req.headers.get("cf-connecting-ip") || "unknown";
  const ipHash = await hashRateKey("ip:" + clientIp);
  const rateLimits: Record<string, { limit: number; window: number }> = {
    send_email_code: { limit: 6, window: 3600 },
    verify_email_code: { limit: 10, window: 600 },
    claim_legacy_customer: { limit: 8, window: 600 },
    plan: { limit: 120, window: 600 },
    queue: { limit: 40, window: 600 },
  };
  const action = String(payload.action);
  // The database rate-limit RPC accepts only its established action names.
  const rateAction = action === "send_email_code" ? "register"
    : ["verify_email_code", "claim_legacy_customer"].includes(action) ? "identify"
    : action;
  const currentLimit = rateLimits[action];
  if (currentLimit) {
    const rate = await admin.rpc("lacorte_kiosk_rate_limit", {
      p_key_hash: ipHash,
      p_action: rateAction,
      p_limit: currentLimit.limit,
      p_window_seconds: currentLimit.window,
    });
    if (rate.error) return reply(503, { error: "Autoatendimento temporariamente indisponível. Tente novamente." });
    if (rate.data !== true) return reply(429, { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
  }

  if (action === "send_email_code" || action === "verify_email_code") {
    const email = normalizeEmail(payload.email);
    if (!isValidEmail(email)) return reply(400, { error: "Informe um e-mail válido." });
    const emailRate = await admin.rpc("lacorte_kiosk_rate_limit", {
      p_key_hash: await hashRateKey("email:" + email),
      p_action: action === "send_email_code" ? "register" : "identify_identifier",
      p_limit: action === "send_email_code" ? 3 : 6,
      p_window_seconds: action === "send_email_code" ? 900 : 600,
    });
    if (emailRate.error) return reply(503, { error: "Confirmação temporariamente indisponível. Tente novamente." });
    if (emailRate.data !== true) return reply(429, { error: "Muitas tentativas para este e-mail. Aguarde alguns minutos." });
  }

  if (action === "claim_legacy_customer") {
    const phone = normalizeBrazilPhone(payload.phone);
    if (phone) {
      const claimRate = await admin.rpc("lacorte_kiosk_rate_limit", {
        p_key_hash: await hashRateKey("claim-phone:" + phone),
        p_action: "identify_identifier",
        p_limit: 4,
        p_window_seconds: 600,
      });
      if (claimRate.error) return reply(503, { error: "Vinculação temporariamente indisponível. Tente novamente." });
      if (claimRate.data !== true) return reply(429, { error: "Muitas tentativas para este telefone. Aguarde alguns minutos." });
    }
  }

  if (action === "send_email_code") {
    if (!authClient) return reply(500, { error: "Confirmação por e-mail indisponível. Procure a equipe." });
    const purpose = String(payload.purpose || "");
    if (!["register", "identify"].includes(purpose)) return reply(400, { error: "Etapa de confirmação inválida." });
    const { error } = await authClient.auth.signInWithOtp({
      email: normalizeEmail(payload.email),
      options: { shouldCreateUser: true },
    });
    if (error) return reply(503, { error: "Não foi possível enviar o código. Aguarde um minuto e tente novamente." });
    return reply(200, { ok: true });
  }

  if (action === "verify_email_code") {
    if (!authClient) return reply(500, { error: "Confirmação por e-mail indisponível. Procure a equipe." });
    const email = normalizeEmail(payload.email);
    const token = String(payload.token || "").trim();
    const purpose = String(payload.purpose || "");
    if (!isValidEmail(email) || !/^[0-9]{6}$/.test(token) || !["register", "identify"].includes(purpose)) {
      return reply(400, { error: "Informe o e-mail e o código de seis números." });
    }
    const verified = await authClient.auth.verifyOtp({ email, token, type: "email" });
    const authUser = verified.data?.user || verified.data?.session?.user;
    if (verified.error || !authUser?.id || normalizeEmail(authUser.email) !== email) {
      return reply(401, { error: "Código inválido ou expirado. Solicite outro código e tente novamente." });
    }
    const { data: staffRole, error: staffRoleError } = await admin.from("lacorte_user_roles")
      .select("user_id").eq("user_id", authUser.id).maybeSingle();
    if (staffRoleError) return reply(500, { error: "Não foi possível validar o tipo de acesso." });
    if (staffRole) return reply(403, { error: "Este e-mail pertence à equipe. Use a área dos profissionais." });

    if (purpose === "register") {
      const registration = payload.registration && typeof payload.registration === "object"
        ? payload.registration as Record<string, unknown> : {};
      const firstName = String(registration.first_name || "").trim().replace(/\s+/g, " ");
      const lastName = String(registration.last_name || "").trim().replace(/\s+/g, " ");
      const phone = normalizeBrazilPhone(registration.phone);
      const birthDate = String(registration.birth_date || "");
      if (firstName.length < 2 || firstName.length > 80 || lastName.length < 2 || lastName.length > 100) {
        return reply(400, { error: "Informe nome e sobrenome válidos." });
      }
      if (!phone) return reply(400, { error: "Informe um telefone brasileiro válido com DDD." });
      if (!isValidBirthDate(birthDate, currentBrazilDate())) return reply(400, { error: "Informe uma data de nascimento válida." });

      const [emailExisting, userExisting] = await Promise.all([
        admin.from("customers").select("id").eq("email", email).is("deleted_at", null).maybeSingle(),
        admin.from("customers").select("id").eq("user_id", authUser.id).is("deleted_at", null).maybeSingle(),
      ]);
      if (emailExisting.error || userExisting.error) return reply(500, { error: "Não foi possível verificar o cadastro. Tente novamente." });
      if (emailExisting.data || userExisting.data) return reply(409, { error: "Este e-mail já possui cadastro. Use “Já tenho cadastro” para entrar." });

      const { data: phoneExists, error: phoneError } = await admin.rpc("lacorte_customer_phone_exists", { p_phone: phone });
      if (phoneError) return reply(500, { error: "Não foi possível verificar o telefone. Tente novamente." });
      if (phoneExists === true) return reply(409, { error: "Esse telefone já possui cadastro. Use “Já tenho cadastro” para vincular seu e-mail." });

      const { data: customer, error: insertError } = await admin.from("customers").insert({
        first_name: firstName,
        last_name: lastName,
        phone,
        birth_date: birthDate,
        email,
        user_id: authUser.id,
        must_change_password: false,
      }).select("id,first_name,last_name,phone,birth_date").single();
      if (insertError) {
        if (insertError.code === "23505") return reply(409, { error: "Este e-mail ou telefone já possui cadastro. Use “Já tenho cadastro”." });
        return reply(400, { error: "Não foi possível salvar seu cadastro. Confira os dados e tente novamente." });
      }
      const expires = Date.now() + 10 * 60 * 1000;
      const signature = await signLookup(String(customer.id), expires, serviceKey);
      return reply(200, {
        customer: { id: customer.id, first_name: customer.first_name, last_name: customer.last_name, phone: customer.phone },
        lookup_token: String(customer.id) + "." + String(expires) + "." + signature,
      });
    }

    const { data: byUser, error: userLookupError } = await admin.from("customers")
      .select("id,first_name,last_name,phone,email,user_id")
      .eq("user_id", authUser.id).is("deleted_at", null).maybeSingle();
    if (userLookupError) return reply(500, { error: "Não foi possível localizar seu cadastro." });
    let customer = byUser;
    if (!customer) {
      const { data: byEmail, error: emailLookupError } = await admin.from("customers")
        .select("id,first_name,last_name,phone,email,user_id")
        .eq("email", email).is("deleted_at", null).maybeSingle();
      if (emailLookupError) return reply(500, { error: "Não foi possível localizar seu cadastro." });
      customer = byEmail;
    }
    if (!customer) {
      const claimToken = await signCustomerClaim(String(authUser.id), email, Date.now() + 5 * 60 * 1000, serviceKey);
      return reply(200, { needs_legacy_link: true, claim_token: claimToken });
    }
    if (customer.user_id && customer.user_id !== authUser.id) return reply(409, { error: "Este cadastro já está vinculado a outro acesso. Procure a equipe La Corte." });
    let linkQuery = admin.from("customers")
      .update({ email, user_id: authUser.id, updated_at: new Date().toISOString() })
      .eq("id", customer.id).is("deleted_at", null);
    linkQuery = customer.user_id ? linkQuery.eq("user_id", authUser.id) : linkQuery.is("user_id", null);
    linkQuery = customer.email ? linkQuery.eq("email", customer.email) : linkQuery.is("email", null);
    const { data: linkedCustomer, error: linkError } = await linkQuery
      .select("id,first_name,last_name,phone").maybeSingle();
    if (linkError || !linkedCustomer) return reply(409, { error: "Não foi possível vincular este e-mail. Procure a equipe La Corte." });
    const expires = Date.now() + 10 * 60 * 1000;
    const signature = await signLookup(String(linkedCustomer.id), expires, serviceKey);
    return reply(200, {
      customer: { id: linkedCustomer.id, first_name: linkedCustomer.first_name, last_name: linkedCustomer.last_name, phone: linkedCustomer.phone },
      lookup_token: String(linkedCustomer.id) + "." + String(expires) + "." + signature,
    });
  }

  if (action === "claim_legacy_customer") {
    const claim = await verifyCustomerClaim(String(payload.claim_token || ""), serviceKey);
    if (!claim) return reply(401, { error: "A confirmação expirou. Solicite um novo código por e-mail." });
    const firstName = String(payload.first_name || "").trim().replace(/\s+/g, " ");
    const lastName = String(payload.last_name || "").trim().replace(/\s+/g, " ");
    const phone = normalizeBrazilPhone(payload.phone);
    const birthDate = String(payload.birth_date || "");
    if (firstName.length < 2 || firstName.length > 80 || lastName.length < 2 || lastName.length > 100) {
      return reply(400, { error: "Informe nome e sobrenome válidos." });
    }
    if (!phone) return reply(400, { error: "Informe um telefone brasileiro válido com DDD." });
    if (!isValidBirthDate(birthDate, currentBrazilDate())) return reply(400, { error: "Informe uma data de nascimento válida." });
    const { data: customer, error: customerError } = await admin.from("customers")
      .select("id,first_name,last_name,phone,email,user_id")
      .eq("phone", phone).eq("birth_date", birthDate).is("deleted_at", null).maybeSingle();
    if (customerError) return reply(500, { error: "Não foi possível conferir o cadastro. Tente novamente." });
    if (!customer || normalizePersonName(customer.first_name) !== normalizePersonName(firstName) ||
        normalizePersonName(customer.last_name) !== normalizePersonName(lastName)) {
      return reply(404, { error: "Não encontramos um cadastro com esses dados. Confira as informações ou procure a equipe." });
    }
    if (customer.email && normalizeEmail(customer.email) !== claim.email) {
      return reply(409, { error: "Este cadastro já possui outro e-mail vinculado. Procure a equipe La Corte." });
    }
    if (customer.user_id && customer.user_id !== claim.userId) {
      return reply(409, { error: "Este cadastro já está vinculado a outro acesso. Procure a equipe La Corte." });
    }
    let linkQuery = admin.from("customers")
      .update({ email: claim.email, user_id: claim.userId, updated_at: new Date().toISOString() })
      .eq("id", customer.id).is("deleted_at", null);
    linkQuery = customer.user_id ? linkQuery.eq("user_id", claim.userId) : linkQuery.is("user_id", null);
    linkQuery = customer.email ? linkQuery.eq("email", customer.email) : linkQuery.is("email", null);
    const { data: linkedCustomer, error: linkError } = await linkQuery
      .select("id,first_name,last_name,phone").maybeSingle();
    if (linkError || !linkedCustomer) return reply(409, { error: "Não foi possível vincular seu cadastro. Procure a equipe La Corte." });
    const expires = Date.now() + 10 * 60 * 1000;
    const signature = await signLookup(String(linkedCustomer.id), expires, serviceKey);
    return reply(200, {
      customer: { id: linkedCustomer.id, first_name: linkedCustomer.first_name, last_name: linkedCustomer.last_name, phone: linkedCustomer.phone },
      lookup_token: String(linkedCustomer.id) + "." + String(expires) + "." + signature,
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
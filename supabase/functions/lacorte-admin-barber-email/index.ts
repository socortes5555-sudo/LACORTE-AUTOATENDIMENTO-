import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Método não permitido." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return reply(401, { error: "Sessão não encontrada." });

  const token = authorization.slice(7);
  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return reply(401, { error: "Sessão inválida. Entre novamente." });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: actorRole, error: actorError } = await admin
    .from("lacorte_user_roles")
    .select("role,barber_id")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (actorError || !actorRole || actorRole.role !== "admin" || actorRole.barber_id !== "barbeiro-1") {
    return reply(403, { error: "Somente o administrador da LaCorte pode gerenciar este acesso." });
  }

  let payload: { action?: string; email?: string };
  try { payload = await req.json(); } catch { return reply(400, { error: "Solicitação inválida." }); }

  const { data: targetRole, error: targetError } = await admin
    .from("lacorte_user_roles")
    .select("user_id,role,barber_id")
    .eq("role", "barber")
    .eq("barber_id", "barbeiro-2")
    .maybeSingle();

  if (targetError) return reply(500, { error: "Não foi possível consultar o acesso do profissional." });

  if (payload.action === "get") {
    if (!targetRole) return reply(200, { barber: "Barbeiro 2", current_email: "" });
    const { data: targetUser, error: userError } = await admin.auth.admin.getUserById(targetRole.user_id);
    if (userError || !targetUser.user) return reply(404, { error: "Não foi possível localizar a conta do Barbeiro 2." });
    return reply(200, { barber: "Barbeiro 2", current_email: targetUser.user.email || "" });
  }

  if (payload.action !== "update") return reply(400, { error: "Ação inválida." });
  const email = String(payload.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: "Informe um e-mail válido." });
  if (email === authData.user.email?.toLowerCase()) return reply(400, { error: "O e-mail do administrador não pode ser usado como e-mail do Barbeiro 2." });

  // After test-account removal the owner can provision a fresh professional.
  // No administrator account or existing professional data is reused.
  if (!targetRole) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, email_confirm: false,
    });
    if (createError || !created.user) {
      return reply(400, { error: "Não foi possível cadastrar o profissional: " + (createError?.message || "Conta não criada.") });
    }
    const { error: roleError } = await admin.from("lacorte_user_roles").insert({
      user_id: created.user.id, role: "barber", barber_id: "barbeiro-2",
    });
    if (roleError) {
      // Roll back the newly created Auth account if authorization was not saved.
      await admin.auth.admin.deleteUser(created.user.id);
      return reply(500, { error: "Não foi possível vincular o acesso do profissional. Tente novamente." });
    }
    const { error: codeError } = await authClient.auth.signInWithOtp({
      email, options: { shouldCreateUser: false, emailRedirectTo: "https://socortes5555-sudo.github.io/LACORTE-AUTOATENDIMENTO-/barbeiros.html?setup=1" },
    });
    return reply(200, {
      current_email: email,
      code_sent: !codeError,
      message: codeError
        ? "Profissional cadastrado. Não foi possível enviar o código agora. Ele pode solicitar o código em PRIMEIRO ACESSO? CRIAR MINHA SENHA."
        : "Profissional cadastrado e confirmação enviada ao e-mail informado. Na área profissional, ele deve usar PRIMEIRO ACESSO? CRIAR MINHA SENHA, confirmar o e-mail e definir a própria senha.",
    });
  }

  const { data: targetUser, error: userError } = await admin.auth.admin.getUserById(targetRole.user_id);
  if (userError || !targetUser.user) return reply(404, { error: "Não foi possível localizar a conta do Barbeiro 2." });
  if (targetUser.user.email?.toLowerCase() === email) {
    const { error: codeError } = await authClient.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: "https://socortes5555-sudo.github.io/LACORTE-AUTOATENDIMENTO-/barbeiros.html?setup=1" } });
    return reply(200, { current_email: email, code_sent: !codeError,
      message: codeError ? "Este e-mail já está cadastrado. Solicite o código em PRIMEIRO ACESSO? CRIAR MINHA SENHA." : "Confirmação enviada ao e-mail cadastrado. O profissional pode confirmar o e-mail e criar a senha pelo primeiro acesso." });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(targetRole.user_id, {
    email,
    email_confirm: true,
  });
  if (updateError) return reply(400, { error: "Não foi possível trocar o e-mail: " + updateError.message });

  return reply(200, {
    message: "E-mail atualizado. O Barbeiro 2 deverá usar PRIMEIRO ACESSO? CRIAR MINHA SENHA na tela profissional para receber o código neste endereço e cadastrar a própria senha.",
    current_email: email,
  });
});

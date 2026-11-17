import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const headers = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const respond = (status, body) => new Response(JSON.stringify(body), {status, headers:{...headers,"Content-Type":"application/json"}});
const redirectTo = "https://socortes5555-sudo.github.io/LACORTE-AUTOATENDIMENTO-/barbeiros.html?setup=1";

export async function handleTeamRequest(req) {
  if (req.method === "OPTIONS") return new Response("ok", {headers});
  if (req.method !== "POST") return respond(405, {error:"Método inválido."});
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
    if (!token) return respond(401, {error:"Sessão ausente."});
    const options = {auth:{persistSession:false,autoRefreshToken:false}};
    const auth = createClient(url, Deno.env.get("SUPABASE_ANON_KEY"), options);
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), options);
    const {data:{user},error:authError} = await auth.auth.getUser(token);
    if (authError || !user) return respond(401, {error:"Sessão inválida. Entre novamente."});
    const actor = await db.from("lacorte_user_roles").select("role,barber_id").eq("user_id",user.id).maybeSingle();
    if (actor.error || actor.data?.role !== "admin" || actor.data.barber_id !== "barbeiro-1") return respond(403, {error:"Apenas o administrador pode gerenciar a equipe."});
    let body;
    try { body = await req.json(); } catch { return respond(400, {error:"Dados inválidos."}); }
    if (!body || typeof body !== "object") return respond(400, {error:"Dados inválidos."});

    const sendInvite = async (id, email) => {
      const {error} = await auth.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:redirectTo}});
      return respond(200, {ok:true,id,invite_sent:!error,message:error
        ? "Cadastro salvo, mas o convite NÃO foi enviado: " + error.message + ". Use REENVIAR CONVITE para tentar novamente."
        : "Confirmação enviada ao e-mail cadastrado. O profissional deve confirmar o e-mail e criar a própria senha."});
    };

    if (body.action === "create") {
      const first = String(body.first_name || "").trim(), last = String(body.last_name || "").trim();
      const email = String(body.email || "").trim().toLowerCase(), age = Number(body.age), commission = Number(body.commission ?? 50);
      if (!first || !last || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isInteger(age) || age < 16 || age > 110 || !Number.isFinite(commission) || commission < 0 || commission > 100) return respond(400,{error:"Confira nome, sobrenome, idade, e-mail e comissão."});
      const existing = await db.from("barbers").select("id").eq("email",email).maybeSingle();
      if (existing.error) return respond(500,{error:"Não foi possível conferir o e-mail cadastrado."});
      if (existing.data) return respond(409,{error:"Este e-mail já possui cadastro. Use REENVIAR CONVITE na lista de barbeiros."});
      const id = "barbeiro-" + crypto.randomUUID();
      const inserted = await db.from("barbers").insert({id,name:first+" "+last,first_name:first,last_name:last,age,email,active:true,commission_percent:commission});
      if (inserted.error) return respond(400,{error:inserted.error.message});
      // Save the account and permission before sending any login link.
      const created = await db.auth.admin.createUser({email,email_confirm:false});
      if (created.error || !created.data?.user) {
        const rollback = await db.from("barbers").delete().eq("id",id).select("id").single();
        return respond(400,{error:(rollback.error ? "Falha ao desfazer o cadastro. " : "") + "Não foi possível criar o acesso: " + (created.error?.message || "Conta não criada.")});
      }
      const link = await db.from("lacorte_user_roles").insert({user_id:created.data.user.id,role:"barber",barber_id:id});
      if (link.error) {
        const removedUser = await db.auth.admin.deleteUser(created.data.user.id);
        const removedBarber = await db.from("barbers").delete().eq("id",id).select("id").single();
        return respond(500,{error:removedUser.error || removedBarber.error ? "Falha ao vincular e desfazer o cadastro. Contate o administrador." : "Falha ao vincular acesso. O cadastro foi desfeito; tente novamente."});
      }
      return await sendInvite(id,email);
    }

    if (!["delete","update","resend_invite"].includes(body.action)) return respond(400,{error:"Ação inválida."});
    const id = String(body.id || "");
    if (!id || id === "barbeiro-1") return respond(403,{error:"A conta do administrador é protegida."});
    const found = await db.from("barbers").select("id,name,email,active,commission_percent").eq("id",id).maybeSingle();
    if (found.error) return respond(500,{error:"Não foi possível consultar o barbeiro."});
    if (!found.data) return respond(404,{error:"Barbeiro não encontrado."});
    const links = await db.from("lacorte_user_roles").select("user_id,role").eq("barber_id",id);
    if (links.error) return respond(500,{error:"Não foi possível conferir a conta vinculada."});
    if (links.data?.some(link => link.role === "admin" || link.user_id === user.id)) return respond(403,{error:"A conta do administrador é protegida."});

    if (body.action === "resend_invite") {
      if (!found.data.active) return respond(409,{error:"Ative o profissional antes de reenviar o convite."});
      if (links.data?.length !== 1) return respond(409,{error:"Conta de acesso não encontrada. Exclua o cadastro sem histórico e cadastre novamente."});
      const account = await db.auth.admin.getUserById(links.data[0].user_id);
      if (account.error || !account.data?.user?.email) return respond(404,{error:"Conta de acesso não encontrada."});
      return await sendInvite(id,account.data.user.email);
    }

    if (body.action === "delete") {
      for (const table of ["appointments","lacorte_queue","lacorte_queue_declines","lacorte_queue_decline_resolutions"]) {
        const history = await db.from(table).select("barber_id").eq("barber_id",id).limit(1);
        if (history.error) return respond(500,{error:"Não foi possível conferir o histórico. Exclusão cancelada."});
        if (history.data?.length) return respond(409,{error:"Este barbeiro tem histórico de atendimento. Desmarque Profissional ativo para desligá-lo preservando os relatórios."});
      }
      for (const link of links.data || []) {
        const removed = await db.auth.admin.deleteUser(link.user_id);
        if (removed.error) return respond(400,{error:"Não foi possível excluir a conta de acesso: " + removed.error.message});
      }
      const removed = await db.from("barbers").delete().eq("id",id).select("id").single();
      if (removed.error || removed.data?.id !== id) return respond(400,{error:"A exclusão do cadastro não foi confirmada. Atualize a lista e tente novamente."});
      const check = await db.from("barbers").select("id").eq("id",id).maybeSingle();
      if (check.error || check.data) return respond(500,{error:"A exclusão não pôde ser confirmada. Atualize a lista."});
      return respond(200,{ok:true,deleted_id:id,message:"Barbeiro e conta de acesso excluídos."});
    }

    const first = String(body.first_name || "").trim(), last = String(body.last_name || "").trim();
    const age = Number(body.age), commission = Number(body.commission ?? found.data.commission_percent);
    if (!first || !last || !Number.isInteger(age) || age < 16 || age > 110 || !Number.isFinite(commission) || commission < 0 || commission > 100) return respond(400,{error:"Confira nome, sobrenome, idade e comissão."});
    const updated = await db.from("barbers").update({name:first+" "+last,first_name:first,last_name:last,age,commission_percent:commission,active:body.active===true}).eq("id",id).select("id").single();
    if (updated.error || updated.data?.id !== id) return respond(400,{error:"A alteração não foi salva. Atualize a lista e tente novamente."});
    return respond(200,{ok:true,message:body.active ? "Profissional atualizado e ativo." : "Profissional desativado. Histórico preservado."});
  } catch {
    return respond(500,{error:"Falha ao processar a solicitação. Atualize a lista antes de tentar novamente."});
  }
}

Deno.serve(handleTeamRequest);

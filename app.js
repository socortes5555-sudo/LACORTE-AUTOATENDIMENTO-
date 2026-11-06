
const SUPABASE_URL = "https://xwctsfpqwugygxpsrcfw.supabase.co";
const SUPABASE_KEY = "sb_publishable_L274hUI6sbyDGFe7u40U-Q_tK28Oh5s";

const db = window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { detectSessionInUrl: false, flowType: "implicit" } }) : null;
const STAFF_PORTAL = /\/barbeiros(?:\.html)?\/?$/i.test(window.location.pathname);

const services = [
  {id:"corte",name:"Corte",detail:"Corte tradicional ou degradê",price:45},
  {id:"barba",name:"Barba",detail:"Desenho e acabamento",price:40},
  {id:"sobrancelha",name:"Sobrancelha",detail:"Limpeza e alinhamento",price:15},
  {id:"bigode",name:"Bigode",detail:"Aparar e alinhar",price:15},
  {id:"pezinho",name:"Pezinho",detail:"Acabamento",price:15},
  {id:"raspar",name:"Raspar",detail:"Raspagem completa",price:25},
  {id:"cavanhaque",name:"Cavanhaque",detail:"Desenho e acabamento",price:35},
  {id:"corte-barba",name:"Corte e barba",detail:"Combo especial",price:80},
  {id:"corte-barba-sobrancelha",name:"Corte, barba e sobrancelha",detail:"Combo completo",price:90},
  {id:"corte-sobrancelha",name:"Corte e sobrancelha",detail:"Combo especial",price:55},
  {id:"corte-bigode",name:"Corte e bigode",detail:"Combo especial",price:55},
  {id:"corte-cavanhaque",name:"Corte e cavanhaque",detail:"Combo especial",price:65},
  {id:"raspar-barba",name:"Raspar e barba",detail:"Combo especial",price:55}
];

const barbers = [
  {id:"barbeiro-1",name:"Barbeiro 01",available:true},
  {id:"barbeiro-2",name:"Barbeiro 02",available:true},
  {id:"barbeiro-3",name:"Barbeiro 03",available:false}
];

const state = {
  step:1,
  user:null,
  customer:null,
  selectedServices:[],
  message:"",
  customerPlan:null,
  customerPlanBenefits:[]
};

const content = document.querySelector("#step-content");
const actions = document.querySelector("#step-actions");
const notice = document.querySelector("#demo-notice");

let customerAutoLogoutTimer = null;
const CUSTOMER_AUTO_LOGOUT_MS = 30 * 1000;

function clearCustomerAutoLogout(){
  if(customerAutoLogoutTimer !== null){
    clearTimeout(customerAutoLogoutTimer);
    customerAutoLogoutTimer = null;
  }
}

async function logoutCurrentSession(){
  clearCustomerAutoLogout();
  const button = actions.querySelector("button");
  if(button) button.disabled = true;
  try {
    const result = await db.auth.signOut({scope:"local"});
    if(result.error) throw result.error;
    // SIGNED_OUT limpa o estado da tela pelo listener do Supabase.
  } catch(error) {
    if(button) button.disabled = false;
    showMessage("Não foi possível encerrar a sessão. Toque em SAIR DA CONTA para tentar novamente. " + (error.message || ""));
    if(state.role === "customer"){
      notice.textContent = "A sessão continua ativa. Encerre manualmente para liberar o totem.";
    }
  }
}

function money(value){
  return value.toLocaleString("pt-BR",{
    style:"currency",
    currency:"BRL"
  });
}

function safe(value){
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  })[char]);
}

function setHeader(kicker,title,description){
  const kickerEl = document.querySelector("#step-kicker");
  const titleEl = document.querySelector("#step-title");
  const descriptionEl = document.querySelector("#step-description");
  if (kickerEl) kickerEl.textContent = kicker;
  if (titleEl) titleEl.textContent = title;
  if (descriptionEl) descriptionEl.textContent = description;
}

function updateProgress(){
  document.querySelectorAll("[data-progress]").forEach(el=>{
    const n=Number(el.dataset.progress);
    el.classList.toggle("active",n===state.step);
    el.classList.toggle("done",n<state.step);
  });
}

function makeButton(label,fn,secondary=false,disabled=false){
  const b=document.createElement("button");
  b.className="btn "+(secondary?"btn-secondary":"btn-primary");
  b.textContent=label;
  b.disabled=disabled;
  b.addEventListener("click",fn);
  return b;
}

function setActions(back,next,nextLabel="CONTINUAR",disabled=false){
  actions.replaceChildren();

  if(back){
    actions.append(makeButton("VOLTAR",back,true));
  }

  if(next){
    actions.append(makeButton(nextLabel,next,false,disabled));
  }
}

function showMessage(message){
  state.message=message;
  const el=document.querySelector("#app-message");
  if(el) el.textContent=message;
}

function render(){
  updateProgress();

  notice.textContent =
    "Cadastro protegido. Não há pagamento online neste atendimento.";

  if(state.step===1) renderLogin();
  if(state.step===2) renderProfile();
  if(state.step===3) renderServices();
  if(state.step===4) renderConfirmation();
}

function renderLogin(){
  setHeader('PRIMEIRO ACESSO','Bem-vindo à LaCorte','Cadastre-se com seu e-mail. O código será solicitado somente no primeiro acesso.');
  content.innerHTML='<form id="login-form"><label for="email">Seu e-mail</label><input id="email" name="email" type="email" placeholder="seuemail@exemplo.com" autocomplete="email" value="'+safe(state.pendingEmail||'')+'" required><button class="btn btn-secondary" id="send-code-button" type="button">ENVIAR CÓDIGO DO PRIMEIRO ACESSO</button><label for="email-code">Código recebido por e-mail</label><input id="email-code" name="token" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000000"><p class="muted">Nas próximas visitas, basta se identificar.</p><p id="app-message" class="muted">'+safe(state.message)+'</p><button class="btn btn-primary" id="verify-code-button" type="submit">CONFIRMAR CADASTRO</button><button class="btn btn-secondary" id="existing-customer-button" type="button">JÁ TENHO CADASTRO</button></form>';
  actions.replaceChildren();
  document.querySelector('#existing-customer-button').addEventListener('click',renderReturningCustomerLookup);
  document.querySelector('#send-code-button').addEventListener('click',async function(){
    const email=document.querySelector('#email').value.trim();if(!email){showMessage('Informe seu e-mail primeiro.');return;}
    this.disabled=true;showMessage('Verificando se já existe cadastro...');const existing=await db.rpc('lacorte_find_customer_for_kiosk',{p_identifier:email});if(existing.error){this.disabled=false;showMessage('Não foi possível verificar o cadastro: '+existing.error.message);return;}if(existing.data&&existing.data.length){this.disabled=false;showMessage('Este e-mail já possui cadastro. Use o botão JÁ TENHO CADASTRO para entrar sem novo código.');return;}showMessage('Enviando código...');const result=await db.auth.signInWithOtp({email:email,options:{shouldCreateUser:true}});this.disabled=false;
    if(result.error){showMessage('Erro ao enviar código: '+result.error.message);return;}state.pendingEmail=email;showMessage('Código enviado. Digite os 6 números acima.');document.querySelector('#email-code').focus();
  });
  document.querySelector('#login-form').addEventListener('submit',async function(e){
    e.preventDefault();const email=document.querySelector('#email').value.trim(),token=document.querySelector('#email-code').value.trim();
    if(!/^[0-9]{6}$/.test(token)){showMessage('Digite os 6 números do código recebido.');return;}
    const button=document.querySelector('#verify-code-button');button.disabled=true;showMessage('Validando primeiro acesso...');
    const result=await db.auth.verifyOtp({email:email,token:token,type:'email'});
    if(result.error){button.disabled=false;showMessage('Não foi possível validar: '+result.error.message);return;}
    state.pendingEmail='';try{if(result.data&&result.data.session){const saved=await db.auth.setSession({access_token:result.data.session.access_token,refresh_token:result.data.session.refresh_token});if(saved.error)throw saved.error;}
      const session=await db.auth.getSession(),user=(session.data&&session.data.session&&session.data.session.user)||(result.data&&result.data.user);
      if(user)await routeAuthenticatedUser(user);else showMessage('Código confirmado, mas a sessão não foi salva.');
    }catch(err){showMessage('Não foi possível abrir o cadastro: '+(err.message||err));}
  });
}

function renderReturningCustomerLookup(){
  setHeader('CLIENTE CADASTRADO','Identifique-se','Informe telefone, e-mail ou nome completo. Não será enviado novo código.');
  content.innerHTML='<form id="returning-form"><label for="customer-identifier">Telefone, e-mail ou nome completo</label><input id="customer-identifier" autocomplete="off" placeholder="Ex.: (48) 99999-9999 ou João Silva" required><p id="app-message" class="muted">'+safe(state.message)+'</p><button class="btn btn-primary" type="submit">LOCALIZAR MEU CADASTRO</button><button class="btn btn-secondary" id="back-first-access" type="button">PRIMEIRO ACESSO / CADASTRAR</button></form>';
  actions.replaceChildren();document.querySelector('#back-first-access').addEventListener('click',renderLogin);
  document.querySelector('#returning-form').addEventListener('submit',async function(e){
    e.preventDefault();const identifier=document.querySelector('#customer-identifier').value.trim(),button=this.querySelector('[type="submit"]');button.disabled=true;showMessage('Localizando cadastro...');
    const result=await db.rpc('lacorte_find_customer_for_kiosk',{p_identifier:identifier});button.disabled=false;
    if(result.error){showMessage('Não foi possível localizar: '+result.error.message);return;}
    const customer=Array.isArray(result.data)?result.data[0]:result.data;if(!customer){showMessage('Cadastro não encontrado. Confira os dados ou faça o primeiro cadastro.');return;}
    state.user=null;state.customer=customer;state.customerPlan=customer.customer_plan||null;state.customerPlanBenefits=state.customerPlan&&Array.isArray(state.customerPlan.benefits)?state.customerPlan.benefits:[];state.selectedServices=[];state.queueTicket=null;state.role='customer';state.message='';setAppMode(false);state.step=3;render();
  });
}

function renderProfile(){
  setHeader(
    "ETAPA 02",
    state.customer?"Seus dados":"Complete seu cadastro",
    "Precisamos destas informações para identificar você nas próximas visitas."
  );

  const c=state.customer||{};

  content.innerHTML=`
    <form id="profile-form">
      <label for="first_name">Nome</label>
      <input id="first_name" required maxlength="80"
        value="${safe(c.first_name||"")}" placeholder="Seu nome">

      <label for="last_name">Sobrenome</label>
      <input id="last_name" required maxlength="100"
        value="${safe(c.last_name||"")}" placeholder="Seu sobrenome">

      <label for="phone">Telefone com DDD</label>
      <input id="phone" required type="tel" maxlength="20"
        value="${safe(c.phone||"")}" placeholder="(48) 99999-9999">

      <label for="profile-email">E-mail</label>
      <input id="profile-email" type="email" readonly
        value="${safe(state.user.email)}">

      <label for="birth_date">Data de aniversário</label>
      <input id="birth_date" type="date" required
        value="${safe(c.birth_date||"")}">

      <p id="app-message" class="muted">${safe(state.message)}</p>

      <button class="btn btn-primary" type="submit">
        SALVAR E CONTINUAR
      </button>
    </form>
  `;

  setActions(
    ()=>{state.step=1;render();},
    null
  );

  document.querySelector("#profile-form").addEventListener("submit",async e=>{
    e.preventDefault();

    const customer={
      user_id:state.user.id,
      first_name:document.querySelector("#first_name").value.trim(),
      last_name:document.querySelector("#last_name").value.trim(),
      phone:document.querySelector("#phone").value.replace(/\D/g,""),
      email:state.user.email,
      birth_date:document.querySelector("#birth_date").value
    };

    if(customer.phone.length<10){
      showMessage("Informe um telefone válido com DDD.");
      return;
    }

    showMessage("Salvando cadastro...");

    const {data,error}=await db
      .from("customers")
      .upsert(customer,{onConflict:"user_id"})
      .select()
      .single();

    if(error){
      showMessage(
        error.code==="23505"
          ?"Este telefone já está cadastrado. Precisamos verificar esse cadastro."
          :"Não foi possível salvar: "+error.message
      );
      return;
    }

    state.customer=data;
    state.message="";
    state.step=3;
    render();
  });
}

function renderCustomerPlanCard(){
  const plan = state.customerPlan;
  if(!plan) return '<section class="summary"><h3>MEU PLANO LACORTE</h3><p class="muted">Você não possui uma assinatura registrada no momento.</p></section>';
  const today = localQueueDate();
  const expiredByDate = plan.expires_at < today;
  const remaining = Math.max(0,Number(plan.included_cuts)-Number(plan.used_cuts));
  const status = plan.status === "suspended" ? "Suspenso" :
    (expiredByDate || plan.status === "expired" ? "Vencido" :
    (remaining === 0 || plan.status === "exhausted" ? "Cortes esgotados" : "Ativo"));
  const benefits = state.customerPlanBenefits || [];
  return '<section class="summary"><h3>MEU PLANO LACORTE</h3>' +
    '<p><strong>'+safe(plan.plan_name)+'</strong></p>' +
    '<div class="summary-row"><span>Valor mensal</span><strong>'+money(Number(plan.monthly_price))+'</strong></div>' +
    '<div class="summary-row"><span>Validade</span><strong>'+safe(plan.start_date)+' até '+safe(plan.expires_at)+'</strong></div>' +
    '<div class="summary-row"><span>Cortes utilizados</span><strong>'+Number(plan.used_cuts)+' de '+Number(plan.included_cuts)+'</strong></div>' +
    '<div class="summary-row"><span>Cortes restantes</span><strong>'+remaining+'</strong></div>' +
    '<div class="summary-row"><span>Status</span><strong>'+status+'</strong></div>' +
    (benefits.length ? '<p><strong>Benefícios</strong></p><ul>'+benefits.map(function(b){return '<li>'+safe(b)+'</li>';}).join('')+'</ul>' : '') +
    '</section>';
}

function renderServices(){
  setHeader('ETAPA 02','Escolha seus serviços','Selecione um ou mais serviços. A fila é compartilhada entre os barbeiros.');
  content.innerHTML=renderCustomerPlanCard()+'<div class="grid" id="choices"></div>';const grid=document.querySelector('#choices');
  services.forEach(function(s){const el=document.createElement('button');el.className='choice'+(state.selectedServices.some(x=>x.id===s.id)?' selected':'');el.innerHTML='<span class="name">'+safe(s.name)+'</span><span class="detail">'+safe(s.detail)+'</span><span class="price">'+money(s.price)+'</span>';el.onclick=function(){const exists=state.selectedServices.some(x=>x.id===s.id);state.selectedServices=exists?state.selectedServices.filter(x=>x.id!==s.id):state.selectedServices.concat([s]);renderServices();};grid.append(el);});
  const preview=getCustomerPlanPreview(),total=preview?preview.total:state.selectedServices.reduce((sum,s)=>sum+Number(s.price),0);
  const totalEl=document.createElement('div');totalEl.className='summary';totalEl.innerHTML='<div class="summary-row"><span>Serviços selecionados</span><strong>'+state.selectedServices.length+'</strong></div>'+(preview?'<p class="muted">'+safe(preview.description)+'</p>':'')+'<div class="summary-row summary-total"><span>Total</span><strong>'+money(total)+'</strong></div>';content.append(totalEl);
  setActions(function(){state.step=1;render();},function(){state.step=4;render();},'REVISAR SOLICITAÇÃO',state.selectedServices.length===0);
}

function renderConfirmation(){
  setHeader('ETAPA 03','Confira sua solicitação','Confirme seus dados e serviços antes de entrar na fila.');
  const preview=getCustomerPlanPreview(),total=preview?preview.total:state.selectedServices.reduce((sum,s)=>sum+Number(s.price),0);
  content.innerHTML='<div class="summary"><div class="summary-row"><span>Cliente</span><strong>'+safe((state.customer.first_name||'')+' '+(state.customer.last_name||''))+'</strong></div><div class="summary-row"><span>Telefone</span><strong>'+safe(state.customer.phone||'—')+'</strong></div><div class="summary-row"><span>E-mail</span><strong>'+safe(state.customer.email||'—')+'</strong></div></div><div class="summary"><strong>Serviços</strong>'+state.selectedServices.map(function(s){return '<div class="summary-row"><span>'+safe(s.name)+'</span><strong>'+money(s.price)+'</strong></div>';}).join('')+(preview?'<p class="muted">'+safe(preview.description)+'</p>':'')+'<div class="summary-row summary-total"><span>Total</span><strong>'+money(total)+'</strong></div></div><p class="muted">Você não escolhe barbeiro nem forma de pagamento. Ao confirmar, sua senha entra na fila única da LaCorte.</p><p id="app-message" class="muted">'+safe(state.message)+'</p>';
  setActions(function(){state.step=3;renderServices();},submitQueueEntry,'ENTRAR NA FILA',state.submitting);
}

async function loadCustomer(user){
  state.user=user;

  const {data,error}=await db
    .from("customers")
    .select("*")
    .eq("user_id",user.id)
    .maybeSingle();

  if(error){
    state.message="Erro ao consultar cadastro: "+error.message;
    state.step=2;
    render();
    return;
  }

  state.customer=data;
  state.customerPlan=null;
  state.customerPlanBenefits=[];

  if(data){
    const planResult = await db.from("lacorte_customer_plans")
      .select("*")
      .eq("customer_id",data.id)
      .order("created_at",{ascending:false})
      .limit(1)
      .maybeSingle();
    if(planResult.error){
      state.message="Não foi possível consultar seu plano: "+planResult.error.message;
    } else if(planResult.data){
      state.customerPlan=planResult.data;
      if(planResult.data.plan_id){
        const benefitResult=await db.from("lacorte_plans")
          .select("benefits")
          .eq("id",planResult.data.plan_id)
          .maybeSingle();
        if(!benefitResult.error && benefitResult.data && Array.isArray(benefitResult.data.benefits)){
          state.customerPlanBenefits=benefitResult.data.benefits;
        }
      }
    }
    state.step=3;
  }else{
    state.step=2;
  }

  if(!state.message) state.message="";
  render();
}

async function init(){
  if(!window.supabase){
    content.textContent="Não foi possível carregar a conexão com o Supabase.";
    return;
  }

  const {data,error}=await db.auth.getSession();

  if(error){
    state.message="Erro ao verificar acesso: "+error.message;
  }

  if(data.session){
    await loadCustomer(data.session.user);
  }else{
    render();
  }

  db.auth.onAuthStateChange(async(event,session)=>{
    if(event==="SIGNED_IN"&&session){
      await loadCustomer(session.user);
    }

    if(event==="SIGNED_OUT"){
      state.user=null;
      state.customer=null;
      state.selectedServices=[];
      state.step=1;
      render();
    }
  });
}

// init(); // substituído pelo roteamento por perfil abaixo



// ===== LA CORTE: roteamento por perfil e fila real =====
state.role = null;
state.barberId = null;
state.queueTicket = null;
state.submitting = false;

function setAppMode(dashboard){
  const hero = document.querySelector(".hero");
  const progress = document.querySelector(".progress");
  if (hero) hero.style.display = dashboard ? "none" : "";
  if (progress) progress.style.display = dashboard ? "none" : "";
  document.body.classList.toggle("admin-dashboard",!!dashboard && state.role==="admin");
  document.body.classList.toggle("professional-dashboard",!!dashboard && state.role==="barber");
}

function localQueueDate(){
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = {};
  parts.forEach(p => { values[p.type] = p.value; });
  return values.year + "-" + values.month + "-" + values.day;
}

function formatDateTime(value){
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short"
  });
}

function statusLabel(status){
  return ({
    waiting: "Aguardando",
    in_progress: "Em atendimento",
    completed: "Concluído",
    cancelled: "Cancelado"
  })[status] || status;
}

function dashboardActions(){
 actions.replaceChildren();
 if(state.barberId && (state.role==='barber' || state.role==='admin')) {
   actions.append(makeButton(state.role==='admin'?'MEUS RELATÓRIOS • BARBEIRO 1':'MEUS RELATÓRIOS',renderBarberReports,true));
 }
 actions.append(makeButton('SAIR DA CONTA',async function(){await db.auth.signOut();},true));
}

async function loadCatalogs(){
  const results = await Promise.all([
    db.from("services").select("id,name,detail,price,active").eq("active", true).order("name"),
    db.from("barbers").select("id,name,active").eq("active", true).order("name")
  ]);

  if (results[0].error) throw new Error("Não foi possível carregar os serviços: " + results[0].error.message);
  if (results[1].error) throw new Error("Não foi possível carregar os barbeiros: " + results[1].error.message);

  services.splice(0, services.length, ...(results[0].data || []).map(function(s){
    return { id: s.id, name: s.name, detail: s.detail || "", price: Number(s.price) };
  }));

  barbers.splice(0, barbers.length, ...(results[1].data || []).map(function(b){
    return { id: b.id, name: b.name, available: true };
  }));
}

async function loadQueueRows(){
 const result=await db.from('lacorte_queue').select('id,customer_id,barber_id,queue_date,queue_number,status,total_amount,commission_amount,payment_method,created_at,started_at,completed_at').eq('queue_date',localQueueDate()).order('queue_number',{ascending:true});
 if(result.error)throw new Error('Erro ao consultar fila: '+result.error.message);const rows=result.data||[];if(!rows.length)return [];
 const customerIds=Array.from(new Set(rows.map(r=>r.customer_id))),queueIds=rows.map(r=>r.id);
 const lookups=await Promise.all([db.from('customers').select('id,first_name,last_name,phone').in('id',customerIds),db.from('lacorte_queue_items').select('queue_id,service_name,unit_price').in('queue_id',queueIds)]);
 if(lookups[0].error)throw new Error('Erro ao consultar clientes: '+lookups[0].error.message);if(lookups[1].error)throw new Error('Erro ao consultar serviços: '+lookups[1].error.message);
 const customers={},items={};(lookups[0].data||[]).forEach(c=>customers[c.id]=c);(lookups[1].data||[]).forEach(i=>(items[i.queue_id]||(items[i.queue_id]=[])).push(i));
 return rows.map(r=>Object.assign({},r,{customer:customers[r.customer_id]||null,items:items[r.id]||[]}));
}


// Navegação do profissional: fila e relatórios em telas independentes.
let professionalView = "queue";
function professionalNavigation(view){
  professionalView = view || professionalView;
  const item = (key,label,icon) => '<button type="button" class="professional-nav-item '+(professionalView===key?'active':'')+'" data-professional-view="'+key+'"><span class="professional-nav-icon" aria-hidden="true">'+icon+'</span><span>'+label+'</span></button>';
  return '<nav class="professional-nav" aria-label="Navegação profissional"><div class="professional-nav-brand"><span class="professional-brand-mark">LC</span><span><strong>LA CORTE</strong><small>ÁREA PROFISSIONAL</small></span></div><div class="professional-nav-items">'+item("queue","Fila compartilhada","▦")+item("reports","Meus relatórios","▤")+'</div></nav>';
}
function bindProfessionalNavigation(){
  content.querySelectorAll("[data-professional-view]").forEach(function(button){
    button.addEventListener("click",function(){
      professionalView=button.dataset.professionalView;
      if(professionalView==="reports") renderBarberReports();
      else renderQueueDashboard();
    });
  });
}

function renderQueueDashboard(){
 setAppMode(true);updateProgress();const admin=state.role==='admin';
 setHeader(admin?'ADMINISTRAÇÃO LACORTE':'PAINEL DO PROFISSIONAL',admin?'Painel central':'Fila compartilhada',admin?'Visão geral dos atendimentos de hoje.':'Escolha qualquer cliente aguardando para iniciar o atendimento.');
 notice.textContent='Fila presencial • Sem pagamento online.';content.innerHTML='<p class="muted">Carregando fila compartilhada...</p>';dashboardActions();actions.prepend(makeButton('ATUALIZAR FILA',renderQueueDashboard,true));
 loadQueueRows().then(rows=>{if(!content.isConnected)return;const waiting=rows.filter(r=>r.status==='waiting').length,progress=rows.filter(r=>r.status==='in_progress').length,completed=rows.filter(r=>r.status==='completed').length;let html=admin?adminNavigation():professionalNavigation('queue');
 html+='<div class="admin-kpis"><article><span>AGUARDANDO</span><strong>'+waiting+'</strong><small>Fila compartilhada</small></article><article><span>EM ATENDIMENTO</span><strong>'+progress+'</strong><small>Com os profissionais</small></article><article><span>CONCLUÍDOS HOJE</span><strong>'+completed+'</strong><small>Finalizados</small></article><article><span>TOTAL DO DIA</span><strong>'+rows.length+'</strong><small>Todos os registros</small></article></div><div class="admin-agenda-heading"><div><small>FILA ÚNICA</small><h3>Clientes por ordem de chegada</h3></div><span>'+waiting+' aguardando</span></div>';
 if(!rows.length)html+='<div class="summary"><p class="muted">Ainda não há clientes na fila hoje.</p></div>';
 rows.forEach(row=>{const c=row.customer||{},name=(c.first_name||'Cliente')+' '+(c.last_name||''),barber=barbers.find(b=>b.id===row.barber_id),serviceText=row.items.map(i=>safe(i.service_name)+' ('+money(Number(i.unit_price))+')').join(', ')||'—',cls=row.status==='completed'?'done':row.status==='in_progress'?'progress':row.status==='cancelled'?'cancelled':'waiting';
 html+='<article class="summary admin-queue-card '+cls+'"><div class="summary-row"><span>Senha #'+row.queue_number+' • '+formatDateTime(row.created_at)+'</span><strong>'+money(Number(row.total_amount))+'</strong></div><div class="summary-row"><span>Cliente</span><strong>'+safe(name.trim())+'</strong></div><div class="summary-row"><span>Telefone</span><strong>'+safe(c.phone||'—')+'</strong></div><div class="summary-row"><span>Serviços</span><strong>'+serviceText+'</strong></div><div class="summary-row"><span>Status</span><strong>'+statusLabel(row.status)+'</strong></div>'+(row.barber_id?'<div class="summary-row"><span>Responsável</span><strong>'+safe(barber?barber.name:row.barber_id)+'</strong></div>':'')+'<div class="actions">';
 if(row.status==='waiting')html+='<button class="btn btn-primary" data-start="'+safe(row.id)+'">CHAMAR CLIENTE</button>';
 if(row.status==='in_progress'&&(admin||row.barber_id===state.barberId))html+='<button class="btn btn-primary" data-finish="'+safe(row.id)+'">FINALIZAR ATENDIMENTO</button>';
 if(admin&&row.status==='waiting')html+='<button class="btn btn-secondary" data-cancel="'+safe(row.id)+'">CANCELAR</button>';html+='</div></article>';});
 content.innerHTML=html;if(admin)bindAdminNavigation();else bindProfessionalNavigation();
 content.querySelectorAll('[data-start]').forEach(button=>button.addEventListener('click',()=>openQueueCallDialog(button.dataset.start)));
 content.querySelectorAll('[data-finish]').forEach(button=>button.addEventListener('click',()=>openPaymentMethodDialog(button.dataset.finish)));
 content.querySelectorAll('[data-cancel]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm('Deseja cancelar este atendimento? Se houver crédito reservado, ele será devolvido.'))return;button.disabled=true;const r=await db.rpc('lacorte_cancel_queue_entry',{p_queue_id:button.dataset.cancel});if(r.error){alert('Não foi possível cancelar: '+r.error.message);button.disabled=false;}else renderQueueDashboard();}));
 }).catch(error=>{content.innerHTML=(admin?adminNavigation():professionalNavigation('queue'))+'<div class="summary"><p class="muted">'+safe(error.message)+'</p></div>';if(admin)bindAdminNavigation();else bindProfessionalNavigation();});
}

function openQueueCallDialog(queueId){
 const overlay=document.createElement('div');overlay.className='payment-dialog-backdrop';overlay.innerHTML='<section class="payment-dialog"><h3>CHAMAR CLIENTE</h3><p>Confirme o resultado da chamada. Se o cliente preferir outro barbeiro, mantenha a senha aguardando.</p><div class="actions"><button class="btn btn-secondary" data-decline>NÃO ACEITOU / MANTER NA FILA</button><button class="btn btn-primary" data-accept>CLIENTE ACEITOU</button></div><p class="muted" id="call-error"></p></section>';content.append(overlay);
 overlay.querySelector('[data-decline]').addEventListener('click',function(){overlay.remove();});
 overlay.querySelector('[data-accept]').addEventListener('click',async function(){this.disabled=true;const r=await db.rpc('lacorte_start_service',{p_queue_id:queueId});if(r.error){this.disabled=false;overlay.querySelector('#call-error').textContent='Não foi possível iniciar: '+r.error.message;return;}renderQueueDashboard();});
}
function openPaymentMethodDialog(queueId){
 const overlay=document.createElement('div');overlay.className='payment-dialog-backdrop';overlay.innerHTML='<section class="payment-dialog"><h3>FINALIZAR ATENDIMENTO</h3><p>Selecione como o cliente pagou.</p><label for="payment-method">Forma de pagamento</label><select id="payment-method"><option value="">Selecione</option><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="credito">Crédito</option><option value="debito">Débito</option></select><div class="actions"><button class="btn btn-secondary" data-close>VOLTAR</button><button class="btn btn-primary" data-confirm>CONFIRMAR FINALIZAÇÃO</button></div><p class="muted" id="payment-error"></p></section>';content.append(overlay);
 overlay.querySelector('[data-close]').addEventListener('click',()=>overlay.remove());
 overlay.querySelector('[data-confirm]').addEventListener('click',async function(){const method=overlay.querySelector('#payment-method').value;if(!method){overlay.querySelector('#payment-error').textContent='Selecione uma forma de pagamento.';return;}this.disabled=true;const r=await db.rpc('lacorte_finish_service',{p_queue_id:queueId,p_payment_method:method});if(r.error){this.disabled=false;overlay.querySelector('#payment-error').textContent='Não foi possível finalizar: '+r.error.message;return;}renderQueueDashboard();});
}

async function routeAuthenticatedUser(user){
  state.user = user;
  state.customer = null;
  state.selectedServices = [];
  state.queueTicket = null;
  state.message = "";

  const roleResult = await db.from("lacorte_user_roles")
    .select("role,barber_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleResult.error) {
    setAppMode(true);
    setHeader("ERRO DE ACESSO", "Não foi possível identificar seu perfil", "Entre em contato com o administrador.");
    content.textContent = roleResult.error.message;
    dashboardActions();
    return;
  }

  const isStaffRole = !!(roleResult.data && (roleResult.data.role === "admin" || roleResult.data.role === "barber"));
  if (STAFF_PORTAL && !isStaffRole) {
    state.user = null; state.customer = null; state.barberId = null; state.role = null;
    await db.auth.signOut({scope:"local"});
    renderStaffLogin("Esta conta não tem permissão de equipe. Use o acesso de cliente no autoatendimento.");
    return;
  }
  if (!STAFF_PORTAL && isStaffRole) {
    window.location.replace("barbeiros.html");
    return;
  }

  if (isStaffRole) {
    state.role = roleResult.data.role;
    state.barberId = roleResult.data.barber_id;
    try {
      await loadCatalogs();
    } catch (error) {
      setAppMode(true);
      setHeader("ERRO", "Não foi possível carregar o painel", "Verifique a conexão com o banco de dados.");
      content.textContent = error.message;
      dashboardActions();
      return;
    }
    renderQueueDashboard();
    return;
  }

  state.role = "customer";
  state.barberId = null;
  setAppMode(false);
  try {
    await loadCatalogs();
  } catch (error) {
    state.message = error.message;
    renderLogin();
    showMessage(error.message);
    return;
  }
  await loadCustomer(user);
}

async function submitQueueEntry(){
  if(state.submitting)return;if(!state.customer||!state.selectedServices.length){showMessage('Confira seus dados e selecione ao menos um serviço.');return;}
  state.submitting=true;showMessage('Registrando sua entrada na fila...');
  try{const rpcName=state.user?'lacorte_create_queue_entry':'lacorte_create_queue_entry_kiosk';const result=await db.rpc(rpcName,{p_customer_id:state.customer.id,p_service_ids:state.selectedServices.map(function(s){return s.id;})});
    if(result.error)throw result.error;const ticket=Array.isArray(result.data)?result.data[0]:result.data;if(!ticket)throw new Error('O banco não retornou a confirmação da fila.');state.queueTicket=ticket;state.submitting=false;renderQueueSuccess();
  }catch(error){state.submitting=false;showMessage('Não foi possível entrar na fila: '+(error.message||'Falha de conexão.'));}
}

function renderQueueSuccess(){
  setAppMode(true);setHeader('ENTRADA CONFIRMADA','Você entrou na fila!','Sua senha está na fila única da LaCorte.');notice.textContent='Aguarde ser chamado por um dos profissionais.';
  const ticket=state.queueTicket;content.innerHTML='<div class="waiting"><p class="muted">SUA SENHA</p><div class="ticket">#'+safe(ticket.ticket_number)+'</div><div class="waiting-card"><div class="summary-row"><span>Cliente</span><strong>'+safe(state.customer.first_name+' '+(state.customer.last_name||''))+'</strong></div><div class="summary-row"><span>Total</span><strong>'+money(Number(ticket.total_amount))+'</strong></div><div class="summary-row"><span>Status</span><strong>Aguardando</strong></div></div><p class="muted">A equipe LaCorte chamará você. O barbeiro será definido no início do atendimento.</p></div>';
  actions.replaceChildren(makeButton('FINALIZAR',logoutCurrentSession,true));clearCustomerAutoLogout();
  if(state.role==='customer'){notice.textContent='Entrada confirmada. A sessão será encerrada automaticamente em 30 segundos.';customerAutoLogoutTimer=setTimeout(logoutCurrentSession,CUSTOMER_AUTO_LOGOUT_MS);}
}

// Calcula a prévia do benefício. O banco continua sendo a autoridade final
// e valida os créditos reservados no momento da entrada na fila.
function getCustomerPlanPreview(){
  const plan = state.customerPlan;
  const selected = state.selectedServices || [];
  if (!plan || selected.length !== 1) return null;

  const today = localQueueDate();
  const eligible = plan.status === "active"
    && plan.start_date <= today
    && plan.expires_at >= today
    && Number(plan.used_cuts) < Number(plan.included_cuts);

  if (!eligible) return null;

  if (selected[0].id === "corte") {
    return { total: 0, normal: Number(selected[0].price), description: "Corte incluído no plano" };
  }

  if (selected[0].id === "corte-barba") {
    const beard = services.find(function(service){ return service.id === "barba"; });
    return { total: beard ? Number(beard.price) : 40, normal: Number(selected[0].price), description: "1 corte do plano + valor da barba" };
  }

  return null;
}

// A confirmação mostra a prévia do benefício; o banco valida a reserva definitivamente.
// Substitui o carregamento inicial antigo: primeiro identifica o perfil, depois abre a área correta.
function passwordField(id,label,autocomplete,placeholder){
  return '<div class="password-field"><input id="'+id+'" name="'+id+'" type="password" autocomplete="'+autocomplete+'" placeholder="'+(placeholder||"")+'" required><button class="password-toggle" type="button" data-password-toggle="'+id+'" aria-label="Mostrar senha" title="Mostrar senha"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg></button></div>';
}

function bindPasswordVisibility(form){
  form.querySelectorAll("[data-password-toggle]").forEach(function(button){
    button.addEventListener("click",function(){
      const input=form.querySelector("#"+button.dataset.passwordToggle);
      if(!input) return;
      const visible=input.type==="password";
      input.type=visible?"text":"password";
      button.setAttribute("aria-label",visible?"Ocultar senha":"Mostrar senha");
      button.setAttribute("title",visible?"Ocultar senha":"Mostrar senha");
      button.classList.toggle("is-visible",visible);
    });
  });
}

function renderStaffLogin(message){
  state.role = null;
  state.user = null;
  state.barberId = null;
  setAppMode(false);
  setHeader("ÁREA PROFISSIONAL","Acesso da equipe LaCorte","Entre com seu e-mail e senha. No primeiro acesso, crie sua senha.");
  notice.textContent = "Acesso exclusivo para barbeiros e administrador. Clientes devem usar o autoatendimento.";
  content.innerHTML = '<form id="staff-login-form" class="staff-login-form"><label for="staff-email">E-mail profissional</label><input id="staff-email" name="email" type="email" autocomplete="username" placeholder="Seu e-mail cadastrado" required><label for="staff-password">Senha</label>'+passwordField("staff-password","Senha","current-password","Sua senha")+'<p id="staff-login-message" class="muted" role="status">'+safe(message||"")+'</p><button class="btn btn-primary" type="submit">ENTRAR NO PAINEL</button><button class="btn btn-secondary" id="staff-forgot-password" type="button">ESQUECI MINHA SENHA</button><button class="btn btn-secondary" id="staff-first-access" type="button">PRIMEIRO ACESSO? CRIAR MINHA SENHA</button></form>';
  actions.replaceChildren();
  const form=content.querySelector("#staff-login-form");
  bindPasswordVisibility(form);
  form.addEventListener("submit",async function(event){
    event.preventDefault();
    const button=form.querySelector('button[type="submit"]'),status=form.querySelector("#staff-login-message");
    const email=form.querySelector("#staff-email").value.trim(),password=form.querySelector("#staff-password").value;
    button.disabled=true;status.textContent="Verificando acesso...";
    const result=await db.auth.signInWithPassword({email,password});
    if(result.error){status.textContent="E-mail ou senha incorretos. Confira os dados ou use ESQUECI MINHA SENHA para redefinir.";button.disabled=false;return;}
    await routeAuthenticatedUser(result.data.user);
  });
  content.querySelector("#staff-first-access").addEventListener("click",function(){
    const email=form.querySelector("#staff-email").value.trim();
    renderStaffPasswordSetup(email);
  });
  content.querySelector("#staff-forgot-password").addEventListener("click",function(){
    renderStaffForgotPassword(form.querySelector("#staff-email").value.trim());
  });
}

function renderStaffForgotPassword(initialEmail,message){
  setAppMode(false);
  setHeader("RECUPERAR ACESSO","Esqueci minha senha","Informe o e-mail profissional para receber o link seguro de redefinição.");
  notice.textContent="Por segurança, o link será enviado somente ao endereço de e-mail cadastrado.";
  content.innerHTML='<form id="staff-forgot-form" class="staff-login-form"><label for="staff-recovery-email">E-mail profissional</label><input id="staff-recovery-email" type="email" autocomplete="email" value="'+safe(initialEmail||"")+'" placeholder="Seu e-mail cadastrado" required><p id="staff-forgot-message" class="muted" role="status">'+safe(message||"")+'</p><button class="btn btn-primary" type="submit">ENVIAR LINK DE REDEFINIÇÃO</button><button class="btn btn-secondary" id="staff-forgot-back" type="button">VOLTAR AO LOGIN</button></form>';
  actions.replaceChildren();
  const form=content.querySelector("#staff-forgot-form");
  form.addEventListener("submit",async function(event){
    event.preventDefault();
    const email=form.querySelector("#staff-recovery-email").value.trim().toLowerCase();
    const button=form.querySelector('button[type="submit"]'),status=form.querySelector("#staff-forgot-message");
    button.disabled=true;status.textContent="Solicitando link de recuperação...";
    const redirectTo=window.location.origin+window.location.pathname;
    const result=await db.auth.resetPasswordForEmail(email,{redirectTo});
    if(result.error){status.textContent="Não foi possível enviar o link. Confira o e-mail e tente novamente. "+result.error.message;button.disabled=false;return;}
    status.textContent="Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha. Confira também o spam.";
    button.disabled=false;
  });
  form.querySelector("#staff-forgot-back").addEventListener("click",function(){renderStaffLogin();});
}

async function renderStaffPasswordReset(message){
  setAppMode(false);
  setHeader("REDEFINIR SENHA","Criar nova senha","Escolha uma nova senha para acessar o painel profissional.");
  notice.textContent="O link de recuperação foi validado. Defina uma senha nova com pelo menos 8 caracteres.";
  content.innerHTML='<form id="staff-reset-form" class="staff-login-form"><label for="staff-reset-password">Nova senha</label>'+passwordField("staff-reset-password","Nova senha","new-password","Mínimo 8 caracteres")+'<label for="staff-reset-confirm">Confirmar nova senha</label>'+passwordField("staff-reset-confirm","Confirmar nova senha","new-password","Repita a nova senha")+'<p id="staff-reset-message" class="muted" role="status">'+safe(message||"")+'</p><button class="btn btn-primary" type="submit">SALVAR NOVA SENHA</button></form>';
  actions.replaceChildren();
  const form=content.querySelector("#staff-reset-form");
  bindPasswordVisibility(form);
  form.addEventListener("submit",async function(event){
    event.preventDefault();
    const password=form.querySelector("#staff-reset-password").value;
    const confirmation=form.querySelector("#staff-reset-confirm").value;
    const status=form.querySelector("#staff-reset-message"),button=form.querySelector('button[type="submit"]');
    if(password.length<8){status.textContent="A senha precisa ter pelo menos 8 caracteres.";return;}
    if(password!==confirmation){status.textContent="As senhas não conferem.";return;}
    button.disabled=true;status.textContent="Salvando nova senha...";
    const role=await db.from("lacorte_user_roles").select("role,barber_id").eq("user_id",(await db.auth.getUser()).data.user.id).maybeSingle();
    if(role.error||!role.data||!["admin","barber"].includes(role.data.role)){
      await db.auth.signOut({scope:"local"});
      renderStaffLogin("Este e-mail não está autorizado como conta profissional.");
      return;
    }
    const saved=await db.auth.updateUser({password:password});
    if(saved.error){status.textContent="Não foi possível salvar a nova senha: "+saved.error.message;button.disabled=false;return;}
    await routeAuthenticatedUser(saved.data.user);
  });
}

function renderStaffPasswordSetup(initialEmail,message){
  setAppMode(false);
  setHeader("PRIMEIRO ACESSO","Criar senha profissional","Confirme seu e-mail e defina a senha que usará nos próximos acessos.");
  notice.textContent = "Enviaremos um código de confirmação para o e-mail cadastrado. Este procedimento é feito somente uma vez.";
  content.innerHTML = '<form id="staff-password-setup" class="staff-login-form"><label for="staff-setup-email">E-mail profissional cadastrado</label><input id="staff-setup-email" type="email" autocomplete="email" value="'+safe(initialEmail||"")+'" placeholder="Seu e-mail cadastrado" required><p id="staff-setup-message" class="muted" role="status">'+safe(message||"")+'</p><button class="btn btn-primary" type="submit">ENVIAR CÓDIGO DE CONFIRMAÇÃO</button><button class="btn btn-secondary" id="staff-setup-back" type="button">VOLTAR AO LOGIN</button></form>';
  actions.replaceChildren();
  const form=content.querySelector("#staff-password-setup");
  form.addEventListener("submit",async function(event){
    event.preventDefault();
    const email=form.querySelector("#staff-setup-email").value.trim().toLowerCase();
    const button=form.querySelector('button[type="submit"]'),status=form.querySelector("#staff-setup-message");
    button.disabled=true;status.textContent="Enviando código para seu e-mail...";
    const sent=await db.auth.signInWithOtp({email:email,options:{shouldCreateUser:false}});
    if(sent.error){status.textContent="Não foi possível enviar o código. Confira o e-mail cadastrado e tente novamente. "+sent.error.message;button.disabled=false;return;}
    renderStaffPasswordVerification(email);
  });
  form.querySelector("#staff-setup-back").addEventListener("click",function(){renderStaffLogin();});
}

function renderStaffPasswordVerification(email,message){
  setAppMode(false);
  setHeader("CONFIRMAR E-MAIL","Definir sua senha","Digite o código recebido e escolha uma senha pessoal.");
  notice.textContent = "O código confirma que você tem acesso à caixa de e-mail profissional.";
  content.innerHTML = '<form id="staff-password-verify" class="staff-login-form"><label for="staff-otp">Código recebido por e-mail</label><input id="staff-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="Código de 6 números" required><label for="staff-new-password">Criar senha (mínimo 8 caracteres)</label>'+passwordField("staff-new-password","Criar senha","new-password","Mínimo 8 caracteres")+'<label for="staff-confirm-password">Confirmar senha</label>'+passwordField("staff-confirm-password","Confirmar senha","new-password","Repita a senha")+'<p id="staff-verify-message" class="muted" role="status">'+safe(message||"")+'</p><button class="btn btn-primary" type="submit">CONFIRMAR E SALVAR SENHA</button><button class="btn btn-secondary" id="staff-resend-code" type="button">REENVIAR CÓDIGO</button><button class="btn btn-secondary" id="staff-verify-back" type="button">VOLTAR AO LOGIN</button></form>';
  actions.replaceChildren();
  const form=content.querySelector("#staff-password-verify");
  bindPasswordVisibility(form);
  form.addEventListener("submit",async function(event){
    event.preventDefault();
    const token=form.querySelector("#staff-otp").value.trim();
    const password=form.querySelector("#staff-new-password").value;
    const confirmation=form.querySelector("#staff-confirm-password").value;
    const button=form.querySelector('button[type="submit"]'),status=form.querySelector("#staff-verify-message");
    if(!/^[0-9]{6}$/.test(token)){status.textContent="Digite o código de 6 números recebido.";return;}
    if(password.length<8){status.textContent="A senha precisa ter pelo menos 8 caracteres.";return;}
    if(password!==confirmation){status.textContent="As senhas não conferem.";return;}
    button.disabled=true;status.textContent="Confirmando seu e-mail...";
    const verified=await db.auth.verifyOtp({email:email,token:token,type:"email"});
    if(verified.error){status.textContent="Código inválido ou expirado. Solicite outro código e tente novamente.";button.disabled=false;return;}
    const session=verified.data && verified.data.session;
    const user=(session&&session.user)||(verified.data&&verified.data.user);
    if(!user){status.textContent="Não foi possível iniciar a sessão após a confirmação. Tente novamente.";button.disabled=false;return;}
    const role=await db.from("lacorte_user_roles").select("role,barber_id").eq("user_id",user.id).maybeSingle();
    if(role.error || !role.data || !["admin","barber"].includes(role.data.role)){
      await db.auth.signOut({scope:"local"});
      renderStaffLogin("Este e-mail não está autorizado como conta profissional. Peça ao administrador para conferir o cadastro.");
      return;
    }
    status.textContent="Salvando sua senha...";
    const saved=await db.auth.updateUser({password:password});
    if(saved.error){renderStaffPasswordOnly(saved.error.message);return;}
    await routeAuthenticatedUser(saved.data.user||user);
  });
  form.querySelector("#staff-resend-code").addEventListener("click",function(){renderStaffPasswordSetup(email,"Solicite um novo código para este e-mail.");});
  form.querySelector("#staff-verify-back").addEventListener("click",function(){db.auth.signOut({scope:"local"}).then(function(){renderStaffLogin();});});
}

function renderStaffPasswordOnly(message){
  setAppMode(false);
  setHeader("QUASE PRONTO","Salvar sua senha","Seu e-mail já foi confirmado. Agora finalize a criação da senha.");
  notice.textContent = "Escolha uma senha com pelo menos 8 caracteres.";
  content.innerHTML = '<form id="staff-password-only" class="staff-login-form"><label for="staff-password-only-new">Nova senha</label>'+passwordField("staff-password-only-new","Nova senha","new-password","Mínimo 8 caracteres")+'<label for="staff-password-only-confirm">Confirmar senha</label>'+passwordField("staff-password-only-confirm","Confirmar senha","new-password","Repita a senha")+'<p id="staff-password-only-message" class="muted" role="status">'+safe(message||"")+'</p><button class="btn btn-primary" type="submit">SALVAR SENHA</button></form>';
  const form=content.querySelector("#staff-password-only");
  bindPasswordVisibility(form);
  form.addEventListener("submit",async function(event){
    event.preventDefault();
    const password=form.querySelector("#staff-password-only-new").value;
    const confirm=form.querySelector("#staff-password-only-confirm").value;
    const status=form.querySelector("#staff-password-only-message");
    if(password.length<8){status.textContent="A senha precisa ter pelo menos 8 caracteres.";return;}
    if(password!==confirm){status.textContent="As senhas não conferem.";return;}
    const result=await db.auth.updateUser({password:password});
    if(result.error){status.textContent="Não foi possível salvar a senha: "+result.error.message;return;}
    await routeAuthenticatedUser(result.data.user);
  });
}

async function initLaCorte(){
  setAppMode(false);

  if (!db) {
    if (STAFF_PORTAL) renderStaffLogin("A conexão segura não carregou. Atualize a página.");
    else { state.role = null; render(); showMessage("A conexão segura não carregou. Verifique a internet e atualize a página para entrar."); }
    return;
  }

  if (STAFF_PORTAL) {
    const hashParams=new URLSearchParams(window.location.hash.replace(/^#/,""));
    if(hashParams.get("type")==="recovery" && hashParams.get("access_token") && hashParams.get("refresh_token")){
      const restored=await db.auth.setSession({access_token:hashParams.get("access_token"),refresh_token:hashParams.get("refresh_token")});
      window.history.replaceState({},document.title,window.location.pathname+window.location.search);
      if(restored.error){renderStaffLogin("O link de recuperação expirou ou já foi utilizado. Solicite outro.");return;}
      await renderStaffPasswordReset();
    }else{
      const staffSession = await db.auth.getSession();
      if (staffSession.error) { renderStaffLogin("Não foi possível verificar a sessão. Entre novamente."); return; }
      if (staffSession.data && staffSession.data.session) await routeAuthenticatedUser(staffSession.data.session.user);
      else renderStaffLogin();
    }
    db.auth.onAuthStateChange(function(event){
      if(event === "SIGNED_OUT") renderStaffLogin();
    });
    return;
  }

  // O autoatendimento continua usando o fluxo de acesso do cliente.
  if (!db) {
    state.role = null;
    render();
    showMessage("A conexão segura não carregou. Verifique a internet e atualize a página para entrar.");
    return;
  }

  // O Supabase processa automaticamente o retorno do link (code ou tokens na URL).
  const sessionResult = await db.auth.getSession();
  if (sessionResult.error) {
    state.message = "Erro ao verificar acesso: " + sessionResult.error.message;
  }

  if (sessionResult.data && sessionResult.data.session) {
    await routeAuthenticatedUser(sessionResult.data.session.user);
  } else {
    state.role = null;
    render();
  }

  db.auth.onAuthStateChange(function(event, session){
    // O login por código já direciona o usuário no próprio formulário.
    // Evita executar routeAuthenticatedUser duas vezes durante a confirmação do OTP.
    if (event === "SIGNED_OUT") {
      clearCustomerAutoLogout();
      state.user = null;
      state.customer = null;
      state.role = null;
      state.barberId = null;
      state.selectedServices = [];
      state.queueTicket = null;
      state.customerPlan = null;
      state.customerPlanBenefits = [];
      state.submitting = false;
      state.step = 1;
      state.message = "";
      setAppMode(false);
      render();
    }
  });
}



// ===== RELATÓRIOS ADMINISTRATIVOS LACORTE =====
let adminReportFilters = { period: "month", start: "", end: "" };

function reportShiftDate(dateText, days){
  const parts = dateText.split("-").map(Number);
  const date = new Date(parts[0], parts[1]-1, parts[2], 12);
  date.setDate(date.getDate()+days);
  return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
}

function reportDateRange(){
  const today = localQueueDate();
  const period = adminReportFilters.period || "month";
  if(period === "today") return {start:today,end:today,label:"Hoje"};
  if(period === "fortnight") return {start:reportShiftDate(today,-13),end:today,label:"Últimos 14 dias"};
  if(period === "week"){
    const d = new Date(today+"T12:00:00");
    const weekday = d.getDay();
    return {start:reportShiftDate(today, -(weekday === 0 ? 6 : weekday-1)),end:today,label:"Esta semana"};
  }
  if(period === "month") return {start:today.slice(0,7)+"-01",end:today,label:"Este mês"};
  const start = adminReportFilters.start;
  const end = adminReportFilters.end;
  if(!start || !end || start > end) throw new Error("Informe um intervalo válido: a data inicial deve ser anterior ou igual à data final.");
  return {start:start,end:end,label:"Período personalizado"};
}

function reportPieChart(items, valueFormatter, emptyMessage){
  const palette=["#f58220","#f5b041","#d35400","#e67e22","#f39c12","#b94b12","#ff9f43","#8e3b0d","#ffc078","#c96b22"];
  const valid=(items || []).map(function(item){return {label:String(item.label || "Não identificado"),value:Math.max(0,Number(item.value)||0)};}).filter(function(item){return item.value>0;});
  if(!valid.length) return '<p class="muted">'+(emptyMessage || "Sem dados para este período.")+'</p>';
  const total=valid.reduce(function(sum,item){return sum+item.value;},0);
  let cursor=0;
  const stops=valid.map(function(item,index){
    const start=cursor;
    cursor+=(item.value/total)*100;
    return palette[index%palette.length]+' '+start.toFixed(2)+'% '+cursor.toFixed(2)+'%';
  });
  const legend=valid.map(function(item,index){
    const percent=(item.value/total)*100;
    return '<div class="report-pie-legend-item"><span class="report-pie-dot" style="background:'+palette[index%palette.length]+'"></span><span class="report-pie-name">'+safe(item.label)+'</span><strong>'+valueFormatter(item.value)+'</strong><small>'+percent.toFixed(1).replace(".",",")+'%</small></div>';
  }).join('');
  return '<div class="report-pie-layout"><div class="report-pie" role="img" aria-label="Gráfico de pizza: '+valid.length+' categorias" style="background:conic-gradient('+stops.join(",")+')"><div class="report-pie-hole"><strong>'+valueFormatter(total)+'</strong><span>Total</span></div></div><div class="report-pie-legend">'+legend+'</div></div>';
}

async function renderBarberReports(){
 if(!(state.role==='barber' || (state.role==='admin' && state.barberId)))return renderQueueDashboard();professionalView='reports';setAppMode(true);setHeader('PAINEL DO PROFISSIONAL','Meus relatórios','Somente os seus atendimentos e valores.');notice.textContent='Relatórios individuais • Dados financeiros de atendimentos concluídos.';dashboardActions();actions.prepend(makeButton("VOLTAR À FILA",renderQueueDashboard,true));content.innerHTML='<p class="muted">Carregando seus relatórios...</p>';
 try{const range=reportDateRange(),r=await db.from('lacorte_queue').select('id,customer_id,status,total_amount,commission_amount,payment_method,queue_date,completed_at,queue_number').eq('barber_id',state.barberId).gte('queue_date',range.start).lte('queue_date',range.end);if(r.error)throw r.error;
 const rows=r.data||[],done=rows.filter(x=>x.status==='completed');const ids=Array.from(new Set(done.map(x=>x.customer_id).filter(Boolean))),queueIds=done.map(x=>x.id);const extra=await Promise.all([ids.length?db.from('customers').select('id,first_name,last_name').in('id',ids):Promise.resolve({data:[],error:null}),queueIds.length?db.from('lacorte_queue_items').select('queue_id,service_name').in('queue_id',queueIds):Promise.resolve({data:[],error:null})]);if(extra[0].error)throw extra[0].error;if(extra[1].error)throw extra[1].error;const customerNames={},serviceNames={};(extra[0].data||[]).forEach(c=>customerNames[c.id]=(c.first_name+' '+c.last_name).trim());(extra[1].data||[]).forEach(i=>(serviceNames[i.queue_id]||(serviceNames[i.queue_id]=[])).push(i.service_name));const gross=done.reduce((s,x)=>s+Number(x.total_amount||0),0),commission=done.reduce((s,x)=>s+Number(x.commission_amount||0),0),payments={pix:0,dinheiro:0,credito:0,debito:0},labels={pix:'PIX',dinheiro:'Dinheiro',credito:'Crédito',debito:'Débito'};
 done.forEach(x=>{if(payments[x.payment_method]!==undefined)payments[x.payment_method]+=Number(x.total_amount||0);});
 const opts=['today','week','fortnight','month'].map(k=>'<option value="'+k+'" '+(adminReportFilters.period===k?'selected':'')+'>'+({today:'Hoje',week:'Semana',fortnight:'Quinzena',month:'Mês'}[k])+'</option>').join('');
 let html='<section class="summary"><label for="barber-report-period">PERÍODO</label><select id="barber-report-period">'+opts+'</select><div class="report-kpis"><article class="summary"><span>Atendimentos</span><strong>'+done.length+'</strong></article><article class="summary"><span>Faturamento bruto</span><strong>'+money(gross)+'</strong></article><article class="summary"><span>Minha comissão</span><strong>'+money(commission)+'</strong></article><article class="summary"><span>Saldo da barbearia</span><strong>'+money(gross-commission)+'</strong></article></div></section><section class="summary"><h3>VALORES POR FORMA DE PAGAMENTO</h3>';
 Object.keys(payments).forEach(k=>{html+='<div class="summary-row"><span>'+labels[k]+'</span><strong>'+money(payments[k])+'</strong></div>';});html+='</section><section class="summary"><h3>ATENDIMENTOS CONCLUÍDOS</h3>';
 if(done.length){html+='<div class="report-table-wrap"><table class="report-table"><thead><tr><th>Senha</th><th>Cliente</th><th>Serviços</th><th>Total</th><th>Pagamento</th><th>Comissão</th></tr></thead><tbody>';done.slice().sort((a,b)=>String(b.completed_at).localeCompare(String(a.completed_at))).forEach(x=>{html+='<tr><td>#'+x.queue_number+'</td><td>'+safe(customerNames[x.customer_id]||'Cliente')+'</td><td>'+safe((serviceNames[x.id]||[]).join(', ')||'—')+'</td><td>'+money(Number(x.total_amount))+'</td><td>'+safe(labels[x.payment_method]||'—')+'</td><td>'+money(Number(x.commission_amount))+'</td></tr>';});html+='</tbody></table></div>';}else html+='<p class="muted">Nenhum atendimento concluído neste período.</p>';html+='</section>';content.innerHTML=(state.role==='admin'?adminNavigation():professionalNavigation('reports'))+html;
 if(state.role==='admin')bindAdminNavigation();else bindProfessionalNavigation();
 content.querySelector('#barber-report-period').addEventListener('change',function(){adminReportFilters.period=this.value;renderBarberReports();});
 }catch(error){content.innerHTML=(state.role==='admin'?adminNavigation():professionalNavigation('reports'))+'<section class="summary"><p class="muted">'+safe(error.message)+'</p></section>';if(state.role==='admin')bindAdminNavigation();else bindProfessionalNavigation();}
}
async function renderAdminReports(){
  if(state.role !== "admin") return renderQueueDashboard();
  adminView = "reports";
  setAppMode(true);
  setHeader("ADMINISTRAÇÃO LACORTE","Relatórios e faturamento","Acompanhe resultados, serviços e comissões por período.");
  notice.textContent = "Relatórios exclusivos do administrador • Valores financeiros consideram somente atendimentos concluídos.";
  dashboardActions();
  content.innerHTML = adminNavigation() + '<p class="muted">Carregando relatórios...</p>';
  let range;
  try {
    range = reportDateRange();
    const queueResult = await db.from("lacorte_queue")
      .select("id,customer_id,barber_id,queue_date,queue_number,status,total_amount,commission_percent,commission_amount,payment_method,created_at,completed_at")
      .gte("queue_date",range.start).lte("queue_date",range.end)
      .order("queue_date",{ascending:true}).order("created_at",{ascending:true});
    if(queueResult.error) throw new Error("Não foi possível consultar os atendimentos: "+queueResult.error.message);
    const rows = queueResult.data || [];
    const completedRows = rows.filter(function(row){return row.status === "completed";});
    const barberResult = await db.from("barbers").select("id,name,active").order("name");
    if(barberResult.error) throw new Error("Não foi possível consultar os barbeiros: "+barberResult.error.message);
    const customerIds = Array.from(new Set(rows.map(function(row){return row.customer_id;}).filter(Boolean)));
    const queueIds = rows.map(function(row){return row.id;});
    const lookups = await Promise.all([
      customerIds.length ? db.from("customers").select("id,first_name,last_name,phone").in("id",customerIds) : Promise.resolve({data:[],error:null}),
      queueIds.length ? db.from("lacorte_queue_items").select("queue_id,service_name,unit_price").in("queue_id",queueIds) : Promise.resolve({data:[],error:null})
    ]);
    if(lookups[0].error) throw new Error("Não foi possível consultar os clientes: "+lookups[0].error.message);
    if(lookups[1].error) throw new Error("Não foi possível consultar os serviços: "+lookups[1].error.message);
    const barberById = {};
    (barberResult.data || []).forEach(function(barber){barberById[barber.id]=barber.name;});
    const customerById = {};
    (lookups[0].data || []).forEach(function(customer){customerById[customer.id]=customer;});
    const itemsByQueue = {};
    (lookups[1].data || []).forEach(function(item){
      if(!itemsByQueue[item.queue_id]) itemsByQueue[item.queue_id]=[];
      itemsByQueue[item.queue_id].push(item);
    });

    const revenue = completedRows.reduce(function(sum,row){return sum+Number(row.total_amount || 0);},0);
    const commissions = completedRows.reduce(function(sum,row){return sum+Number(row.commission_amount || 0);},0);
    const net = revenue-commissions;
    const paymentTotals = {pix:0,dinheiro:0,credito:0,debito:0};
    completedRows.forEach(function(row){if(paymentTotals[row.payment_method] !== undefined) paymentTotals[row.payment_method] += Number(row.total_amount || 0);});
    const counts = {
      completed:completedRows.length,
      waiting:rows.filter(function(row){return row.status==="waiting";}).length,
      in_progress:rows.filter(function(row){return row.status==="in_progress";}).length,
      cancelled:rows.filter(function(row){return row.status==="cancelled";}).length
    };
    const daily = {};
    const cursorDates = [];
    for(let date=range.start;date<=range.end;date=reportShiftDate(date,1)){
      cursorDates.push(date);
      if(cursorDates.length>370) break;
    }
    cursorDates.forEach(function(date){daily[date]=0;});
    completedRows.forEach(function(row){
      daily[row.queue_date]=(daily[row.queue_date] || 0)+Number(row.total_amount || 0);
    });
    const dailyItems = cursorDates.map(function(date){
      return {label:date.slice(8,10)+"/"+date.slice(5,7),value:daily[date] || 0};
    });
    const commissionsByBarber = {};
    completedRows.forEach(function(row){
      const name=barberById[row.barber_id] || row.barber_id || "Não identificado";
      commissionsByBarber[name]=(commissionsByBarber[name] || 0)+Number(row.commission_amount || 0);
    });
    const commissionItems = Object.keys(commissionsByBarber).map(function(name){
      return {label:name,value:commissionsByBarber[name]};
    }).sort(function(a,b){return b.value-a.value;});
    const serviceCounts = {};
    completedRows.forEach(function(row){
      (itemsByQueue[row.id] || []).forEach(function(item){
        serviceCounts[item.service_name]=(serviceCounts[item.service_name] || 0)+1;
      });
    });
    const serviceItems = Object.keys(serviceCounts).map(function(name){
      return {label:name,value:serviceCounts[name]};
    }).sort(function(a,b){return b.value-a.value;}).slice(0,8);
    const customerName = function(row){
      const c=customerById[row.customer_id] || {};
      return ((c.first_name || "Cliente")+" "+(c.last_name || "")).trim();
    };
    let history = "";
    rows.slice().sort(function(a,b){
      return String(b.created_at).localeCompare(String(a.created_at));
    }).forEach(function(row){
      const serviceText=(itemsByQueue[row.id] || []).map(function(item){
        return safe(item.service_name)+" ("+money(Number(item.unit_price || 0))+")";
      }).join(", ") || "—";
      history += '<tr><td>#'+Number(row.queue_number)+'</td><td>'+safe(customerName(row))+'</td><td>'+safe(barberById[row.barber_id] || row.barber_id || 'Aguardando atribuição')+'</td><td>'+serviceText+'</td><td>'+money(Number(row.total_amount || 0))+'</td><td>'+safe(row.payment_method || '—')+'</td><td>'+safe(statusLabel(row.status))+'</td><td>'+formatDateTime(row.completed_at || row.created_at)+'</td></tr>';
    });

    const periodOptions = '<option value="today" '+(adminReportFilters.period==="today"?"selected":"")+'>Hoje</option>'+
      '<option value="week" '+(adminReportFilters.period==="week"?"selected":"")+'>Esta semana</option>'+
      '<option value="fortnight" '+(adminReportFilters.period==="fortnight"?"selected":"")+'>Quinzena</option>'+
      '<option value="month" '+(adminReportFilters.period==="month"?"selected":"")+'>Este mês</option>'+
      '<option value="custom" '+(adminReportFilters.period==="custom"?"selected":"")+'>Personalizado</option>';
    let html = adminNavigation();
    html += '<form id="report-filter" class="summary report-filter"><label for="report-period">PERÍODO DO RELATÓRIO</label><select id="report-period" name="period">'+periodOptions+'</select>'+
      '<div class="report-date-fields"><label>Data inicial<input type="date" id="report-start" name="start" value="'+safe(adminReportFilters.start || range.start)+'"></label>'+
      '<label>Data final<input type="date" id="report-end" name="end" value="'+safe(adminReportFilters.end || range.end)+'"></label></div>'+
      '<button class="btn btn-primary" type="submit">APLICAR PERÍODO</button></form>';
    html += '<div class="report-kpis">'+
      '<article class="summary"><span class="muted">Faturamento</span><strong>'+money(revenue)+'</strong></article>'+
      '<article class="summary"><span class="muted">Comissões</span><strong>'+money(commissions)+'</strong></article>'+
      '<article class="summary"><span class="muted">Após comissões</span><strong>'+money(net)+'</strong></article>'+
      '<article class="summary"><span class="muted">Atendimentos concluídos</span><strong>'+counts.completed+'</strong></article></div>';
    html += '<section class="summary"><h3>FORMAS DE PAGAMENTO</h3>'+Object.keys(paymentTotals).map(function(method){return '<div class="summary-row"><span>'+({pix:"PIX",dinheiro:"Dinheiro",credito:"Crédito",debito:"Débito"}[method])+'</span><strong>'+money(paymentTotals[method])+'</strong></div>';}).join("")+'</section>';
    html += '<section class="summary report-chart"><h3>FATURAMENTO POR DIA</h3><p class="muted">'+safe(range.label)+' • '+safe(range.start)+' até '+safe(range.end)+'</p>'+reportPieChart(dailyItems,money,"Sem faturamento concluído neste período.")+'</section>';
    html += '<div class="report-chart-grid"><section class="summary report-chart"><h3>COMISSÕES POR BARBEIRO</h3>'+reportPieChart(commissionItems,money)+'</section>'+
      '<section class="summary report-chart"><h3>SERVIÇOS MAIS REALIZADOS</h3>'+reportPieChart(serviceItems,function(value){return value+" atend.";})+'</section></div>';
    const statusItems=[
      {label:"Aguardando",value:counts.waiting},
      {label:"Em atendimento",value:counts.in_progress},
      {label:"Concluídos",value:counts.completed},
      {label:"Cancelados",value:counts.cancelled}
    ];
    html += '<section class="summary report-chart"><h3>STATUS DOS ATENDIMENTOS</h3>'+reportPieChart(statusItems,function(value){return String(value)+" atend.";})+'</section>';
    html += '<section class="summary"><h3>HISTÓRICO DO PERÍODO</h3><p class="muted">'+rows.length+' registro(s) encontrado(s).</p>'+
      (rows.length ? '<div class="report-table-wrap"><table class="report-table"><thead><tr><th>Senha</th><th>Cliente</th><th>Barbeiro</th><th>Serviços</th><th>Total</th><th>Pagamento</th><th>Status</th><th>Data</th></tr></thead><tbody>'+history+'</tbody></table></div>' : '<p class="muted">Nenhum atendimento encontrado neste período.</p>')+
      '</section>';

    if(state.role !== "admin" || adminView !== "reports") return;
    content.innerHTML = html;
    bindAdminNavigation();
    const filter = content.querySelector("#report-filter");
    filter.querySelector("#report-period").addEventListener("change",function(){
      const custom=this.value==="custom";
      filter.querySelector("#report-start").disabled=!custom;
      filter.querySelector("#report-end").disabled=!custom;
    });
    const customFields=adminReportFilters.period==="custom";
    filter.querySelector("#report-start").disabled=!customFields;
    filter.querySelector("#report-end").disabled=!customFields;
    filter.addEventListener("submit",function(event){
      event.preventDefault();
      const fd=new FormData(filter);
      adminReportFilters.period=String(fd.get("period") || "month");
      adminReportFilters.start=String(fd.get("start") || "");
      adminReportFilters.end=String(fd.get("end") || "");
      renderAdminReports();
    });
  } catch(error) {
    if(state.role !== "admin" || adminView !== "reports") return;
    content.innerHTML = adminNavigation() + '<section class="summary"><p class="muted">'+safe(error.message)+'</p></section>';
    bindAdminNavigation();
  }
}


// ===== GERENCIAMENTO ADMINISTRATIVO LACORTE =====
let adminView = "queue";

function adminNavigation(){
  if(state.role !== "admin") return "";
  const navItem=function(view,label,icon){
    return '<button type="button" class="admin-nav-item '+(adminView===view?'active':'')+'" data-admin-view="'+view+'"><span class="admin-nav-icon">'+icon+'</span><span>'+label+'</span></button>';
  };
  return '<aside class="admin-nav"><div class="admin-brand"><span class="admin-brand-mark">LC</span><span><strong>LA CORTE</strong><small>PAINEL ADMINISTRATIVO</small></span></div>'+
    '<div class="admin-nav-caption">GESTÃO DA BARBEARIA</div>'+
    navItem("queue","Painel geral","▦")+
    navItem("customers","Clientes cadastrados","♧")+
    navItem("manage","Serviços e equipe","♙")+
    navItem("plans","Planos e assinaturas","◇")+
    navItem("reports","Relatórios","▥")+
    '<div class="admin-nav-footer"><span class="admin-online-dot"></span> Sistema operacional</div></aside>';
}

function bindAdminNavigation(){
  content.querySelectorAll("[data-admin-view]").forEach(function(button){
    button.addEventListener("click", function(){
      adminView = button.dataset.adminView;
      if(adminView === "manage") renderAdminManagement();
      else if(adminView === "customers") renderAdminCustomers();
      else if(adminView === "plans") renderAdminPlans();
      else if(adminView === "reports") renderAdminReports();
      else renderQueueDashboard();
    });
  });
}


async function renderAdminCustomers(){
  if(state.role !== "admin") return renderQueueDashboard();
  adminView = "customers";
  setAppMode(true);
  setHeader("ADMINISTRAÇÃO LACORTE","Clientes cadastrados","Cadastro permanente e histórico de visitas da clientela.");
  notice.textContent = "Dados pessoais e histórico completos • Acesso exclusivo do administrador.";
  dashboardActions();
  content.innerHTML = adminNavigation() + '<p class="muted">Carregando clientes e histórico...</p>';
  try {
    const results = await Promise.all([
      db.from("customers").select("id,first_name,last_name,email,phone,birth_date,created_at").order("created_at",{ascending:false}).limit(500),
      db.from("lacorte_queue").select("id,customer_id,queue_date,queue_number,status,total_amount,barber_id,payment_method,created_at,completed_at").order("created_at",{ascending:false}).limit(2000),
      db.from("barbers").select("id,name")
    ]);
    if(results[0].error) throw new Error("Não foi possível carregar os clientes: "+results[0].error.message);
    if(results[1].error) throw new Error("Não foi possível carregar o histórico: "+results[1].error.message);
    if(results[2].error) throw new Error("Não foi possível carregar os barbeiros: "+results[2].error.message);
    const customers = results[0].data || [];
    const queueRows = results[1].data || [];
    const barberNames = {};
    (results[2].data || []).forEach(function(b){barberNames[b.id]=b.name;});
    const history = {};
    queueRows.forEach(function(row){
      if(!history[row.customer_id]) history[row.customer_id]=[];
      history[row.customer_id].push(row);
    });
    let html = adminNavigation();
    html += '<section class="summary"><h3>BASE DE CLIENTES</h3><p class="muted">'+customers.length+' cadastro(s) carregado(s). Pesquise por nome, telefone ou e-mail.</p><label for="customer-admin-search">BUSCAR CLIENTE</label><input id="customer-admin-search" type="search" placeholder="Digite nome, telefone ou e-mail"></section>';
    if(!customers.length) html += '<section class="summary"><p class="muted">Ainda não há clientes cadastrados.</p></section>';
    customers.forEach(function(customer){
      const fullName=(customer.first_name||"")+" "+(customer.last_name||"");
      const rows=history[customer.id]||[];
      const completed=rows.filter(function(row){return row.status==="completed";});
      const spent=completed.reduce(function(sum,row){return sum+Number(row.total_amount||0);},0);
      const lastVisit=rows.length?rows[0].created_at:null;
      const searchText=(fullName+" "+(customer.phone||"")+" "+(customer.email||"")).toLocaleLowerCase("pt-BR");
      html += '<details class="summary admin-customer-card" data-customer-card data-search="'+safe(searchText)+'"><summary><strong>'+safe(fullName.trim()||"Cliente sem nome")+'</strong><span class="muted">'+rows.length+' visita(s) • '+money(spent)+'</span></summary>';
      html += '<div class="summary-row"><span>Telefone</span><strong>'+safe(customer.phone||"—")+'</strong></div><div class="summary-row"><span>E-mail</span><strong>'+safe(customer.email||"—")+'</strong></div><div class="summary-row"><span>Aniversário</span><strong>'+safe(customer.birth_date||"—")+'</strong></div><div class="summary-row"><span>Cadastro</span><strong>'+formatDateTime(customer.created_at)+'</strong></div><div class="summary-row"><span>Última entrada</span><strong>'+formatDateTime(lastVisit)+'</strong></div><h4>HISTÓRICO DE ATENDIMENTOS</h4>';
      if(!rows.length) html += '<p class="muted">Nenhuma entrada na fila registrada.</p>';
      else {
        html += '<div class="report-table-wrap"><table class="report-table"><thead><tr><th>Data</th><th>Senha</th><th>Status</th><th>Barbeiro</th><th>Valor</th></tr></thead><tbody>';
        rows.slice(0,30).forEach(function(row){
          html += '<tr><td>'+safe(row.queue_date||"—")+'</td><td>#'+safe(row.queue_number)+'</td><td>'+safe(statusLabel(row.status))+'</td><td>'+safe(barberNames[row.barber_id]||"—")+'</td><td>'+money(Number(row.total_amount||0))+'</td></tr>';
        });
        html += '</tbody></table></div>';
        if(rows.length>30) html += '<p class="muted">Mostrando as 30 visitas mais recentes de '+rows.length+'.</p>';
      }
      html += '</details>';
    });
    content.innerHTML=html;
    bindAdminNavigation();
    const search=content.querySelector("#customer-admin-search");
    if(search) search.addEventListener("input",function(){
      const term=search.value.trim().toLocaleLowerCase("pt-BR");
      content.querySelectorAll("[data-customer-card]").forEach(function(card){
        card.hidden=!card.dataset.search.includes(term);
      });
    });
  } catch(error) {
    content.innerHTML=adminNavigation()+'<section class="summary"><p class="muted">'+safe(error.message)+'</p></section>';
    bindAdminNavigation();
  }
}

async function renderAdminManagement(){
  if(state.role !== "admin") return renderQueueDashboard();
  setAppMode(true);
  setHeader("ADMINISTRAÇÃO LACORTE", "Gerenciar a barbearia", "Altere serviços, preços, barbeiros e comissões. As permissões também são verificadas pelo banco de dados.");
  notice.textContent = "Área exclusiva do administrador. As alterações são salvas diretamente no Supabase.";
  dashboardActions();
  content.innerHTML = adminNavigation() + '<p class="muted">Carregando cadastros...</p>';
  try {
    const results = await Promise.all([
      db.from("barbers").select("id,name,active,commission_percent").order("name"),
      db.from("services").select("id,name,detail,price,active").order("name")
    ]);
    if(results[0].error) throw new Error("Erro ao carregar barbeiros: " + results[0].error.message);
    if(results[1].error) throw new Error("Erro ao carregar serviços: " + results[1].error.message);
    const barberRows = results[0].data || [];
    const serviceRows = results[1].data || [];
    let accessEmail = "";
    let accessLoadMessage = "";
    const accessLoad = await db.functions.invoke("lacorte-admin-barber-email", { body: { action: "get" } });
    if(accessLoad.error) accessLoadMessage = "Não foi possível carregar o e-mail atual: " + accessLoad.error.message;
    else accessEmail = accessLoad.data.current_email || "";
    let html = adminNavigation();
    html += '<div class="admin-workspace"><div class="admin-section-heading"><span class="eyebrow">CONFIGURAÇÕES</span><h2>Gestão da barbearia</h2><p class="muted">Escolha uma área. Cada tela mostra somente as ferramentas daquela seção.</p></div><nav class="manage-tabs" role="tablist" aria-label="Configurações da barbearia">' +
      '<button type="button" class="manage-tab active" role="tab" aria-selected="true" data-manage-tab="access">Acessos profissionais</button>' +
      '<button type="button" class="manage-tab" role="tab" aria-selected="false" data-manage-tab="barbers">Equipe e comissões</button>' +
      '<button type="button" class="manage-tab" role="tab" aria-selected="false" data-manage-tab="services">Serviços e preços</button></nav>';
    html += '<div class="manage-panel active" role="tabpanel" data-manage-panel="access"><section class="summary"><h3>ACESSOS PROFISSIONAIS</h3><p class="muted">Gerencie o e-mail de acesso do Barbeiro 2. Seu acesso de administrador permanece separado e não pode ser alterado por esta tela.</p>' +
      '<form id="barber-access-form" class="admin-form"><label>E-mail atualmente vinculado ao Barbeiro 2</label><input type="email" value="' + safe(accessEmail) + '" readonly>' +
      '<label>Novo e-mail profissional</label><input name="email" type="email" maxlength="254" autocomplete="off" placeholder="Digite o e-mail definitivo do barbeiro" required>' +
      '<p id="barber-access-message" class="muted" role="status">' + safe(accessLoadMessage || "Após a troca, o barbeiro usará PRIMEIRO ACESSO para receber um código neste endereço e criar a própria senha.") + '</p>' +
      '<button class="btn btn-primary" type="submit">SOLICITAR TROCA DE E-MAIL</button></form></section>';
    html += '</div><div class="manage-panel" role="tabpanel" data-manage-panel="barbers"><section class="summary"><h3>BARBEIROS</h3><p class="muted">Edite nome, comissão e disponibilidade. Desativar preserva o histórico.</p>';
    html += '<button type="button" class="btn btn-primary admin-reveal-button" data-reveal="new-barber-form">+ ADICIONAR BARBEIRO</button><div id="new-barber-form-wrap" class="admin-reveal-content" hidden><form id="new-barber-form" class="admin-form"><h4>Novo barbeiro</h4><label>Nome</label><input name="name" maxlength="80" required placeholder="Nome do profissional"><label>Comissão (%)</label><input name="commission" type="number" min="0" max="100" step="0.01" value="50" required><button class="btn btn-primary" type="submit">CADASTRAR BARBEIRO</button></form></div>';
    html += '<button type="button" class="btn btn-secondary admin-list-toggle" data-list-toggle="barber-list">VER EQUIPE CADASTRADA</button><div id="barber-list" class="admin-reveal-content" hidden>';
    barberRows.forEach(function(b){
      html += '<form class="summary admin-item" data-barber-form="' + safe(b.id) + '">' +
        '<label>Nome</label><input name="name" maxlength="80" required value="' + safe(b.name) + '">' +
        '<label>Comissão (%)</label><input name="commission" type="number" min="0" max="100" step="0.01" required value="' + Number(b.commission_percent || 0) + '">' +
        '<label class="admin-check"><input name="active" type="checkbox" ' + (b.active ? "checked" : "") + '> Ativo e disponível no totem</label>' +
        '<button class="btn btn-primary" type="submit">SALVAR ' + safe(b.name).toUpperCase() + '</button></form>';
    });
    html += '</div></section></div><div class="manage-panel" role="tabpanel" data-manage-panel="services"><section class="summary"><h3>SERVIÇOS E COMBOS</h3><p class="muted">Cadastre ou consulte os serviços quando precisar.</p>';
    html += '<button type="button" class="btn btn-primary admin-reveal-button" data-reveal="new-service-form">+ ADICIONAR CORTE / SERVIÇO</button><div id="new-service-form-wrap" class="admin-reveal-content" hidden><form id="new-service-form" class="admin-form"><h4>Novo corte ou serviço</h4><label>Nome</label><input name="name" maxlength="100" required placeholder="Ex.: Corte infantil"><label>Descrição</label><input name="detail" maxlength="180" placeholder="Descrição opcional"><label>Preço (R$)</label><input name="price" type="number" min="0" step="0.01" required><button class="btn btn-primary" type="submit">SALVAR SERVIÇO</button></form></div>';
    html += '<button type="button" class="btn btn-secondary admin-list-toggle" data-list-toggle="service-list">VER SERVIÇOS CADASTRADOS</button><div id="service-list" class="admin-reveal-content" hidden>';
    serviceRows.forEach(function(s){
      html += '<form class="summary admin-item" data-service-form="' + safe(s.id) + '">' +
        '<label>Nome</label><input name="name" maxlength="100" required value="' + safe(s.name) + '">' +
        '<label>Descrição</label><input name="detail" maxlength="180" value="' + safe(s.detail || "") + '">' +
        '<label>Preço (R$)</label><input name="price" type="number" min="0" step="0.01" required value="' + Number(s.price) + '">' +
        '<label class="admin-check"><input name="active" type="checkbox" ' + (s.active ? "checked" : "") + '> Ativo no totem</label>' +
        '<button class="btn btn-primary" type="submit">SALVAR ' + safe(s.name).toUpperCase() + '</button></form>';
    });
    html += '</div></section></div></div>';
    content.innerHTML = html;
    content.querySelectorAll('[data-reveal]').forEach(function(button){
      button.addEventListener('click',function(){
        const wrap = content.querySelector('#'+button.dataset.reveal+'-wrap');
        if(!wrap) return;
        const opening = wrap.hidden;
        wrap.hidden = !opening;
        button.textContent = opening ? 'FECHAR CADASTRO' : (button.dataset.reveal === 'new-service-form' ? '+ ADICIONAR CORTE / SERVIÇO' : '+ ADICIONAR BARBEIRO');
        if(opening) wrap.querySelector('input')?.focus();
      });
    });
    content.querySelectorAll('[data-list-toggle]').forEach(function(button){
      button.addEventListener('click',function(){
        const list = content.querySelector('#'+button.dataset.listToggle);
        if(!list) return;
        list.hidden = !list.hidden;
        button.textContent = list.hidden ? (button.dataset.listToggle === 'service-list' ? 'VER SERVIÇOS CADASTRADOS' : 'VER EQUIPE CADASTRADA') : 'OCULTAR LISTA';
      });
    });
    bindAdminNavigation();
    content.querySelectorAll("[data-manage-tab]").forEach(function(tab){
      tab.addEventListener("click", function(){
        const selected = tab.dataset.manageTab;
        content.querySelectorAll("[data-manage-tab]").forEach(function(item){
          const active = item === tab;
          item.classList.toggle("active",active);
          item.setAttribute("aria-selected",active ? "true" : "false");
        });
        content.querySelectorAll("[data-manage-panel]").forEach(function(panel){
          panel.classList.toggle("active",panel.dataset.managePanel === selected);
        });
      });
    });

    const accessForm = content.querySelector("#barber-access-form");
    accessForm.addEventListener("submit", async function(e){
      e.preventDefault();
      const email = String(new FormData(accessForm).get("email") || "").trim().toLowerCase();
      const button = accessForm.querySelector('button[type="submit"]');
      const status = accessForm.querySelector("#barber-access-message");
      if(!email) return;
      button.disabled = true;
      status.textContent = "Enviando solicitação segura...";
      const result = await db.functions.invoke("lacorte-admin-barber-email", { body: { action: "update", email: email } });
      button.disabled = false;
      if(result.error || result.data?.error){
        status.textContent = "Não foi possível solicitar a troca: " + (result.data?.error || result.error?.message || "Erro desconhecido.");
        return;
      }
      status.textContent = result.data.message || "Solicitação enviada.";
      accessForm.querySelector('input[name="email"]').value = "";
    });

    const newBarber = content.querySelector("#new-barber-form");
    newBarber.addEventListener("submit", async function(e){
      e.preventDefault();
      const fd = new FormData(newBarber);
      const name = String(fd.get("name") || "").trim();
      const id = "barbeiro-" + slugId(name);
      const commission = Number(fd.get("commission"));
      if(!name || !Number.isFinite(commission) || commission < 0 || commission > 100) return alert("Confira o nome e a comissão (0 a 100%).");
      const result = await db.from("barbers").insert({id:id,name:name,active:true,commission_percent:commission});
      if(result.error) return alert("Não foi possível cadastrar. Verifique se o ID já existe. " + result.error.message);
      alert("Barbeiro cadastrado. Para acessar o painel, ainda será necessário criar a conta de acesso e vinculá-la ao perfil.");
      renderAdminManagement();
    });

    content.querySelectorAll("[data-barber-form]").forEach(function(form){
      form.addEventListener("submit", async function(e){
        e.preventDefault();
        const fd = new FormData(form);
        const commission = Number(fd.get("commission"));
        if(!Number.isFinite(commission) || commission < 0 || commission > 100) return alert("A comissão deve ficar entre 0 e 100%.");
        const result = await db.from("barbers").update({
          name:String(fd.get("name") || "").trim(),
          commission_percent:commission,
          active:fd.get("active") === "on"
        }).eq("id",form.dataset.barberForm);
        if(result.error) return alert("Erro ao salvar barbeiro: " + result.error.message);
        alert("Barbeiro atualizado.");
        renderAdminManagement();
      });
    });

    const newService = content.querySelector("#new-service-form");
    newService.addEventListener("submit", async function(e){
      e.preventDefault();
      const fd = new FormData(newService);
      const name = String(fd.get("name") || "").trim();
      const price = Number(fd.get("price"));
      if(!name || !Number.isFinite(price) || price < 0) return alert("Confira o nome e o preço.");
      const id = slugId(name);
      const result = await db.from("services").insert({
        id:id,name:name,detail:String(fd.get("detail") || "").trim(),price:price,active:true
      });
      if(result.error) return alert("Não foi possível cadastrar. O identificador pode já existir. " + result.error.message);
      alert("Serviço cadastrado.");
      renderAdminManagement();
    });

    content.querySelectorAll("[data-service-form]").forEach(function(form){
      form.addEventListener("submit", async function(e){
        e.preventDefault();
        const fd = new FormData(form);
        const price = Number(fd.get("price"));
        if(!Number.isFinite(price) || price < 0) return alert("Informe um preço válido.");
        const result = await db.from("services").update({
          name:String(fd.get("name") || "").trim(),
          detail:String(fd.get("detail") || "").trim(),
          price:price,
          active:fd.get("active") === "on"
        }).eq("id",form.dataset.serviceForm);
        if(result.error) return alert("Erro ao salvar serviço: " + result.error.message);
        alert("Serviço atualizado.");
        renderAdminManagement();
      });
    });
  } catch(error) {
    content.innerHTML = adminNavigation() + '<p class="muted">' + safe(error.message) + '</p>';
    bindAdminNavigation();
  }
}

async function renderAdminPlans(){
  if(state.role !== "admin") return renderQueueDashboard();
  setAppMode(true);
  setHeader("ADMINISTRAÇÃO LACORTE", "Planos e assinaturas", "Cadastre planos e controle as assinaturas dos clientes.");
  notice.textContent = "Ativação manual após confirmar o pagamento fora do site. Nenhuma cobrança é feita aqui.";
  dashboardActions();
  content.innerHTML = adminNavigation() + '<p class="muted">Carregando planos e assinaturas...</p>';
  try {
    const results = await Promise.all([
      db.from("lacorte_plans").select("id,name,description,monthly_price,benefits,active").order("created_at", {ascending:false}),
      db.from("customers").select("id,first_name,last_name,phone,email").order("first_name"),
      db.from("lacorte_customer_plans").select("*").order("created_at", {ascending:false})
    ]);
    results.forEach(function(r){ if(r.error) throw new Error(r.error.message); });
    const rows = results[0].data || [];
    const customers = results[1].data || [];
    const subscriptions = results[2].data || [];
    const localDateString = function(date){
      return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
    };
    const todayString = localQueueDate();
    const expiredSubscriptions = subscriptions.filter(function(sub){
      return sub.status === "active" && sub.expires_at && sub.expires_at < todayString;
    });
    for(const expiredSub of expiredSubscriptions){
      const expiryUpdate = await db.from("lacorte_customer_plans")
        .update({status:"expired",updated_at:new Date().toISOString()})
        .eq("id",expiredSub.id).eq("status","active");
      if(expiryUpdate.error) console.warn("Não foi possível atualizar assinatura vencida:",expiryUpdate.error.message);
      else expiredSub.status = "expired";
    }
    const customerById = {};
    customers.forEach(function(c){ customerById[c.id] = c; });
    let html = adminNavigation();
    const sevenDaysDate = new Date();
    sevenDaysDate.setDate(sevenDaysDate.getDate()+7);
    const sevenDaysString = localDateString(sevenDaysDate);
    const activeSubscriptions = subscriptions.filter(function(sub){
      return sub.status === "active" && sub.expires_at && sub.expires_at >= todayString;
    });
    const expiringSoonCount = activeSubscriptions.filter(function(sub){
      return sub.expires_at <= sevenDaysString;
    }).length;
    const expiredCount = subscriptions.filter(function(sub){
      return sub.status === "expired" || (sub.expires_at && sub.expires_at < todayString);
    }).length;
    html += '<section class="summary"><h3>RESUMO DAS ASSINATURAS</h3><div class="report-status-grid">' +
      '<div><span>Assinaturas ativas</span><strong>'+activeSubscriptions.length+'</strong></div>' +
      '<div><span>Vencendo em até 7 dias</span><strong>'+expiringSoonCount+'</strong></div>' +
      '<div><span>Assinaturas vencidas</span><strong>'+expiredCount+'</strong></div>' +
      '</div></section>';
    html += '<section class="summary"><h3>ASSINATURAS</h3><p class="muted">Ative ou consulte assinaturas somente quando precisar.</p><button type="button" class="btn btn-primary admin-reveal-button" data-reveal="activate-plan">+ ATIVAR ASSINATURA</button><div id="activate-plan-wrap" class="admin-reveal-content" hidden><p class="muted">Confirme o pagamento primeiro. Depois selecione o cliente, o plano e o período de validade.</p>';
    if(!customers.length) html += '<p class="muted">Nenhum cliente cadastrado ainda.</p>';
    else if(!rows.some(function(p){return p.active;})) html += '<p class="muted">Cadastre e ative pelo menos um plano antes de ativar assinaturas.</p>';
    else {
      const today = new Date(localQueueDate()+"T12:00:00");
      const dateValue = function(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
      const nextMonth = new Date(today.getFullYear(),today.getMonth()+1,today.getDate());
      html += '<form id="activate-customer-plan" class="admin-form">' +
        '<label>Cliente</label><select name="customer_id" required><option value="">Selecione o cliente</option>' +
        customers.map(function(c){return '<option value="'+safe(c.id)+'">'+safe(c.first_name+' '+c.last_name)+' • '+safe(c.phone || c.email || '')+'</option>';}).join('') +
        '</select><label>Plano</label><select name="plan_id" required><option value="">Selecione o plano</option>' +
        rows.filter(function(p){return p.active;}).map(function(p){return '<option value="'+safe(p.id)+'">'+safe(p.name)+' • '+money(p.monthly_price)+'</option>';}).join('') +
        '</select><label>Início da assinatura</label><input name="start_date" type="date" required value="'+dateValue(today)+'">' +
        '<label>Vencimento</label><input name="expires_at" type="date" required value="'+dateValue(nextMonth)+'">' +
        '<label>Pagamento confirmado por</label><select name="payment_method" required><option value="">Selecione</option><option>InfinitePay</option><option>Pix</option><option>Dinheiro</option><option>Cartão</option><option>Outro</option></select>' +
        '<label>Observação (opcional)</label><input name="notes" maxlength="500" placeholder="Ex.: comprovante conferido">' +
        '<button class="btn btn-primary" type="submit">ATIVAR ASSINATURA</button></form>';
    }
    html += '</div></section>';
    html += '<section class="summary"><h3>HISTÓRICO DE ASSINATURAS</h3><button type="button" class="btn btn-secondary admin-list-toggle" data-list-toggle="subscription-history">CONSULTAR HISTÓRICO</button><div id="subscription-history" class="admin-reveal-content" hidden><p class="muted">Pesquise pelo nome, telefone ou plano.</p>';
    html += '<label for="subscription-history-search">Buscar no histórico</label><input id="subscription-history-search" type="search" placeholder="Nome do cliente, telefone ou plano">';
    if(!subscriptions.length) html += '<p class="muted">Nenhuma assinatura registrada.</p>';
    subscriptions.forEach(function(sub){
      const c = customerById[sub.customer_id] || {};
      const customerName = (c.first_name || "Cliente")+' '+(c.last_name || "");
      const remaining = Math.max(0,Number(sub.included_cuts)-Number(sub.used_cuts));
      const statusLabel = ({active:"Ativa",expired:"Vencida",exhausted:"Cortes esgotados",suspended:"Suspensa"})[sub.status] || sub.status;
      const todayDate = new Date(todayString+"T00:00:00");
      const expiryDate = sub.expires_at ? new Date(sub.expires_at+"T00:00:00") : null;
      const daysRemaining = expiryDate ? Math.ceil((expiryDate-todayDate)/86400000) : null;
      const isExpired = sub.status === "expired" || (sub.expires_at && sub.expires_at < todayString);
      const expiryNotice = isExpired
        ? '<p class="notice"><strong>ASSINATURA VENCIDA:</strong> Esta assinatura passou da data de validade.</p>'
        : sub.status === "active" && daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 7
          ? '<p class="notice"><strong>ATENÇÃO:</strong> '+(daysRemaining === 0 ? "A assinatura vence hoje." : "A assinatura vence em "+daysRemaining+" dia(s).")+'</p>'
          : "";
      const searchText = [customerName,c.phone || "",c.email || "",sub.plan_name || "",statusLabel].join(" ").toLowerCase();
      const paidDate = sub.paid_at ? new Date(sub.paid_at).toLocaleString("pt-BR") : "Não informado";
      html += '<article class="summary admin-item" data-subscription-history-card data-search="'+safe(searchText)+'"><h3>'+safe(sub.plan_name)+'</h3><p><strong>Cliente:</strong> '+safe(customerName)+'</p><p><strong>Telefone:</strong> '+safe(c.phone || "—")+'</p><p><strong>Período:</strong> '+safe(sub.start_date)+' até '+safe(sub.expires_at)+'</p>'+expiryNotice+'<p><strong>Cortes:</strong> '+Number(sub.used_cuts)+' usados • '+remaining+' restantes de '+Number(sub.included_cuts)+'</p><p><strong>Valor:</strong> '+money(sub.monthly_price)+' • <strong>Pagamento:</strong> '+safe(sub.payment_method || "—")+'</p><p><strong>Pagamento registrado:</strong> '+safe(paidDate)+'</p><p><strong>Status:</strong> '+safe(statusLabel)+'</p>';
      if(sub.notes) html += '<p><strong>Observação:</strong> '+safe(sub.notes)+'</p>';
      if(sub.status === "active") html += '<button class="btn btn-secondary" type="button" data-suspend-plan="'+safe(sub.id)+'">SUSPENDER ASSINATURA</button>';
      if(sub.status === "suspended") html += '<button class="btn btn-primary" type="button" data-reactivate-plan="'+safe(sub.id)+'">REATIVAR ASSINATURA</button>';
      html += '</article>';
    });
    html += '</div></section>';
    html += '<section class="summary"><h3>PLANOS</h3><p class="muted">Cadastre ou consulte os planos disponíveis.</p><button type="button" class="btn btn-primary admin-reveal-button" data-reveal="new-plan-form">+ ADICIONAR PLANO</button><div id="new-plan-form-wrap" class="admin-reveal-content" hidden><form id="new-plan-form" class="admin-form">' +
      '<label>Nome</label><input name="name" maxlength="100" required placeholder="Ex.: LaCorte Premium">' +
      '<label>Descrição</label><textarea name="description" maxlength="500" rows="3"></textarea>' +
      '<label>Valor mensal (R$)</label><input name="monthly_price" type="number" min="0" step="0.01" required>' +
      '<label>Benefícios (um por linha)</label><textarea name="benefits" rows="4" placeholder="4 cortes por mês&#10;Desconto em produtos"></textarea>' +
      '<button class="btn btn-primary" type="submit">CADASTRAR PLANO</button></form>';
    html += '<div id="plan-list-items" class="admin-reveal-content" hidden>';
    if(!rows.length) html += '<p class="muted">Nenhum plano cadastrado ainda.</p>';
    rows.forEach(function(p){
      const benefits = Array.isArray(p.benefits) ? p.benefits.join("\n") : "";
      html += '<form class="summary admin-item" data-plan-form="' + safe(p.id) + '">' +
        '<label>Nome</label><input name="name" maxlength="100" required value="' + safe(p.name) + '">' +
        '<label>Descrição</label><textarea name="description" maxlength="500" rows="3">' + safe(p.description || "") + '</textarea>' +
        '<label>Valor mensal (R$)</label><input name="monthly_price" type="number" min="0" step="0.01" required value="' + Number(p.monthly_price) + '">' +
        '<label>Benefícios (um por linha)</label><textarea name="benefits" rows="4">' + safe(benefits) + '</textarea>' +
        '<label class="admin-check"><input name="active" type="checkbox" ' + (p.active ? "checked" : "") + '> Disponível para venda</label>' +
        '<button class="btn btn-primary" type="submit">SALVAR PLANO</button></form>';
    });
    html += '</section>';
    content.innerHTML = html;
    bindAdminNavigation();
    content.querySelectorAll('[data-reveal],[data-list-toggle]').forEach(function(button){
      button.addEventListener('click',function(){
        const id=button.dataset.reveal ? button.dataset.reveal+'-wrap' : button.dataset.listToggle;
        const target=content.querySelector('#'+id);
        if(!target) return;
        target.hidden=!target.hidden;
        const open=!target.hidden;
        if(button.dataset.reveal) button.textContent=open?'FECHAR':'+'+(button.dataset.reveal==='new-plan-form'?' ADICIONAR PLANO':' ATIVAR ASSINATURA');
        else button.textContent=open?'OCULTAR':'VER '+(id==='plan-list-items'?'PLANOS CADASTRADOS':'HISTÓRICO');
      });
    });
    const activationForm = content.querySelector("#activate-customer-plan");
    if(activationForm) activationForm.addEventListener("submit", async function(e){
      e.preventDefault();
      const fd = new FormData(activationForm);
      const customerId = String(fd.get("customer_id") || "");
      const plan = rows.find(function(p){return p.id === String(fd.get("plan_id") || "");});
      const startDate = String(fd.get("start_date") || "");
      const expiresAt = String(fd.get("expires_at") || "");
      if(!customerId || !plan || !startDate || !expiresAt || expiresAt < startDate) return alert("Confira cliente, plano e datas.");
      const includedCuts = planIncludedCuts(plan);
      if(!includedCuts) return alert("Informe a quantidade de cortes nos benefícios do plano (ex.: 4 cortes por mês) antes de ativar a assinatura.");
      const existing = await db.from("lacorte_customer_plans").select("id").eq("customer_id",customerId).eq("status","active").limit(1);
      if(existing.error) return alert("Não foi possível verificar assinaturas anteriores: "+existing.error.message);
      if(existing.data && existing.data.length) return alert("Este cliente já possui uma assinatura ativa. Suspenda a anterior antes de ativar outra.");
      const saved = await db.from("lacorte_customer_plans").insert({
        customer_id:customerId,plan_id:plan.id,plan_name:plan.name,monthly_price:plan.monthly_price,
        start_date:startDate,expires_at:expiresAt,included_cuts:includedCuts,used_cuts:0,status:"active",
        paid_at:new Date().toISOString(),payment_method:String(fd.get("payment_method") || ""),
        notes:String(fd.get("notes") || "").trim()
      });
      if(saved.error) return alert("Erro ao ativar assinatura: "+saved.error.message);
      alert("Assinatura ativada. O pagamento foi registrado como confirmado manualmente.");
      renderAdminPlans();
    });
    content.querySelectorAll("[data-suspend-plan]").forEach(function(button){
      button.addEventListener("click", async function(){
        if(!confirm("Deseja suspender esta assinatura?")) return;
        const updated = await db.from("lacorte_customer_plans").update({status:"suspended",updated_at:new Date().toISOString()}).eq("id",button.dataset.suspendPlan);
        if(updated.error) return alert("Erro ao suspender: "+updated.error.message);
        renderAdminPlans();
      });
    });
    content.querySelectorAll("[data-reactivate-plan]").forEach(function(button){
      button.addEventListener("click", async function(){
        const subscription = subscriptions.find(function(item){return item.id === button.dataset.reactivatePlan;});
        if(!subscription) return alert("Assinatura não encontrada. Atualize a página.");
        const today = localQueueDate();
        if(subscription.expires_at < today) return alert("Esta assinatura está vencida. Cadastre uma nova assinatura após confirmar o pagamento.");
        if(Number(subscription.used_cuts) >= Number(subscription.included_cuts)) return alert("Esta assinatura não possui cortes disponíveis. Não é possível reativar os benefícios.");
        const otherActive = await db.from("lacorte_customer_plans").select("id").eq("customer_id",subscription.customer_id).eq("status","active").neq("id",subscription.id).limit(1);
        if(otherActive.error) return alert("Não foi possível verificar outras assinaturas: "+otherActive.error.message);
        if(otherActive.data && otherActive.data.length) return alert("Este cliente já possui outra assinatura ativa.");
        if(!confirm("Deseja reativar esta assinatura mantendo os créditos e a validade atuais?")) return;
        button.disabled = true;
        const updated = await db.from("lacorte_customer_plans").update({status:"active",updated_at:new Date().toISOString()}).eq("id",subscription.id).eq("status","suspended");
        if(updated.error) { button.disabled = false; return alert("Erro ao reativar: "+updated.error.message); }
        alert("Assinatura reativada. Os créditos e a validade foram mantidos.");
        renderAdminPlans();
      });
    });
    content.querySelector("#new-plan-form").addEventListener("submit", async function(e){
      e.preventDefault();
      const form = e.currentTarget, fd = new FormData(form), name = String(fd.get("name") || "").trim(), price = Number(fd.get("monthly_price"));
      if(!name || !Number.isFinite(price) || price < 0) return alert("Confira o nome e o valor mensal.");
      const benefits = String(fd.get("benefits") || "").split("\n").map(x=>x.trim()).filter(Boolean);
      const saved = await db.from("lacorte_plans").insert({name,description:String(fd.get("description") || "").trim(),monthly_price:price,benefits,active:true});
      if(saved.error) return alert("Erro ao cadastrar: " + saved.error.message);
      alert("Plano cadastrado."); renderAdminPlans();
    });
    content.querySelectorAll("[data-plan-form]").forEach(function(form){
      form.addEventListener("submit", async function(e){
        e.preventDefault();
        const fd = new FormData(form), name = String(fd.get("name") || "").trim(), price = Number(fd.get("monthly_price"));
        if(!name || !Number.isFinite(price) || price < 0) return alert("Confira o nome e o valor mensal.");
        const benefits = String(fd.get("benefits") || "").split("\n").map(x=>x.trim()).filter(Boolean);
        const saved = await db.from("lacorte_plans").update({name,description:String(fd.get("description") || "").trim(),monthly_price:price,benefits,active:fd.get("active") === "on",updated_at:new Date().toISOString()}).eq("id",form.dataset.planForm);
        if(saved.error) return alert("Erro ao salvar plano: " + saved.error.message);
        alert("Plano atualizado."); renderAdminPlans();
      });
    });
  } catch(error) {
    content.innerHTML = adminNavigation() + '<p class="muted">Erro ao carregar planos e assinaturas: ' + safe(error.message) + '</p>';
    bindAdminNavigation();
  }
}

function planIncludedCuts(plan){
  const benefits = Array.isArray(plan && plan.benefits) ? plan.benefits.join(" ") : "";
  const match = benefits.match(/(?:^|\D)(\d{1,3})\s+cortes?\b/i);
  if(!match) return null;
  const count = Number(match[1]);
  return Number.isInteger(count) && count > 0 ? count : null;
}
function slugId(value){
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,45);
}

const originalRenderQueueDashboard = renderQueueDashboard;
renderQueueDashboard = function(){
  if(state.role === "admin" && adminView === "manage") return renderAdminManagement();
  if(state.role === "admin" && adminView === "plans") return renderAdminPlans();
  if(state.role === "admin" && adminView === "reports") return renderAdminReports();
  originalRenderQueueDashboard();
  if(state.role === "admin"){
    const previous = content.innerHTML;
    content.innerHTML = adminNavigation() + previous;
    bindAdminNavigation();
  }
};

initLaCorte();

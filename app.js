
const SUPABASE_URL = "https://xwctsfpqwugygxpsrcfw.supabase.co";
const SUPABASE_KEY = "sb_publishable_L274hUI6sbyDGFe7u40U-Q_tK28Oh5s";

const db = window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { detectSessionInUrl: false, flowType: "implicit" } }) : null;

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
  barber:null,
  message:"",
  customerPlan:null,
  customerPlanBenefits:[]
};

const content = document.querySelector("#step-content");
const actions = document.querySelector("#step-actions");
const notice = document.querySelector("#demo-notice");

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
  document.querySelector("#step-kicker").textContent=kicker;
  document.querySelector("#step-title").textContent=title;
  document.querySelector("#step-description").textContent=description;
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
  if(state.step===4) renderBarbers();
  if(state.step===5) renderConfirmation();
}

function renderLogin(){
  setHeader(
    "ETAPA 01",
    "Acesse sua conta",
    "Informe seu e-mail, solicite o código e digite os 6 números aqui mesmo."
  );

  content.innerHTML=`
    <form id="login-form">
      <label for="email">Seu e-mail</label>
      <input
        id="email"
        name="email"
        type="email"
        placeholder="seuemail@exemplo.com"
        autocomplete="email"
        value="${safe(state.pendingEmail || "")}"
        required
      >
      <button class="btn btn-secondary" id="send-code-button" type="button">
        ENVIAR CÓDIGO DE ACESSO
      </button>
      <label for="email-code">Código de 6 dígitos</label>
      <input
        id="email-code"
        name="token"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        pattern="[0-9]{6}"
        maxlength="6"
        placeholder="000000"
      >
      <p class="muted">O campo do código já está disponível. Confira também a caixa de spam.</p>
      <p id="app-message" class="muted">${safe(state.message)}</p>
      <button class="btn btn-primary" id="verify-code-button" type="submit">
        CONFIRMAR CÓDIGO
      </button>
    </form>
  `;

  actions.replaceChildren();

  document.querySelector("#send-code-button").addEventListener("click", async function(){
    const email=document.querySelector("#email").value.trim();
    if(!email){
      showMessage("Informe seu e-mail primeiro.");
      return;
    }
    const button=document.querySelector("#send-code-button");
    button.disabled=true;
    showMessage("Enviando código de acesso...");
    const {error}=await db.auth.signInWithOtp({
      email:email,
      options:{shouldCreateUser:true}
    });
    button.disabled=false;
    if(error){
      showMessage("Erro ao enviar código: "+error.message);
      return;
    }
    state.pendingEmail=email;
    showMessage("Código enviado. Digite os 6 números no campo acima.");
    document.querySelector("#email-code").focus();
  });

  document.querySelector("#login-form").addEventListener("submit",async function(e){
    e.preventDefault();
    const email=document.querySelector("#email").value.trim();
    const token=document.querySelector("#email-code").value.trim();
    if(!email){
      showMessage("Informe seu e-mail.");
      return;
    }
    if(!/^[0-9]{6}$/.test(token)){
      showMessage("Digite os 6 números do código recebido.");
      return;
    }
    const button=document.querySelector("#verify-code-button");
    button.disabled=true;
    showMessage("Validando código...");
    const {data,error}=await db.auth.verifyOtp({
      email:email,
      token:token,
      type:"email"
    });
    if(error){
      button.disabled=false;
      showMessage("Não foi possível validar o código: "+error.message);
      return;
    }
    state.pendingEmail="";
    try {
      if (data && data.session) {
        const savedSession = await db.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token
        });
        if (savedSession.error) throw savedSession.error;
      }
      const sessionCheck = await db.auth.getSession();
      const authenticatedUser = (sessionCheck.data && sessionCheck.data.session && sessionCheck.data.session.user) || (data && data.user);
      if (sessionCheck.error) throw sessionCheck.error;
      if (authenticatedUser) {
        await routeAuthenticatedUser(authenticatedUser);
      } else {
        showMessage("Código confirmado, mas a sessão não foi salva. Tente entrar novamente.");
      }
    } catch (routeError) {
      showMessage("Código confirmado, mas não foi possível abrir seu cadastro: " + (routeError.message || routeError));
    }
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
  const today = new Date().toISOString().slice(0,10);
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
  setHeader(
    "ETAPA 03",
    "Escolha seus serviços",
    "Você pode selecionar mais de um serviço."
  );

  content.innerHTML=renderCustomerPlanCard()+'<div class="grid" id="choices"></div>';

  const grid=document.querySelector("#choices");

  services.forEach(s=>{
    const el=document.createElement("button");

    el.className="choice"+
      (state.selectedServices.some(x=>x.id===s.id)?" selected":"");

    el.innerHTML=`
      <span class="name">${safe(s.name)}</span>
      <span class="detail">${safe(s.detail)}</span>
      <span class="price">${money(s.price)}</span>
    `;

    el.onclick=()=>{
      const exists=state.selectedServices.some(x=>x.id===s.id);

      state.selectedServices=exists
        ?state.selectedServices.filter(x=>x.id!==s.id)
        :[...state.selectedServices,s];

      renderServices();
    };

    grid.append(el);
  });

  const total=state.selectedServices.reduce((sum,s)=>sum+s.price,0);

  const totalEl=document.createElement("div");
  totalEl.className="summary";
  totalEl.innerHTML=`
    <div class="summary-row">
      <span>Serviços selecionados</span>
      <strong>${state.selectedServices.length}</strong>
    </div>
    <div class="summary-row summary-total">
      <span>Total</span>
      <strong>${money(total)}</strong>
    </div>
  `;
  content.append(totalEl);

  setActions(
    ()=>{state.step=2;render();},
    ()=>{
      state.step=4;
      render();
    },
    "ESCOLHER BARBEIRO",
    state.selectedServices.length===0
  );
}

function renderBarbers(){
  setHeader(
    "ETAPA 04",
    "Escolha seu barbeiro",
    "Selecione um profissional disponível."
  );

  content.innerHTML='<div class="grid" id="choices"></div>';

  const grid=document.querySelector("#choices");

  barbers.forEach(b=>{
    const el=document.createElement("button");

    el.className="choice"+
      (state.barber?.id===b.id?" selected":"");

    el.disabled=!b.available;

    el.innerHTML=`
      <span class="name">${safe(b.name)}</span>
      <span class="badge">
        ${b.available?"Disponível":"Indisponível"}
      </span>
    `;

    el.onclick=()=>{
      state.barber=b;
      renderBarbers();
    };

    grid.append(el);
  });

  setActions(
    ()=>{state.step=3;render();},
    ()=>{
      state.step=5;
      render();
    },
    "REVISAR SOLICITAÇÃO",
    !state.barber
  );
}

function renderConfirmation(){
  setHeader(
    "ETAPA 05",
    "Confira sua solicitação",
    "Confira seus dados, serviços e barbeiro."
  );

  const total=state.selectedServices.reduce((sum,s)=>sum+s.price,0);

  content.innerHTML=`
    <div class="summary">
      <div class="summary-row">
        <span>Cliente</span>
        <strong>${safe(state.customer.first_name)} ${safe(state.customer.last_name)}</strong>
      </div>
      <div class="summary-row">
        <span>Telefone</span>
        <strong>${safe(state.customer.phone)}</strong>
      </div>
      <div class="summary-row">
        <span>E-mail</span>
        <strong>${safe(state.customer.email)}</strong>
      </div>
      <div class="summary-row">
        <span>Aniversário</span>
        <strong>${safe(state.customer.birth_date)}</strong>
      </div>
    </div>

    <div class="summary">
      <strong>Serviços</strong>
      ${state.selectedServices.map(s=>`
        <div class="summary-row">
          <span>${safe(s.name)}</span>
          <strong>${money(s.price)}</strong>
        </div>
      `).join("")}
      <div class="summary-row summary-total">
        <span>Total</span>
        <strong>${money(total)}</strong>
      </div>
    </div>

    <div class="summary">
      <div class="summary-row">
        <span>Barbeiro</span>
        <strong>${safe(state.barber.name)}</strong>
      </div>
    </div>

    <p class="muted">
      Seus dados de cadastro foram salvos.
      A solicitação acima ainda não foi registrada como atendimento.
    </p>
  `;

  setActions(
    ()=>{state.step=4;render();},
    ()=>{
      showMessage(
        "Sua seleção está pronta. A gravação do atendimento será habilitada na próxima etapa."
      );
    },
    "FINALIZAR"
  );
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
      state.barber=null;
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
  actions.append(makeButton("SAIR DA CONTA", async function(){
    await db.auth.signOut();
  }, true));
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
  let query = db.from("lacorte_queue")
    .select("id,customer_id,barber_id,queue_date,queue_number,status,total_amount,commission_amount,created_at,started_at,completed_at")
    .eq("queue_date", localQueueDate())
    .order("queue_number", { ascending: true });

  if (state.role === "barber") query = query.eq("barber_id", state.barberId);

  const queueResult = await query;
  if (queueResult.error) throw new Error("Erro ao consultar fila: " + queueResult.error.message);

  const rows = queueResult.data || [];
  if (!rows.length) return [];

  const customerIds = Array.from(new Set(rows.map(function(row){ return row.customer_id; })));
  const queueIds = rows.map(function(row){ return row.id; });

  const results = await Promise.all([
    db.from("customers").select("id,first_name,last_name,phone").in("id", customerIds),
    db.from("lacorte_queue_items").select("queue_id,service_name,unit_price").in("queue_id", queueIds)
  ]);

  if (results[0].error) throw new Error("Erro ao consultar clientes da fila: " + results[0].error.message);
  if (results[1].error) throw new Error("Erro ao consultar serviços da fila: " + results[1].error.message);

  const customersById = {};
  (results[0].data || []).forEach(function(c){ customersById[c.id] = c; });
  const itemsByQueue = {};
  (results[1].data || []).forEach(function(item){
    if (!itemsByQueue[item.queue_id]) itemsByQueue[item.queue_id] = [];
    itemsByQueue[item.queue_id].push(item);
  });

  return rows.map(function(row){
    return Object.assign({}, row, {
      customer: customersById[row.customer_id] || null,
      items: itemsByQueue[row.id] || []
    });
  });
}

function renderQueueDashboard(){
  setAppMode(true);
  updateProgress();
  const admin = state.role === "admin";
  setHeader(
    admin ? "ADMINISTRAÇÃO LACORTE" : "PAINEL DO PROFISSIONAL",
    admin ? "Painel central" : "Minha fila",
    admin ? "Visão geral dos atendimentos de hoje." : "Acompanhe e atualize somente os seus atendimentos."
  );
  notice.textContent = "Fila presencial • Sem pagamento online.";
  content.innerHTML = '<p class="muted">Carregando fila...</p>';
  dashboardActions();

  loadQueueRows().then(function(rows){
    if (!content.isConnected) return;
    const waiting = rows.filter(function(r){ return r.status === "waiting"; }).length;
    const progressCount = rows.filter(function(r){ return r.status === "in_progress"; }).length;
    const completed = rows.filter(function(r){ return r.status === "completed"; }).length;

    let html = '<div class="summary">' +
      '<div class="summary-row"><span>Aguardando</span><strong>' + waiting + '</strong></div>' +
      '<div class="summary-row"><span>Em atendimento</span><strong>' + progressCount + '</strong></div>' +
      '<div class="summary-row"><span>Concluídos hoje</span><strong>' + completed + '</strong></div>' +
      '</div>';

    if (!rows.length) {
      html += '<div class="summary"><p class="muted">Ainda não há atendimentos na fila de hoje.</p></div>';
    } else {
      rows.forEach(function(row){
        const customerName = row.customer
          ? safe(row.customer.first_name) + " " + safe(row.customer.last_name)
          : "Cliente";
        const servicesText = row.items.map(function(item){
          return safe(item.service_name) + " (" + money(Number(item.unit_price)) + ")";
        }).join(", ");
        const barber = barbers.find(function(b){ return b.id === row.barber_id; });
        html += '<article class="summary">' +
          '<div class="summary-row"><span>Senha</span><strong>#' + row.queue_number + '</strong></div>' +
          '<div class="summary-row"><span>Cliente</span><strong>' + customerName + '</strong></div>' +
          '<div class="summary-row"><span>Telefone</span><strong>' + safe(row.customer ? row.customer.phone : "—") + '</strong></div>' +
          '<div class="summary-row"><span>Barbeiro</span><strong>' + safe(barber ? barber.name : row.barber_id) + '</strong></div>' +
          '<div class="summary-row"><span>Serviços</span><strong>' + (servicesText || "—") + '</strong></div>' +
          '<div class="summary-row"><span>Valor</span><strong>' + money(Number(row.total_amount)) + '</strong></div>' +
          '<div class="summary-row"><span>Entrada</span><strong>' + formatDateTime(row.created_at) + '</strong></div>' +
          '<div class="summary-row"><span>Status</span><strong>' + statusLabel(row.status) + '</strong></div>' +
          '<div class="actions">';
        if (row.status === "waiting") {
          html += '<button class="btn btn-primary" data-start="' + safe(row.id) + '">INICIAR ATENDIMENTO</button>';
        } else if (row.status === "in_progress") {
          html += '<button class="btn btn-primary" data-finish="' + safe(row.id) + '">FINALIZAR ATENDIMENTO</button>';
        }
        html += '</div></article>';
      });
    }

    content.innerHTML = (state.role === "admin" ? adminNavigation() : "") + html;
    if(state.role === "admin") bindAdminNavigation();
    content.querySelectorAll("[data-start]").forEach(function(button){
      button.addEventListener("click", async function(){
        button.disabled = true;
        const result = await db.rpc("lacorte_start_service", { p_queue_id: button.dataset.start });
        if (result.error) {
          alert("Não foi possível iniciar: " + result.error.message);
          button.disabled = false;
          return;
        }
        renderQueueDashboard();
      });
    });
    content.querySelectorAll("[data-finish]").forEach(function(button){
      button.addEventListener("click", async function(){
        button.disabled = true;
        const result = await db.rpc("lacorte_finish_service", { p_queue_id: button.dataset.finish });
        if (result.error) {
          alert("Não foi possível finalizar: " + result.error.message);
          button.disabled = false;
          return;
        }
        renderQueueDashboard();
      });
    });
  }).catch(function(error){
    content.innerHTML = '<p class="muted">' + safe(error.message) + '</p>';
  });
}

async function routeAuthenticatedUser(user){
  state.user = user;
  state.customer = null;
  state.selectedServices = [];
  state.barber = null;
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

  if (roleResult.data && (roleResult.data.role === "admin" || roleResult.data.role === "barber")) {
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
  if (state.submitting) return;
  if (!state.customer || !state.barber || !state.selectedServices.length) {
    showMessage("Confira seus dados, serviços e barbeiro antes de continuar.");
    return;
  }

  state.submitting = true;
  showMessage("Registrando sua entrada na fila...");

  const result = await db.rpc("lacorte_create_queue_entry", {
    p_customer_id: state.customer.id,
    p_barber_id: state.barber.id,
    p_service_ids: state.selectedServices.map(function(service){ return service.id; })
  });

  state.submitting = false;

  if (result.error) {
    showMessage("Não foi possível entrar na fila: " + result.error.message);
    return;
  }

  const ticket = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!ticket) {
    showMessage("O banco não retornou a confirmação da fila. Consulte a recepção antes de tentar novamente.");
    return;
  }

  state.queueTicket = ticket;
  renderQueueSuccess();
}

function renderQueueSuccess(){
  setAppMode(true);
  setHeader("ENTRADA CONFIRMADA", "Você entrou na fila!", "Sua senha foi registrada para o barbeiro escolhido.");
  notice.textContent = "Aguarde ser chamado pelo profissional.";
  const ticket = state.queueTicket;
  content.innerHTML = '<div class="waiting">' +
    '<p class="muted">SUA SENHA</p>' +
    '<div class="ticket">#' + safe(ticket.ticket_number) + '</div>' +
    '<div class="waiting-card">' +
      '<div class="summary-row"><span>Cliente</span><strong>' + safe(state.customer.first_name) + ' ' + safe(state.customer.last_name) + '</strong></div>' +
      '<div class="summary-row"><span>Barbeiro</span><strong>' + safe(state.barber.name) + '</strong></div>' +
      '<div class="summary-row"><span>Total</span><strong>' + money(Number(ticket.total_amount)) + '</strong></div>' +
      '<div class="summary-row"><span>Status</span><strong>Aguardando</strong></div>' +
    '</div>' +
    '<p class="muted">Sua entrada foi registrada. Aguarde as orientações da equipe LaCorte.</p>' +
    '</div>';
  actions.replaceChildren(makeButton("SAIR DA CONTA", async function(){ await db.auth.signOut(); }, true));
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
renderConfirmation = function(){
  setHeader("ETAPA 05", "Confira sua solicitação", "Confira seus dados, serviços e barbeiro antes de entrar na fila.");
  const preview = getCustomerPlanPreview();
  const total = preview
    ? preview.total
    : state.selectedServices.reduce(function(sum, service){ return sum + Number(service.price); }, 0);
  content.innerHTML =
    '<div class="summary">' +
      '<div class="summary-row"><span>Cliente</span><strong>' + safe(state.customer.first_name) + ' ' + safe(state.customer.last_name) + '</strong></div>' +
      '<div class="summary-row"><span>Telefone</span><strong>' + safe(state.customer.phone) + '</strong></div>' +
      '<div class="summary-row"><span>E-mail</span><strong>' + safe(state.customer.email) + '</strong></div>' +
    '</div>' +
    '<div class="summary"><strong>Serviços</strong>' +
      state.selectedServices.map(function(service){
        const linePrice = preview ? preview.total : Number(service.price);
        return '<div class="summary-row"><span>' + safe(service.name) + '</span><strong>' + money(linePrice) + '</strong></div>';
      }).join("") +
      (preview
        ? '<p class="muted">' + safe(preview.description) + '. Valor normal: ' + money(preview.normal) + '.</p><p class="muted">Benefício sujeito à confirmação de crédito disponível ao registrar a fila.</p>'
        : '') +
      '<div class="summary-row summary-total"><span>Total</span><strong>' + money(total) + '</strong></div>' +
    '</div>' +
    '<div class="summary"><div class="summary-row"><span>Barbeiro</span><strong>' + safe(state.barber.name) + '</strong></div></div>' +
    '<p id="app-message" class="muted">' + safe(state.message) + '</p>';

  setActions(
    function(){ state.step = 4; render(); },
    submitQueueEntry,
    "CONFIRMAR E ENTRAR NA FILA",
    state.submitting
  );
};
  setHeader("ETAPA 05", "Confira sua solicitação", "Confira seus dados, serviços e barbeiro antes de entrar na fila.");
  const total = state.selectedServices.reduce(function(sum, service){ return sum + Number(service.price); }, 0);
  content.innerHTML =
    '<div class="summary">' +
      '<div class="summary-row"><span>Cliente</span><strong>' + safe(state.customer.first_name) + ' ' + safe(state.customer.last_name) + '</strong></div>' +
      '<div class="summary-row"><span>Telefone</span><strong>' + safe(state.customer.phone) + '</strong></div>' +
      '<div class="summary-row"><span>E-mail</span><strong>' + safe(state.customer.email) + '</strong></div>' +
    '</div>' +
    '<div class="summary"><strong>Serviços</strong>' +
      state.selectedServices.map(function(service){
        return '<div class="summary-row"><span>' + safe(service.name) + '</span><strong>' + money(Number(service.price)) + '</strong></div>';
      }).join("") +
      '<div class="summary-row summary-total"><span>Total</span><strong>' + money(total) + '</strong></div>' +
    '</div>' +
    '<div class="summary"><div class="summary-row"><span>Barbeiro</span><strong>' + safe(state.barber.name) + '</strong></div></div>' +
    '<p id="app-message" class="muted">' + safe(state.message) + '</p>';

  setActions(
    function(){ state.step = 4; render(); },
    submitQueueEntry,
    "CONFIRMAR E ENTRAR NA FILA",
    state.submitting
  );
};

// Substitui o carregamento inicial antigo: primeiro identifica o perfil, depois abre a área correta.
async function initLaCorte(){
  setAppMode(false);

  // Exibe o formulário mesmo quando a biblioteca do Supabase não carregar.
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
      state.user = null;
      state.customer = null;
      state.role = null;
      state.barberId = null;
      state.selectedServices = [];
      state.barber = null;
      state.queueTicket = null;
      state.step = 1;
      state.message = "";
      setAppMode(false);
      render();
    }
  });
}


// ===== GERENCIAMENTO ADMINISTRATIVO LACORTE =====
let adminView = "queue";

function adminNavigation(){
  if(state.role !== "admin") return "";
  return '<div class="actions admin-nav">' +
    '<button class="btn ' + (adminView === "queue" ? "btn-primary" : "btn-secondary") + '" data-admin-view="queue">FILA DE HOJE</button>' +
    '<button class="btn ' + (adminView === "manage" ? "btn-primary" : "btn-secondary") + '" data-admin-view="manage">GERENCIAR</button>' +
    '<button class="btn ' + (adminView === "plans" ? "btn-primary" : "btn-secondary") + '" data-admin-view="plans">PLANOS</button>' +
    '</div>';
}

function bindAdminNavigation(){
  content.querySelectorAll("[data-admin-view]").forEach(function(button){
    button.addEventListener("click", function(){
      adminView = button.dataset.adminView;
      if(adminView === "manage") renderAdminManagement();
      else if(adminView === "plans") renderAdminPlans();
      else renderQueueDashboard();
    });
  });
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
    let html = adminNavigation();
    html += '<section class="summary"><h3>BARBEIROS</h3><p class="muted">Edite nome, comissão e disponibilidade. Desativar preserva o histórico.</p>';
    html += '<form id="new-barber-form" class="admin-form"><h4>Novo barbeiro</h4><label>Nome</label><input name="name" maxlength="80" required placeholder="Nome do profissional"><label>Comissão (%)</label><input name="commission" type="number" min="0" max="100" step="0.01" value="50" required><button class="btn btn-primary" type="submit">CADASTRAR BARBEIRO</button></form>';
    barberRows.forEach(function(b){
      html += '<form class="summary admin-item" data-barber-form="' + safe(b.id) + '">' +
        '<label>Nome</label><input name="name" maxlength="80" required value="' + safe(b.name) + '">' +
        '<label>Comissão (%)</label><input name="commission" type="number" min="0" max="100" step="0.01" required value="' + Number(b.commission_percent || 0) + '">' +
        '<label class="admin-check"><input name="active" type="checkbox" ' + (b.active ? "checked" : "") + '> Ativo e disponível no totem</label>' +
        '<button class="btn btn-primary" type="submit">SALVAR ' + safe(b.name).toUpperCase() + '</button></form>';
    });
    html += '</section><section class="summary"><h3>SERVIÇOS E COMBOS</h3><p class="muted">Edite nomes, descrições, preços e disponibilidade no autoatendimento.</p>';
    html += '<form id="new-service-form" class="admin-form"><h4>Novo serviço ou combo</h4><label>Nome</label><input name="name" maxlength="100" required placeholder="Ex.: Corte infantil"><label>Descrição</label><input name="detail" maxlength="180" placeholder="Descrição opcional"><label>Preço (R$)</label><input name="price" type="number" min="0" step="0.01" required><button class="btn btn-primary" type="submit">CADASTRAR SERVIÇO</button></form>';
    serviceRows.forEach(function(s){
      html += '<form class="summary admin-item" data-service-form="' + safe(s.id) + '">' +
        '<label>Nome</label><input name="name" maxlength="100" required value="' + safe(s.name) + '">' +
        '<label>Descrição</label><input name="detail" maxlength="180" value="' + safe(s.detail || "") + '">' +
        '<label>Preço (R$)</label><input name="price" type="number" min="0" step="0.01" required value="' + Number(s.price) + '">' +
        '<label class="admin-check"><input name="active" type="checkbox" ' + (s.active ? "checked" : "") + '> Ativo no totem</label>' +
        '<button class="btn btn-primary" type="submit">SALVAR ' + safe(s.name).toUpperCase() + '</button></form>';
    });
    html += '</section>';
    content.innerHTML = html;
    bindAdminNavigation();

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
    const customerById = {};
    customers.forEach(function(c){ customerById[c.id] = c; });
    let html = adminNavigation();
    html += '<section class="summary"><h3>ATIVAR ASSINATURA DE CLIENTE</h3><p class="muted">Confirme o pagamento primeiro. Depois selecione o cliente, o plano e o período de validade.</p>';
    if(!customers.length) html += '<p class="muted">Nenhum cliente cadastrado ainda.</p>';
    else if(!rows.some(function(p){return p.active;})) html += '<p class="muted">Cadastre e ative pelo menos um plano antes de ativar assinaturas.</p>';
    else {
      const today = new Date();
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
    html += '</section>';
    html += '<section class="summary"><h3>ASSINATURAS DOS CLIENTES</h3>';
    if(!subscriptions.length) html += '<p class="muted">Nenhuma assinatura registrada.</p>';
    subscriptions.forEach(function(sub){
      const c = customerById[sub.customer_id] || {};
      const remaining = Math.max(0,Number(sub.included_cuts)-Number(sub.used_cuts));
      const statusLabel = ({active:"Ativa",expired:"Vencida",exhausted:"Cortes esgotados",suspended:"Suspensa"})[sub.status] || sub.status;
      html += '<article class="summary admin-item"><h3>'+safe(sub.plan_name)+'</h3><p><strong>Cliente:</strong> '+safe((c.first_name || "Cliente")+' '+(c.last_name || ""))+'</p><p><strong>Telefone:</strong> '+safe(c.phone || "—")+'</p><p><strong>Validade:</strong> '+safe(sub.start_date)+' até '+safe(sub.expires_at)+'</p><p><strong>Cortes:</strong> '+Number(sub.used_cuts)+' usados • '+remaining+' restantes de '+Number(sub.included_cuts)+'</p><p><strong>Valor:</strong> '+money(sub.monthly_price)+' • <strong>Pagamento:</strong> '+safe(sub.payment_method || "—")+'</p><p><strong>Status:</strong> '+safe(statusLabel)+'</p>';
      if(sub.status === "active") html += '<button class="btn btn-secondary" type="button" data-suspend-plan="'+safe(sub.id)+'">SUSPENDER ASSINATURA</button>';
      html += '</article>';
    });
    html += '</section>';
    html += '<section class="summary"><h3>PLANOS CADASTRADOS</h3><p class="muted">Cadastre o valor mensal e um benefício por linha.</p><form id="new-plan-form" class="admin-form">' +
      '<label>Nome</label><input name="name" maxlength="100" required placeholder="Ex.: LaCorte Premium">' +
      '<label>Descrição</label><textarea name="description" maxlength="500" rows="3"></textarea>' +
      '<label>Valor mensal (R$)</label><input name="monthly_price" type="number" min="0" step="0.01" required>' +
      '<label>Benefícios (um por linha)</label><textarea name="benefits" rows="4" placeholder="4 cortes por mês&#10;Desconto em produtos"></textarea>' +
      '<button class="btn btn-primary" type="submit">CADASTRAR PLANO</button></form>';
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
    const activationForm = content.querySelector("#activate-customer-plan");
    if(activationForm) activationForm.addEventListener("submit", async function(e){
      e.preventDefault();
      const fd = new FormData(activationForm);
      const customerId = String(fd.get("customer_id") || "");
      const plan = rows.find(function(p){return p.id === String(fd.get("plan_id") || "");});
      const startDate = String(fd.get("start_date") || "");
      const expiresAt = String(fd.get("expires_at") || "");
      if(!customerId || !plan || !startDate || !expiresAt || expiresAt < startDate) return alert("Confira cliente, plano e datas.");
      const existing = await db.from("lacorte_customer_plans").select("id").eq("customer_id",customerId).eq("status","active").limit(1);
      if(existing.error) return alert("Não foi possível verificar assinaturas anteriores: "+existing.error.message);
      if(existing.data && existing.data.length) return alert("Este cliente já possui uma assinatura ativa. Suspenda a anterior antes de ativar outra.");
      const saved = await db.from("lacorte_customer_plans").insert({
        customer_id:customerId,plan_id:plan.id,plan_name:plan.name,monthly_price:plan.monthly_price,
        start_date:startDate,expires_at:expiresAt,included_cuts:4,used_cuts:0,status:"active",
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

function slugId(value){
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,45);
}

const originalRenderQueueDashboard = renderQueueDashboard;
renderQueueDashboard = function(){
  if(state.role === "admin" && adminView === "manage") return renderAdminManagement();
  if(state.role === "admin" && adminView === "plans") return renderAdminPlans();
  originalRenderQueueDashboard();
  if(state.role === "admin"){
    const previous = content.innerHTML;
    content.innerHTML = adminNavigation() + previous;
    bindAdminNavigation();
  }
};

initLaCorte();

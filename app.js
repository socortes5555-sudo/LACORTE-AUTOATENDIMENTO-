
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
  {id:"barbeiro-2",name:"Barbeiro 02",available:true}
];

const state = {
  step:1,
  user:null,
  customer:null,
  selectedServices:[],
  participants:[],
  activeParticipant:0,
  queueRequestId:null,
  message:"",
  customerPlan:null,
  customerPlanBenefits:[],
  lookupToken:null
};

const content = document.querySelector("#step-content");
const actions = document.querySelector("#step-actions");
const notice = document.querySelector("#demo-notice");

let customerAutoLogoutTimer = null;
const CUSTOMER_AUTO_LOGOUT_MS = 5 * 1000;

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
    "Seu cadastro fica salvo na LaCorte. Não há pagamento online neste atendimento.";

  if(state.step===1) renderLogin();
  if(state.step===2) renderProfile();
  if(state.step===3) renderServices();
  if(state.step===4) renderConfirmation();
}

function renderLogin(){
  clearKioskSelection();
  state.step=1;
  setHeader("AUTOATENDIMENTO LACORTE","Bem-vindo à LaCorte","Cadastre-se uma única vez ou localize seu cadastro.");
  content.innerHTML = `<div class="entry-choice" id="entry-choice-options">
    <article class="entry-card">
      <div class="choice-title">NOVO <em>CADASTRO</em></div>
      <p>Cadastre-se para acessar nossa fila.</p>
      <button class="btn btn-primary" id="start-registration" type="button">Cadastrar</button>
    </article>
    <article class="entry-card">
      <div class="choice-title">JÁ TENHO <em>CADASTRO</em></div>
      <p>Acesse seu cadastro rapidamente.</p>
      <button class="btn btn-primary" id="start-returning" type="button">Entrar</button>
    </article>
  </div><p id="app-message" class="muted" role="status">${safe(state.message)}</p>`;
  actions.replaceChildren();
  document.querySelector("#start-registration").addEventListener("click",renderProfile);
  document.querySelector("#start-returning").addEventListener("click",renderReturningCustomerLookup);
}

function renderReturningCustomerLookup(){
  state.step=1;
  setHeader("CLIENTE CADASTRADO","Localize seu cadastro","Digite seu nome completo ou seu telefone com DDD.");
  content.innerHTML = '<form id="returning-form"><label for="customer-identifier">Nome completo ou celular</label><input id="customer-identifier" type="text" maxlength="120" autocomplete="off" placeholder="Seu nome completo ou (48) 99999-9999" required><p class="muted">Se houver nomes iguais, use o número do celular para identificar o cadastro correto.</p><p id="app-message" class="muted" role="status">'+safe(state.message)+'</p><button class="btn btn-primary" type="submit">LOCALIZAR CADASTRO</button><button class="btn btn-secondary" id="back-entry-choice" type="button">VOLTAR</button></form>';
  actions.replaceChildren();
  document.querySelector("#back-entry-choice").addEventListener("click",renderLogin);
  document.querySelector("#returning-form").addEventListener("submit",async function(event){
    event.preventDefault();
    const identifier=document.querySelector("#customer-identifier").value.trim();
    const button=this.querySelector('button[type="submit"]');
    button.disabled=true;showMessage("Localizando seu cadastro...");
    try{
      const result=await kioskRequest({action:"identify",identifier:identifier});
      await continueKioskCustomer(result);
    }catch(error){
      showMessage(error.message||"Não foi possível localizar o cadastro.");
      button.disabled=false;
    }
  });
}

function renderProfile(){
  state.step=2;
  setHeader("PRIMEIRO CADASTRO","Faça seu cadastro","Preencha somente estes quatro dados. Não precisa de e-mail nem confirmação.");
  content.innerHTML = '<form id="profile-form"><label for="first_name">Nome</label><input id="first_name" name="first_name" required maxlength="80" autocomplete="given-name" placeholder="Seu nome"><label for="last_name">Sobrenome</label><input id="last_name" name="last_name" required maxlength="100" autocomplete="family-name" placeholder="Seu sobrenome"><label for="phone">Telefone com DDD</label><input id="phone" name="phone" type="tel" required maxlength="20" autocomplete="tel" placeholder="(48) 99999-9999"><label for="birth_date">Data de aniversário</label><input id="birth_date" name="birth_date" type="date" required><p id="app-message" class="muted" role="status">'+safe(state.message)+'</p><button class="btn btn-primary" type="submit">SALVAR CADASTRO E CONTINUAR</button><button class="btn btn-secondary" id="back-entry-choice" type="button">VOLTAR</button></form>';
  actions.replaceChildren();
  document.querySelector("#back-entry-choice").addEventListener("click",renderLogin);
  document.querySelector("#profile-form").addEventListener("submit",async function(event){
    event.preventDefault();
    const payload={
      action:"register",
      first_name:document.querySelector("#first_name").value.trim(),
      last_name:document.querySelector("#last_name").value.trim(),
      phone:document.querySelector("#phone").value.trim(),
      birth_date:document.querySelector("#birth_date").value
    };
    const button=this.querySelector('button[type="submit"]');
    button.disabled=true;showMessage("Salvando seu cadastro...");
    try{
      const result=await kioskRequest(payload);
      await continueKioskCustomer(result);
    }catch(error){
      showMessage(error.message||"Não foi possível salvar seu cadastro.");
      button.disabled=false;
    }
  });
}

async function kioskRequest(payload){
  if(!db) throw new Error("A conexão com a LaCorte não carregou. Atualize a página.");
  const result=await db.functions.invoke("lacorte-kiosk",{body:payload});
  if(result.error){
    let message=result.error.message||"Falha ao acessar o autoatendimento.";
    try{
      const body=await result.error.context.json();
      if(body&&body.error) message=body.error;
    }catch(_){}
    throw new Error(message);
  }
  if(!result.data) throw new Error("O autoatendimento não retornou uma resposta válida.");
  return result.data;
}

const KIOSK_SELECTION_KEY = "lacorte-service-selection";

function clearKioskSelection(){
  try{ sessionStorage.removeItem(KIOSK_SELECTION_KEY); }catch(_){}
}

function rememberKioskSelection(){
  const { customer, lookupToken, selectedServices } = state;
  if(STAFF_PORTAL || !customer || !lookupToken) return;
  try{
    sessionStorage.setItem(KIOSK_SELECTION_KEY, JSON.stringify({
      customer: { first_name:customer.first_name, last_name:customer.last_name, phone:customer.phone },
      lookup_token:lookupToken,
      selectedIds:selectedServices.map(service => service.id),
      participants:state.participants.map(person => ({
        name:person.name,service_ids:person.services.map(service => service.id)
      })),
      activeParticipant:state.activeParticipant,
      requestId:state.queueRequestId,
      expiresAt:Math.min(Date.now() + 120000, Number(lookupToken.split(".")[1]))
    }));
  }catch(_){}
}

function takeKioskSelectionForReload(){
  let selection;
  try{ selection = JSON.parse(sessionStorage.getItem(KIOSK_SELECTION_KEY)); }catch(_){}
  clearKioskSelection();
  if(performance.getEntriesByType("navigation")[0]?.type !== "reload") return null;
  if(!selection?.customer || !selection.lookup_token || !(selection.expiresAt > Date.now())) return null;
  return selection;
}

async function continueKioskCustomer(result, selectedIds = [], savedSelection = {}){
  if(!result||!result.customer||!result.lookup_token) throw new Error("Não foi possível validar seu cadastro. Tente novamente.");
  state.customer=result.customer;
  state.lookupToken=result.lookup_token;
  state.user=null;
  state.role="customer";
  state.message="";
  state.selectedServices=[];
  state.customerPlan=null;
  state.customerPlanBenefits=[];
  try{
    const planResult=await kioskRequest({action:"plan",lookup_token:state.lookupToken});
    state.customerPlan=planResult.plan||null;
    state.customerPlanBenefits=Array.isArray(planResult.benefits)?planResult.benefits:[];
  }catch(_){}
  await loadCatalogs();
  const savedPeople = Array.isArray(savedSelection.participants) ? savedSelection.participants.slice(0,6) :
    [{name:"",service_ids:selectedIds}];
  state.participants = savedPeople.map((person,index) => ({
    name:index === 0 ? ((state.customer.first_name||"")+" "+(state.customer.last_name||"")).trim() :
      String(person.name||"").slice(0,100),
    services:services.filter(service => Array.isArray(person.service_ids) && person.service_ids.includes(service.id))
  }));
  if(!state.participants.length) state.participants.push({name:state.customer.first_name,services:[]});
  state.activeParticipant = Math.max(0,Math.min(state.participants.length-1,Number(savedSelection.activeParticipant)||0));
  state.queueRequestId = savedSelection.requestId || crypto.randomUUID();
  state.selectedServices = state.participants[0].services;
  const lookupToken = state.lookupToken;
  totemPromotions = [];
  state.step=3;
  render();
  void loadTotemPromotions(true).then(function(promotions){
    if(state.lookupToken !== lookupToken) return;
    totemPromotions = promotions;
    if(state.step === 3) renderServices();
  }).catch(function(error){
    console.warn("Não foi possível carregar as promoções do totem.", error.message);
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

function participantLabel(person,index){
  return index === 0 ? "Você — "+person.name : (person.name.trim() || "Pessoa "+(index+1));
}

function participantTotal(person,index){
  const preview = index === 0 ? getCustomerPlanPreview(person.services) : null;
  return preview ? preview.total : person.services.reduce((sum,service)=>sum+Number(service.price),0);
}

function participantsTotal(){
  return state.participants.reduce((sum,person,index)=>sum+participantTotal(person,index),0);
}

function renderServices(){
  rememberKioskSelection();
  const index = state.activeParticipant;
  const person = state.participants[index];
  setHeader("ETAPA 02","Escolha os serviços","Escolha os serviços de cada pessoa. Vocês entram com uma única senha.");
  const promotionStrip = content.querySelector(".totem-promotion");
  content.innerHTML = '<section class="family-selection" aria-label="Pessoas na mesma senha">'+
    '<div class="family-heading"><strong>Quem vai ser atendido?</strong>'+
    '<button type="button" class="btn btn-secondary" data-add-person>+ Adicionar outra pessoa</button></div>'+
    '<nav class="family-people" aria-label="Escolher pessoa">'+
    state.participants.map((person,index)=>'<button type="button" data-person="'+index+'" aria-pressed="'+
      (index === state.activeParticipant)+'">'+safe(participantLabel(person,index))+
      '<small>'+person.services.length+' serviço(s) · '+money(participantTotal(person,index))+'</small></button>').join("")+
    '</nav><div class="family-person-editor"></div></section><div class="grid" id="choices"></div>';
  const add = content.querySelector("[data-add-person]");
  add.disabled = state.participants.length >= 6;
  add.addEventListener("click",function(){
    state.participants.push({name:"",services:[]});
    state.activeParticipant = state.participants.length-1;
    state.queueRequestId = crypto.randomUUID();
    renderServices();
    content.querySelector("#participant-name")?.focus();
  });
  content.querySelectorAll("[data-person]").forEach(button => {
    button.addEventListener("click",function(){
      state.activeParticipant = Number(button.dataset.person);
      renderServices();
    });
  });
  const editor = content.querySelector(".family-person-editor");
  if(index > 0){
    editor.innerHTML = '<label for="participant-name">Nome ou identificação desta pessoa (opcional)</label>'+
      '<div><input id="participant-name" maxlength="100" placeholder="Ex.: filho, João" value="'+safe(person.name)+'">'+
      '<button type="button" class="btn btn-secondary" data-remove-person>Remover pessoa</button></div>'+
      '<p class="muted">Os serviços desta pessoa serão registrados separadamente. O plano do titular vale somente para ele.</p>';
    editor.querySelector("input").addEventListener("input",function(){
      person.name = this.value;
      state.queueRequestId = crypto.randomUUID();
      const button = content.querySelector('[data-person="'+index+'"]');
      button.firstChild.textContent = participantLabel(person,index);
      rememberKioskSelection();
    });
    editor.querySelector("[data-remove-person]").addEventListener("click",function(){
      if(person.services.length && !confirm("Remover esta pessoa e os serviços escolhidos para ela?")) return;
      state.participants.splice(index,1);
      state.activeParticipant = Math.max(0,index-1);
      state.queueRequestId = crypto.randomUUID();
      renderServices();
    });
  }else{
    editor.innerHTML = renderCustomerPlanCard();
  }
  const grid = content.querySelector("#choices");
  services.forEach(function(service){
    const selected = person.services.some(item=>item.id===service.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice"+(selected ? " selected" : "");
    button.setAttribute("aria-pressed",String(selected));
    button.innerHTML = '<span class="name">'+safe(service.name)+'</span><span class="detail">'+
      safe(service.detail)+'</span><span class="price">'+money(service.price)+'</span>';
    button.addEventListener("click",function(){
      person.services = selected ? person.services.filter(item=>item.id!==service.id) : person.services.concat(service);
      state.selectedServices = state.participants[0].services;
      state.queueRequestId = crypto.randomUUID();
      renderServices();
      content.querySelectorAll("#choices .choice")[services.indexOf(service)]?.focus();
    });
    grid.append(button);
  });
  if(totemPromotions.length) grid.before(promotionStrip || makeTotemPromotionStrip());
  const summary = document.createElement("div");
  summary.className = "summary";
  summary.innerHTML = '<div class="summary-row"><span>'+safe(participantLabel(person,index))+
    '</span><strong>'+money(participantTotal(person,index))+'</strong></div>'+
    '<div class="summary-row summary-total"><span>Total de '+state.participants.length+
    ' pessoa(s)</span><strong>'+money(participantsTotal())+'</strong></div>'+
    '<p class="muted">Selecione ao menos um serviço para cada pessoa.</p>';
  content.append(summary);
  setActions(function(){state.step=1;render();},function(){state.step=4;render();},
    "REVISAR SOLICITAÇÃO",state.participants.some(person=>person.services.length===0));
}

function renderConfirmation(){
  rememberKioskSelection();
  setHeader("ETAPA 03","Confira sua solicitação","Uma senha para todos, com os serviços separados por pessoa.");
  content.innerHTML = '<section class="summary"><div class="summary-row"><span>Cadastro</span><strong>'+
    safe(state.customer.first_name+" "+(state.customer.last_name||""))+'</strong></div>'+
    '<div class="summary-row"><span>Telefone</span><strong>'+safe(state.customer.phone||"—")+'</strong></div></section>'+
    state.participants.map(function(person,index){
      const preview = index === 0 ? getCustomerPlanPreview(person.services) : null;
      return '<section class="summary"><h3>'+safe(participantLabel(person,index))+'</h3>'+
        person.services.map(service=>'<div class="summary-row"><span>'+safe(service.name)+
          '</span><strong>'+money(service.price)+'</strong></div>').join("")+
        (preview ? '<p class="muted">'+safe(preview.description)+'</p>' : "")+
        '<div class="summary-row summary-total"><span>Total desta pessoa</span><strong>'+
        money(participantTotal(person,index))+'</strong></div></section>';
    }).join("")+
    '<div class="summary"><div class="summary-row summary-total"><span>Total da senha</span><strong>'+
    money(participantsTotal())+'</strong></div></div>'+
    '<p class="muted">Cada pessoa pode ser atendida por um barbeiro diferente. A equipe define o profissional ao chamar.</p>'+
    '<p id="app-message" class="muted" role="status">'+safe(state.message)+'</p>';
  setActions(function(){state.step=3;renderServices();},submitQueueEntry,"ENTRAR NA FILA",state.submitting);
}

// ===== LA CORTE: roteamento por perfil e fila real =====
state.role = null;
state.barberId = null;
state.queueTicket = null;
state.submitting = false;

function setAppMode(dashboard){
  if(typeof stopBarberTimer === "function") stopBarberTimer();
  const staffHeader = document.querySelector(".topbar");
  if(staffHeader?.dataset.barberHeader && !(dashboard && state.role === "barber")){
    staffHeader.innerHTML = staffHeaderHTML;
    delete staffHeader.dataset.barberHeader;
  }
  document.body.classList.remove("barber-payment");
  const hero = document.querySelector(".hero");
  const progress = document.querySelector(".progress[aria-label]");
  if (hero) hero.style.display = dashboard ? "none" : "";
  if (progress) progress.style.display = dashboard ? "none" : "";
  document.body.classList.toggle("admin-dashboard",!!dashboard && state.role==="admin");
  const barberDashboard = !!dashboard && state.role === "barber";
  document.body.classList.toggle("professional-dashboard",barberDashboard);
  const defaultStyles = document.querySelector("#staff-default-styles");
  const barberStyles = document.querySelector("#barber-styles");
  const loginStyles = document.querySelector("#staff-login-styles");
  if(loginStyles) loginStyles.media = dashboard ? "not all" : "all";
  if(defaultStyles && barberStyles){
    defaultStyles.media = dashboard && !barberDashboard ? "all" : "not all";
    barberStyles.media = barberDashboard ? "all" : "not all";
  }
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

function queueTicketNumber(row){
  return row.group_ticket_number ?? row.queue_number;
}

function queuePersonLabel(row,registeredName){
  return row.participant_name ?
    "Pessoa "+row.participant_index+" — "+row.participant_name+" · Cadastro "+registeredName : registeredName;
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
 // Acesso aos relatórios fica somente na navegação lateral do profissional.
 actions.append(makeButton('SAIR DA CONTA',async function(){await db.auth.signOut();},true));
}

async function loadCatalogs(){
  const results = await Promise.all([
    db.from("services").select("id,name,detail,price,active").eq("active", true).order("name"),
    db.from("barbers").select("id,name,active,commission_percent").eq("active", true).order("name")
  ]);

  if (results[0].error) throw new Error("Não foi possível carregar os serviços: " + results[0].error.message);
  if (results[1].error) throw new Error("Não foi possível carregar os barbeiros: " + results[1].error.message);

  services.splice(0, services.length, ...(results[0].data || []).map(function(s){
    return { id: s.id, name: s.name, detail: s.detail || "", price: Number(s.price) };
  }));

  barbers.splice(0, barbers.length, ...(results[1].data || []).map(function(b){
    return { id: b.id, name: b.name, available: true, commission_percent: Number(b.commission_percent) };
  }));
}

async function loadQueueRows(){
 const result=await db.from('lacorte_queue').select('id,customer_id,barber_id,queue_date,queue_number,group_ticket_number,group_id,participant_index,participant_name,status,total_amount,commission_percent,commission_amount,payment_method,created_at,started_at,completed_at').in('status',['waiting','in_progress']).order('queue_date',{ascending:true}).order('queue_number',{ascending:true});
 if(result.error)throw new Error('Erro ao consultar fila: '+result.error.message);const rows=result.data||[];if(!rows.length)return [];
 const customerIds=Array.from(new Set(rows.map(r=>r.customer_id))),queueIds=rows.map(r=>r.id);
 const lookups=await Promise.all([db.from('customers').select('id,first_name,last_name').in('id',customerIds),db.from('lacorte_queue_items').select('queue_id,service_name,unit_price').in('queue_id',queueIds)]);
 if(lookups[0].error)throw new Error('Erro ao consultar clientes: '+lookups[0].error.message);if(lookups[1].error)throw new Error('Erro ao consultar serviços: '+lookups[1].error.message);
 const customers={},items={};(lookups[0].data||[]).forEach(c=>customers[c.id]=c);(lookups[1].data||[]).forEach(i=>(items[i.queue_id]||(items[i.queue_id]=[])).push(i));
 return rows.map(r=>Object.assign({},r,{customer:customers[r.customer_id]||null,items:items[r.id]||[]}));
}

let queueRealtimeChannel = null;
function stopQueueRealtime(){
  if(queueRealtimeChannel && db){
    db.removeChannel(queueRealtimeChannel);
    queueRealtimeChannel = null;
  }
}
function subscribeToQueueRealtime(){
  if(!db || typeof db.channel !== "function") return;
  stopQueueRealtime();
  const refreshActiveStaffView=function(){
    if(content.querySelector(".payment-dialog-backdrop")) return;
    if(state.role==="admin"){
      if(adminView === "settings"){
        const queue = content.querySelector("[data-admin-queue]");
        if(queue && !queue.querySelector(".payment-dialog-backdrop")) renderAdminQueue(queue);
      }else if(["queue","fila"].includes(adminView) && !content.querySelector("[data-admin-queue] .payment-dialog-backdrop")){
        renderQueueDashboard();
      }
    }else if(state.role==="barber"){
      if(["profile","payment"].includes(professionalView) || content.querySelector(".payment-dialog-backdrop")) return;
      if(professionalView==="history") renderBarberHistory();
      else if(professionalView==="reports") renderBarberReports();
      else renderQueueDashboard();
    }
  };
  queueRealtimeChannel = db.channel("lacorte-shared-queue-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"lacorte_queue"},refreshActiveStaffView)
    .on("postgres_changes",{event:"*",schema:"public",table:"lacorte_queue_items"},refreshActiveStaffView)
    .subscribe();
}


function bindProfilePhotoEditor(form,settings,fallback = "B1"){
  const {photo,zoom,cropX,cropY} = form.elements;
  const preview = form.querySelector("[data-avatar-preview]");
  const panel = form.querySelector("[data-avatar-crop]");
  const status = form.querySelector("[role=status]");
  const save = form.querySelector("[type=submit]");
  let pendingPhoto = settings.photo || "";
  let loading = false;
  let version = 0;
  const cropValues = () => ({zoom:Number(zoom.value),x:Number(cropX.value),y:Number(cropY.value)});
  function updatePreview(){ preview.innerHTML = profileAvatar(pendingPhoto,cropValues(),fallback); }
  function setCrop(crop = {}){
    zoom.value = crop.zoom ?? 1;
    cropX.value = crop.x ?? 50;
    cropY.value = crop.y ?? 50;
    updatePreview();
  }
  function openCrop(open){
    panel.hidden = !open;
    preview.setAttribute("aria-expanded",String(open));
  }
  setCrop(settings.crop);
  preview.addEventListener("click",()=>{
    if(pendingPhoto) openCrop(panel.hidden);
    else photo.click();
  });
  panel.addEventListener("input",updatePreview);
  form.querySelector("[data-reset-crop]").addEventListener("click",()=>setCrop());
  photo.addEventListener("change",async function(){
    const currentVersion = ++version;
    const file = photo.files[0];
    loading = Boolean(file);
    save.disabled = loading;
    if(!file) return;
    try{
      const image = await prepareTotemImage(file,256);
      if(currentVersion !== version) return;
      pendingPhoto = image;
      setCrop();
      openCrop(true);
      status.textContent = "";
    }catch(error){
      if(currentVersion === version) status.textContent = error.message;
    }finally{
      if(currentVersion === version){
        loading = false;
        save.disabled = false;
      }
    }
  });
  form.querySelector("[data-remove-avatar]").addEventListener("click",()=>{
    version++;
    photo.value = "";
    pendingPhoto = "";
    loading = false;
    setCrop();
    openCrop(false);
    save.disabled = false;
  });
  return {
    get photo(){ return pendingPhoto; },
    get crop(){ return cropValues(); },
    get busy(){ return loading; }
  };
}

function openQueueCallDialog(queueId, target = content, refresh = renderQueueDashboard){
 const overlay=document.createElement('div');overlay.className='payment-dialog-backdrop';overlay.innerHTML='<section class="payment-dialog"><h3>CHAMAR CLIENTE</h3><p>Confirme o resultado da chamada. Se o cliente preferir outro barbeiro, mantenha a senha aguardando.</p><div class="actions"><button class="btn btn-secondary" data-decline>NÃO ACEITOU / MANTER NA FILA</button><button class="btn btn-primary" data-accept>CLIENTE ACEITOU</button></div><p class="muted" id="call-error"></p></section>';target.append(overlay);
 overlay.querySelector('[data-decline]').addEventListener('click',function(){overlay.remove();});
 overlay.querySelector('[data-accept]').addEventListener('click',async function(){this.disabled=true;const r=await db.rpc('lacorte_start_service',{p_queue_id:queueId});if(r.error){this.disabled=false;overlay.querySelector('#call-error').textContent='Não foi possível iniciar: '+r.error.message;return;}overlay.remove();refresh();});
}
async function openPaymentMethodDialog(queueId, target = content, refresh = renderQueueDashboard){
 if(state.role === "barber") return renderBarberPayment(queueId);
 const queueResult=await db.from("lacorte_queue").select("gross_amount,total_amount,discount_amount").eq("id",queueId).single();
 if(!target.isConnected || state.role === null) return;
 if(queueResult.error){alert("Não foi possível carregar o valor do atendimento: "+queueResult.error.message);return;}
 const queue=queueResult.data||{};
 const gross=Number(queue.gross_amount ?? queue.total_amount ?? 0);
 const previousDiscount=Number(queue.discount_amount||0);
 const initialNet=Math.max(0,gross-previousDiscount);
 const overlay=document.createElement("div");
 overlay.className="payment-dialog-backdrop";
 overlay.innerHTML='<section class="payment-dialog"><h3>FINALIZAR ATENDIMENTO</h3>'+
  '<div class="summary-row"><span>Valor dos serviços</span><strong id="payment-gross">'+money(gross)+'</strong></div>'+
  '<label for="payment-discount">Desconto (R$)</label><input id="payment-discount" type="number" min="0" max="'+gross.toFixed(2)+'" step="0.01" value="'+previousDiscount.toFixed(2)+'">'+
  '<div class="summary-row"><span>Total a receber</span><strong id="payment-net">'+money(initialNet)+'</strong></div>'+
  '<p class="muted">Informe quanto foi recebido em cada forma. Pode combinar PIX, dinheiro e cartões.</p>'+
  '<div class="payment-split-fields">'+
  '<label>PIX (R$)<input data-payment="pix" type="number" min="0" step="0.01" value="'+(initialNet>0?initialNet.toFixed(2):"")+'"></label>'+
  '<label>Dinheiro (R$)<input data-payment="dinheiro" type="number" min="0" step="0.01"></label>'+
  '<label>Crédito (R$)<input data-payment="credito" type="number" min="0" step="0.01"></label>'+
  '<label>Débito (R$)<input data-payment="debito" type="number" min="0" step="0.01"></label></div>'+
  '<div class="summary-row"><span>Total informado</span><strong id="payment-entered">'+money(initialNet)+'</strong></div>'+
  '<p class="muted" id="payment-balance" aria-live="polite">Valores conferem.</p>'+
  '<div class="actions"><button class="btn btn-secondary" data-close>VOLTAR</button><button class="btn btn-primary" data-confirm>CONFIRMAR FINALIZAÇÃO</button></div>'+
  '<p class="muted" id="payment-error" role="alert"></p></section>';
 target.append(overlay);
 const discountInput=overlay.querySelector("#payment-discount");
 const amountInputs=Array.from(overlay.querySelectorAll("[data-payment]"));
 const confirmButton=overlay.querySelector("[data-confirm]");
 function amounts(){
  return amountInputs.map(input=>({method:input.dataset.payment,amount:Math.round((Number(input.value)||0)*100)/100})).filter(x=>x.amount>0);
 }
 function updatePaymentPreview(){
  const discount=Math.round((Number(discountInput.value)||0)*100)/100;
  const net=Math.max(0,Math.round((gross-discount)*100)/100);
  const entered=Math.round(amounts().reduce((sum,x)=>sum+x.amount,0)*100)/100;
  overlay.querySelector("#payment-net").textContent=money(net);
  overlay.querySelector("#payment-entered").textContent=money(entered);
  const balance=Math.round((net-entered)*100)/100;
  const message=balance===0?"Valores conferem.":balance>0?"Falta receber "+money(balance):"Há "+money(Math.abs(balance))+" a mais que o total.";
  overlay.querySelector("#payment-balance").textContent=message;
  overlay.querySelector("#payment-balance").style.color=balance===0?"#8ed6a2":"#ff9b55";
  confirmButton.disabled=balance!==0||discount<0||discount>gross;
 }
 discountInput.addEventListener("input",updatePaymentPreview);
 amountInputs.forEach(input=>input.addEventListener("input",updatePaymentPreview));
 overlay.querySelector("[data-close]").addEventListener("click",()=>overlay.remove());
 confirmButton.addEventListener("click",async function(){
  const discount=Math.round((Number(discountInput.value)||0)*100)/100;
  const payments=amounts();
  const net=Math.round((gross-discount)*100)/100;
  const sum=Math.round(payments.reduce((total,p)=>total+p.amount,0)*100)/100;
  if(discount<0||discount>gross||sum!==net){overlay.querySelector("#payment-error").textContent="Confira o desconto e a soma dos pagamentos.";return;}
  if(net>0&&!payments.length){overlay.querySelector("#payment-error").textContent="Informe pelo menos uma forma de pagamento.";return;}
  this.disabled=true;
  const result=await db.rpc("lacorte_finish_service_with_payments",{p_queue_id:queueId,p_discount_amount:discount,p_payments:payments});
  if(result.error){this.disabled=false;overlay.querySelector("#payment-error").textContent="Não foi possível finalizar: "+result.error.message;return;}
  overlay.remove();
  refresh();
 });
 updatePaymentPreview();
}

async function routeAuthenticatedUser(user){
  barberProfile = {};
  barberProfileError = "";
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
      if(state.role === "barber") await loadBarberProfile();
      subscribeToQueueRealtime();
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
  state.step = 1;
  renderLogin();
}

async function submitQueueEntry(){
  if(state.submitting) return;
  if(!state.customer || !state.lookupToken || !state.participants.length || state.participants.some(person=>!person.services.length)){
    showMessage("Confira seu cadastro e selecione ao menos um serviço.");
    return;
  }
  state.submitting=true;
  actions.querySelectorAll("button").forEach(button=>button.disabled=true);
  showMessage("Registrando sua entrada na fila...");
  try{
    const result=await kioskRequest({
      action:"queue",
      lookup_token:state.lookupToken,
      request_id:state.queueRequestId,
      participants:state.participants.map(person=>({
        name:person.name,service_ids:person.services.map(service=>service.id)
      }))
    });
    clearKioskSelection();
    state.queueTicket=result;
    state.submitting=false;
    renderQueueSuccess();
  }catch(error){
    state.submitting=false;
    actions.querySelectorAll("button").forEach(button=>button.disabled=false);
    showMessage("Não foi possível entrar na fila: "+(error.message||"Falha de conexão."));
  }
}

function renderQueueSuccess(){
  setAppMode(true);
  setHeader("ENTRADA CONFIRMADA","Você entrou na fila!","Sua senha está na fila única da LaCorte.");
  notice.textContent="Aguarde ser chamado por um dos profissionais.";
  const ticket=state.queueTicket;
  const people = ticket.participants || [];
  const peopleHtml = people.length > 1 ? '<div class="summary">'+people.map(person=>
    '<div class="summary-row"><span>'+safe(person.name)+'</span><strong>'+money(Number(person.total_amount))+
    '</strong></div>').join("")+'</div>' : "";
  content.innerHTML='<div class="waiting"><p class="muted">SUA SENHA</p><div class="ticket">#'+safe(ticket.ticket_number)+'</div>'+peopleHtml+'<div class="waiting-card"><div class="summary-row"><span>Cliente</span><strong>'+safe(state.customer.first_name+' '+(state.customer.last_name||''))+'</strong></div><div class="summary-row"><span>Total</span><strong>'+money(Number(ticket.total_amount))+'</strong></div><div class="summary-row"><span>Status</span><strong>Aguardando</strong></div></div><p class="muted">A equipe LaCorte chamará você. O barbeiro será definido no início do atendimento.</p></div>';
  function returnCustomerKioskToHome(){
    clearCustomerAutoLogout();
    state.customer=null;
    state.lookupToken=null;
    state.selectedServices=[];
    state.participants=[];
    state.activeParticipant=0;
    state.queueRequestId=null;
    state.customerPlan=null;
    state.customerPlanBenefits=[];
    state.queueTicket=null;
    state.step=1;
    state.message="";
    state.submitting=false;
    state.role="customer";
    setAppMode(false);
    renderLogin();
  }

  actions.replaceChildren(makeButton("FINALIZAR",returnCustomerKioskToHome,true));

  // Após confirmar a entrada, libera o totem automaticamente para o próximo cliente.
  clearCustomerAutoLogout();
  customerAutoLogoutTimer = setTimeout(returnCustomerKioskToHome,CUSTOMER_AUTO_LOGOUT_MS);
}

// Calcula a prévia do benefício. O banco continua sendo a autoridade final
// e valida os créditos reservados no momento da entrada na fila.
function getCustomerPlanPreview(selected = state.selectedServices || []){
  const plan = state.customerPlan;
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
  barberProfile = {};
  barberProfileError = "";
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
  notice.textContent = "Enviaremos a confirmação para o e-mail cadastrado. Use o código recebido ou abra o link do e-mail para criar sua senha.";
  content.innerHTML = '<form id="staff-password-setup" class="staff-login-form"><label for="staff-setup-email">E-mail profissional cadastrado</label><input id="staff-setup-email" type="email" autocomplete="email" value="'+safe(initialEmail||"")+'" placeholder="Seu e-mail cadastrado" required><p id="staff-setup-message" class="muted" role="status">'+safe(message||"")+'</p><button class="btn btn-primary" type="submit">ENVIAR CONFIRMAÇÃO POR E-MAIL</button><button class="btn btn-secondary" id="staff-setup-back" type="button">VOLTAR AO LOGIN</button></form>';
  actions.replaceChildren();
  const form=content.querySelector("#staff-password-setup");
  form.addEventListener("submit",async function(event){
    event.preventDefault();
    const email=form.querySelector("#staff-setup-email").value.trim().toLowerCase();
    const button=form.querySelector('button[type="submit"]'),status=form.querySelector("#staff-setup-message");
    button.disabled=true;status.textContent="Enviando confirmação para seu e-mail...";
    const sent=await db.auth.signInWithOtp({email:email,options:{shouldCreateUser:false,emailRedirectTo:new URL("barbeiros.html?setup=1",window.location.href).href}});
    if(sent.error){status.textContent="Não foi possível enviar a confirmação. Confira o e-mail cadastrado e tente novamente. "+sent.error.message;button.disabled=false;return;}
    renderStaffPasswordVerification(email);
  });
  form.querySelector("#staff-setup-back").addEventListener("click",function(){renderStaffLogin();});
}

function renderStaffPasswordVerification(email,message){
  setAppMode(false);
  setHeader("CONFIRMAÇÃO ENVIADA","Confira seu e-mail","Abra o botão de confirmação no e-mail da LaCorte. Você será levado à criação da sua senha profissional.");
  notice.textContent = "Confira também o spam. Se o e-mail trouxer um código numérico, você pode confirmá-lo abaixo.";
  content.innerHTML = '<form id="staff-password-verify" class="staff-login-form"><label for="staff-otp">Código recebido por e-mail</label><input id="staff-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="Código de 6 números" required><p id="staff-verify-message" class="muted" role="status">'+safe(message||"")+'</p><button class="btn btn-primary" type="submit">CONFIRMAR CÓDIGO</button><button class="btn btn-secondary" id="staff-resend-code" type="button">REENVIAR CONFIRMAÇÃO</button><button class="btn btn-secondary" id="staff-verify-back" type="button">VOLTAR AO LOGIN</button></form>';
  actions.replaceChildren();
  const form=content.querySelector("#staff-password-verify");
  bindPasswordVisibility(form);
  form.addEventListener("submit",async function(event){
    event.preventDefault();
    const token=form.querySelector("#staff-otp").value.trim();
    const button=form.querySelector('button[type="submit"]'),status=form.querySelector("#staff-verify-message");
    if(!/^[0-9]{6}$/.test(token)){status.textContent="Digite o código de 6 números recebido.";return;}
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
    renderStaffPasswordOnly();
  });
  form.querySelector("#staff-resend-code").addEventListener("click",function(){renderStaffPasswordSetup(email,"Solicite uma nova confirmação para este e-mail.");});
  form.querySelector("#staff-verify-back").addEventListener("click",function(){db.auth.signOut({scope:"local"}).then(function(){renderStaffLogin();});});
}

function renderStaffPasswordOnly(message){
  setAppMode(false);
  setHeader("QUASE PRONTO","Salvar sua senha","Seu e-mail já foi confirmado. Agora finalize a criação da senha.");
  notice.textContent = "Escolha uma senha com pelo menos 8 caracteres.";
  content.innerHTML = '<form id="staff-password-only" class="staff-login-form"><label for="staff-password-only-new">Nova senha</label>'+passwordField("staff-password-only-new","Nova senha","new-password","Mínimo 8 caracteres")+'<label for="staff-password-only-confirm">Confirmar senha</label>'+passwordField("staff-password-only-confirm","Confirmar senha","new-password","Repita a senha")+'<p id="staff-password-only-message" class="muted" role="status">'+safe(message||"")+'</p><button class="btn btn-primary" type="submit">SALVAR SENHA</button></form>';
  actions.replaceChildren();
  const form=content.querySelector("#staff-password-only");
  bindPasswordVisibility(form);
  form.addEventListener("submit",async function(event){
    event.preventDefault();
    const password=form.querySelector("#staff-password-only-new").value;
    const confirm=form.querySelector("#staff-password-only-confirm").value;
    const status=form.querySelector("#staff-password-only-message");
    if(password.length<8){status.textContent="A senha precisa ter pelo menos 8 caracteres.";return;}
    if(password!==confirm){status.textContent="As senhas não conferem.";return;}
    const button=form.querySelector('button[type="submit"]');
    button.disabled=true;
    const result=await db.auth.updateUser({password:password});
    if(result.error){status.textContent="Não foi possível salvar a senha: "+result.error.message;button.disabled=false;return;}
    await routeAuthenticatedUser(result.data.user);
  });
}

async function handleStaffAuthCallback(){
  const hash=new URLSearchParams(window.location.hash.slice(1));
  const query=new URLSearchParams(window.location.search);
  const hasCallback=hash.has("access_token")||hash.has("error")||query.has("token_hash")||query.has("code")||query.has("error");
  if(!hasCallback) return false;
  // Remove credentials from the address before any asynchronous work or navigation.
  window.history.replaceState({},document.title,window.location.pathname);
  const invalid=function(){renderStaffLogin("A confirmação expirou ou já foi utilizada. Use PRIMEIRO ACESSO para solicitar outro e-mail.");};
  if(hash.has("error")||query.has("error")){invalid();return true;}
  let result;
  const type=hash.get("type")||query.get("type")||"email";
  try{
    if(hash.get("access_token")&&hash.get("refresh_token")){
      result=await db.auth.setSession({access_token:hash.get("access_token"),refresh_token:hash.get("refresh_token")});
    }else if(query.get("token_hash")&&["email","signup","invite","magiclink","recovery","email_change"].includes(type)){
      result=await db.auth.verifyOtp({token_hash:query.get("token_hash"),type:type});
    }else if(query.get("code")){
      result=await db.auth.exchangeCodeForSession(query.get("code"));
    }else{invalid();return true;}
    const user=result.data&&((result.data.session&&result.data.session.user)||result.data.user);
    if(result.error||!user){invalid();return true;}
    const role=await db.from("lacorte_user_roles").select("role,barber_id").eq("user_id",user.id).maybeSingle();
    if(role.error||!role.data||!["admin","barber"].includes(role.data.role)){
      await db.auth.signOut({scope:"local"});
      renderStaffLogin("Este e-mail não está autorizado como conta profissional. Peça ao administrador para conferir o cadastro.");
      return true;
    }
    if(type==="recovery") await renderStaffPasswordReset();
    else renderStaffPasswordOnly();
  }catch(error){invalid();}
  return true;
}

async function initLaCorte(){
  setAppMode(false);
  if(!db){
    if(STAFF_PORTAL) renderStaffLogin("A conexão segura não carregou. Atualize a página.");
    else {render();showMessage("A conexão com o autoatendimento não carregou. Verifique a internet e atualize a página.");}
    return;
  }
  if(STAFF_PORTAL){
    if(!await handleStaffAuthCallback()){
      const staffSession=await db.auth.getSession();
      if(staffSession.error){renderStaffLogin("Não foi possível verificar a sessão. Entre novamente.");return;}
      if(staffSession.data&&staffSession.data.session) await routeAuthenticatedUser(staffSession.data.session.user);
      else if(new URLSearchParams(window.location.search).get("setup")==="1") renderStaffPasswordSetup();
      else renderStaffLogin();
    }
    db.auth.onAuthStateChange(function(event){
      if(event==="SIGNED_OUT"){stopQueueRealtime();renderStaffLogin();}
    });
    return;
  }
  void applyTotemBackground();
  void applyShopSettings();
  // Totem público: cadastro e identificação não usam conta Auth nem confirmação por e-mail.
  state.role="customer";
  state.user=null;
  try{
    const selection = takeKioskSelectionForReload();
    if(selection){
      await continueKioskCustomer(selection, selection.selectedIds, selection);
      return;
    }
    await loadCatalogs();
    state.step=1;
    renderLogin();
  }catch(error){
    renderLogin();
    showMessage(error.message||"Não foi possível carregar o catálogo da LaCorte.");
  }
}

// ===== RELATÓRIOS ADMINISTRATIVOS LACORTE =====


function reportShiftDate(dateText, days){
  const parts = dateText.split("-").map(Number);
  const date = new Date(parts[0], parts[1]-1, parts[2], 12);
  date.setDate(date.getDate()+days);
  return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
}

function reportDateRange(period = adminReportFilters.period || "month"){
  const today = localQueueDate();
  if(period === "today") return {start:today,end:today,label:"Hoje"};
  if(period === "fortnight") return {start:reportShiftDate(today,-14),end:today,label:"Últimos 15 dias"};
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

function reportPieChart(items, valueFormatter, emptyMessage, palette=["#f58220","#f5b041","#d35400","#e67e22","#f39c12","#b94b12","#ff9f43","#8e3b0d","#ffc078","#c96b22"]){
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

function openRecordActionDialog({title,description,rpc,args,reason=false,refresh}){
  if(content.querySelector('.payment-dialog-backdrop')) return;
  const previousFocus=document.activeElement;
  const overlay=document.createElement('div');
  overlay.className='payment-dialog-backdrop';
  overlay.innerHTML='<section class="payment-dialog" role="dialog" aria-modal="true" aria-labelledby="record-action-title"><h3 id="record-action-title">'+safe(title)+'</h3><p>'+safe(description)+'</p>'+
    (reason?'<label for="record-action-reason">Motivo (opcional)</label><textarea id="record-action-reason" maxlength="300" rows="3"></textarea>':'')+
    '<div class="actions"><button type="button" class="btn btn-secondary" data-close>Voltar</button><button type="button" class="btn btn-primary" data-confirm>Confirmar</button></div><p class="muted" role="alert" data-error></p></section>';
  content.append(overlay);
  const close=()=>{overlay.remove();if(previousFocus?.isConnected) previousFocus.focus();};
  const confirmButton=overlay.querySelector('[data-confirm]');
  const back=overlay.querySelector('[data-close]');
  back.onclick=close;back.focus();
  overlay.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!confirmButton.disabled){event.preventDefault();close();}
    if(event.key==='Tab'){
      const fields=Array.from(overlay.querySelectorAll('button,textarea')).filter(el=>!el.disabled);
      const first=fields[0],last=fields[fields.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  confirmButton.onclick=async()=>{
    confirmButton.disabled=back.disabled=true;
    try{
      const payload={...args};
      if(reason) payload.p_reason=overlay.querySelector('textarea').value.trim()||null;
      const result=await db.rpc(rpc,payload);
      if(result.error) throw result.error;
      close();refresh();
    }catch(error){overlay.querySelector('[data-error]').textContent='Não foi possível concluir: '+error.message;confirmButton.disabled=back.disabled=false;}
  };
}
function openCancelAppointmentDialog(queueId,refresh){
  openRecordActionDialog({title:'Cancelar atendimento',description:'O registro será marcado como cancelado e sairá dos totais de faturamento e comissão. Se houver corte de plano reservado ou utilizado, o crédito será devolvido. Um pagamento já recebido deve ser estornado separadamente.',rpc:'lacorte_cancel_appointment',args:{p_queue_id:queueId},reason:true,refresh});
}
function openDeleteCustomerDialog(customerId,refresh){
  openRecordActionDialog({title:'Excluir cliente',description:'O cadastro sairá da lista e do autoatendimento. As entradas ativas deste cliente e acompanhantes serão canceladas e os planos ativos serão suspensos. O histórico de atendimentos será preservado.',rpc:'lacorte_delete_customer',args:{p_customer_id:customerId},refresh});
}
function profileAvatar(photo,crop = {},fallback = "B1"){
  const validPhoto = /^data:image\/webp;base64,[a-z0-9+/]+={0,2}$/i.test(photo || "");
  const zoom = Math.min(3,Math.max(1,Number(crop.zoom)||1));
  const x = Math.min(100,Math.max(0,Number(crop.x ?? 50)||0));
  const y = Math.min(100,Math.max(0,Number(crop.y ?? 50)||0));
  const position = x+"% "+y+"%";
  return '<span class="lc-admin-avatar" aria-hidden="true">'+
    (validPhoto ? '<img src="'+safe(photo)+'" alt="" style="object-position:'+position+
      ';transform-origin:'+position+';transform:scale('+zoom+')">' : safe(fallback))+'</span>';
}

function renderQueueDashboard(){
  if(state.role === "admin" && adminView === "manage") return renderAdminManagement();
  if(state.role === "admin" && adminView === "plans") return renderAdminPlans();
  if(state.role === "admin" && adminView === "reports") return renderAdminReports();
  if(state.role === "admin" && adminView === "history") return renderAdminReports("history");
  if(state.role === "admin" && adminView === "customers") return renderAdminCustomers();
  if(state.role === "admin" && adminView === "services") return renderAdminManagement();
  if(state.role === "admin" && adminView === "visual") return renderAdminTotemVisual();
  if(state.role === "admin" && adminView === "settings") return renderAdminDisplaySettings();
  if(state.role === "admin") return renderAdminOverview();
  renderBarberQueue();
}

async function loadTotemBackground(){
  const { data, error } = await db.from("lacorte_totem_visual")
    .select("background_image").eq("id", 1).maybeSingle();
  if(error) throw error;
  return data?.background_image || "";
}

async function applyTotemBackground(){
  try{
    const image = await loadTotemBackground();
    if(!/^data:image\/webp;base64,[a-z0-9+/]+={0,2}$/i.test(image)) return;
    const totem = document.getElementById("entry-choice");
    totem.style.setProperty("--totem-background", 'url("' + image + '")');
    totem.classList.add("custom-totem-background");
  }catch(error){
    console.warn("Não foi possível carregar o fundo do totem.", error.message);
  }
}

async function prepareTotemImage(file, maxDimension = 1920){
  if(!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12 * 1024 * 1024){
    throw new Error("Escolha um JPG, PNG ou WebP de até 12 MB.");
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const image = canvas.toDataURL("image/webp", 0.78);
  if(!image.startsWith("data:image/webp;base64,") || image.length > 1400000){
    throw new Error("A imagem ficou grande demais. Escolha uma foto menor.");
  }
  return image;
}

let totemPromotions = [];

async function loadTotemPromotions(onlyActive = false){
  let query = db.from("lacorte_totem_promotions").select("id,message,image,active").order("id");
  if(onlyActive) query = query.eq("active", true);
  const { data, error } = await query;
  if(error) throw error;
  return data;
}

function makeTotemPromotionStrip(){
  const strip = document.createElement("section");
  strip.className = "totem-promotion";
  strip.setAttribute("aria-label", "Promoções da LaCorte");
  const message = document.createElement("strong");
  const image = document.createElement("img");
  image.alt = "Anúncio da LaCorte";
  strip.append(image, message);
  let index = 0;

  function showPromotion(){
    const promotion = totemPromotions[index];
    message.textContent = promotion.message;
    message.hidden = !promotion.message;
    image.hidden = !promotion.image;
    if(promotion.image) image.src = promotion.image;
  }

  showPromotion();
  if(totemPromotions.length > 1){
    const timer = setInterval(function(){
      if(!strip.isConnected){ clearInterval(timer); return; }
      index = (index + 1) % totemPromotions.length;
      showPromotion();
    }, 3000);
  }
  return strip;
}

async function applyShopSettings(){
  try{
    const result=await db.from("lacorte_shop_settings").select("display_name,slogan,opening_days,opening_time,closing_time,whatsapp,instagram").eq("id",1).single();
    if(result.error || !result.data) return;
    const shop=result.data;
    const title=document.querySelector("#welcome-title em");if(title) title.textContent=shop.display_name;
    const slogan=document.querySelector(".hero-pretitle");if(slogan) slogan.textContent=shop.slogan;
    const days=document.querySelector(".contact-strip>div:first-child strong");if(days)days.textContent=shop.opening_days;
    const hours=document.querySelector(".contact-strip>div:first-child b");
    const time=value=>value.slice(0,5).replace(":00","h");if(hours)hours.textContent=time(shop.opening_time)+" às "+time(shop.closing_time);
    for(const [selector,url,label] of [["#instagram-qr","https://instagram.com/"+shop.instagram,"@"+shop.instagram],["#whatsapp-qr","https://wa.me/"+shop.whatsapp,shop.whatsapp.replace(/^55(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3")]]){
      const qr=document.querySelector(selector),anchor=qr?.closest("a");if(!anchor)continue;
      anchor.href=url;const text=anchor.querySelector("strong");if(text)text.textContent=label;
      if(window.QRCode){qr.replaceChildren();new window.QRCode(qr,{text:url,width:96,height:96,colorDark:"#111111",colorLight:"#ffffff",correctLevel:window.QRCode.CorrectLevel.M});}
    }
  }catch(error){console.warn("Não foi possível carregar os dados da barbearia.");}
}

window.__LACORTE_APP_STARTED__ = true;
initLaCorte();

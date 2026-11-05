
const SUPABASE_URL = "https://xwctsfpqwugygxpsrcfw.supabase.co";
const SUPABASE_KEY = "sb_publishable_L274hUI6sbyDGFe7u40U-Q_tK28Oh5s";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
  message:""
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
    "Informe seu e-mail para receber um link seguro de acesso."
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
        required
      >
      <p class="muted">
        Você receberá um link de acesso no seu e-mail.
        Não precisa criar senha.
      </p>
      <p id="app-message" class="muted">${safe(state.message)}</p>
      <button class="btn btn-primary" type="submit">
        ENVIAR LINK DE ACESSO
      </button>
    </form>
  `;

  actions.replaceChildren();

  document.querySelector("#login-form").addEventListener("submit",async e=>{
    e.preventDefault();

    const email=document.querySelector("#email").value.trim();

    showMessage("Enviando link de acesso...");

    const {error}=await db.auth.signInWithOtp({
      email,
      options:{
        emailRedirectTo:window.location.origin+
          window.location.pathname,
        shouldCreateUser:true
      }
    });

    if(error){
      showMessage("Erro: "+error.message);
      return;
    }

    showMessage(
      "Link enviado! Abra seu e-mail e clique no link para continuar na LaCorte."
    );
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

function renderServices(){
  setHeader(
    "ETAPA 03",
    "Escolha seus serviços",
    "Você pode selecionar mais de um serviço."
  );

  content.innerHTML='<div class="grid" id="choices"></div>';

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

  if(data){
    state.step=3;
  }else{
    state.step=2;
  }

  state.message="";
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

init();

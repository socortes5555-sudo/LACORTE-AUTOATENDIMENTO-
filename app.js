// LaCorte - jornada do cliente
// Catálogo atualizado com os preços oficiais.

const services = [
  {id:"corte", name:"Corte", detail:"Corte tradicional ou degradê", price:45},
  {id:"barba", name:"Barba", detail:"Desenho e acabamento", price:40},
  {id:"sobrancelha", name:"Sobrancelha", detail:"Limpeza e alinhamento", price:15},
  {id:"bigode", name:"Bigode", detail:"Aparar e alinhar", price:15},
  {id:"pezinho", name:"Pezinho", detail:"Acabamento", price:15},
  {id:"raspar", name:"Raspar", detail:"Raspagem completa", price:25},
  {id:"cavanhaque", name:"Cavanhaque", detail:"Desenho e acabamento", price:35},

  {id:"corte-barba", name:"Corte e barba", detail:"Combo especial", price:80},
  {id:"corte-barba-sobrancelha", name:"Corte, barba e sobrancelha", detail:"Combo completo", price:90},
  {id:"corte-sobrancelha", name:"Corte e sobrancelha", detail:"Combo especial", price:55},
  {id:"corte-bigode", name:"Corte e bigode", detail:"Combo especial", price:55},
  {id:"corte-cavanhaque", name:"Corte e cavanhaque", detail:"Combo especial", price:65},
  {id:"raspar-barba", name:"Raspar e barba", detail:"Combo especial", price:55}
];

const barbers = [
  {id:"barbeiro-1",name:"Barbeiro 01",waiting:0,available:true},
  {id:"barbeiro-2",name:"Barbeiro 02",waiting:2,available:true},
  {id:"barbeiro-3",name:"Barbeiro 03",waiting:0,available:false}
];

const methods = [
  {id:"pix",name:"PIX",detail:"Pagamento por QR Code (integração será adicionada)",symbol:"▦"},
  {id:"card",name:"Cartão no caixa",detail:"Pague presencialmente no caixa",symbol:"▣"},
  {id:"cash",name:"Dinheiro no caixa",detail:"Pague presencialmente no caixa",symbol:"＄"}
];

const state={step:1,service:null,barber:null,payment:null};

const content=document.querySelector("#step-content");
const actions=document.querySelector("#step-actions");
const notice=document.querySelector("#demo-notice");

function money(value){
  return value.toLocaleString("pt-BR",{
    style:"currency",
    currency:"BRL"
  });
}

function updateProgress(){
  document.querySelectorAll("[data-progress]").forEach(el=>{
    const n=Number(el.dataset.progress);
    el.classList.toggle("active",n===state.step);
    el.classList.toggle("done",n<state.step);
  });
}

function setHeader(kicker,title,description){
  document.querySelector("#step-kicker").textContent=kicker;
  document.querySelector("#step-title").textContent=title;
  document.querySelector("#step-description").textContent=description;
}

function button(label,fn,secondary=false,disabled=false){
  const b=document.createElement("button");
  b.className="btn "+(secondary?"btn-secondary":"btn-primary");
  b.textContent=label;
  b.disabled=disabled;
  b.addEventListener("click",fn);
  return b;
}

function renderActions(back,nextLabel="CONTINUAR",nextFn=null,disabled=false){
  actions.replaceChildren();

  if(state.step>1&&state.step<4){
    actions.append(button("VOLTAR",()=>{
      state.step--;
      render();
    },true));
  }

  if(nextFn){
    actions.append(button(nextLabel,nextFn,false,disabled));
  }
}

function render(){
  updateProgress();
  notice.style.display=state.step===4?"none":"block";

  if(state.step===1){

    setHeader(
      "ETAPA 01",
      "Escolha seu serviço",
      "Selecione o serviço que deseja realizar."
    );

    content.innerHTML='<div class="grid" id="choices"></div>';

    const grid=document.querySelector("#choices");

    services.forEach(s=>{
      const el=document.createElement("button");

      el.className="choice"+
        (state.service?.id===s.id?" selected":"");

      el.innerHTML=`
        <span class="name">${s.name}</span>
        <span class="detail">${s.detail}</span>
        <span class="price">${money(s.price)}</span>
      `;

      el.onclick=()=>{
        state.service=s;
        render();
      };

      grid.append(el);
    });

    renderActions(
      "",
      "CONTINUAR",
      ()=>{
        state.step=2;
        render();
      },
      !state.service
    );

  }else if(state.step===2){

    setHeader(
      "ETAPA 02",
      "Escolha seu barbeiro",
      "Selecione um profissional disponível. A fila é individual."
    );

    content.innerHTML='<div class="grid" id="choices"></div>';

    const grid=document.querySelector("#choices");

    barbers.forEach(b=>{
      const el=document.createElement("button");

      el.className="choice"+
        (state.barber?.id===b.id?" selected":"");

      el.disabled=!b.available;

      el.innerHTML=`
        <span class="name">${b.name}</span>
        <span class="detail">
          ${b.available
            ?`${b.waiting} cliente(s) aguardando`
            :"Indisponível no momento"}
        </span>
        <span class="badge">
          ${b.available?"Disponível":"Indisponível"}
        </span>
      `;

      el.onclick=()=>{
        state.barber=b;
        render();
      };

      grid.append(el);
    });

    renderActions(
      "",
      "CONTINUAR",
      ()=>{
        state.step=3;
        render();
      },
      !state.barber
    );

  }else if(state.step===3){

    setHeader(
      "ETAPA 03",
      "Forma de pagamento",
      "Escolha como pretende pagar."
    );

    content.innerHTML=`
      <div class="summary">
        <div class="summary-row">
          <span>Serviço</span>
          <strong>${state.service.name}</strong>
        </div>

        <div class="summary-row">
          <span>Barbeiro</span>
          <strong>${state.barber.name}</strong>
        </div>

        <div class="summary-row summary-total">
          <span>Total</span>
          <strong>${money(state.service.price)}</strong>
        </div>
      </div>

      <div class="grid" id="choices"></div>
    `;

    const grid=document.querySelector("#choices");

    methods.forEach(m=>{
      const el=document.createElement("button");

      el.className="choice payment-choice"+
        (state.payment?.id===m.id?" selected":"");

      el.innerHTML=`
        <span class="symbol">${m.symbol}</span>
        <span>
          <span class="name">${m.name}</span>
          <span class="detail">${m.detail}</span>
        </span>
      `;

      el.onclick=()=>{
        state.payment=m;
        render();
      };

      grid.append(el);
    });

    renderActions(
      "",
      "CONTINUAR",
      ()=>{
        state.step=4;
        render();
      },
      !state.payment
    );

  }else{

    setHeader(
      "ETAPA 04",
      "Solicitação registrada",
      "Confira os dados abaixo."
    );

    content.innerHTML=`
      <div class="waiting">
        <p class="eyebrow">
          PRÉVIA DE ATENDIMENTO • DEMONSTRAÇÃO
        </p>

        <div class="ticket">LC-001</div>

        <h2>Quase lá!</h2>

        <p class="muted">
          Esta é apenas uma prévia visual.
          Nenhuma cobrança foi feita e você ainda
          não entrou em uma fila real.
        </p>
      </div>

      <div class="waiting-card">

        <div class="summary-row">
          <span>Serviço</span>
          <strong>${state.service.name}</strong>
        </div>

        <div class="summary-row">
          <span>Barbeiro</span>
          <strong>${state.barber.name}</strong>
        </div>

        <div class="summary-row">
          <span>Pagamento</span>
          <strong>${state.payment.name}</strong>
        </div>

        <div class="summary-row">
          <span>Total</span>
          <strong>${money(state.service.price)}</strong>
        </div>

        <div class="summary-row">
          <span>Status</span>
          <strong style="color:#ff9a54">
            Aguardando integração
          </strong>
        </div>

      </div>
    `;

    actions.replaceChildren(
      button("RECOMEÇAR",()=>{
        state.step=1;
        state.service=null;
        state.barber=null;
        state.payment=null;
        render();
      })
    );
  }
}

render();

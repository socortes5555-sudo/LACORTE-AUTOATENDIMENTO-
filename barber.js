/* LaCorte — painel do barbeiro. Única implementação das telas profissionais. */
const staffHeaderHTML = document.querySelector('.topbar')?.innerHTML || '';
let professionalView = 'queue';
let barberElapsedTimer = null;
let barberHistoryDate = null;
let barberQueueRows = [];
const barberPaymentLabels = {pix:'PIX',dinheiro:'Dinheiro',credito:'Crédito',debito:'Débito',misto:'Dividido',cortesia:'Cortesia'};
function barberIcon(name){
  const paths = {
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8.1 8.1 12 12M14 14l6-12M8.1 15.9 12 12"/>',
    chart:'<path d="M5 20V12m7 8V4m7 16V8"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20m-16 5h4"/>',
    cash:'<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 8h1m12 8h1"/>',
    pix:'<path d="m12 2 5 5-5 5-5-5Zm0 10 5 5-5 5-5-5ZM2 12l5-5m-5 5 5 5m10-10 5 5-5 5"/>',
    refresh:'<path d="M20 4v6h-6M4 20v-6h6M5 9a7 7 0 0 1 12-4l3 5M4 14l3 5a7 7 0 0 0 12-4"/>',
    left:'<path d="m15 5-7 7 7 7"/>',right:'<path d="m9 5 7 7-7 7"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    chair:'<path d="M6 4h9v9H6zM4 13h14v4H4zm7 4v5m-4 0h8M18 9h3v8"/>',
    coins:'<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 4 16 4 16 0V6M4 12v6c0 4 16 4 16 0v-6"/>'
  };
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.chart)+'</svg>';
}
function stopBarberTimer(){if(barberElapsedTimer){clearInterval(barberElapsedTimer);barberElapsedTimer=null;}}
function barberDateLabel(date = localQueueDate(), weekday = false){
  return new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',...(weekday?{weekday:'long'}:{})}).format(new Date(date+'T12:00:00'));
}
function professionalNavigation(view){
  professionalView = view || professionalView;
  return '<nav class="professional-nav" aria-label="Navegação profissional">'+
    [['queue','Fila','users'],['history','Atendimentos','scissors'],['reports','Relatórios','chart']].map(([key,label,icon])=>
      '<button type="button" class="professional-nav-item'+(professionalView===key?' active':'')+'" data-professional-view="'+key+'"'+(professionalView===key?' aria-current="page"':'')+'>'+barberIcon(icon)+'<span>'+label+'</span></button>').join('')+'</nav>';
}
function bindProfessionalNavigation(){
  document.querySelectorAll('[data-professional-view]').forEach(button=>button.onclick=()=>{
    const view=button.dataset.professionalView;
    if(view==='profile') renderBarberProfile();
    else if(view==='history') renderBarberHistory();
    else if(view==='reports') renderBarberReports();
    else renderBarberQueue();
  });
}
function mountBarberHeader(){
  const header=document.querySelector('.topbar');
  header.dataset.barberHeader='1';
  header.innerHTML=(["payment","profile"].includes(professionalView)?'<button type="button" class="barber-header-back" aria-label="Voltar à fila">'+barberIcon("left")+'</button>':'')+'<span class="barber-brand"><img class="brand-logo" src="assets/lacorte-logo.svg?v=barbearia-1" alt="La Corte Barbearia"></span>'+
    '<button class="barber-header-profile" type="button" data-professional-view="profile" aria-label="Abrir meu perfil">'+barberProfileAvatar()+'</button>';
  const back=header.querySelector('.barber-header-back');if(back) back.onclick=renderBarberQueue;
}
function openBarberScreen(view,title){
  setAppMode(true);professionalView=view;mountBarberHeader();
  setHeader('PAINEL DO BARBEIRO',title,'');
  content.innerHTML=professionalNavigation(view)+'<main class="professional-main" aria-label="'+safe(title)+'"></main>';
  actions.replaceChildren();notice.textContent='';bindProfessionalNavigation();
  return content.querySelector('.professional-main');
}
function barberError(main,message,retry){
  if(!main.isConnected) return;
  main.innerHTML='<section class="summary barber-empty"><p role="alert">'+safe(message)+'</p><button class="btn btn-primary" data-retry>Tentar novamente</button></section>';
  main.querySelector('[data-retry]').onclick=retry;
}
function barberRowName(row){return row.participant_name||[row.customer?.first_name,row.customer?.last_name].filter(Boolean).join(' ')||'Cliente';}
function barberServices(row){return (row.items||[]).map(item=>item.service_name).join(' + ')||'Serviço não informado';}
function barberElapsed(start){const ms=Date.now()-new Date(start).getTime();const mins=Number.isFinite(ms)?Math.max(0,Math.floor(ms/60000)):0;return String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');}
async function renderBarberQueue(){
  if(state.role!=='barber') return;
  const main=openBarberScreen('queue','Minha fila');
  main.innerHTML='<p class="muted" role="status">Carregando fila...</p>';
  try{
    const today=localQueueDate();
    const [rows,done]=await Promise.all([loadQueueRows(),loadBarberReportRows({start:today,end:today})]);
    if(!main.isConnected) return;
    barberQueueRows=rows.filter(row=>row.queue_date===today);
    const waiting=barberQueueRows.filter(row=>row.status==='waiting'&&!(row.declinedBarberIds||[]).includes(String(state.barberId)));
    const active=barberQueueRows.filter(row=>row.status==='in_progress'&&row.barber_id===state.barberId);
    main.innerHTML='<div class="barber-greeting"><h1>Olá, '+safe(barberDisplayName().split(' ')[0])+'</h1><p>'+safe(barberDateLabel(today,true))+'</p></div>'+
      '<div class="barber-day-stats"><article>'+barberIcon('users')+'<div><span>Aguardando</span><strong>'+waiting.length+'</strong></div></article><article>'+barberIcon('check')+'<div><span>Concluídos</span><strong>'+done.length+'</strong></div></article></div>'+
      active.map(row=>'<article class="barber-active"><div class="barber-active-label">EM ATENDIMENTO</div><div class="barber-active-body"><div class="barber-active-customer">'+barberIcon('chair')+'<div><h2>#'+safe(queueTicketNumber(row))+' • '+safe(barberRowName(row))+'</h2><p>'+safe(barberServices(row))+'</p></div></div><div class="barber-active-details"><span>'+barberIcon('clock')+'<time data-elapsed="'+safe(row.started_at||row.created_at)+'">'+barberElapsed(row.started_at||row.created_at)+'</time></span><span>'+barberIcon('card')+money(Number(row.total_amount))+'</span></div><button class="btn btn-primary" data-finish="'+safe(row.id)+'">Finalizar atendimento</button></div></article>').join('')+
      '<div class="professional-page-tools"><h2>Fila compartilhada</h2><button type="button" class="barber-refresh" data-refresh-queue aria-label="Atualizar fila">'+barberIcon('refresh')+'</button></div><section class="professional-queue-grid" aria-label="Fila de atendimentos">'+
      (waiting.map(row=>'<article class="barber-waiting">'+barberIcon('users')+'<div><h3>#'+safe(queueTicketNumber(row))+' • '+safe(barberRowName(row))+'</h3><p>'+safe(barberServices(row))+' • '+money(Number(row.total_amount))+'</p></div><button class="btn btn-outline" data-start="'+safe(row.id)+'">Chamar</button></article>').join('')||'<p class="barber-empty muted">Nenhum cliente aguardando.</p>')+'</section><p class="barber-queue-note">Fila presencial • Renovada diariamente</p>';
    main.querySelector('[data-refresh-queue]').onclick=renderBarberQueue;
    main.querySelectorAll('[data-start]').forEach(button=>button.onclick=()=>openQueueCallDialog(button.dataset.start,content,renderBarberQueue));
    main.querySelectorAll('[data-finish]').forEach(button=>button.onclick=()=>renderBarberPayment(button.dataset.finish));
    barberElapsedTimer=setInterval(()=>{
      if(!main.isConnected){stopBarberTimer();return;}
      if(localQueueDate()!==today){renderBarberQueue();return;}
      main.querySelectorAll('[data-elapsed]').forEach(el=>el.textContent=barberElapsed(el.dataset.elapsed));
    },15000);
  }catch(error){barberError(main,'Não foi possível carregar a fila. '+error.message,renderBarberQueue);}
}
function barberPeriodControls(period,attribute){
  return '<nav class="barber-periods" aria-label="Período">'+Object.entries({today:'Dia',week:'Semana',fortnight:'Quinzena',month:'Mês'}).map(([key,label])=>'<button type="button" '+attribute+'="'+key+'" aria-pressed="'+(key===period)+'">'+label+'</button>').join('')+'</nav>';
}
async function loadBarberHistoryDetails(rows){
  const names={},services={};
  const customerIds=[...new Set(rows.map(row=>row.customer_id).filter(Boolean))];
  const ids=rows.map(row=>row.id);
  for(let offset=0;offset<Math.max(ids.length,customerIds.length);offset+=50){
    const customers=customerIds.slice(offset,offset+50),entries=ids.slice(offset,offset+50);
    const result=await Promise.all([
      customers.length?db.from('customers').select('id,first_name,last_name').in('id',customers):{data:[]},
      entries.length?db.from('lacorte_queue_items').select('queue_id,service_name').in('queue_id',entries):{data:[]}
    ]);
    result.forEach(r=>{if(r.error) throw r.error;});
    result[0].data.forEach(row=>names[row.id]=[row.first_name,row.last_name].filter(Boolean).join(' '));
    result[1].data.forEach(row=>(services[row.queue_id]||=[]).push(row.service_name));
  }
  return {names,services};
}
async function renderBarberHistory(){
  if(state.role!=='barber') return;
  const main=openBarberScreen('history','Meus atendimentos');
  main.innerHTML='<p class="muted" role="status">Carregando atendimentos...</p>';
  try{
    const period=barberHistoryPeriod;
    const day=barberHistoryDate||localQueueDate();
    const range=period==='today'?{start:day,end:day,label:barberDateLabel(day)}:reportDateRange(period);
    const rows=(await loadBarberReportRows(range,false)).filter(row=>["completed","cancelled"].includes(row.status));
    const {names,services}=await loadBarberHistoryDetails(rows);
    if(!main.isConnected) return;
    rows.sort((a,b)=>String(b.completed_at||b.created_at).localeCompare(String(a.completed_at||a.created_at)));
    const done=rows.filter(row=>row.status==='completed');
    const revenue=done.reduce((n,row)=>n+Number(row.total_amount||0),0);
    const commission=done.reduce((n,row)=>n+Number(row.commission_amount||0),0);
    const commissionLabel=barberCommissionLabel(done);
    let limit=3;
    function draw(){
      main.innerHTML='<h1>Meus atendimentos</h1>'+barberPeriodControls(period,'data-history-period')+
        '<div class="barber-date-picker"><button type="button" data-date-prev aria-label="Dia anterior"'+(period==='today'?'':' hidden')+'>'+barberIcon('left')+'</button><label>'+barberIcon('calendar')+'<span>'+safe(period==='today'?barberDateLabel(day):range.label)+'</span><input type="date" aria-label="Selecionar dia" value="'+safe(day)+'" max="'+localQueueDate()+'"'+(period==='today'?'':' hidden')+'></label><button type="button" data-date-next aria-label="Dia seguinte"'+(period==='today'?'':' hidden')+(day>=localQueueDate()?' disabled':'')+'>'+barberIcon('right')+'</button></div>'+
        '<div class="barber-history-summary">'+barberIcon('chart')+'<strong>'+done.length+' atendimentos • '+money(revenue)+'</strong></div>'+
        '<div class="barber-history-list">'+(rows.slice(0,limit).map(row=>'<article class="barber-history-record"><span class="barber-history-check '+(row.status==='cancelled'?'cancelled':'')+'">'+barberIcon('check')+'</span><div class="barber-history-info"><h3>#'+safe(queueTicketNumber(row))+' • '+safe(row.participant_name||names[row.customer_id]||'Cliente')+'</h3><p>'+safe((services[row.id]||[]).join(' + ')||'Serviço não informado')+'</p><small>'+safe(row.status==='cancelled'?'Cancelado':new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(row.completed_at||row.created_at))+' • '+(barberPaymentLabels[row.payment_method]||'Não informado'))+'</small>'+(row.observation?'<p class="barber-history-note">'+safe(row.observation)+'</p>':'')+'</div><strong>'+money(Number(row.total_amount||0))+'</strong><details><summary>Detalhes</summary><p>Comissão: '+money(Number(row.commission_amount||0))+'</p>'+(row.status==='completed'?'<button class="btn btn-outline" data-cancel-appointment="'+safe(row.id)+'">Cancelar atendimento</button>':'<p class="muted">'+safe(statusLabel(row.status))+'</p>')+'</details></article>').join('')||'<p class="barber-empty muted">Nenhum atendimento neste período.</p>')+'</div>'+
        '<section class="barber-result-card">'+barberIcon('coins')+'<div><h3>Seu resultado '+(period==='today'&&day===localQueueDate()?'hoje':'no período')+'</h3><p>Comissão'+safe(commissionLabel)+'</p></div><strong>'+money(commission)+'</strong></section>'+(rows.length>limit?'<button class="btn btn-outline" data-more>Carregar mais</button>':'');
      main.querySelectorAll('[data-history-period]').forEach(button=>button.onclick=()=>{barberHistoryPeriod=button.dataset.historyPeriod;renderBarberHistory();});
      main.querySelector('[data-date-prev]').onclick=()=>{barberHistoryDate=reportShiftDate(day,-1);renderBarberHistory();};
      main.querySelector('[data-date-next]').onclick=()=>{barberHistoryDate=reportShiftDate(day,1);renderBarberHistory();};
      main.querySelector('input[type=date]').onchange=function(){if(this.value&&this.value<=localQueueDate()){barberHistoryDate=this.value;renderBarberHistory();}};
      main.querySelectorAll('[data-cancel-appointment]').forEach(button=>button.onclick=()=>openCancelAppointmentDialog(button.dataset.cancelAppointment,renderBarberHistory));
      const more=main.querySelector('[data-more]');if(more) more.onclick=()=>{limit+=40;draw();};
    }
    draw();
  }catch(error){barberError(main,'Não foi possível carregar seus atendimentos. '+error.message,renderBarberHistory);}
}
function barberCommissionLabel(rows=[]){
  const rates=[...new Set(rows.map(row=>Number(row.commission_percent)).filter(Number.isFinite))];
  const rate= rates.length===1?rates[0]:rows.length?null:Number(barbers.find(b=>b.id===state.barberId)?.commission_percent);
  return rate==null||!Number.isFinite(rate)?'':' ('+rate.toLocaleString('pt-BR')+'%)';
}
async function renderBarberPayment(queueId){
  if(state.role!=='barber') return;
  const main=openBarberScreen('payment','Finalizar atendimento');
  document.body.classList.add('barber-payment');
  main.innerHTML='<p class="muted" role="status">Carregando atendimento...</p>';
  try{
    const result=await db.from('lacorte_queue').select('id,customer_id,participant_name,queue_number,group_ticket_number,status,barber_id,total_amount,gross_amount,discount_amount,commission_percent,observation').eq('id',queueId).single();
    if(result.error) throw result.error;
    if(!main.isConnected) return;
    const row=result.data;
    if(row.status!=='in_progress'||row.barber_id!==state.barberId) throw new Error('Este atendimento não está em andamento no seu perfil.');
    const {names,services}=await loadBarberHistoryDetails([row]);
    if(!main.isConnected) return;
    const gross=Number(row.gross_amount??row.total_amount);
    let selected='pix',split=false;
    main.innerHTML='<h1>Finalizar atendimento</h1><section class="barber-payment-customer"><div><h2>#'+safe(queueTicketNumber(row))+' • '+safe(row.participant_name||names[row.customer_id]||'Cliente')+'</h2><p>'+safe((services[row.id]||[]).join(' + ')||'Serviço não informado')+'</p></div><div><span>Total</span><strong data-payment-total>'+money(gross)+'</strong></div></section><form class="barber-payment-form"><h2>Forma de pagamento</h2><div class="barber-payment-methods">'+
      Object.entries({pix:'PIX',dinheiro:'Dinheiro',credito:'Crédito',debito:'Débito'}).map(([key,label])=>'<button type="button" data-method="'+key+'" aria-pressed="'+(key===selected)+'">'+barberIcon(key==='pix'?'pix':key==='dinheiro'?'cash':'card')+'<span>'+label+'</span><span class="barber-method-check">✓</span></button>').join('')+'</div><button type="button" class="barber-split-toggle" aria-expanded="false">Dividir pagamento</button><div class="payment-split-fields" hidden>'+Object.entries({pix:'PIX',dinheiro:'Dinheiro',credito:'Crédito',debito:'Débito'}).map(([key,label])=>'<label>'+label+' (R$)<input type="number" min="0" step="0.01" inputmode="decimal" data-payment="'+key+'" aria-label="Valor em '+label+'"></label>').join('')+'</div><div class="barber-payment-extras"><label>Desconto (R$)<input name="discount" type="number" min="0" max="'+gross+'" step="0.01" inputmode="decimal" value="'+Number(row.discount_amount||0)+'"></label><label>Observação<input name="observation" maxlength="300" placeholder="Opcional" value="'+safe(row.observation||'')+'"></label></div><div class="barber-payment-totals"><div><span>Valor recebido</span><strong data-net></strong></div><div><span>Sua comissão'+safe(barberCommissionLabel([row]))+'</span><strong data-commission></strong></div></div><p class="barber-payment-balance" role="status" aria-live="polite"></p><button class="btn btn-primary" type="submit">Confirmar e concluir</button><button class="barber-payment-back" type="button">Voltar ao atendimento</button><p role="alert" data-error></p></form>';
    const form=main.querySelector('form'),discount=form.elements.discount,parts=[...form.querySelectorAll('[data-payment]')],submit=form.querySelector('[type=submit]'),balance=form.querySelector('[role=status]');
    const cents=value=>Math.round(Number(value)*100);
    function paymentState(){
      const discountCents=cents(discount.value||0),net=cents(gross)-discountCents;
      const values=split?parts.map(input=>({method:input.dataset.payment,amount:cents(input.value||0)/100})).filter(p=>p.amount>0):net>0?[{method:selected,amount:net/100}]:[];
      const entered=values.reduce((sum,p)=>sum+cents(p.amount),0);
      const valid=Number.isFinite(discountCents)&&discountCents>=0&&net>=0&&entered===net&&parts.every(input=>!split||input.validity.valid);
      return {discount:discountCents/100,net:net/100,values,entered:entered/100,valid};
    }
    function update(){
      const p=paymentState();
      main.querySelector('[data-payment-total]').textContent=money(Math.max(0,p.net));
      form.querySelector('[data-net]').textContent=money(Math.max(0,p.net));
      form.querySelector('[data-commission]').textContent=money(Math.max(0,p.net)*Number(row.commission_percent||0)/100);
      const missing=Math.round((p.net-p.entered)*100)/100;
      balance.textContent=split?(p.valid?'Valores conferem.':missing>0?'Falta receber '+money(missing):missing<0?'Há '+money(-missing)+' a mais que o total.':'Confira os valores informados.') : '';
      submit.disabled=!p.valid;
      form.querySelectorAll('[data-method]').forEach(button=>button.setAttribute('aria-pressed',String(!split&&button.dataset.method===selected)));
    }
    form.querySelectorAll('[data-method]').forEach(button=>button.onclick=()=>{selected=button.dataset.method;if(split){split=false;form.querySelector('.payment-split-fields').hidden=true;form.querySelector('.barber-split-toggle').setAttribute('aria-expanded','false');}update();});
    form.querySelector('.barber-split-toggle').onclick=function(){split=!split;form.querySelector('.payment-split-fields').hidden=!split;this.setAttribute('aria-expanded',String(split));if(split&&parts.every(input=>!input.value)) parts.find(input=>input.dataset.payment===selected).value=paymentState().net.toFixed(2);update();};
    discount.oninput=update;parts.forEach(input=>input.oninput=update);
    form.querySelector('.barber-payment-back').onclick=renderBarberQueue;
    form.onsubmit=async function(event){
      event.preventDefault();if(form.dataset.saving) return;
      const p=paymentState();if(!p.valid) return;
      form.dataset.saving='1';[...form.elements].forEach(e=>e.disabled=true);
      const error=form.querySelector('[data-error]');error.textContent='';
      try{
        const result=await db.rpc('lacorte_finish_service_details',{p_queue_id:queueId,p_discount_amount:p.discount,p_payments:p.values,p_observation:form.elements.observation.value.trim()||null});
        if(result.error) throw result.error;
        if(main.isConnected) renderBarberQueue();
      }catch(e){error.textContent='Não foi possível concluir. '+e.message;delete form.dataset.saving;[...form.elements].forEach(el=>el.disabled=false);update();}
    };
    update();
  }catch(error){barberError(main,error.message,()=>renderBarberPayment(queueId));}
}
let barberProfile = {};
let barberProfileError = "";

async function loadBarberProfile(){
  const userId = state.user?.id;
  try{
    const result = await db.from("lacorte_staff_profiles")
      .select("display_name,photo,zoom,crop_x,crop_y,report_period")
      .eq("user_id",userId).maybeSingle();
    if(result.error) throw result.error;
    if(state.role !== "barber" || state.user?.id !== userId) return;
    barberProfile = result.data || {};
    barberProfileError = "";
    barberReportPeriod = barberProfile.report_period || "today";
  }catch(error){
    if(state.role === "barber" && state.user?.id === userId){
      barberProfileError = "Não foi possível carregar seu perfil. Tente novamente.";
    }
  }
}

function barberDisplayName(){
  return barberProfile.display_name ||
    barbers.find(barber=>barber.id === state.barberId)?.name || "Profissional";
}

function barberProfileAvatar(){
  return profileAvatar(barberProfile.photo,{
    zoom:barberProfile.zoom,x:barberProfile.crop_x,y:barberProfile.crop_y
  },"B2");
}

function renderBarberProfile(){
  if(state.role !== "barber") return;
  professionalView = "profile";
  const main = openBarberScreen("profile","Meu perfil");
  main.innerHTML = "<h1>Meu perfil</h1>";
  if(barberProfileError){
    main.innerHTML = '<section class="summary"><p class="muted">'+safe(barberProfileError)+
      '</p><button type="button" class="btn">Tentar novamente</button></section>';
    main.querySelector("button").addEventListener("click",async function(){
      this.disabled = true;
      await loadBarberProfile();
      if(main.isConnected && professionalView === "profile") renderBarberProfile();
    });
    return;
  }
  const form = document.createElement("form");
  form.className = "summary barber-profile-form";
  form.innerHTML = `<div class="barber-profile-intro"><span class="eyebrow">DO SEU JEITO</span>
    <h3>Foto e preferências</h3><p class="muted">Toque na foto para ajustar o enquadramento.</p></div>
    <button type="button" class="lc-avatar-edit" data-avatar-preview aria-label="Ajustar minha foto"
      aria-expanded="false" aria-controls="barber-avatar-crop"></button>
    <fieldset id="barber-avatar-crop" data-avatar-crop hidden>
      <legend>Ajustar foto</legend>
      <label>Zoom<input name="zoom" type="range" min="1" max="3" step=".05" value="1"></label>
      <label>Posição horizontal<input name="cropX" type="range" min="0" max="100" value="50"></label>
      <label>Posição vertical<input name="cropY" type="range" min="0" max="100" value="50"></label>
      <button type="button" class="btn" data-reset-crop>Centralizar</button>
    </fieldset>
    <label>Trocar foto<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>
    <button type="button" class="btn" data-remove-avatar>Remover foto</button>
    <label>Nome de exibição<input name="displayName" maxlength="80" autocomplete="nickname"
      placeholder="Seu nome no painel"></label>
    <label>Abrir meus relatórios em<select name="period">
      <option value="today">Dia</option><option value="week">Semana</option>
      <option value="fortnight">Quinzena</option><option value="month">Mês</option>
    </select></label>
    <div class="actions"><button type="submit" class="btn btn-primary">Salvar perfil</button></div>
    <p role="status" class="muted" aria-live="polite"></p>`;
  main.append(form);
  const logout = makeButton("Sair da conta",async()=>{await db.auth.signOut();},true);
  main.append(logout);
  const settings = {
    photo:barberProfile.photo,
    crop:{zoom:barberProfile.zoom,x:barberProfile.crop_x,y:barberProfile.crop_y}
  };
  const photoEditor = bindProfilePhotoEditor(form,settings,"B2");
  form.elements.displayName.value = barberDisplayName();
  form.elements.period.value = barberProfile.report_period || "today";
  const userId = state.user.id;
  form.addEventListener("submit",async function(event){
    event.preventDefault();
    if(photoEditor.busy || form.dataset.saving) return;
    form.dataset.saving = "1";
    const status = form.querySelector("[role=status]");
    const crop = photoEditor.crop;
    const values = {
      user_id:userId,display_name:form.elements.displayName.value.trim(),
      photo:photoEditor.photo || null,zoom:crop.zoom,crop_x:crop.x,crop_y:crop.y,
      report_period:form.elements.period.value,updated_at:new Date().toISOString()
    };
    const fields = Array.from(form.elements);
    fields.forEach(field=>field.disabled=true);
    status.textContent = "Salvando seu perfil...";
    try{
      const result = await db.from("lacorte_staff_profiles").upsert(values,{onConflict:"user_id"})
        .select("display_name,photo,zoom,crop_x,crop_y,report_period").single();
      if(result.error || !result.data) throw result.error || new Error("Perfil não retornado.");
      if(state.role !== "barber" || state.user?.id !== userId) return;
      barberProfile = result.data;
      barberReportPeriod = barberProfile.report_period;
      if(form.isConnected){
        const nav = content.querySelector(".professional-nav");
        nav.outerHTML = professionalNavigation("profile");
        mountBarberHeader();
        bindProfessionalNavigation();
        status.textContent = "Perfil salvo.";
      }
    }catch(error){
      status.textContent = "Não foi possível salvar seu perfil. Tente novamente.";
    }finally{
      delete form.dataset.saving;
      fields.forEach(field=>field.disabled=false);
    }
  });
}

let barberReportPeriod = "today";
let barberHistoryPeriod = "today";

async function loadBarberReportRows(range, completedOnly = true){
  const rows = [];
  for(let offset=0;;offset+=500){
    let query = db.from("lacorte_queue")
      .select("id,customer_id,status,total_amount,commission_amount,payment_method,queue_date,created_at,completed_at,queue_number,group_ticket_number,participant_name,commission_percent,observation,cancelled_at,cancel_reason")
      .eq("barber_id",state.barberId);
    if(completedOnly) query=query.eq("status","completed");
    if(range) query=query.gte("queue_date",range.start).lte("queue_date",range.end);
    const result=await query.order("id").range(offset,offset+499);
    if(result.error) throw result.error;
    rows.push(...result.data);
    if(result.data.length < 500) return rows;
  }
}


async function renderBarberReports(){
  if(!(state.role === "barber" || (state.role === "admin" && state.barberId))) return renderQueueDashboard();
  professionalView = "reports";
  setAppMode(true);
  if(state.role === "barber") mountBarberHeader();
  setHeader("PAINEL DO PROFISSIONAL","Meus resultados","Acompanhe seus atendimentos, faturamento e comissão.");
  notice.textContent = "Valores de atendimentos concluídos pelo seu perfil.";
  dashboardActions();
  actions.prepend(makeButton("VOLTAR À FILA",renderQueueDashboard,true));
  content.innerHTML = '<p class="muted">Carregando seus resultados...</p>';
  const loading = content.firstElementChild;
  try{
    const period = barberReportPeriod;
    const range = reportDateRange(period);
    const done = await loadBarberReportRows(range);
    const queueIds = done.map(row=>row.id);
    const serviceNames = {}, paymentsByQueue = {};
    // Each entry can contain several services and payment lines. Keep every batch below API row limits.
    for(let offset=0;offset<queueIds.length;offset+=50){
      const entries = queueIds.slice(offset,offset+50);
      const extra = await Promise.all([
        entries.length ? db.from("lacorte_queue_items").select("queue_id,service_name").in("queue_id",entries) : {data:[]},
        entries.length ? db.from("lacorte_queue_payments").select("queue_id,payment_method,amount").in("queue_id",entries) : {data:[]}
      ]);
      for(const result of extra) if(result.error) throw result.error;
      extra[0].data.forEach(row=>(serviceNames[row.queue_id] ||= []).push(row.service_name));
      extra[1].data.forEach(row=>(paymentsByQueue[row.queue_id] ||= []).push(row));
    }
    const revenue = done.reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const commission = done.reduce((sum,row)=>sum+Number(row.commission_amount||0),0);
    const labels = {pix:"PIX",dinheiro:"Dinheiro",credito:"Crédito",debito:"Débito",outros:"Sem detalhamento"};
    const payments = {pix:0,dinheiro:0,credito:0,debito:0,outros:0};
    const serviceCounts = {};
    for(const row of done){
      const lines = paymentsByQueue[row.id] || [];
      if(lines.length){
        lines.forEach(payment=>{
          const key = Object.hasOwn(payments,payment.payment_method) ? payment.payment_method : "outros";
          payments[key] += Number(payment.amount);
        });
      }else{
        const key = Object.hasOwn(payments,row.payment_method) ? row.payment_method : "outros";
        payments[key] += Number(row.total_amount);
      }
      (serviceNames[row.id]||[]).forEach(name=>serviceCounts[name]=(serviceCounts[name]||0)+1);
    }
    const periods = {today:"Dia",week:"Semana",fortnight:"Quinzena",month:"Mês"};
    const tabs = Object.entries(periods).map(([key,label])=>'<button type="button" data-barber-period="'+key+
      '" aria-pressed="'+(period===key)+'">'+label+'</button>').join("");
    const dateLabel = date=>date.slice(8)+"/"+date.slice(5,7)+"/"+date.slice(0,4);
    const metrics = [
      ["Faturamento líquido",money(revenue),"Valor recebido","revenue"],
      ["Minha comissão",money(commission),"Seu ganho no período","commission"],
      ["Atendimentos",String(done.length),"Concluídos no período","count"],
      ["Valor médio",money(done.length ? revenue/done.length : 0),"Por atendimento concluído",""]
    ].map(([label,value,note,kind])=>'<article class="summary '+kind+'"><span>'+label+'</span><strong>'+
      value+'</strong><small>'+safe(note)+'</small></article>').join("");
    const paymentItems = Object.keys(payments).map(key=>({label:labels[key],value:payments[key]}));
    const rankedServices = Object.entries(serviceCounts).sort((a,b)=>b[1]-a[1]);
    const highest = Math.max(1,...rankedServices.map(([,count])=>count));
    const servicesHtml = rankedServices.map(([name,count])=>'<div class="barber-service-bar"><div><span>'+
      safe(name)+'</span><strong>'+count+'</strong></div><meter min="0" max="'+highest+'" value="'+count+
      '" aria-label="'+safe(name)+', '+count+' serviço(s)"></meter></div>').join("") ||
      '<p class="barber-chart-empty">Nenhum serviço concluído neste período.</p>';
    let html = '<section class="summary barber-report-filter"><div><span class="eyebrow">SEUS RESULTADOS</span>'+
      '<h3>'+periods[period]+'</h3><p>'+safe(range.label)+' · '+dateLabel(range.start)+
      (range.start===range.end ? "" : " a "+dateLabel(range.end))+'</p></div>'+
      '<nav class="barber-periods" aria-label="Período dos relatórios">'+tabs+'</nav></section>'+
      '<div class="report-kpis barber-report-kpis">'+metrics+'</div>'+
      '<div class="barber-chart-grid">'+
      '<section class="summary barber-chart"><div class="barber-chart-heading"><div><h3>Formas de pagamento</h3>'+
      '<p>Participação no valor recebido</p></div></div>'+
      reportPieChart(paymentItems,money,"Nenhum pagamento recebido neste período.",
        ["#ff8128","#58d2b2","#839cff","#d19bff","#8c8c8c"])+'</section>'+
      '<section class="summary barber-chart"><div class="barber-chart-heading"><div><h3>Serviços realizados</h3>'+
      '<p>Quantidade de cada serviço concluído</p></div></div>'+servicesHtml+'</section></div>';
    if(!loading.isConnected) return;
    content.innerHTML = (state.role === "admin" ? adminNavigation()+html :
      professionalNavigation("reports")+'<main class="professional-main"><h1>Meus relatórios</h1>'+html+'</main>');
    if(state.role === "admin") bindAdminNavigation();
    else bindProfessionalNavigation();
    content.querySelectorAll("[data-barber-period]").forEach(button=>{
      button.addEventListener("click",()=>{
        barberReportPeriod = button.dataset.barberPeriod;
        renderBarberReports();
      });
    });
  }catch(error){
    if(!loading.isConnected) return;
    content.innerHTML = (state.role === "admin" ? adminNavigation() : professionalNavigation("reports"))+
      '<section class="summary"><p class="muted">'+safe(error.message)+'</p>'+
      '<button type="button" class="btn" data-retry-barber-report>Tentar novamente</button></section>';
    if(state.role === "admin") bindAdminNavigation();
    else bindProfessionalNavigation();
    content.querySelector("[data-retry-barber-report]").addEventListener("click",renderBarberReports);
  }
}

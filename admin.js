/* LaCorte — administrador. Funções exclusivas e layout aprovado. */
let adminHistoryLimit = 20;
let adminReportFilters = { period: "month", start: "", end: "" };
async function renderAdminReports(view="reports", target){
  if(state.role !== "admin") return;
  const embedded = target;
  target = openAdminSection(target, view, view === "history" ? "Histórico de atendimentos" : "Relatórios e faturamento",
    view === "history" ? "Consulte os registros de todos os atendimentos da barbearia." : "Acompanhe resultados, serviços e comissões por período.",
    "Relatórios exclusivos do administrador • Valores financeiros consideram somente atendimentos concluídos.");
  const isCurrent = showAdminLoading(target, "Carregando relatórios...");
  let range;
  try {
    range = reportDateRange();
    const queueResult = await db.from("lacorte_queue")
      .select("id,customer_id,barber_id,queue_date,queue_number,group_ticket_number,group_id,participant_index,participant_name,status,total_amount,gross_amount,discount_amount,commission_percent,commission_amount,payment_method,created_at,completed_at,cancelled_at,cancel_reason")
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
      queueIds.length ? db.from("lacorte_queue_items").select("queue_id,service_name,unit_price").in("queue_id",queueIds) : Promise.resolve({data:[],error:null}),
      queueIds.length ? db.from("lacorte_queue_payments").select("queue_id,payment_method,amount").in("queue_id",queueIds) : Promise.resolve({data:[],error:null})
    ]);
    if(lookups[0].error) throw new Error("Não foi possível consultar os clientes: "+lookups[0].error.message);
    if(lookups[1].error) throw new Error("Não foi possível consultar os serviços: "+lookups[1].error.message);
    if(lookups[2].error) throw new Error("Não foi possível consultar os pagamentos: "+lookups[2].error.message);
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
    const grossRevenue = completedRows.reduce(function(sum,row){return sum+Number(row.gross_amount ?? row.total_amount ?? 0);},0);
    const discountTotal = completedRows.reduce(function(sum,row){return sum+Number(row.discount_amount || 0);},0);
    const commissions = completedRows.filter(row => row.barber_id !== "barbeiro-1").reduce(function(sum,row){return sum+Number(row.commission_amount || 0);},0);
    const net = revenue-commissions;
    const paymentTotals = {pix:0,dinheiro:0,credito:0,debito:0};
    const paymentLinesByQueue = {};
    (lookups[2].data || []).forEach(function(line){(paymentLinesByQueue[line.queue_id]||(paymentLinesByQueue[line.queue_id]=[])).push(line);});
    completedRows.forEach(function(row){
      const lines=paymentLinesByQueue[row.id]||[];
      if(lines.length) lines.forEach(function(line){if(paymentTotals[line.payment_method] !== undefined) paymentTotals[line.payment_method] += Number(line.amount||0);});
      else if(paymentTotals[row.payment_method] !== undefined) paymentTotals[row.payment_method] += Number(row.total_amount||0);
    });
    const paymentLabelForRow=function(row){
      const lines=paymentLinesByQueue[row.id]||[];
      return lines.length?lines.map(function(line){return ({pix:"PIX",dinheiro:"Dinheiro",credito:"Crédito",debito:"Débito"})[line.payment_method]+" "+money(Number(line.amount||0));}).join(" + "):(({pix:"PIX",dinheiro:"Dinheiro",credito:"Crédito",debito:"Débito"})[row.payment_method] || row.payment_method || "—");
    };
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
      return queuePersonLabel(row,((c.first_name || "Cliente")+" "+(c.last_name || "")).trim());
    };
    const history = view === "history" ? rows.slice().sort(function(a,b){
      return String(b.created_at).localeCompare(String(a.created_at));
    }).slice(0,adminHistoryLimit).map(function(row){
      const items = itemsByQueue[row.id] || [];
      const services = items.map(function(item){
        return '<li>'+safe(item.service_name)+' · '+money(Number(item.unit_price || 0))+'</li>';
      }).join("");
      const serviceCount = items.length === 1 ? "1 serviço" : items.length + " serviços";
      const barber = barberById[row.barber_id] || row.barber_id || "Aguardando atribuição";
      return '<article class="admin-history-record">'+
        '<div class="admin-history-row"><strong>#'+Number(queueTicketNumber(row))+'</strong>'+
        '<div><strong>'+safe(customerName(row))+'</strong><small>'+serviceCount+'</small></div>'+
        '<strong>'+money(Number(row.total_amount || 0))+'</strong>'+
        '<span>'+safe(paymentLabelForRow(row))+'</span>'+
        '<span class="admin-history-status">'+safe(statusLabel(row.status))+'</span></div>'+
        '<details><summary>Detalhes</summary><div class="admin-history-details">'+
        '<span><b>Barbeiro</b> '+safe(barber)+'</span>'+
        '<span><b>Desconto</b> '+money(Number(row.discount_amount || 0))+'</span>'+
        '<span><b>Pagamento</b> '+safe(paymentLabelForRow(row))+'</span>'+
        '<span><b>Data</b> '+safe(formatDateTime(row.completed_at || row.created_at))+'</span>'+
        (row.cancelled_at ? '<span><b>Cancelado em</b> '+safe(formatDateTime(row.cancelled_at))+'</span>' : '')+
        (row.cancel_reason ? '<span><b>Motivo</b> '+safe(row.cancel_reason)+'</span>' : '')+
        (services ? '<ul aria-label="Serviços">'+services+'</ul>' : '')+
        '</div></details>'+ (row.status!=="cancelled" ? '<button type="button" class="btn btn-secondary" data-cancel-appointment="'+safe(row.id)+'">Cancelar atendimento</button>' : '')+'</article>';
    }).join("") : "";

    const periodOptions = '<option value="today" '+(adminReportFilters.period==="today"?"selected":"")+'>Hoje</option>'+
      '<option value="week" '+(adminReportFilters.period==="week"?"selected":"")+'>Esta semana</option>'+
      '<option value="fortnight" '+(adminReportFilters.period==="fortnight"?"selected":"")+'>Quinzena</option>'+
      '<option value="month" '+(adminReportFilters.period==="month"?"selected":"")+'>Este mês</option>'+
      '<option value="custom" '+(adminReportFilters.period==="custom"?"selected":"")+'>Personalizado</option>';
    let html = "";
    const filterLabel = view === "history" ? "PERÍODO DO HISTÓRICO" : "PERÍODO DO RELATÓRIO";
    html += '<form id="report-filter" class="summary report-filter"><label for="report-period">' + filterLabel + '</label><select id="report-period" name="period">'+periodOptions+'</select>'+
      '<div class="report-date-fields"><label>Data inicial<input type="date" id="report-start" name="start" value="'+safe(adminReportFilters.start || range.start)+'"></label>'+
      '<label>Data final<input type="date" id="report-end" name="end" value="'+safe(adminReportFilters.end || range.end)+'"></label></div>'+
      '<button class="btn btn-primary" type="submit">APLICAR PERÍODO</button></form>';

    if(view === "history"){
      html += '<section class="summary admin-history-panel"><div class="admin-history-heading"><div><h3>REGISTROS DO PERÍODO</h3><p class="muted">Todos os atendimentos da barbearia, com status e responsável.</p></div><strong>'+rows.length+' registro(s)</strong></div>'+
        (rows.length
          ? '<div class="admin-history-records">'+history+'</div>'+(rows.length>adminHistoryLimit?'<button type="button" class="btn btn-secondary" data-more-history>Carregar mais atendimentos</button>':'')
          : '<p class="muted">Nenhum atendimento encontrado neste período.</p>')+
        '</section>';
    } else {
      html += '<div class="report-kpis">'+
        '<article class="summary"><span class="muted">Faturamento bruto</span><strong>'+money(grossRevenue)+'</strong></article>'+
        '<article class="summary"><span class="muted">Descontos</span><strong>'+money(discountTotal)+'</strong></article>'+
        '<article class="summary"><span class="muted">Faturamento líquido</span><strong>'+money(revenue)+'</strong></article>'+
        '<article class="summary"><span class="muted">Comissões de terceiros</span><strong>'+money(commissions)+'</strong></article>'+
        '<article class="summary"><span class="muted">Após comissões de terceiros</span><strong>'+money(net)+'</strong></article>'+
        '<article class="summary"><span class="muted">Atendimentos concluídos</span><strong>'+counts.completed+'</strong></article></div>';
      html += '<section class="summary"><h3>FORMAS DE PAGAMENTO</h3>'+Object.keys(paymentTotals).map(function(method){return '<div class="summary-row"><span>'+({pix:"PIX",dinheiro:"Dinheiro",credito:"Crédito",debito:"Débito"}[method])+'</span><strong>'+money(paymentTotals[method])+'</strong></div>';}).join("")+'</section>';
      html += '<section class="summary report-chart"><h3>FATURAMENTO POR DIA</h3><p class="muted">'+safe(range.label)+' • '+safe(range.start)+' até '+safe(range.end)+'</p>'+lcAdminRevenueChart(dailyItems.map(item=>item.value),range.end,range.start)+'</section>';
      html += '<div class="report-chart-grid"><section class="summary report-chart"><h3>COMISSÕES POR BARBEIRO</h3>'+reportPieChart(commissionItems,money)+'</section>'+
        '<section class="summary report-chart"><h3>SERVIÇOS MAIS REALIZADOS</h3>'+reportPieChart(serviceItems,function(value){return value+" atend.";})+'</section></div>';
      const statusItems=[
        {label:"Aguardando",value:counts.waiting},
        {label:"Em atendimento",value:counts.in_progress},
        {label:"Concluídos",value:counts.completed},
        {label:"Cancelados",value:counts.cancelled}
      ];
      html += '<section class="summary report-chart"><h3>STATUS DOS ATENDIMENTOS</h3>'+reportPieChart(statusItems,function(value){return String(value)+" atend.";})+'</section>';
    }

    if(!isCurrent()) return;
    target.innerHTML = html;
    const moreHistory=target.querySelector("[data-more-history]");if(moreHistory) moreHistory.onclick=()=>{adminHistoryLimit+=20;renderAdminReports(view,embedded);};
    target.querySelectorAll("[data-cancel-appointment]").forEach(button=>button.addEventListener("click",()=>openCancelAppointmentDialog(button.dataset.cancelAppointment,()=>renderAdminReports(view,embedded))));
    const filter = target.querySelector("#report-filter");
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
      adminHistoryLimit=20;
      adminReportFilters.period=String(fd.get("period") || "month");
      adminReportFilters.start=String(fd.get("start") || "");
      adminReportFilters.end=String(fd.get("end") || "");
      if(target.isConnected) renderAdminReports(view, embedded);
    });
  } catch(error) {
    if(!isCurrent()) return;
    target.innerHTML = '<section class="summary"><p class="muted">'+safe(error.message)+'</p></section>';
  }
}


// ===== GERENCIAMENTO ADMINISTRATIVO LACORTE =====
let adminView = "queue";






async function renderAdminCustomers(target){
  if(state.role !== "admin") return;
  const embedded = target;
  target = openAdminSection(target, "customers", "Clientes cadastrados",
    "Cadastro permanente e histórico de visitas da clientela.",
    "Dados pessoais e histórico completos • Acesso exclusivo do administrador.");
  const isCurrent = showAdminLoading(target, "Carregando clientes e histórico...");
  try {
    const results = await Promise.all([
      db.from("customers").select("id,first_name,last_name,email,phone,birth_date,created_at").is("deleted_at",null).order("created_at",{ascending:false}).limit(500),
      db.from("lacorte_queue").select("id,customer_id,queue_date,queue_number,group_ticket_number,group_id,participant_index,participant_name,status,total_amount,barber_id,payment_method,created_at,completed_at").order("created_at",{ascending:false}).limit(2000),
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
    let html = "";
    html += '<section class="summary"><h3>BASE DE CLIENTES</h3><p class="muted">'+customers.length+' cadastro(s) carregado(s). Pesquise por nome, telefone ou e-mail.</p><label for="customer-admin-search">BUSCAR CLIENTE</label><input id="customer-admin-search" type="search" placeholder="Digite nome, telefone ou e-mail"></section>';
    if(!customers.length) html += '<section class="summary"><p class="muted">Ainda não há clientes cadastrados.</p></section>';
    customers.forEach(function(customer){
      const fullName=(customer.first_name||"")+" "+(customer.last_name||"");
      const rows=history[customer.id]||[];
      const completed=rows.filter(function(row){return row.status==="completed";});
      const spent=completed.reduce(function(sum,row){return sum+Number(row.total_amount||0);},0);
      const visitCount=new Set(rows.map(row=>row.group_id||row.id)).size;
      const lastVisit=rows.length?rows[0].created_at:null;
      const searchText=(fullName+" "+(customer.phone||"")+" "+(customer.email||"")).toLocaleLowerCase("pt-BR");
      html += '<details class="summary admin-customer-card" data-customer-card data-search="'+safe(searchText)+'"><summary><strong>'+safe(fullName.trim()||"Cliente sem nome")+'</strong><span class="admin-customer-chevron" aria-hidden="true">⌄</span></summary>';
      html += '<div class="admin-customer-details"><div class="admin-customer-stats"><div><span>VISITAS</span><strong>'+visitCount+'</strong></div><div><span>VALOR CONCLUÍDO</span><strong>'+money(spent)+'</strong></div></div><div class="summary-row"><span>Telefone</span><strong>'+safe(customer.phone||"—")+'</strong></div><div class="summary-row"><span>E-mail</span><strong>'+safe(customer.email||"—")+'</strong></div><div class="summary-row"><span>Aniversário</span><strong>'+safe(customer.birth_date||"—")+'</strong></div><div class="summary-row"><span>Cadastro</span><strong>'+formatDateTime(customer.created_at)+'</strong></div><div class="summary-row"><span>Última entrada</span><strong>'+formatDateTime(lastVisit)+'</strong></div><form class="admin-form customer-edit-form" data-customer-form="' + safe(customer.id) + '"><h4>EDITAR CADASTRO</h4><label>Nome</label><input name="first_name" required maxlength="80" value="' + safe(customer.first_name||"") + '"><label>Sobrenome</label><input name="last_name" required maxlength="100" value="' + safe(customer.last_name||"") + '"><label>Telefone</label><input name="phone" type="tel" required maxlength="20" value="' + safe(customer.phone||"") + '"><label>E-mail</label><input name="email" type="email" value="' + safe(customer.email||"") + '"><label>Aniversário</label><input name="birth_date" type="date" value="' + safe(customer.birth_date||"") + '"><button class="btn btn-secondary" type="submit">SALVAR CADASTRO</button><p class="muted" data-customer-save-status role="status"></p></form><button type="button" class="btn btn-secondary" data-delete-customer="' + safe(customer.id) + '">EXCLUIR CLIENTE</button><h4>HISTÓRICO DE ATENDIMENTOS</h4>';
      if(!rows.length) html += '<p class="muted">Nenhuma entrada na fila registrada.</p>';
      else {
        html += '<div class="report-table-wrap"><table class="report-table"><thead><tr><th>Data</th><th>Senha</th><th>Status</th><th>Barbeiro</th><th>Valor</th></tr></thead><tbody>';
        rows.slice(0,30).forEach(function(row){
          html += '<tr><td>'+safe(row.queue_date||"—")+'</td><td>#'+safe(queueTicketNumber(row))+(row.participant_name ? ' · '+safe(row.participant_name) : '')+'</td><td>'+safe(statusLabel(row.status))+'</td><td>'+safe(barberNames[row.barber_id]||"—")+'</td><td>'+money(Number(row.total_amount||0))+'</td></tr>';
        });
        html += '</tbody></table></div>';
        if(rows.length>30) html += '<p class="muted">Mostrando as 30 visitas mais recentes de '+rows.length+'.</p>';
      }
      html += '</div></details>';
    });
    if(!isCurrent()) return;
    target.innerHTML=html;
    target.querySelectorAll("[data-delete-customer]").forEach(button=>button.addEventListener("click",()=>openDeleteCustomerDialog(button.dataset.deleteCustomer,()=>renderAdminCustomers(embedded))));
    const search=target.querySelector("#customer-admin-search");
    if(search) search.addEventListener("input",function(){
      const term=search.value.trim().toLocaleLowerCase("pt-BR");
      target.querySelectorAll("[data-customer-card]").forEach(function(card){
        card.hidden=!card.dataset.search.includes(term);
      });
    });
    target.querySelectorAll("[data-customer-form]").forEach(function(form){
      form.addEventListener("submit",async function(event){
        event.preventDefault();
        const fd=new FormData(form);
        const phone=String(fd.get("phone")||"").replace(/\D/g,"");
        const status=form.querySelector("[data-customer-save-status]");
        const button=form.querySelector('button[type="submit"]');
        if(phone.length<10){status.textContent="Informe um telefone válido com DDD.";return;}
        button.disabled=true;
        status.textContent="Salvando cadastro...";
        const result=await db.from("customers").update({
          first_name:String(fd.get("first_name")||"").trim(),
          last_name:String(fd.get("last_name")||"").trim(),
          phone:phone,
          email:String(fd.get("email")||"").trim().toLowerCase()||null,
          birth_date:String(fd.get("birth_date")||"")||null,
          updated_at:new Date().toISOString()
        }).eq("id",form.dataset.customerForm);
        if(result.error){
          button.disabled=false;
          status.textContent="Não foi possível salvar: "+result.error.message;
          return;
        }
        status.textContent="Cadastro atualizado.";
        if(target.isConnected) renderAdminCustomers(embedded);
      });
    });
  } catch(error) {
    if(!isCurrent()) return;
    target.innerHTML='<section class="summary"><p class="muted">'+safe(error.message)+'</p></section>';
  }
}

async function renderAdminManagement(view=adminView, target){
  if(state.role !== "admin") return;
  const servicesOnly = view === "services";
  const selectedTab = target?.querySelector("[data-manage-tab].active")?.dataset.manageTab;
  const embedded = target;
  target = openAdminSection(target, view, servicesOnly ? "Serviços e preços" : "Gestão da barbearia",
    servicesOnly ? "Consulte o catálogo ativo e os valores praticados." : "Equipe e comissões da operação.",
    "Área exclusiva do administrador. As alterações são salvas diretamente no Supabase.");
  const isCurrent = showAdminLoading(target, "Carregando cadastros...");
  try {
    const results = await Promise.all([
      servicesOnly
        ? Promise.resolve({data:[],error:null})
        : db.from("barbers").select("id,name,first_name,last_name,age,email,active,commission_percent").order("name"),
      servicesOnly
        ? db.from("services").select("id,name,detail,price,active").order("name")
        : Promise.resolve({data:[],error:null})
    ]);
    if(results[0].error) throw new Error("Erro ao carregar barbeiros: " + results[0].error.message);
    if(results[1].error) throw new Error("Erro ao carregar serviços: " + results[1].error.message);
    const barberRows = results[0].data || [];
    const serviceRows = results[1].data || [];
    let html = "";
    const workspaceClass = servicesOnly ? "admin-workspace is-services" : "admin-workspace is-management";
    const workspaceTitle = servicesOnly ? "Catálogo de serviços" : "Gestão da barbearia";
    const workspaceDescription = servicesOnly
      ? "Serviços disponíveis e seus preços atuais."
      : "Acessos profissionais, equipe e comissões.";
    const tabsMarkup = servicesOnly
      ? '<button type="button" class="manage-tab active" role="tab" aria-selected="true" data-manage-tab="services">Catálogo</button>'
      : '<button type="button" class="manage-tab active" role="tab" aria-selected="true" data-manage-tab="barbers">Equipe</button>';
    html += '<div class="' + workspaceClass + '"><div class="admin-section-heading"><span class="eyebrow">CONFIGURAÇÕES</span><h2>' +
      workspaceTitle + '</h2><p class="muted">' + workspaceDescription +
      '</p></div><nav class="manage-tabs" role="tablist" aria-label="Configurações da barbearia">' +
      tabsMarkup + '</nav>';
    if(!servicesOnly){

      html += '<div class="manage-panel" role="tabpanel" data-manage-panel="barbers" class="manage-panel active"><section class="summary manage-overview-card"><div class="manage-panel-heading"><div><h3>EQUIPE E COMISSÕES</h3><p class="muted">Cadastre profissionais e ajuste comissão e situação.</p></div><span class="manage-count">' + barberRows.length + '</span></div><button type="button" class="btn btn-primary admin-reveal-button" data-reveal="new-barber-form">+ ADICIONAR BARBEIRO</button><div id="new-barber-form-wrap" class="admin-reveal-content" hidden><form id="new-barber-form" class="admin-form"><label>Nome</label><input name="first_name" required maxlength="80"><label>Sobrenome</label><input name="last_name" required maxlength="80"><label>Idade</label><input name="age" type="number" min="16" max="110" required><label>E-mail</label><input name="email" type="email" required><label>Comissão (%)</label><input name="commission" type="number" min="0" max="100" step="0.01" value="50" required><button class="btn btn-primary" type="submit">CADASTRAR BARBEIRO</button></form></div><button type="button" class="btn btn-secondary admin-list-toggle" data-list-toggle="barber-list">VER EQUIPE CADASTRADA</button><div id="barber-list" class="admin-reveal-content" hidden><div class="manage-overview-list">';
      barberRows.forEach(function(b){
        html += '<form class="admin-form" data-barber-form="' + safe(b.id) + '"><h4>' + safe(b.name) + '</h4><label>Nome</label><input name="first_name" required value="' + safe(b.first_name || b.name.split(" ")[0]) + '"><label>Sobrenome</label><input name="last_name" required value="' + safe(b.last_name || b.name.split(" ").slice(1).join(" ")) + '"><label>Idade</label><input name="age" type="number" min="16" max="110" required value="' + safe(b.age || "") + '"><label>E-mail</label><input type="email" readonly value="' + safe(b.email || "") + '"><label>Comissão (%)</label><input name="commission" type="number" min="0" max="100" step="0.01" value="' + Number(b.commission_percent || 0) + '" required><label class="admin-check"><input name="active" type="checkbox" ' + (b.active ? 'checked' : '') + '> Profissional ativo</label><button class="btn btn-secondary" type="submit">SALVAR ALTERAÇÕES</button><button class="btn btn-secondary" type="button" data-delete-barber="' + safe(b.id) + '">EXCLUIR BARBEIRO</button></form>';
      });
      if(!barberRows.length) html += '<p class="muted">Nenhum profissional cadastrado.</p>';
      html += '</div></div></section></div>';
    }
    html += '<div class="manage-panel ' + (servicesOnly ? "active" : "") + '" role="tabpanel" data-manage-panel="services"><section class="summary manage-overview-card"><div class="manage-panel-heading"><div><h3>SERVIÇOS E PREÇOS</h3><p class="muted">Catálogo disponível na LaCorte.</p></div><span class="manage-count">' + serviceRows.length + '</span></div><button type="button" class="btn btn-primary admin-reveal-button" data-reveal="new-service-form">+ ADICIONAR CORTE / SERVIÇO</button><div id="new-service-form-wrap" class="admin-reveal-content" hidden><form id="new-service-form" class="admin-form"><label>Nome do serviço</label><input name="name" required maxlength="80" placeholder="Ex.: Corte"><label>Descrição</label><input name="detail" maxlength="160" placeholder="Descrição curta"><label>Preço (R$)</label><input name="price" type="number" min="0" step="0.01" required placeholder="45,00"><button class="btn btn-primary" type="submit">CADASTRAR SERVIÇO</button></form></div><button type="button" class="btn btn-secondary admin-list-toggle" data-list-toggle="service-list">VER SERVIÇOS CADASTRADOS</button><div id="service-list" class="admin-reveal-content" hidden><div class="manage-overview-list">';
    serviceRows.forEach(function(s){
      html += '<form class="admin-form" data-service-form="' + safe(s.id) + '"><h4>' + safe(s.name) + '</h4><label>Nome</label><input name="name" required maxlength="80" value="' + safe(s.name) + '"><label>Descrição</label><input name="detail" maxlength="160" value="' + safe(s.detail || '') + '"><label>Preço (R$)</label><input name="price" type="number" min="0" step="0.01" value="' + Number(s.price || 0) + '" required><label class="admin-check"><input name="active" type="checkbox" ' + (s.active ? 'checked' : '') + '> Serviço ativo</label><button class="btn btn-secondary" type="submit">SALVAR ALTERAÇÕES</button></form>';
    });
    if(!serviceRows.length) html += '<p class="muted">Nenhum serviço cadastrado.</p>';
    html += '</div></div></section></div></div>';
    if(!isCurrent()) return;
    target.innerHTML = html;
    target.querySelectorAll('[data-reveal]').forEach(function(button){
      button.addEventListener('click',function(){
        const wrap = target.querySelector('#'+button.dataset.reveal+'-wrap');
        if(!wrap) return;
        const opening = wrap.hidden;
        wrap.hidden = !opening;
        button.textContent = opening ? 'FECHAR CADASTRO' : (button.dataset.reveal === 'new-service-form' ? '+ ADICIONAR CORTE / SERVIÇO' : '+ ADICIONAR BARBEIRO');
        if(opening) wrap.querySelector('input')?.focus();
      });
    });
    target.querySelectorAll('[data-list-toggle]').forEach(function(button){
      button.addEventListener('click',function(){
        const list = target.querySelector('#'+button.dataset.listToggle);
        if(!list) return;
        list.hidden = !list.hidden;
        button.textContent = list.hidden ? (button.dataset.listToggle === 'service-list' ? 'VER SERVIÇOS CADASTRADOS' : 'VER EQUIPE CADASTRADA') : 'OCULTAR LISTA';
      });
    });
    target.querySelectorAll("[data-manage-tab]").forEach(function(tab){
      tab.addEventListener("click", function(){
        const selected = tab.dataset.manageTab;
        target.querySelectorAll("[data-manage-tab]").forEach(function(item){
          const active = item === tab;
          item.classList.toggle("active",active);
          item.setAttribute("aria-selected",active ? "true" : "false");
        });
        target.querySelectorAll("[data-manage-panel]").forEach(function(panel){
          panel.classList.toggle("active",panel.dataset.managePanel === selected);
        });
      });
    });

    if(selectedTab){
      target.querySelector('[data-manage-tab="'+selectedTab+'"]')?.click();
    }

    target.querySelectorAll("[data-delete-barber]").forEach(button=>{
      button.addEventListener("click",async()=>{
        const id=button.dataset.deleteBarber;
        if(!confirm("Excluir definitivamente este barbeiro? Profissionais com histórico ou conta vinculada não podem ser excluídos."))return;
        button.disabled=true;
        const result=await db.functions.invoke("lacorte-admin-team",{body:{action:"delete",id}});
        if(result.error||result.data?.error){alert(result.data?.error||result.error?.message||"Não foi possível excluir.");button.disabled=false;return;}
        alert(result.data?.message||"Barbeiro excluído.");
        if(target.isConnected)renderAdminManagement(view,embedded);
      });
    });
    const newBarber = target.querySelector("#new-barber-form");
    if(newBarber) newBarber.addEventListener("submit", async function(e){
      e.preventDefault();
      const fd = new FormData(newBarber);
      const result=await db.functions.invoke("lacorte-admin-team",{body:{action:"create",first_name:String(fd.get("first_name")||"").trim(),last_name:String(fd.get("last_name")||"").trim(),age:Number(fd.get("age")),email:String(fd.get("email")||"").trim(),commission:Number(fd.get("commission"))}});
      if(result.error||result.data?.error)return alert(result.data?.error||result.error?.message);
      alert(result.data?.message||"Convite enviado.");
      if(target.isConnected)renderAdminManagement(view,embedded);
    });

    target.querySelectorAll("[data-barber-form]").forEach(function(form){
      form.addEventListener("submit", async function(e){
        e.preventDefault();
        const fd = new FormData(form);
        const result=await db.functions.invoke("lacorte-admin-team",{body:{action:"update",id:form.dataset.barberForm,first_name:String(fd.get("first_name")||"").trim(),last_name:String(fd.get("last_name")||"").trim(),age:Number(fd.get("age")),commission:Number(fd.get("commission")),active:fd.get("active")==="on"}});
        if(result.error||result.data?.error)return alert(result.data?.error||result.error?.message);
        alert(result.data?.message||"Atualizado.");
        if(target.isConnected)renderAdminManagement(view,embedded);
      });
    });

    const newService = target.querySelector("#new-service-form");
    if(newService) newService.addEventListener("submit", async function(e){
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
      if(target.isConnected) renderAdminManagement(view, embedded);
    });

    target.querySelectorAll("[data-service-form]").forEach(function(form){
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
        if(target.isConnected) renderAdminManagement(view, embedded);
      });
    });
  } catch(error) {
    if(!isCurrent()) return;
    target.innerHTML = '<p class="muted">' + safe(error.message) + '</p>';
  }
}

async function renderAdminPlans(target){
  if(state.role !== "admin") return;
  const embedded = target;
  target = openAdminSection(target, "plans", "Planos e assinaturas",
    "Cadastre planos e controle as assinaturas dos clientes.",
    "Ativação manual após confirmar o pagamento fora do site. Nenhuma cobrança é feita aqui.");
  const isCurrent = showAdminLoading(target, "Carregando planos e assinaturas...");
  try {
    const results = await Promise.all([
      db.from("lacorte_plans").select("id,name,description,monthly_price,benefits,active").order("created_at", {ascending:false}),
      db.from("customers").select("id,first_name,last_name,phone,email,deleted_at").order("first_name"),
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
    if(!isCurrent()) return;
    for(const expiredSub of expiredSubscriptions){
      const expiryUpdate = await db.from("lacorte_customer_plans")
        .update({status:"expired",updated_at:new Date().toISOString()})
        .eq("id",expiredSub.id).eq("status","active");
      if(expiryUpdate.error) console.warn("Não foi possível atualizar assinatura vencida:",expiryUpdate.error.message);
      else expiredSub.status = "expired";
    }
    const customerById = {};
    customers.forEach(function(c){ customerById[c.id] = c; });
    let html = "";
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
        customers.filter(c=>!c.deleted_at).map(function(c){return '<option value="'+safe(c.id)+'">'+safe(c.first_name+' '+c.last_name)+' • '+safe(c.phone || c.email || '')+'</option>';}).join('') +
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
      '<button class="btn btn-primary" type="submit">CADASTRAR PLANO</button></form></div><button type="button" class="btn btn-secondary" data-list-toggle="plan-list-items">VER PLANOS CADASTRADOS</button>';
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
    html += '</div></section>';
    if(!isCurrent()) return;
    target.innerHTML = html;
    target.querySelectorAll('[data-reveal],[data-list-toggle]').forEach(function(button){
      button.addEventListener('click',function(){
        const id=button.dataset.reveal ? button.dataset.reveal+'-wrap' : button.dataset.listToggle;
        const section=target.querySelector('#'+id);
        if(!section) return;
        section.hidden=!section.hidden;
        const open=!section.hidden;
        if(button.dataset.reveal) button.textContent=open?'FECHAR':'+'+(button.dataset.reveal==='new-plan-form'?' ADICIONAR PLANO':' ATIVAR ASSINATURA');
        else button.textContent=open?'OCULTAR':'VER '+(id==='plan-list-items'?'PLANOS CADASTRADOS':'HISTÓRICO');
      });
    });
    const activationForm = target.querySelector("#activate-customer-plan");
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
      if(target.isConnected) renderAdminPlans(embedded);
    });
    target.querySelectorAll("[data-suspend-plan]").forEach(function(button){
      button.addEventListener("click", async function(){
        if(!confirm("Deseja suspender esta assinatura?")) return;
        const updated = await db.from("lacorte_customer_plans").update({status:"suspended",updated_at:new Date().toISOString()}).eq("id",button.dataset.suspendPlan);
        if(updated.error) return alert("Erro ao suspender: "+updated.error.message);
        if(target.isConnected) renderAdminPlans(embedded);
      });
    });
    target.querySelectorAll("[data-reactivate-plan]").forEach(function(button){
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
        if(target.isConnected) renderAdminPlans(embedded);
      });
    });
    target.querySelector("#new-plan-form").addEventListener("submit", async function(e){
      e.preventDefault();
      const form = e.currentTarget, fd = new FormData(form), name = String(fd.get("name") || "").trim(), price = Number(fd.get("monthly_price"));
      if(!name || !Number.isFinite(price) || price < 0) return alert("Confira o nome e o valor mensal.");
      const benefits = String(fd.get("benefits") || "").split("\n").map(x=>x.trim()).filter(Boolean);
      const saved = await db.from("lacorte_plans").insert({name,description:String(fd.get("description") || "").trim(),monthly_price:price,benefits,active:true});
      if(saved.error) return alert("Erro ao cadastrar: " + saved.error.message);
      alert("Plano cadastrado."); if(target.isConnected) renderAdminPlans(embedded);
    });
    target.querySelectorAll("[data-plan-form]").forEach(function(form){
      form.addEventListener("submit", async function(e){
        e.preventDefault();
        const fd = new FormData(form), name = String(fd.get("name") || "").trim(), price = Number(fd.get("monthly_price"));
        if(!name || !Number.isFinite(price) || price < 0) return alert("Confira o nome e o valor mensal.");
        const benefits = String(fd.get("benefits") || "").split("\n").map(x=>x.trim()).filter(Boolean);
        const saved = await db.from("lacorte_plans").update({name,description:String(fd.get("description") || "").trim(),monthly_price:price,benefits,active:fd.get("active") === "on",updated_at:new Date().toISOString()}).eq("id",form.dataset.planForm);
        if(saved.error) return alert("Erro ao salvar plano: " + saved.error.message);
        alert("Plano atualizado."); if(target.isConnected) renderAdminPlans(embedded);
      });
    });
  } catch(error) {
    if(!isCurrent()) return;
    target.innerHTML = '<p class="muted">Erro ao carregar planos e assinaturas: ' + safe(error.message) + '</p>';
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


function lcAdminIcon(name){
  const paths={
    overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    management:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a8 8 0 0 0 0-6l1.4-1.1-1.4-2.4-1.7.6a8 8 0 0 0-5.7-1.5L11.7 3H9l-.3 1.8a8 8 0 0 0-1.7 1l-1.7-.6-1.4 2.4L5.3 9a8 8 0 0 0 0 6l-1.4 1.1 1.4 2.4 1.7-.6a8 8 0 0 0 5.7 1.5l.3 1.8h2.7l.3-1.8a8 8 0 0 0 1.7-1l1.7.6 1.4-2.4z"/>',
    clients:'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>',
    services:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m20 4-12 12m0-8 12 12"/>',
    reports:'<path d="M3 3v18h18"/><path d="m7 14 4-4 4 3 6-7"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    support:'<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a8 8 0 0 0 0-6l1.4-1.1-1.4-2.4-1.7.6a8 8 0 0 0-5.7-1.5L11.7 3H9l-.3 1.8a8 8 0 0 0-1.7 1l-1.7-.6-1.4 2.4L5.3 9a8 8 0 0 0 0 6l-1.4 1.1 1.4 2.4 1.7-.6a8 8 0 0 0 5.7 1.5l.3 1.8h2.7l.3-1.8a8 8 0 0 0 1.7-1l1.7.6 1.4-2.4z"/>'
  };
  return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.overview)+'</svg>';
}









function adminDisplayKey(){
  return "lacorte-admin-display:"+(state.user?.id || state.barberId);
}

function loadAdminDisplaySettings(){
  try{
    return JSON.parse(localStorage.getItem(adminDisplayKey())) || {};
  }catch(_){
    return {};
  }
}

function renderAdminDisplaySettings(){
  if(state.role !== "admin") return;
  const settings = loadAdminDisplaySettings();
  const workspace = openAdminSection(null, "settings", "Configurações",
    "Altere as preferências e os dados da barbearia em um só lugar.",
    "As preferências da tela são salvas neste navegador.");
  const sections = {
    "Preferências da tela": null,
    "Dados da barbearia": renderAdminShopSettings,
    "Equipe e acessos": target => renderAdminManagement("manage", target),
    "Serviços": target => renderAdminManagement("services", target),
    "Clientes": renderAdminCustomers,
    "Planos e assinaturas": renderAdminPlans,
    "Visual do totem": renderAdminTotemVisual,
    "Fila": renderAdminQueue,
    "Histórico": target => renderAdminReports("history", target),
    "Relatórios": target => renderAdminReports("reports", target)
  };
  workspace.innerHTML = `<nav class="manage-tabs lc-settings-nav" aria-label="Seções de configurações">
    ${Object.keys(sections).map((label, index) => `<button type="button" class="manage-tab${index === 0 ? " active" : ""}" aria-pressed="${index === 0}">${label}</button>`).join("")}
  </nav><div data-settings-section></div>
  <div data-display-preferences><form class="summary lc-admin-display-settings" id="lc-admin-display-settings">
    <h3>Preferências da tela</h3><p class="muted">As preferências são salvas neste navegador.</p>
    <p class="muted">Toque na foto para ajustar o zoom e a posição.</p>
    <button type="button" class="lc-avatar-edit" data-avatar-preview aria-expanded="false" aria-controls="lc-avatar-crop" aria-label="Ajustar enquadramento da foto"></button>
    <fieldset id="lc-avatar-crop" data-avatar-crop hidden>
      <legend>Enquadramento da foto</legend>
      <label>Zoom<input name="zoom" type="range" min="1" max="3" step=".05" value="1"></label>
      <label>Posição horizontal<input name="cropX" type="range" min="0" max="100" value="50"></label>
      <label>Posição vertical<input name="cropY" type="range" min="0" max="100" value="50"></label>
      <button class="btn btn-secondary" type="button" data-reset-crop>Centralizar foto</button>
    </fieldset>
    <label>Foto do perfil<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>
    <button class="btn btn-secondary" data-remove-avatar type="button">Usar avatar B1</button>
    <label>Nome de exibição<input name="displayName" maxlength="80" autocomplete="name"></label>
    <label>Período inicial do gráfico<select name="period"><option value="today">Dia</option><option value="week">Semana</option><option value="fortnight">Quinzena</option><option value="month">Mês</option></select></label>
    <label>Espaçamento do painel<select name="density"><option value="standard">Padrão</option><option value="compact">Compacto</option></select></label>
    <button class="btn btn-primary" type="submit">Salvar configurações</button>
    <p class="muted" role="status"></p>
  </form></div>`;
  const preferences = workspace.querySelector("[data-display-preferences]");
  const form = preferences.querySelector("#lc-admin-display-settings");
  const section = workspace.querySelector("[data-settings-section]");
  const buttons = workspace.querySelectorAll(".lc-settings-nav button");
  buttons.forEach(button => button.addEventListener("click", function(){
    if(button.classList.contains("active")) return;
    buttons.forEach(item => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
    const render = sections[button.textContent];
    preferences.hidden = Boolean(render);
    section.replaceChildren();
    if(render){
      const target = document.createElement("div");
      target.className = "lc-admin-module";
      section.append(target);
      render(target);
    }
  }));
  const {period,density} = form.elements;
  const status = form.querySelector("[role=status]");
  const photoEditor = bindProfilePhotoEditor(form,settings);
  form.elements.displayName.value = adminOwnerName();
  period.value = settings.period || "month";
  density.value = settings.density || "standard";
  form.addEventListener("submit",function(event){
    event.preventDefault();
    if(photoEditor.busy) return;
    try{
      localStorage.setItem(adminDisplayKey(),JSON.stringify({displayName:form.elements.displayName.value.trim(),photo:photoEditor.photo,crop:photoEditor.crop,period:period.value,density:density.value}));
      adminOverviewPeriod = period.value;
      document.body.classList.toggle("admin-display-compact",density.value === "compact");
      const avatar = content.querySelector(".lc-admin-user .lc-admin-avatar");
      if(avatar) avatar.outerHTML = profileAvatar(photoEditor.photo,photoEditor.crop);
      const ownerLabel=content.querySelector(".lc-admin-user strong");if(ownerLabel)ownerLabel.textContent=adminOwnerName();
      const mobileAvatar=content.querySelector(".lc-admin-mobile-profile .lc-admin-avatar");if(mobileAvatar) mobileAvatar.outerHTML=profileAvatar(photoEditor.photo,photoEditor.crop);
      status.textContent = "Configurações salvas.";
    }catch(_){
      status.textContent = "Não foi possível salvar neste navegador.";
    }
  });
}



let adminOverviewPeriod;
let adminOverviewBarber = "all";





function openAdminQueueResolutionDialog(queueId, eligibleBarbers, target, refresh){
  const options=(eligibleBarbers||[]).filter(barber=>barber&&barber.id&&barber.name);
  if(!options.length) return;
  const overlay=document.createElement("div");
  overlay.className="payment-dialog-backdrop";
  overlay.innerHTML='<section class="payment-dialog" role="dialog" aria-modal="true" aria-labelledby="queue-resolution-title">'+
    '<h3 id="queue-resolution-title">REVISAR PREFERÊNCIA DO CLIENTE</h3>'+
    '<p>Todos os profissionais ativos já pularam esta senha. Só reabra a preferência para um deles se o cliente confirmar pessoalmente que aceita o atendimento.</p>'+
    '<label for="queue-resolution-barber">Profissional escolhido</label>'+
    '<select id="queue-resolution-barber">'+options.map(barber=>'<option value="'+safe(barber.id)+'">'+safe(barber.name)+'</option>').join("")+'</select>'+
    '<label class="queue-resolution-confirm"><input id="queue-resolution-customer-confirmed" type="checkbox"> O cliente confirmou que aceita ser atendido por este profissional.</label>'+
    '<div class="actions"><button type="button" class="btn btn-secondary" data-close>VOLTAR</button><button type="button" class="btn btn-primary" data-confirm disabled>REGISTRAR CONFIRMAÇÃO</button></div>'+
    '<p class="muted" id="queue-resolution-error" role="alert"></p></section>';
  target.append(overlay);
  const select=overlay.querySelector("#queue-resolution-barber");
  const checkbox=overlay.querySelector("#queue-resolution-customer-confirmed");
  const confirmButton=overlay.querySelector("[data-confirm]");
  const closeButton=overlay.querySelector("[data-close]");
  const error=overlay.querySelector("#queue-resolution-error");
  checkbox.addEventListener("change",()=>{confirmButton.disabled=!checkbox.checked;});
  closeButton.addEventListener("click",()=>overlay.remove());
  overlay.addEventListener("click",event=>{if(event.target===overlay) overlay.remove();});
  confirmButton.addEventListener("click",async function(){
    if(!checkbox.checked||!select.value) return;
    this.disabled=true;
    closeButton.disabled=true;
    select.disabled=true;
    checkbox.disabled=true;
    error.textContent="Registrando confirmação...";
    let result;
    try{
      result=await db.rpc("lacorte_admin_resolve_queue_decline",{
        p_queue_id:queueId,
        p_barber_id:select.value,
        p_customer_confirmed:true
      });
    }catch(requestError){
      result={error:requestError};
    }
    if(result.error){
      this.disabled=!checkbox.checked;
      closeButton.disabled=false;
      select.disabled=false;
      checkbox.disabled=false;
      error.textContent="Não foi possível registrar a confirmação: "+result.error.message;
      return;
    }
    overlay.remove();
    refresh();
  });
}


async function renderAdminQueue(target){
  if(state.role !== "admin") return;
  const embedded = Boolean(target);
  target = openAdminSection(target, "fila", "Fila", "Fila compartilhada da barbearia.",
    "Acompanhe e gerencie os atendimentos em andamento.");
  target.dataset.adminQueue = "";
  const isCurrent = showAdminLoading(target, "Carregando fila...");
  const refresh = () => { if(target.isConnected) renderAdminQueue(embedded ? target : undefined); };
  try{
    const queueRows = await loadQueueRows();
    if(!isCurrent()) return;
    const activeBarbers = Array.isArray(barbers) ? barbers.filter(barber=>barber&&barber.id&&barber.name) : [];
    const visible = queueRows.filter(row => ["waiting","in_progress"].includes(row.status));
    const queueHtml=visible.length?visible.map(function(row){
      const customer=row.customer||{};
      const name=((customer.first_name||"")+" "+(customer.last_name||"")).trim()||"Cliente";
      const service=(row.items||[]).map(i=>safe(i.service_name)).join(", ")||"Serviço não informado";
      const declinedIds=row.declinedBarberIds||[];
      const activeDeclinedBarbers=activeBarbers.filter(barber=>declinedIds.includes(String(barber.id)));
      const allActiveBarbersDeclined=activeBarbers.length>0&&activeDeclinedBarbers.length===activeBarbers.length;
      const needsAdminResolution=row.status==="waiting"&&!row.barber_id&&allActiveBarbersDeclined;
      const declinedBy=activeDeclinedBarbers.length
        ? '<small class="muted lc-queue-declines">Já pulada por '+activeDeclinedBarbers.length+' profissional(is): '+safe(activeDeclinedBarbers.map(barber=>barber.name).join(", "))+'</small>'
        : '';
      const resolutionNotice=needsAdminResolution
        ? '<small class="lc-queue-resolution-alert">Todos os profissionais ativos já pularam esta senha. Confirme a preferência com o cliente.</small>'
        : '';
      const resolvedNames=row.resolvedBarberNames||[];
      const resolvedBy=resolvedNames.length
        ? '<small class="muted lc-queue-resolved">Preferência reaberta após confirmação: '+safe(resolvedNames.join(", "))+'</small>'
        : '';
      const resolutionAction=needsAdminResolution
        ? '<button type="button" class="is-secondary" data-resolve-declines="'+safe(row.id)+'">Revisar preferência</button>'
        : '';
      const isProgress=row.status==="in_progress";
      const canStart=row.status==="waiting"&&!row.barber_id&&!needsAdminResolution;
      const canFinish=isProgress&&row.barber_id===state.barberId;
      const action=canStart
        ? '<button type="button" class="is-primary" data-start="'+safe(row.id)+'">Iniciar</button>'
        : canFinish
          ? '<button type="button" class="is-primary" data-finish="'+safe(row.id)+'">Finalizar</button>'
          : isProgress ? '<span class="lc-queue-assigned">Em atendimento</span>' : '';
      return '<article class="lc-queue-row"><div class="lc-queue-ticket">#'+safe(queueTicketNumber(row))+'</div>'+
        '<div class="lc-queue-details"><strong>'+safe(queuePersonLabel(row,name))+'</strong><span>'+service+'</span>'+declinedBy+resolutionNotice+resolvedBy+'</div>'+
        '<div class="lc-queue-actions"><strong class="lc-queue-value">'+money(Number(row.total_amount||0))+'</strong>'+action+resolutionAction+
        '<button type="button" class="is-secondary" data-cancel="'+safe(row.id)+'">'+(row.status==="waiting"?'Excluir da fila':'Cancelar atendimento')+'</button>'+
        '</div></article>';
    }).join(""):'<div class="lc-empty-queue">Nenhum cliente aguardando ou em atendimento agora.</div>';
    const historyLink = embedded ? "" :
      '<button type="button" class="lc-view-all" data-admin-view="history">Abrir histórico completo <span>→</span></button>';
    target.innerHTML = '<section class="lc-admin-middle lc-admin-queue-only"><article class="lc-admin-card lc-queue-card"><div class="lc-card-heading"><div><h3>Aguardando e em atendimento</h3><p>Senha, nome, serviços e valor.</p></div><button type="button" class="lc-text-action" data-refresh-admin>Atualizar fila</button></div><div class="lc-queue-list">'+queueHtml+'</div>' + historyLink + '</article></section>';
    if(!embedded) bindAdminNavigation();
    target.querySelector("[data-refresh-admin]").addEventListener("click",refresh);
    target.querySelectorAll("[data-start]").forEach(button => {
      button.addEventListener("click",()=>openQueueCallDialog(button.dataset.start, target, refresh));
    });
    target.querySelectorAll("[data-resolve-declines]").forEach(button=>{
      const row=visible.find(item=>String(item.id)===button.dataset.resolveDeclines);
      const eligible=activeBarbers.filter(barber=>(row?.declinedBarberIds||[]).includes(String(barber.id)));
      button.addEventListener("click",()=>openAdminQueueResolutionDialog(button.dataset.resolveDeclines,eligible,target,refresh));
    });
    target.querySelectorAll("[data-finish]").forEach(button => {
      button.addEventListener("click",()=>openPaymentMethodDialog(button.dataset.finish, target, refresh));
    });
    target.querySelectorAll("[data-cancel]").forEach(button=>button.addEventListener("click",()=>openCancelAppointmentDialog(button.dataset.cancel,refresh)));
  }catch(error){
    if(!isCurrent()) return;
    target.innerHTML = '<section class="summary"><p class="muted">'+safe(error.message)+
      '</p><button type="button" class="btn btn-secondary">Tentar novamente</button></section>';
    target.querySelector("button").addEventListener("click",refresh);
  }
}











async function renderAdminTotemVisual(target){
  if(state.role !== "admin") return;
  target = openAdminSection(target, "visual", "Visual do totem",
    "Troque a imagem de fundo e confira a prévia antes de salvar.",
    "As alterações ficam disponíveis para o totem após recarregar a página.");
  target.innerHTML = `<form class="summary" id="totem-visual-form">
    <label for="totem-background-file">Imagem de fundo (JPG, PNG ou WebP)</label>
    <input id="totem-background-file" type="file" accept="image/jpeg,image/png,image/webp" required>
    <img id="totem-background-preview" alt="Prévia da imagem de fundo" style="display:block;width:min(100%,720px);aspect-ratio:16/9;object-fit:cover" src="assets/totem-cena.svg">
    <p id="totem-visual-status" role="status" class="muted"></p>
    <button class="btn btn-primary" type="submit" disabled>Salvar fundo</button>
  </form>`;
  target.append(makeAdminPromotionsEditor());
  const form = target.querySelector("#totem-visual-form");
  const input = form.querySelector("input");
  const preview = form.querySelector("img");
  const status = form.querySelector("[role=status]");
  const save = form.querySelector("button");
  let pending = "";
  let saved = "assets/totem-cena.svg";

  void loadTotemBackground().then(function(image){
    if(image) saved = image;
    if(!input.files.length) preview.src = saved;
  }).catch(function(){
    if(!input.files.length) status.textContent = "Não foi possível carregar o fundo salvo.";
  });

  input.addEventListener("change", async function(){
    const file = input.files[0];
    pending = "";
    save.disabled = true;
    preview.src = saved;
    status.textContent = "";
    if(!file) return;
    try{
      const image = await prepareTotemImage(file);
      if(input.files[0] !== file) return;
      pending = image;
      preview.src = image;
      save.disabled = false;
    }catch(error){
      if(input.files[0] === file) status.textContent = error.message || "Não foi possível abrir essa imagem.";
    }
  });

  form.addEventListener("submit", async function(event){
    event.preventDefault();
    if(!pending || save.disabled) return;
    save.disabled = true;
    input.disabled = true;
    status.textContent = "Salvando...";
    try{
      const { error } = await db.from("lacorte_totem_visual")
        .upsert({ id: 1, background_image: pending });
      if(error) throw error;
      saved = pending;
      pending = "";
      input.value = "";
      status.textContent = "Fundo salvo. Recarregue a tela do totem para ver a mudança.";
    }catch(error){
      status.textContent = "Não foi possível salvar o fundo. Confira a sessão e tente novamente.";
    }finally{
      input.disabled = false;
      save.disabled = !pending;
    }
  });
}

function makeAdminPromotionsEditor(){
  const form = document.createElement("form");
  form.className = "summary";
  form.innerHTML = `<h3>Promoções na tela de serviços</h3>
    <label>Escolher anúncio <select name="promotion"><option value="">Novo anúncio</option></select></label>
    <label>Texto curto <input name="message" maxlength="140"></label>
    <label>Imagem <input name="image" type="file" accept="image/jpeg,image/png,image/webp"></label>
    <img alt="Prévia do anúncio" hidden style="max-width:100%;max-height:140px;object-fit:contain">
    <label class="admin-check totem-promotion-check"><input name="active" type="checkbox"> Mostrar no totem</label>
    <p role="status" class="muted"></p>
    <button class="btn btn-primary" type="submit">Salvar anúncio</button>
    <button class="btn btn-secondary" type="button" data-clear-image hidden>Remover imagem</button>
    <button class="btn btn-secondary" type="button" data-delete-promotion hidden>Excluir anúncio</button>`;
  const { promotion, message, image, active } = form.elements;
  const preview = form.querySelector("img");
  const status = form.querySelector("[role=status]");
  const clearImage = form.querySelector("[data-clear-image]");
  const remove = form.querySelector("[data-delete-promotion]");
  let rows = [];
  let pendingImage = null;
  let loadVersion = 0;

  function showImage(value){
    pendingImage = value;
    preview.hidden = clearImage.hidden = !value;
    if(value) preview.src = value;
    else preview.removeAttribute("src");
  }

  function selectRow(){
    loadVersion++;
    const row = rows.find(item => String(item.id) === promotion.value);
    message.value = row?.message || "";
    active.checked = row?.active || false;
    image.value = "";
    remove.hidden = !row;
    showImage(row?.image || null);
  }

  async function refreshRows(id){
    rows = await loadTotemPromotions();
    promotion.replaceChildren(new Option("Novo anúncio", ""));
    for(const row of rows){
      promotion.add(new Option(row.message || "Anúncio com imagem", row.id));
    }
    promotion.value = id == null ? "" : String(id);
    selectRow();
  }

  void refreshRows().catch(function(){ status.textContent = "Não foi possível carregar os anúncios."; });
  promotion.addEventListener("change", selectRow);
  clearImage.addEventListener("click", function(){
    loadVersion++;
    image.value = "";
    showImage(null);
  });
  image.addEventListener("change", async function(){
    const version = ++loadVersion;
    const file = image.files[0];
    if(!file) return;
    try{
      const value = await prepareTotemImage(file);
      if(version === loadVersion){ showImage(value); status.textContent = ""; }
    }catch(error){
      if(version === loadVersion){ image.value = ""; status.textContent = error.message; }
    }
  });

  async function savePromotion(deleting){
    const id = Number(promotion.value);
    const values = { message: message.value.trim(), image: pendingImage, active: active.checked };
    if(!deleting && !values.message && !values.image){
      status.textContent = "Adicione um texto ou uma imagem.";
      return;
    }
    const buttons = Array.from(form.querySelectorAll("button"));
    const fields = [promotion, message, image, active, ...buttons];
    fields.forEach(field => field.disabled = true);
    status.textContent = "Salvando...";
    try{
      const table = db.from("lacorte_totem_promotions");
      const result = deleting ? await table.delete().eq("id", id).select("id").single() :
        await (id ? table.update(values).eq("id", id) : table.insert(values)).select("id").single();
      if(result.error) throw result.error;
      await refreshRows(deleting ? null : result.data.id);
      status.textContent = deleting ? "Anúncio excluído." : "Anúncio salvo. Recarregue o totem para ver a mudança.";
    }catch(error){
      status.textContent = "Não foi possível salvar a alteração. Tente novamente.";
    }finally{
      fields.forEach(field => field.disabled = false);
    }
  }

  form.addEventListener("submit", function(event){
    event.preventDefault();
    void savePromotion(false);
  });
  remove.addEventListener("click", function(){
    if(confirm("Excluir este anúncio?")) void savePromotion(true);
  });
  return form;
}


/* Estrutura única do painel administrativo aprovado. */
function adminNavigation(){return '';}
function adminOwnerName(){return loadAdminDisplaySettings().displayName || state.user?.user_metadata?.full_name || 'Carlos Sousa';}
function lcAdminDateLabel(){return new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Sao_Paulo'}).format(new Date());}
function lcAdminSidebar(){
 const item=(key,label,icon)=>'<button type="button" class="lc-admin-nav-item'+(adminView===key?' active':'')+'" data-admin-view="'+key+'"'+(adminView===key?' aria-current="page"':'')+'>'+lcAdminIcon(icon)+'<span>'+label+'</span></button>';
 const settings=loadAdminDisplaySettings();
 return '<aside class="lc-admin-sidebar" id="admin-sidebar"><div class="lc-admin-brand"><img src="assets/lacorte-logo.svg?v=barbearia-1" alt="La Corte Barbearia"><span>ADMINISTRAÇÃO</span></div><nav class="lc-admin-nav" aria-label="Menu administrativo">'+
 item('queue','Painel geral','overview')+item('fila','Fila','clients')+item('history','Histórico','history')+item('customers','Clientes','clients')+item('services','Serviços','services')+item('manage','Equipe','management')+item('plans','Planos','overview')+item('reports','Relatórios','reports')+item('settings','Configurações','settings')+
 '</nav><div class="lc-admin-sidebar-bottom"><button class="lc-admin-user" type="button" data-admin-view="settings" aria-label="Abrir meu perfil">'+profileAvatar(settings.photo,settings.crop)+'<span><strong>'+safe(adminOwnerName())+'</strong><small>Administrador • Barbeiro 1</small></span></button><button class="lc-admin-logout" type="button" data-admin-logout aria-label="Sair da conta">'+lcAdminIcon('logout')+'</button></div></aside>';
}
function mountAdminPage(title,description=''){
 setAppMode(true);setHeader('ADMINISTRAÇÃO LACORTE',title,description);actions.replaceChildren();notice.textContent='';
 const settings=loadAdminDisplaySettings();
 content.innerHTML='<div class="lc-admin-app">'+lcAdminSidebar()+'<main class="lc-admin-main"><div class="lc-admin-mobile-header"><button type="button" class="lc-admin-icon-btn" data-admin-menu aria-controls="admin-sidebar" aria-expanded="false" aria-label="Abrir menu administrativo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button><img src="assets/lacorte-logo.svg?v=barbearia-1" alt="La Corte Barbearia"><button type="button" class="lc-admin-mobile-profile" data-admin-view="settings" aria-label="Abrir meu perfil">'+profileAvatar(settings.photo,settings.crop)+'</button></div><header class="lc-admin-header"><div><h1>'+safe(title)+'</h1><p>'+safe(description)+'</p></div><div class="lc-admin-header-tools"><button class="lc-admin-icon-btn" type="button" data-admin-view="settings" aria-label="Configurações">'+lcAdminIcon('settings')+'</button><span class="lc-admin-date">'+lcAdminDateLabel()+'</span></div></header><div class="lc-admin-module" data-admin-content></div><footer class="lc-admin-footer">Fila presencial • Sem pagamento online</footer></main></div>';
 document.body.classList.toggle('admin-display-compact',settings.density==='compact');
 bindAdminNavigation();lcBindAdminSidebarActions();return content.querySelector('[data-admin-content]');
}
function bindAdminNavigation(){
 content.querySelectorAll('[data-admin-view]').forEach(button=>{
  if(button.dataset.navBound) return;button.dataset.navBound='1';
  button.addEventListener('click',()=>{
   document.body.classList.remove('admin-menu-open');
   adminView=button.dataset.adminView;
   if(adminView==='manage') renderAdminManagement('manage');
   else if(adminView==='services') renderAdminManagement('services');
   else if(adminView==='history') renderAdminReports('history');
   else if(adminView==='reports') renderAdminReports();
   else if(adminView==='customers') renderAdminCustomers();
   else if(adminView==='plans') renderAdminPlans();
   else if(adminView==='visual') renderAdminTotemVisual();
   else if(adminView==='settings') renderAdminDisplaySettings();
   else if(adminView==='fila') renderAdminQueue();
   else renderAdminOverview();
  });
 });
}
function lcBindAdminSidebarActions(){
 content.querySelectorAll('[data-admin-logout]').forEach(button=>button.onclick=async()=>{
  button.disabled=true;const result=await db.auth.signOut();if(result.error){button.disabled=false;alert('Não foi possível sair. Tente novamente.');}
 });
 content.querySelectorAll('[data-admin-menu]').forEach(button=>button.onclick=()=>{
  const open=document.body.classList.toggle('admin-menu-open');button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Fechar menu administrativo':'Abrir menu administrativo');
 });
}
function openAdminSection(target,view,title,description,message){
 if(target) return target;
 adminView=view;return mountAdminPage(title,description);
}
function showAdminLoading(target,message){target.innerHTML='<p class="muted" role="status">'+safe(message)+'</p>';return ()=>state.role==='admin'&&target.isConnected;}
function adminError(target,error,retry){
 if(!target.isConnected)return;
 target.innerHTML='<section class="summary admin-error"><h3>Não foi possível carregar</h3><p role="alert">'+safe(error.message||error)+'</p><button class="btn btn-primary" data-retry>Tentar novamente</button></section>';
 target.querySelector('[data-retry]').onclick=retry;
}
async function loadOverviewRows(start,end){
 const rows=[];
 for(let offset=0;;offset+=500){
  const result=await db.from('lacorte_queue').select('id,queue_date,status,total_amount,commission_amount,commission_percent,barber_id,payment_method').gte('queue_date',start).lte('queue_date',end).order('id').range(offset,offset+499);
  if(result.error)throw result.error;rows.push(...(result.data||[]));if((result.data||[]).length<500)return rows;
 }
}
function adminOverviewTotals(rows){
 const done=rows.filter(row=>row.status==='completed');
 const revenue=done.reduce((n,row)=>n+Number(row.total_amount||0),0);
 const commission=done.filter(row=>row.barber_id!=='barbeiro-1').reduce((n,row)=>n+Number(row.commission_amount||0),0);
 return {done,revenue,commission,afterCommission:Math.round((revenue-commission)*100)/100};
}
function lcAdminRevenueChart(values,end,start){
 if(!values.length)values=[0];
 const max=Math.max(0,...values),tick=max?Math.ceil(max/4/10)*10:25;
 const left=76,right=570,top=18,bottom=168;
 const points=values.map((value,i)=>({x:left+i*(right-left)/Math.max(1,values.length-1),y:bottom-value/(tick*4)*(bottom-top),value,date:reportShiftDate(start,i)}));
 const line=points.map(p=>p.x+','+p.y).join(' ');
 const labels=points.filter((p,i)=>i===0||i===points.length-1||(points.length>5&&i%Math.ceil(points.length/5)===0)).map(p=>'<text x="'+p.x+'" y="192" text-anchor="middle">'+p.date.slice(8)+'/'+p.date.slice(5,7)+'</text>').join('');
 const ticks=Array.from({length:5},(_,i)=>{const y=bottom-i*(bottom-top)/4;return '<path d="M'+left+' '+y+'H'+right+'" stroke="#ffffff20" stroke-dasharray="4 5"/><text x="'+(left-10)+'" y="'+(y+4)+'" text-anchor="end">R$ '+(i*tick).toLocaleString('pt-BR')+'</text>';}).join('');
 return '<svg class="lc-revenue-svg" viewBox="0 0 600 206" role="img" aria-label="Faturamento por dia, de '+safe(start)+' até '+safe(end)+'"><defs><linearGradient id="admin-revenue-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ff8128" stop-opacity=".35"/><stop offset="1" stop-color="#ff8128" stop-opacity="0"/></linearGradient></defs>'+ticks+'<polygon points="'+left+','+bottom+' '+line+' '+points.at(-1).x+','+bottom+'" fill="url(#admin-revenue-fill)"/><polyline points="'+line+'" fill="none" stroke="#ff8128" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+points.map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="3.5" fill="#ff8128" stroke="#ffd9bb"><title>'+p.date+' • '+money(p.value)+'</title></circle>').join('')+labels+'</svg><details class="lc-revenue-days"><summary>Ver valores por dia</summary><ul>'+points.map(p=>'<li><span>'+p.date.slice(8)+'/'+p.date.slice(5,7)+'</span><strong>'+money(p.value)+'</strong></li>').join('')+'</ul></details>';
}
function adminPaymentChart(totals,revenue){
 const labels={pix:'PIX',dinheiro:'Dinheiro',credito:'Crédito',debito:'Débito',outros:'Outros'};
 const colors=['#ff8128','#ffa54d','#ffd0a1','#c6c6c6','#696969'];let cursor=0;
 const entries=Object.entries(totals).filter(([key,value])=>key!=='outros'||value>0);
 const stops=entries.map(([key,value],i)=>{const begin=cursor;cursor+=revenue>0?value/revenue*100:0;return colors[i%colors.length]+' '+begin+'% '+cursor+'%';});
 return '<div class="admin-payment-chart"><div class="admin-donut" role="img" aria-label="Recebimentos por forma de pagamento" style="background:'+(revenue>0?'conic-gradient('+stops.join(',')+')':'#353535')+'"><div><strong>'+money(revenue)+'</strong><span>Total recebido</span></div></div><div class="admin-payment-legend">'+entries.map(([key,value],i)=>'<div><i style="background:'+colors[i%colors.length]+'"></i><span>'+labels[key]+'</span><strong>'+money(value)+'</strong></div>').join('')+'</div></div>';
}
async function renderAdminOverview(){
 if(state.role!=='admin')return;
 if(adminView==='fila')return renderAdminQueue();
 adminView='queue';const target=mountAdminPage('Painel geral','Sua barbearia em um só lugar.');
 showAdminLoading(target,'Carregando visão geral...');
 try{
  adminOverviewPeriod??=loadAdminDisplaySettings().period||'month';
  const period=adminOverviewPeriod,selected=adminOverviewBarber,range=reportDateRange(period),today=localQueueDate();
  const [allRows,queueRows,teamResult]=await Promise.all([loadOverviewRows(range.start,range.end),loadQueueRows(),db.from('barbers').select('id,name,active,commission_percent').order('id')]);
  if(teamResult.error)throw teamResult.error;
  const rows=allRows.filter(row=>selected==='all'||row.barber_id===selected);
  const totals=adminOverviewTotals(rows);const payments={pix:0,dinheiro:0,credito:0,debito:0,outros:0};
  const paymentLines={};const ids=totals.done.map(row=>row.id);
  for(let offset=0;offset<ids.length;offset+=50){
   const result=await db.from('lacorte_queue_payments').select('queue_id,payment_method,amount').in('queue_id',ids.slice(offset,offset+50));
   if(result.error)throw result.error;(result.data||[]).forEach(line=>(paymentLines[line.queue_id]||=[]).push(line));
  }
  totals.done.forEach(row=>{const lines=paymentLines[row.id];if(lines?.length){lines.forEach(line=>payments[Object.hasOwn(payments,line.payment_method)?line.payment_method:'outros']+=Number(line.amount||0));}else payments[Object.hasOwn(payments,row.payment_method)?row.payment_method:'outros']+=Number(row.total_amount||0);});
  if(!target.isConnected||period!==adminOverviewPeriod||selected!==adminOverviewBarber)return;
  const days=new Map();for(let day=range.start;day<=range.end;day=reportShiftDate(day,1))days.set(day,0);
  totals.done.forEach(row=>days.set(row.queue_date,(days.get(row.queue_date)||0)+Number(row.total_amount||0)));
  const waiting=queueRows.filter(row=>row.status==='waiting'&&row.queue_date===today);
  const team=teamResult.data||[];
  const metrics=[['Faturamento',money(totals.revenue),'Recebido no período','reports'],['Comissão do barbeiro 2',money(totals.commission),String(team.find(b=>b.id==='barbeiro-2')?.commission_percent??50)+'% dos serviços dele','services'],['Após comissão do barbeiro 2',money(totals.afterCommission),'Antes das despesas','overview'],['Atendimentos',String(totals.done.length),'Concluídos no período','calendar']];
  const filterOptions='<option value="all">Todos os barbeiros</option>'+team.map(b=>'<option value="'+safe(b.id)+'"'+(selected===b.id?' selected':'')+'>'+safe(b.name)+'</option>').join('');
  target.innerHTML='<div class="admin-overview-filters"><div class="admin-periods" role="group" aria-label="Período da visão geral">'+Object.entries({today:'Dia',week:'Semana',fortnight:'Quinzena',month:'Mês'}).map(([key,label])=>'<button type="button" data-overview-period="'+key+'" aria-pressed="'+(period===key)+'">'+label+'</button>').join('')+'</div><select aria-label="Filtrar por barbeiro" id="admin-overview-barber">'+filterOptions+'</select></div>'+
  '<section class="lc-metric-grid" aria-label="Indicadores do período">'+metrics.map(([label,value,note,icon])=>'<article class="lc-metric-card"><div class="lc-metric-icon">'+lcAdminIcon(icon)+'</div><div><span>'+label+'</span><strong>'+value+'</strong><small>'+note+'</small></div></article>').join('')+'</section>'+
  '<section class="admin-chart-grid"><article class="lc-admin-card"><h2>Faturamento por dia</h2>'+lcAdminRevenueChart([...days.values()],range.end,range.start)+'</article><article class="lc-admin-card"><h2>Recebimentos por forma</h2>'+adminPaymentChart(payments,totals.revenue)+'</article></section>'+
  '<section class="admin-bottom-grid"><article class="lc-admin-card"><div class="lc-card-heading"><div><h2>Fila de hoje</h2><span class="admin-queue-count">'+waiting.length+' aguardando</span></div><button type="button" class="lc-text-action" data-admin-view="fila">Ver fila ›</button></div><div class="admin-overview-queue">'+(waiting.slice(0,3).map(row=>'<article><strong class="admin-queue-ticket">#'+safe(queueTicketNumber(row))+'</strong><div><strong>'+safe(row.participant_name||[row.customer?.first_name,row.customer?.last_name].filter(Boolean).join(' ')||'Cliente')+'</strong><span>'+safe((row.items||[]).map(i=>i.service_name).join(' + '))+'</span></div><strong>'+money(Number(row.total_amount||0))+'</strong><button class="btn btn-outline" data-call="'+safe(row.id)+'">Chamar</button></article>').join('')||'<p class="admin-empty">Nenhum cliente aguardando hoje.</p>')+'</div></article>'+
  '<article class="lc-admin-card"><h2>Resultado por barbeiro</h2><div class="report-table-wrap"><table class="admin-team-results"><thead><tr><th>Profissional</th><th>Faturamento</th><th>Repasse</th></tr></thead><tbody>'+team.filter(b=>b.active||totals.done.some(row=>row.barber_id===b.id)).map(b=>{const own=totals.done.filter(row=>row.barber_id===b.id);return '<tr><th scope="row">'+safe(b.id==='barbeiro-1'?adminOwnerName()+' • Barbeiro 1':b.name)+'</th><td>'+money(own.reduce((n,row)=>n+Number(row.total_amount||0),0))+'</td><td>'+(b.id==='barbeiro-1'?'100% próprio':money(own.reduce((n,row)=>n+Number(row.commission_amount||0),0)))+'</td></tr>';}).join('')+'</tbody></table></div></article></section>'+
  '<nav class="admin-mobile-shortcuts" aria-label="Acesso rápido">'+[['fila','Fila','clients'],['manage','Equipe','management'],['reports','Relatórios','reports'],['settings','Configurações','settings']].map(([key,label,icon])=>'<button type="button" data-admin-view="'+key+'">'+lcAdminIcon(icon)+'<span>'+label+'</span><b>›</b></button>').join('')+'</nav>';
  target.querySelectorAll('[data-overview-period]').forEach(button=>button.onclick=()=>{adminOverviewPeriod=button.dataset.overviewPeriod;renderAdminOverview();});
  target.querySelector('#admin-overview-barber').onchange=function(){adminOverviewBarber=this.value;renderAdminOverview();};
  target.querySelectorAll('[data-call]').forEach(button=>button.onclick=()=>openQueueCallDialog(button.dataset.call,target,renderAdminOverview));
  bindAdminNavigation();
 }catch(error){adminError(target,error,renderAdminOverview);}
}

async function renderAdminShopSettings(target){
 if(state.role!=='admin')return;
 const current=showAdminLoading(target,'Carregando dados da barbearia...');
 try{
  const result=await db.from('lacorte_shop_settings').select('*').eq('id',1).single();
  if(result.error)throw result.error;if(!current())return;const values=result.data;
  target.innerHTML='<form class="summary admin-form" id="admin-shop-settings"><h3>Dados da barbearia</h3><p class="muted">As alterações são salvas para todos os dispositivos e aparecem no totem ao recarregar.</p><label>Nome da barbearia<input name="display_name" maxlength="80" required value="'+safe(values.display_name)+'"></label><label>Frase de apresentação<input name="slogan" maxlength="160" required value="'+safe(values.slogan)+'"></label><label>Dias de funcionamento<input name="opening_days" maxlength="80" required value="'+safe(values.opening_days)+'"></label><div class="report-date-fields"><label>Abertura<input name="opening_time" type="time" required value="'+safe(values.opening_time.slice(0,5))+'"></label><label>Fechamento<input name="closing_time" type="time" required value="'+safe(values.closing_time.slice(0,5))+'"></label></div><label>WhatsApp com código do país<input name="whatsapp" inputmode="tel" pattern="[0-9]{10,15}" maxlength="15" required value="'+safe(values.whatsapp)+'"></label><label>Instagram (sem @)<input name="instagram" pattern="[A-Za-z0-9_.]{1,30}" maxlength="30" required value="'+safe(values.instagram)+'"></label><button class="btn btn-primary" type="submit">Salvar dados da barbearia</button><p role="status" aria-live="polite"></p></form>';
  const form=target.querySelector('form');
  form.onsubmit=async function(event){
   event.preventDefault();const f=form.elements,status=form.querySelector('[role=status]');
   if(f.closing_time.value<=f.opening_time.value){status.textContent='O fechamento deve ser depois da abertura.';return;}
   const data={display_name:f.display_name.value.trim(),slogan:f.slogan.value.trim(),opening_days:f.opening_days.value.trim(),opening_time:f.opening_time.value,closing_time:f.closing_time.value,whatsapp:f.whatsapp.value.trim(),instagram:f.instagram.value.trim(),updated_at:new Date().toISOString()};
   const fields=[...form.elements];fields.forEach(field=>field.disabled=true);status.textContent='Salvando...';
   try{const result=await db.from('lacorte_shop_settings').update(data).eq('id',1).select('id').single();if(result.error||!result.data)throw result.error||new Error('Dados não retornados.');status.textContent='Dados salvos. Recarregue o totem para aplicar.';}
   catch(error){status.textContent='Não foi possível salvar. '+error.message;}
   finally{fields.forEach(field=>field.disabled=false);}
  };
 }catch(error){adminError(target,error,()=>renderAdminShopSettings(target));}
}

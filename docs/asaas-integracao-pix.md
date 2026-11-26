# Integração Asaas — fila online LaCorte

**Provedor escolhido para pagamentos da fila online: Asaas.** A InfinitePay permanece independente para os demais recebimentos da barbearia.

## Fluxo planejado
1. Cliente autenticado escolhe serviços no celular.
2. Backend valida preços atuais, cria pedido idempotente em `lacorte_remote_orders` e associa a um cliente Asaas.
3. Backend gera cobrança Pix no Asaas e obtém QR Code/Copia e Cola por meio da API oficial.
4. Interface apresenta Pix e aguarda a confirmação.
5. Webhook Asaas é recebido em endpoint protegido, validado e deduplicado; servidor consulta a cobrança no Asaas antes de liberar a fila.
6. Com valor e status conferidos, transação atômica associa uma única senha ao pedido na fila compartilhada.
7. Em falhas, repetição de webhook, pagamento tardio ou virada do dia, não gerar senha duplicada.

## Segurança e limites
- Segredo de API e token de autenticação do webhook exclusivamente em secrets do Supabase; não enviar ao navegador nem salvar no GitHub.
- Validar token do webhook e conferir pagamento pela API autenticada; nunca confiar em comprovante ou redirecionamento.
- Não conceder acesso direto do navegador a tabelas de pedidos, eventos e reembolsos.
- O totem presencial continua sem pagamento online.
- Um pedido pago deve gerar no máximo uma entrada remota na fila.
- Política de remarcação: uma vez, com solicitação ao menos 40 minutos antes da previsão comunicada; tolerância de 15 minutos, observada legislação de consumo.
- Clube de Pontos excluído do escopo.
- Cobranças reais desabilitadas até testar sandbox e configurar a conta do estabelecimento.

## Documentação oficial
- https://docs.asaas.com/
- https://docs.asaas.com/reference/criar-nova-cobranca
- https://docs.asaas.com/reference/obter-qr-code-para-pagamentos-via-pix

## Pendências
- Proprietário criar/confirmar conta Asaas e habilitação da API.
- Configurar chave de sandbox e webhook de teste sem compartilhá-los no chat.
- Implementar Edge Functions, autenticação de clientes e operações transacionais de fila.
- Executar testes de integração, segurança e release conforme AGENTS.md antes de publicar.

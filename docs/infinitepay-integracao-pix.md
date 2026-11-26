# Integração Pix — InfinitePay | LaCorte

**Provedor escolhido:** InfinitePay.

## Regras
- Somente a fila online exige pagamento integral antes de inserir a senha na fila compartilhada.
- O totem presencial mantém o fluxo atual, sem pagamento antecipado.
- O preço deve ser recalculado no servidor a partir dos serviços ativos, nunca confiado ao navegador.
- A cobrança deve referenciar o ID interno de `lacorte_remote_orders`, com chave de idempotência.
- A confirmação deve vir de consulta autenticada à InfinitePay ou notificação verificada pelo backend. Não aceitar redirecionamento de sucesso, print, código Pix ou declaração do cliente como prova.
- Usar `lacorte_remote_payment_events` para deduplicação e travas transacionais para impedir duas senhas por pedido.
- Só criar a entrada na fila quando o pagamento estiver confirmado, utilizando a operação existente de fila e respeitando o reset diário.
- Credenciais exclusivamente em secrets do Supabase; nunca em HTML, JavaScript público ou commits.
- Prever reembolso, pagamento atrasado após virada do dia, divergência de valor, falha de rede, webhook repetido e estorno.
- A fila presencial e o painel do barbeiro devem continuar operando mesmo se a InfinitePay ficar indisponível.
- O Clube de Pontos está fora do escopo.

## Pendências de integração
1. Confirmar qual produto/API de cobranças Pix da InfinitePay está disponível para a conta do estabelecimento e obter a documentação oficial correspondente.
2. Configurar credenciais e ambiente de testes no Supabase.
3. Implementar criação de cobrança e confirmação de pagamento com os campos, autenticação e assinatura efetivamente documentados.
4. Testar pedido duplicado, confirmação repetida, pagamento tardio, reembolso e inclusão única na fila.
5. Validar a release seguindo AGENTS.md antes de publicar.

**Estado:** provedor definido; cobrança real ainda desativada. Não inventar endpoints, segredos ou assinaturas de webhook.

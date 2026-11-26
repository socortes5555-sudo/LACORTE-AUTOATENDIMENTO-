# LaCorte — implementação aprovada: cliente mobile, fila online e Clube de Pontos

Estado: **especificação para implementação em branch isolada; NÃO publicada em produção**.

## Identidade visual aprovada
- Preto/grafite, laranja como acento, interface chique e minimalista, cartões compactos.
- Reutilizar `assets/lacorte-logo.svg` e demais assets oficiais existentes **sem redesenhar a logo**.
- No celular do cliente: **fila em destaque acima do Clube de Pontos**.
- Preservar as interfaces atuais de totem e equipe durante a transição, sem substituição abrupta.

## Entrada na fila
- Presencial: permanece pelo tablet, sem pagamento online.
- Remota: pelo celular do cliente, escolha de serviços, preço total, consentimento com regras, Pix de **100%** do valor, confirmação por webhook assinado do provedor e só então entrada na mesma fila compartilhada.
- Nunca confiar em comprovante de tela ou callback do navegador como prova de pagamento.
- Uma única fila e ordem transparente; nenhuma prioridade oculta para clientes remotos.
- Posição e tempo de espera são estimativas, não agendamentos garantidos.
- Avisar mudanças da previsão e proximidade da vez; tolerância de 15 minutos, com definição explícita do evento que inicia a contagem.
- Botão “Não vou conseguir chegar a tempo”: até 40 minutos antes da previsão comunicada, oferece opções estimadas disponíveis para **uma única remarcação** por pagamento; crédito do pagamento é preservado.
- Cancelamento por impossibilidade de comparecimento: fluxo de reembolso conforme política aplicável e direitos do consumidor; não implementar perda automática integral do valor sem revisão jurídica.
- Ao virar o dia, limpar a fila operacional, mas **não apagar pagamentos, créditos, remarcações, reembolsos, histórico nem pontos**.

## Clube LaCorte
- Pontuação específica por serviço, configurável pelo administrador; serviços mais caros tendem a render mais pontos, mas sem regra rígida de 1 ponto por real.
- Pontos somente após atendimento concluído e elegível; idempotência por item de atendimento; estornos/cancelamentos revertem créditos indevidos.
- Cada lote de pontos vence 12 meses após o crédito, com consumo dos lotes mais antigos primeiro.
- Apenas ao atingir **200 pontos válidos** o cliente pode escolher **um** prêmio ativo liberado pelo administrador.
- Qualquer prêmio disponível custa 200 pontos; resgate automático, transação atômica e código único para impedir duplicidade; marcar entrega separadamente.
- Administrador cadastra, edita, ativa/desativa prêmios e define pontuação por serviço.
- Cliente consulta saldo, validade, histórico e recompensas pelo celular.
- Serviço grátis obtido por pontos não deve gerar novos pontos, salvo regra futura explícita.

## Segurança e implementação
- Reaproveitar banco Supabase e registros de clientes existentes, sem duplicá-los.
- Implementar autenticação/identificação segura do cliente remoto; nome ou telefone isoladamente não autoriza acesso ao saldo ou pagamento de outra pessoa.
- RLS e funções transacionais no banco; operações financeiras exclusivamente no backend.
- Chaves de gateway Pix somente em segredos do servidor; conciliação e webhook idempotentes.
- Proteger contra resgate simultâneo, pagamento repetido e corrida de atualização da fila.
- Separar CSS/JS por entrada e manter PWA cliente/equipe distintos.
- Antes de publicar código: executar `node scripts/release.mjs`, `node scripts/release.mjs --check`, verificações de sintaxe e `node --test tests/*.test.mjs`, conforme AGENTS.md.
- Validar em celular, tablet e desktop; deploy gradual somente após testes.

## Pendências externas antes de ativar pagamentos
1. Definir e conectar conta de provedor Pix com API e webhooks.
2. Definir política jurídica de cancelamento, reembolso e não comparecimento.
3. Validar mecanismo de autenticação do cliente remoto e notificações.

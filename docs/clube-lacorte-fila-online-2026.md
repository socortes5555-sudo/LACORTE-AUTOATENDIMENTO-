# LaCorte — fila online e painel do cliente

**Em desenvolvimento, não publicado.** O Clube de Pontos foi retirado do escopo por solicitação do proprietário. Não exibir pontos, prêmios ou resgates em nenhum painel.

## Visual
Preto/grafite com acentos laranja, minimalista, usando a logo original sem alteração. Painel mobile: fila, serviços, histórico e perfil.

## Fluxo
- Atendimento presencial permanece gratuito na entrada da fila pelo totem.
- Entrada remota usa a mesma fila compartilhada, mediante pagamento Pix integral confirmado pelo backend através de webhook verificado e idempotente.
- Mostrar posição e espera estimadas, sem prometer agendamento.
- Tolerância de 15 minutos; uma remarcação por pagamento, solicitada até 40 minutos antes da previsão comunicada, mantendo crédito.
- Reembolsos e faltas conforme política revisada à luz da legislação aplicável.
- Reset diário da fila sem apagar histórico financeiro, créditos ou reembolsos.
- Autenticação segura no acesso remoto; telefone/nome sozinho não dá acesso à conta.
- Nunca inserir chaves privadas de Pix no frontend.

## Publicação
Não alterar a versão em produção antes de configurar provedor Pix, implementar backend, testar fluxo ponta a ponta e executar o procedimento de release do AGENTS.md.

# LaCorte — Autoatendimento e Fila de Atendimento

Aplicação web da LaCorte para autoatendimento de clientes, organização de uma fila compartilhada e administração da operação.

O sistema é orientado a **fila de atendimento por ordem de entrada**. Não é um sistema de agendamento de horários.

## Identidade visual

- Cores principais: preto, grafite, branco/cinza e laranja.
- Interface responsiva para celular, tablet e computador.
- Painéis com apresentação compacta e foco na operação diária.

## Arquivos do projeto

- `index.html` + `customer.css`: autoatendimento do cliente.
- `barbeiros.html` + `barber.css`: área profissional dos barbeiros.
- `painel-admin-preview.html` + `admin.css`: painel administrativo do proprietário.
- `app.js`: lógica compartilhada de autenticação da equipe, navegação, autoatendimento, fila, painéis e relatórios.
- `assets/`: identidade visual e recursos estáticos.

## Tecnologias e serviços

- Front-end: HTML, CSS e JavaScript.
- Backend e banco de dados: Supabase.
- Identificação do cliente: telefone normalizado; autenticação por e-mail/senha é restrita à equipe.
- Publicação: GitHub Pages.
- Operações de fila: funções RPC no banco de dados, incluindo:
  - `lacorte_create_queue_entry`
  - `lacorte_start_service`
  - `lacorte_finish_service`
  - `lacorte_cancel_queue_entry`

A aplicação utiliza a chave pública/publicável do Supabase no navegador. Chaves secretas e credenciais administrativas não devem ser inseridas no código do front-end.

## Jornada do cliente

1. O cliente informa seu telefone para identificação.
2. Na primeira visita, completa o perfil com nome, sobrenome, telefone e aniversário.
3. Nas próximas visitas, os dados já cadastrados podem ser reutilizados pelo telefone.
4. Escolhe os serviços desejados.
5. Confere os dados e confirma a entrada.
6. Recebe sua senha e acompanha o status do atendimento.

O cliente não escolhe barbeiro. A entrada é registrada na fila compartilhada, e o profissional assume o próximo atendimento disponível. Não há seleção de data ou horário de agendamento.

## Painel do profissional

- Cada barbeiro acompanha somente os atendimentos atribuídos a ele.
- Visualiza clientes, serviços, valores e status.
- Pode iniciar e concluir atendimentos conforme as permissões configuradas.
- Os indicadores distinguem atendimentos aguardando, em andamento e concluídos.

## Administração

O painel administrativo é destinado ao proprietário e reúne:

- Visão geral da operação e da fila.
- Gerenciamento de barbeiros e comissões.
- Gerenciamento de serviços e preços.
- Acompanhamento e gerenciamento dos atendimentos.
- Gerenciamento e consulta de assinaturas.
- Relatórios por período, serviços, barbeiros e situação dos atendimentos.
- Indicadores financeiros e gráficos.

As permissões de acesso devem continuar sendo aplicadas no banco de dados por autenticação e políticas de segurança (RLS), além das validações da interface. Ocultar uma opção na tela, isoladamente, não é uma medida de segurança.

## Assinaturas e planos

O sistema possui estrutura para planos de clientes, consulta do histórico e acompanhamento de validade e créditos.

- O plano LaCorte Premium está configurado com 4 cortes por ciclo mensal.
- O consumo do crédito ocorre quando o atendimento é concluído.
- Um atendimento cancelado libera a reserva do crédito.
- O sistema apresenta avisos para assinaturas próximas do vencimento e vencidas.
- A ativação do plano depende da confirmação manual do pagamento externo.

**Importante:** a aplicação não deve ser considerada integrada a um gateway de pagamento automático. Não confirme recebimentos apenas com base em registros de teste ou em uma tela do sistema.

## Relatórios

O painel administrativo contempla filtros por período e indicadores como:

- Faturamento dos atendimentos concluídos.
- Comissões dos profissionais.
- Valor líquido após comissões.
- Quantidade de atendimentos concluídos.
- Serviços realizados e situação da fila.
- Gráficos de acompanhamento, incluindo gráficos de pizza.

Os valores financeiros devem ser interpretados conforme os atendimentos efetivamente concluídos e os registros persistidos no banco.

## Publicação

Aplicação publicada em:

https://socortes5555-sudo.github.io/LACORTE-AUTOATENDIMENTO-/

O repositório é:

https://github.com/socortes5555-sudo/LACORTE-AUTOATENDIMENTO-

Após alterações nos arquivos, aguarde a atualização do GitHub Pages e valide a versão publicada em celular e computador. Quando CSS ou JavaScript forem alterados, atualize também os parâmetros de versão/cache referenciados em `index.html`, para evitar que o navegador continue carregando arquivos antigos.

## Checklist de validação antes do uso

- [ ] Acesso por e-mail e recuperação da sessão.
- [ ] Cadastro e reutilização dos dados do cliente.
- [ ] Seleção de serviços sem escolha de barbeiro pelo cliente.
- [ ] Geração de senha e entrada na fila compartilhada.
- [ ] Atribuição do atendimento ao profissional que o iniciar.
- [ ] Acesso exclusivo do proprietário às funções administrativas.
- [ ] Início, conclusão e cancelamento de atendimentos.
- [ ] Cálculo de valores e comissões.
- [ ] Reserva, consumo e liberação de créditos de planos.
- [ ] Avisos de vencimento de assinaturas.
- [ ] Relatórios, filtros e gráficos com dados reais.
- [ ] Layout responsivo e identidade visual sem cores fora da paleta.

## Segurança e operação

- Não publique senhas, tokens, chaves secretas ou credenciais administrativas no repositório.
- Mantenha as políticas RLS e as funções do banco revisadas.
- Faça alterações no banco com cuidado e valide-as antes de usar em produção.
- Não remova tabelas ou dados históricos sem uma cópia de segurança e autorização explícita.
- Teste mudanças em fluxo controlado antes de disponibilizá-las aos clientes.

---
Documentação do projeto LaCorte. Atualize este arquivo sempre que o comportamento real da aplicação mudar.

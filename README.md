# LaCorte — Autoatendimento e Fila de Atendimento

Aplicação web da LaCorte para autoatendimento de clientes, organização de uma fila compartilhada e administração da operação.

O sistema é orientado a **fila de atendimento por ordem de entrada**. Não é um sistema de agendamento de horários.

## Identidade visual

- Cores principais: preto, grafite, branco/cinza e laranja.
- Interface responsiva para celular, tablet e computador.
- Painéis com apresentação compacta e foco na operação diária.

## Arquivos do projeto

- `index.html`: estrutura da aplicação e carregamento dos recursos.
- `styles.css`: identidade visual, componentes e responsividade.
- `app.js`: autenticação, navegação, autoatendimento, fila, painéis e relatórios.

## Tecnologias e serviços

- Front-end: HTML, CSS e JavaScript.
- Backend e banco de dados: Supabase.
- Equipe: autenticação Supabase por e-mail e senha.
- Clientes no ambiente publicado: cadastro com nome, sobrenome, telefone e nascimento; retorno por nome completo ou telefone. A confirmação por código ainda não está ativa em produção.
- Publicação: GitHub Pages.
- Operações de fila: funções RPC no banco de dados, incluindo:
  - `lacorte_create_queue_entry`
  - `lacorte_start_service`
  - `lacorte_finish_service`
  - `lacorte_cancel_queue_entry`

A aplicação utiliza a chave pública/publicável do Supabase no navegador. Chaves secretas e credenciais administrativas não devem ser inseridas no código do front-end.

## Jornada do cliente em produção

1. Na primeira visita, informa nome, sobrenome, telefone e data de nascimento.
2. O cadastro é salvo para reutilização nas próximas visitas.
3. O cliente recorrente localiza o cadastro pelo nome completo ou telefone com DDD.
4. Escolhe os serviços e pode incluir acompanhantes na mesma senha.
5. Confere os serviços e valores antes de confirmar a entrada na fila.
6. Recebe sua senha; o totem retorna à tela inicial após cinco segundos.

**Verificação por código:** a implementação por OTP de e-mail está preparada no PR #17, mas ainda não foi incorporada nem publicada. A versão de produção continua usando as ações antigas de cadastro/identificação. Não anuncie OTP como ativo até concluir a configuração SMTP e a implantação coordenada descritas em [docs/customer-verification-rollout.md](docs/customer-verification-rollout.md).

O cliente não escolhe barbeiro. A entrada é registrada na fila compartilhada, e o profissional assume o próximo atendimento disponível. Não há seleção de data ou horário de agendamento.

## Estado atual da confirmação do cliente

- A Edge Function `lacorte-kiosk` ativa em produção é a versão 12 e ainda aceita as ações antigas `register` e `identify`.
- A implementação OTP está no PR #17, ainda aberto. Ela não deve ser considerada funcional para clientes reais até que a entrega de e-mail seja testada com um endereço externo à equipe.
- A migração aditiva do índice único de e-mails ativos já consta no histórico do banco. Nenhum cadastro foi removido para preparar essa mudança.
- OTP por WhatsApp continua desativado: não há provedor oficial gratuito configurado.
- A ativação exige SMTP próprio e modelo Magic Link com `{{ .Token }}`. Consulte o [roteiro de implantação](docs/customer-verification-rollout.md).

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
- Sinalização de senhas puladas por todos os profissionais ativos.
- Reabertura de uma preferência somente após confirmação do cliente, com registro administrativo e preservação do número e da posição da senha.
- Gerenciamento e consulta de assinaturas.
- Relatórios por período, serviços, barbeiros, produtos vendidos e situação dos atendimentos.
- Separação do faturamento bruto e líquido de serviços e produtos, com rateio proporcional dos descontos.
- Quantidades vendidas e ranking de produtos baseado nos nomes e preços históricos gravados em cada comanda.
- Histórico de atendimentos com os serviços e produtos efetivamente registrados.
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

## Instalação como aplicativo (PWA)

O sistema LaCorte pode ser instalado como aplicativo **sem reconstruir os painéis** e sem criar banco de dados separado. O aplicativo é online: internet é necessária para login, fila, atendimentos e relatórios.

- **Totem / cliente:** abra o endereço principal no Chrome/Edge e use **Instalar aplicativo**; no iPhone/iPad, use **Compartilhar → Adicionar à Tela de Início**. A entrada instalada abre o autoatendimento.
- **Equipe / administrador:** abra `barbeiros.html` no navegador e instale a entrada **LaCorte Equipe** da mesma maneira. O profissional continua fazendo login com e-mail e senha, e suas permissões não mudam.
- **Computador:** no Chrome/Edge, use a opção de instalar o aplicativo na barra de endereço ou no menu do navegador.

A configuração de instalação está em `manifest.webmanifest` e `manifest-profissionais.webmanifest`, com ícones oficiais em `assets/lacorte-app-v5-192.png` e `assets/lacorte-app-v5-512.png`. O service worker não armazena clientes, sessões nem relatórios em cache. A atualização do site continua disponível normalmente e os dados permanecem online no Supabase.

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

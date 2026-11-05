# LaCorte — protótipo da área do cliente

Este é um protótipo estático, pensado para abrir em celular e computador.

## Arquivos
- `index.html`: estrutura da página.
- `styles.css`: visual preto e laranja.
- `app.js`: etapas e interações da jornada do cliente.

## Importante
Esta versão é somente um protótipo visual/interativo. Os serviços, barbeiros e quantidades na fila são exemplos. Os preços estão como "a configurar". Não processa pagamentos, não cria registros em banco de dados e não coloca clientes em uma fila real.

## Próximas etapas para produção
1. Criar projeto no Supabase.
2. Criar tabelas de serviços, barbeiros, atendimentos e pagamentos.
3. Configurar autenticação e políticas de segurança (RLS).
4. Implementar fila por barbeiro com operações atômicas no servidor.
5. Integrar um gateway de pagamento brasileiro e validar PIX por webhook.
6. Testar em ambiente de homologação antes de usar com clientes.

## Publicação gratuita
Pode ser publicado como site estático no Cloudflare Pages. Para atualizar, envie os arquivos atualizados ao repositório GitHub conectado ao Pages ou faça novo deploy.

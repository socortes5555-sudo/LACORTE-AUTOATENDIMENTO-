# Implantação segura da confirmação de clientes

## Estado verificado em 27/11/2026

- A Edge Function `lacorte-kiosk` em produção está na versão 12 e ainda implementa cadastro e identificação sem OTP (ações `register` e `identify`).
- O PR [#19](https://github.com/socortes5555-sudo/LACORTE-AUTOATENDIMENTO-/pull/19) contém a implementação de OTP por e-mail, permanece aberto e ainda não foi publicada.
- A migração aditiva `20261123181605_customer_email_otp_unique_index` consta no histórico do Supabase.
- A configuração de SMTP e do modelo de e-mail não pode ser confirmada pelas integrações disponíveis nesta execução.
- WhatsApp OTP não está configurado.

## Compatibilidade da identificação recorrente no PR #19

- O totem continua recebendo nome completo ou telefone. O servidor resolve o cadastro ativo e envia o OTP ao e-mail já vinculado, sem devolver o endereço ao navegador.
- Na etapa de confirmação, o cliente informa o e-mail que recebeu o código; o servidor confere novamente que ele pertence ao cadastro localizado antes de criar o token temporário do autoatendimento.
- Se houver nomes iguais, orientar o cliente a usar o telefone. Para cadastro sem e-mail, existe uma opção separada de vinculação: informar um endereço novo, confirmar o OTP e comprovar nome, sobrenome, telefone e nascimento exatos.
- Os testes `tests/kiosk-email-otp.test.mjs` cobrem a busca por nome/telefone, o envio sem exposição do endereço, a revalidação do cadastro e a rota de vinculação legada.

## Pré-requisitos no Supabase

1. No painel do projeto, abra **Authentication → SMTP Settings** e habilite um servidor SMTP próprio.
2. Escolha somente um serviço cujo plano gratuito atual seja suficiente para o volume esperado. Confirme limites, exigência de domínio/remetente e política de uso antes de criar a conta. Nenhum provedor foi contratado nesta etapa.
3. Armazene host, porta, usuário, senha e remetente exclusivamente nas configurações seguras do Supabase. Nunca coloque esses valores em arquivos do GitHub, no front-end ou em issues.
4. Em **Authentication → Email Templates → Magic Link**, configure o corpo para apresentar o código OTP usando `{{ .Token }}`. Se o modelo usar somente `{{ .ConfirmationURL }}`, o Supabase enviará um link em vez do código de seis dígitos esperado pela tela.
5. Mantenha o limite de expiração do OTP curto e confira os limites de envio no painel.

O SMTP padrão do Supabase é destinado a testes: aceita somente endereços previamente autorizados na equipe do projeto e, segundo a documentação consultada em 24/11/2026, limita o envio a 2 mensagens por hora. Ele não atende o totem com clientes externos.

Documentação oficial:
- [SMTP personalizado](https://supabase.com/docs/guides/auth/auth-smtp)
- [Modelos de e-mail e variável OTP](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Login sem senha por e-mail](https://supabase.com/docs/guides/auth/auth-email-passwordless)

## Testes obrigatórios antes da ativação

Use um endereço de teste que **não** pertença à equipe Supabase:

- Solicitar código para cadastro novo e confirmar que o e-mail chega com seis dígitos.
- Solicitar código para cliente recorrente e validar a identificação.
- Confirmar código correto, incorreto, expirado e reutilizado.
- Confirmar bloqueio de e-mail de profissional no totem.
- Vincular um cadastro antigo com nome, sobrenome, telefone e nascimento exatos.
- Confirmar que e-mail ou telefone duplicado não cria um segundo cadastro.
- Conferir limites por IP, e-mail e telefone.
- Confirmar que nenhum access token ou refresh token do Supabase é devolvido ao navegador.
- Repetir os fluxos de seleção, revisão, entrada na fila e retorno do totem em cinco segundos.

Não use dados de clientes reais para testes de vinculação.

## Implantação sem interromper o totem

O front-end GitHub Pages e a Edge Function Supabase são publicados separadamente. O PR #17 troca as ações antigas `register`/`identify` pelas ações OTP; portanto, publicar apenas o front-end ou apenas a função pode deixar o autoatendimento temporariamente incompatível.

Antes da liberação, prepare uma etapa intermediária compatível (ou uma janela controlada de manutenção) para garantir que o front-end e a função sejam atualizados em conjunto. Depois:

1. Confirme SMTP e template com envio real para endereço externo.
2. Execute a CI completa do PR #19 e revise o diff final.
3. Prepare a transição coordenada da Edge Function e das quatro entradas PWA/Pages, respeitando o cache.
4. Teste cadastro novo e cliente antigo em produção com um cadastro de teste autorizado.
5. Só então encerre as ações legadas sem OTP e confirme que a versão publicada não permite retornar ao fluxo antigo.
6. Verifique que clientes existentes e histórico continuam preservados.

## Regras de segurança

- Não publique credenciais SMTP, tokens, dados pessoais ou QR de Wi-Fi.
- Não apague nem recrie cadastros para facilitar a migração.
- Não execute migrações destrutivas.
- Não habilite plano pago nem contrate domínio, hospedagem ou API.
- Se o provedor gratuito exigir pagamento, upgrade ou credencial que ainda não foi fornecida, mantenha a ativação em espera.

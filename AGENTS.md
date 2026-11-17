# Publicação da LaCorte

- Toda mudança deve funcionar no navegador e nos aplicativos instalados. Verifique index.html, cliente/index.html, barbeiros.html e equipe/index.html.
- Antes de publicar qualquer alteração de código ou estilo, execute `node scripts/release.mjs`. Ele sincroniza as versões dos arquivos nas quatro entradas e o aviso de atualização dos aplicativos.
- Execute `node scripts/release.mjs --check`, as verificações de sintaxe e `node --test tests/*.test.mjs` antes de publicar.
- Preserve as identidades e os escopos independentes de /cliente/ e /equipe/. Não apague sessões, cadastros ou dados para atualizar o aplicativo.
- Não recarregue automaticamente uma tela em uso: o aplicativo deve oferecer Atualizar agora para preservar o trabalho em andamento.
- Preserve o layout aprovado, a marca e os QR codes ao fazer correções operacionais.

# LaCorte — auditoria inicial de isolamento visual

Data: 2026-11-09
Branch de trabalho: refactor/css-isolation-20261109
Branch de produção preservada: main

## Estado confirmado no repositório
- styles.css: 350.246 caracteres, 5.893 linhas, 109 blocos @media, aproximadamente 2.993 blocos de regra e 2.656 ocorrências de !important.
- index.html (totem/cliente) carrega styles.css e customer-layout.css.
- barbeiros.html carrega o mesmo styles.css.
- painel-admin-preview.html carrega o mesmo styles.css.
- app.js concentra a lógica compartilhada; não deve ser reescrito durante a separação visual.
- totem-inicio-preview.html não carrega folha de estilo própria no estado auditado.
- Não existe package.json na raiz; não presumir que comandos npm estejam disponíveis.
- Migrações Supabase, testes e ativos estão presentes e fora do escopo da refatoração visual.

## Diagnóstico
Os três ambientes principais compartilham uma folha global extensa. O CSS do cliente já foi parcialmente separado em customer-layout.css, mas ainda depende de styles.css. O arquivo compartilhado contém regras para cliente, administrador e profissional, além de correções históricas sobrepostas. Apenas criar novos arquivos sem migrar as regras e remover a dependência antiga não resolve o acoplamento.

## Arquitetura-alvo
- styles-base.css: tokens, reset, tipografia e componentes realmente compartilhados.
- customer.css: somente autoatendimento do cliente.
- barber.css: somente painel do profissional.
- admin.css: somente painel administrativo.
- Cada HTML carrega apenas a base e sua folha específica.
- app.js, IDs, handlers, autenticação, integrações Supabase, dados e migrações permanecem inalterados nesta etapa.

## Regras de segurança da migração
1. Migrar em branch isolada; não substituir main durante a auditoria.
2. Inventariar seletores e dependências por página antes de mover regras.
3. Não apagar styles.css nem customer-layout.css até provar que nenhum HTML depende deles.
4. Fazer a migração em etapas pequenas e revisar diffs.
5. Validar sintaxe CSS, seletores órfãos, carregamento de cada página e regressões visuais em desktop, tablet e celular.
6. Manter o Supabase e os dados de produção intocados.
7. Só promover para main depois dos testes e da aprovação visual.

## Próxima etapa técnica
Classificar os seletores do CSS atual por escopo (#entry-choice/cliente, .professional-dashboard/barbeiro, .admin-dashboard/admin e componentes globais), identificar regras genéricas compartilhadas e conflitos de ordem/especificidade. Em seguida, criar as quatro folhas-alvo e alterar os HTMLs para carregamento individual, sem remover o CSS legado até a validação final.
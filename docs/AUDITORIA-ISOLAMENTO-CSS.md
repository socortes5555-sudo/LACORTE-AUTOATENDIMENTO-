# LaCorte — auditoria e isolamento de CSS

Data: 2026-11-09  
Branch: `refactor/css-isolation-20261109`

## Resultado desta etapa

As três folhas de estilo foram reduzidas por escopo, removendo regras explicitamente pertencentes aos outros painéis:

| Tela | Antes | Depois | Redução |
|---|---:|---:|---:|
| Cliente | 358.143 caracteres | 178.877 | 50% |
| Barbeiros | 350.405 caracteres | 75.019 | 79% |
| Administração | 351.847 caracteres | 155.310 | 56% |

## Arquitetura

- `index.html` carrega somente `customer.css`.
- `barbeiros.html` carrega somente `barber.css`.
- `painel-admin-preview.html` carrega somente `admin.css`.
- `app.js` permanece compartilhado porque contém a lógica de negócio e os componentes dinâmicos dos painéis.
- A folha legada `styles.css` e a folha complementar `customer-layout.css` não existem mais na branch.

## Critério aplicado

Foram removidos seletores explicitamente identificados como exclusivos de outra área: prefixos administrativos (`.admin-*`, `.lc-admin-*`, `.lc-queue-*`, `.manage-*`), profissionais (`.professional-*`, `.staff-shell`, componentes de pagamento do profissional) e componentes visuais exclusivos do totem (hero, showcase, membership, connection, QR e entrada do cliente). Regras globais e componentes de uso compartilhado foram preservados.

## Limites da validação

A alteração foi feita por análise estática dos seletores e dos nomes de classes usados pelo HTML e pelo JavaScript. A CI foi configurada para executar `node --check app.js` e `node --test tests/*.test.mjs` nesta branch. Ainda é necessária inspeção visual real nos três painéis, em tablet, celular e desktop, antes de promover para `main`.

## Proteção de dados

Nenhuma migration, tabela, registro, cliente, senha de fila, histórico, credencial ou configuração do Supabase foi alterada nesta limpeza.

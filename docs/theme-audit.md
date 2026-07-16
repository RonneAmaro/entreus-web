# Auditoria automática de temas — Pacote 50B

## Cobertura

`tests/e2e/theme-audit.spec.ts` executa tema escuro e claro em desktop 1440×900 e mobile 390×844. Rotas: Feed, mensagens, notificações, perfil, busca, salvos, desafios, Creator Studio, carteira, presentes, VIP Plus, configurações, ajuda, editor, Lab, Meet, admin, criadores, convite, verificação de idade, login, cadastro e recuperação de senha. O Hub é aberto e capturado nos quatro cenários.

Cada página verifica carregamento, classe do tema no `<html>`, overflow horizontal, contraste do texto/fundo principal, `pageerror` e erros relevantes de console. A suíte também alterna dark → light e confirma persistência após reload.

## Ambiente seguro

A autenticação usa usuário fictício e JWT sintético. Todas as chamadas ao host Supabase configurado são interceptadas no navegador; nenhuma conta real, cookie real ou dado pessoal é utilizado. Respostas de perfil usam papel administrativo fictício para tornar as superfícies auditáveis. APIs locais protegidas continuam aplicando suas regras normais.

## Capturas

As capturas ficam em `reports/theme-audit/{dark|light}/{desktop|mobile}/`. `reports/` permanece fora do versionamento conforme a política atual.

## Problemas e correções

- Hub, sidebar e barra mobile estavam presos a superfícies pretas: receberam pares claros e escuros.
- accents do Hub usavam texto 200 em fundo claro: passaram a usar 700 no claro e 200 no escuro.
- busca, fechamento e rodapé do Hub receberam borda, texto e superfície próprios por tema.
- `colorScheme` global passou a declarar suporte a `dark light`, mantendo dark como padrão explícito do provider.
- tokens semânticos reais foram centralizados em `globals.css`.

## Limitações e revisão manual

Estados dependentes de mídia real, LiveKit, pagamentos, filas administrativas e dados de produção são representados por estados vazios ou respostas fictícias. A auditoria de contraste automatizada cobre o par principal; combinações internas ainda exigem inspeção humana.

Checklist manual: desktop 1440×900, notebook 1366×768, tablet 768×1024, mobile 390×844, zoom 200%, teclado, dark e light. Conferir hierarquia, bordas, formulários, tooltips, modais, loading, erro, estados vazios, Feed, Perfil, Hub, Meet, Admin e Creator Studio.

Os 17 erros legados de hooks observados em Gifts, Wallet e VIP são dívida técnica fora do escopo do tema.

## Repetição e rollback

Executar `npx.cmd playwright test tests/e2e/theme-audit.spec.ts`. No Windows, pode-se iniciar servidor externo controlado e definir `PLAYWRIGHT_EXTERNAL_SERVER=1` e `PLAYWRIGHT_BASE_URL`.

Rollback: remover a suíte e este documento, reverter os tokens adicionados em `globals.css` e restaurar as classes anteriores do Hub/sidebar/mobile. Não há migration, dependência ou alteração server-side.

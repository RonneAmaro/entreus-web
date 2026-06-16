# Status e manutencao da EntreUS

## Para que serve

A rota `/status` e uma pagina estatica para comunicar avisos temporarios sobre estabilidade, manutencao e recursos da plataforma EntreUS.

Ela deve ser usada quando a equipe precisar orientar usuarios durante instabilidades, como:

- Supabase indisponivel, pausado ou restrito por limite externo;
- autenticacao instavel;
- R2 ou upload de midias instavel;
- manutencao temporaria do app;
- limitacao externa que afete feed, publicacoes, mensagens, notificacoes, Meet ou IA.

## Como funciona agora

A pagina e propositalmente simples e estatica. Ela nao consulta Supabase, R2, APIs internas, health checks ou qualquer servico externo.

O conteudo atual orienta o usuario a tentar novamente depois, verificar a conexao, evitar reenviar uploads repetidamente e salvar textos antes de sair da pagina.

## Onde aparece

- Rota direta: `/status`.
- Link discreto na central de ajuda: `/help`.

## Guia interno relacionado

Para retomada operacional do Supabase e planejamento seguro de migracao de midias para R2, consulte `docs/retomada-supabase-migracao-r2.md`.

## Futuras evolucoes

Quando fizer sentido, a pagina pode evoluir para:

- status dinamico gerenciado por admin;
- health checks de servicos internos;
- historico de incidentes;
- avisos segmentados por recurso;
- integracao com monitoramento externo.

Enquanto isso, `/status` deve continuar sem dependencia de banco, storage ou autenticacao.

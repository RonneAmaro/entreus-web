# Central beta para convite de criadores

A rota administrativa `/admin/beta-checklist` centraliza a validacao da EntreUS antes do convite aos primeiros criadores. Ela reutiliza a verificacao de perfil admin existente e nao cria banco ou migration.

## Categorias e status

O checklist cobre conta e acesso, perfil, feed, upload, 18+, monetizacao, saques, criadores, admin/moderacao, mobile, seguranca, politicas e preparacao para convite.

Cada item pode ser marcado como Nao testado, Em teste, Aprovado, Problema encontrado, Bloqueador ou Nao se aplica. O progresso e as observacoes ficam apenas no navegador do admin, na chave `entreus:beta-checklist:v1` do `localStorage`.

A prontidao e calculada pelo percentual de itens aplicaveis aprovados. Qualquer bloqueador impede o estado pronto para convite. O relatorio copiado inclui data, prontidao, bloqueadores, pendencias e aprovados.

## Roteiro de contas

- Conta A, usuario comum: cadastro, perfil, publicacao, interacoes, ItaCash e gorjeta.
- Conta B, criador: perfil, post pago, gorjeta, desbloqueio e solicitacao de saque.
- Conta C, admin: denuncias, idade, saques e painel administrativo.

Nao convidar criadores enquanto houver bloqueadores em login/cadastro, upload, 18+, gorjetas, posts pagos, saque, moderacao, termos ou suporte. A decisao positiva exige zero bloqueadores e 100% dos itens aplicaveis aprovados.

## Proximos passos

- Testes E2E reais com contas controladas.
- Painel de bugs vinculado aos itens.
- Onboarding guiado para criadores.
- Checklist compartilhavel entre navegadores.
- Historico de relatorios de prontidao.

# Onboarding de criadores fundadores

Pacote 41 melhora a apresentacao publica para influenciadores e criadores entrarem no EntreUS com expectativas claras.

## Paginas

- `/creators`: pagina principal de convite e onboarding.
- `/creators/apply`: formulario de interesse para entrar na lista de criadores.
- `/creator-dashboard`: CTA para criadores que ja possuem conta acompanharem metricas e monetizacao.

## O que a pagina comunica

`/creators` explica que o EntreUS e uma rede social brasileira por comunidades, criada para aproximar criadores e publico. A pagina apresenta:

- entrada cedo no beta controlado;
- destaque inicial conforme a plataforma crescer;
- participacao na construcao da plataforma;
- comunidades por nicho;
- ItaCash como credito interno;
- gorjetas e posts pagos;
- divisao de receita 85/15;
- dashboard e metricas;
- seguranca, moderacao e separacao de conteudo 18+;
- selos e status visuais.

## Modelo de criador fundador

Criador fundador e uma proposta de participacao inicial. O texto nao promete aprovacao automatica, alcance, renda ou selo automatico. A comunicacao reforca que recursos podem evoluir conforme feedback dos primeiros criadores.

## Monetizacao 85/15

A pagina explica a regra ja definida no Pacote 40:

- o pagador usa ItaCash no valor bruto;
- o criador recebe 85% liquido;
- a plataforma retem 15%;
- ItaCash e credito interno, nao cripto nem pagamento externo;
- saque automatico nao e prometido;
- repasses/saques seguem fluxo manual ou administrativo quando disponiveis e conforme regras da plataforma.

## Selos explicados

A secao de selos apresenta:

- VIP;
- VIP Premium;
- Anciao;
- Selo Comunidade;
- Criador fundador como conceito em preparacao.

O pacote nao cria logica de concessao de selo, nao altera badges e nao concede status automaticamente.

## Formulario de interesse

`/creators/apply` coleta apenas informacoes de contato e contexto do criador:

- nome;
- e-mail;
- WhatsApp ou contato opcional;
- usuario ou rede principal;
- nicho principal;
- tamanho aproximado da audiencia;
- link principal;
- interesses como gorjetas, posts pagos, conteudo 18+, comunidade fechada, Lives/Meet ou outro;
- mensagem livre.

Nao coleta documento, senha, dados bancarios, comprovantes ou dados sensiveis desnecessarios. Conteudo 18+ continua no fluxo proprio de verificacao e seguranca.

## Limitacoes atuais

- A pagina e de comunicacao e UX, nao de banco ou pagamento.
- Nao cria migration.
- Nao cria payout nem saque automatico.
- Nao muda Mercado Pago, Pix, webhook, RPCs, R2, LiveKit, Meet ou upload de video.
- O formulario reaproveita `POST /api/creator-interest` e o schema existente.

## Proximos passos

- Painel admin financeiro.
- Solicitacao de saque manual.
- Personalizacao visual no feed.
- Melhoria do composer para criadores.
- Destaque dedicado para criador fundador.
- Videos de onboarding ItaCash.

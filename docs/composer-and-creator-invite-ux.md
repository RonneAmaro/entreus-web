# Composer e convite de criadores

Este pacote melhora a experiencia de publicacao e a pagina publica `/convite` sem alterar regras financeiras, RPCs, migrations, webhooks, upload de video, R2 ou seguranca 18+.

## Composer

O `PostComposer` foi reorganizado em duas camadas:

- Fluxo essencial sempre visivel: texto, comunidade, adicionar midia, emoji e publicar.
- Opcoes avancadas recolhidas: categoria legada, visibilidade, classificacao sensivel/18+, post pago, preco em ItaCash, limites de video por tier e assistencia de IA.

Os defaults seguros permanecem:

- comunidade inicial: `general`;
- classificacao inicial: `safe`;
- post pago desligado;
- preco vazio.

Ao desligar post pago, o preco digitado e limpo para evitar reaproveitamento acidental. A validacao de preco continua usando `validatePaidPostPrice`, portanto o preco so e exigido quando post pago esta ativo.

## Seguranca 18+

As regras existentes foram mantidas:

- comunidade `adult_18plus` exige conta elegivel;
- classificacao adulta continua forçando comunidade e classificacao coerentes;
- usuario sem verificacao 18+ aprovada recebe bloqueio de UI;
- `normalizePostClassification` continua protegendo o envio.

## Convite de criadores

A pagina `/convite` agora fala diretamente com criadores:

- cabecalho "EntreUS para Criadores";
- chamada para criadores fundadores;
- explicacao simples da rede por comunidades;
- blocos sobre gorjetas, posts pagos, dashboard e assinaturas futuras;
- secao dedicada a ItaCash;
- secao de selos e destaque;
- secao de seguranca, comunidades, conteudo 18+, moderacao e denuncias;
- CTAs para `/creators/apply`, `/signup`, `/itacash`, `/selos`, `/terms` e `/privacy`.

## Monetizacao e ItaCash

Os textos explicam que:

- ItaCash e credito interno da EntreUS;
- usuarios podem apoiar criadores com gorjetas e desbloqueio de posts pagos;
- criadores acompanham recebimentos no dashboard/carteira quando os registros estao disponiveis;
- saques e repasses na fase inicial passam por fluxo manual e revisao administrativa;
- assinaturas ainda estao em preparacao.

Nenhum fluxo financeiro real foi alterado.

## Limitacoes

- A pagina de convite nao concede selo automaticamente.
- O selo visual dedicado de criador fundador foi descrito como preparacao quando ainda nao estiver aplicado.
- A pagina nao cria saque, transacao, assinatura ou regra financeira nova.
- O smoke autenticado do composer continua limitado por ausencia de fixture de usuario.

## Proximos passos

- Personalizacao visual no feed/avatar.
- Cores de paises/Copa.
- Onboarding guiado para criadores.
- Tutorial em video do ItaCash.
- Pagina financeira/admin de entradas e saidas.

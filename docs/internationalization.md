# Internacionalização global

## Escopo atual

O núcleo global suporta `pt-BR`, `en`, `es`, `fr`, `id`, `ko`, `ja` e `zh-CN`. A interface e o conteúdo publicado
são conceitos separados: trocar o idioma da plataforma nunca reescreve posts,
comentários ou mensagens.

A cobertura revisada neste pacote inclui resolução inicial, Feed/Home, compositor,
comunidades e filtros, cartões e ações de posts, comentários encadeados, painel
lateral do Feed, Hub, navegação, Configurações, login, cadastro, páginas principais
do Lab e Meet, shells de carregamento, erros globais e o fluxo de tradução de
publicações. O conteúdo escrito por usuários não entra nos catálogos.

Perfil, salvos e telas secundárias ainda aproveitam parcialmente o catálogo legado
com fallback técnico para inglês nos idiomas não portugueses. Ferramentas internas de `app/lab/*`, sala completa de
`app/meet/[roomName]`, mensagens, notificações, e-mails e áreas administrativas
ainda possuem textos não migrados.

## Organização

- `lib/i18n/config.ts`: idiomas, normalização, cookie e fallback;
- `lib/i18n/catalogs/`: um catálogo revisado por idioma;
- `lib/i18n/index.ts`: tradução tipada e helpers `Intl`;
- `lib/i18n/countries.ts`: países ISO e sugestões não vinculantes;
- `lib/i18n/content-language.ts`: detecção conservadora do conteúdo;
- `LanguageProvider`: consumo em Client Components e compatibilidade temporária
  com `lib/translations.ts`;
- `app/layout.tsx`: resolução server-side sem prefixo na URL.

Para adicionar um idioma, inclua o código em `SUPPORTED_LOCALES`, crie um catálogo
que satisfaça `Record<TranslationKey, string>`, registre-o em `lib/i18n/index.ts` e
adicione a opção visual. O TypeScript acusa chaves ausentes. Em desenvolvimento,
chaves legadas ausentes são registradas e exibidas de forma destacada; em produção,
chaves cruas não são mostradas.

Os domínios prioritários usam os prefixos `feed`, `composer`, `post`,
`communities`, `lab`, `meet`, `navigation`/`nav` e `common`. O catálogo local
histórico do Feed não participa mais da renderização; ele permanece no arquivo
apenas até a limpeza mecânica do suporte aos idiomas legados.

## Resolução e persistência

A ordem inicial é:

1. cookie explícito `entreus-locale`;
2. `Accept-Language` na primeira visita;
3. fallback `pt-BR`.

O valor resolvido define `<html lang>` e o estado inicial do provider, evitando
hidratação em outro idioma. Visitantes persistem por cookie. Usuários autenticados
também tentam persistir `profiles.interface_locale`; `profiles.country_code` é
separado. O provider sincroniza o perfil depois de encontrar a sessão do Supabase.

A escolha local é aplicada antes da chamada remota. Falha de rede, indisponibilidade
da API ou migration ausente não desfaz cookie, `localStorage`, `<html lang>` nem o
estado do provider. Nesses casos, `entreus-locale-sync-pending` impede que o perfil
antigo sobrescreva a preferência no reload e a interface informa que a escolha está
somente no dispositivo. Apenas locale inválido ou falha de armazenamento local
impede a troca.

Como a autenticação atual do browser não fornece sessão Supabase ao Server Component,
um dispositivo novo usa cookie/navegador no primeiro carregamento e sincroniza o
perfil após autenticar. A visita seguinte já começa no idioma sincronizado.

Não há prefixos de idioma nas URLs, preservando links existentes.

## Datas, números e moedas

`formatDateTime`, `formatNumber` e `formatCurrency` centralizam `Intl`. A moeda
continua sendo informada pela regra de negócio; o idioma controla apenas a
apresentação. Chamadas legadas diretas a `toLocaleString` ainda serão migradas
gradualmente.

## Tradução de conteúdo

O botão aparece quando a detecção conservadora não identifica o conteúdo como o
mesmo idioma da interface. Textos curtos ou ambíguos continuam oferecendo tradução.
Ao clicar:

1. o browser envia somente tipo, ID e idioma de destino;
2. `/api/translate` autentica o usuário;
3. o backend lê o conteúdo sob a RLS existente;
4. valida tamanho, aplica limite de rajada e timeout;
5. envia o texto ao provedor intermediário já adotado;
6. retorna uma tradução transitória.

O original nunca é alterado ou salvo como texto do autor. Traduções são reutilizadas
somente em memória, por usuário/conteúdo/idioma, e “Ver original” remove a tradução
da tela. Comentários já são aceitos pelo backend, mas a UI de comentários ainda não
expõe o botão. Mensagens privadas e legendas não foram habilitadas.

## Rollout e rollback

Aplicar `20260719_add_profile_locale_and_country.sql` depois das migrations
anteriores. Em 19/07/2026, a consulta somente leitura ao projeto configurado retornou
HTTP 400 para `interface_locale,country_code`, confirmando que as colunas ainda não
estavam disponíveis. Por isso a migration pendente foi ampliada diretamente para os
oito locales.

`20260719_expand_profile_locale_constraint.sql` cobre separadamente ambientes que
tenham registrado a versão anterior como aplicada. Ela verifica a existência da
coluna, não cria permissões e recria apenas a constraint de locales. Para rollback
do schema, remover primeiro os usos no frontend e só então as constraints/colunas;
não há transformação de conteúdo a desfazer.

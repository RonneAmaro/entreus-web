# Personalizacao visual no feed

Pacote 44 amplia os temas de perfil para aparecerem tambem onde outras pessoas veem o usuario: feed, cards de post, perfil publico, Meu Perfil, salvos e post individual.

## O que mudou

- O tema efetivo do autor agora aplica uma faixa superior discreta no card do post.
- O avatar do autor usa anel colorido conforme tema e tier.
- O `PostCard` aceita `authorProfileTheme` e usa fallback seguro para `default` quando o tema nao existe ou o usuario nao tem acesso.
- O feed principal, que renderiza card proprio, tambem calcula o tema efetivo do autor.
- A pagina `/vip-plus` menciona personalizacao visivel no feed como beneficio visual.

## Onde aparece

- `/feed`: avatar do autor e card de post.
- `/profile`: preview do proprio usuario, avatar e posts do perfil.
- `/u/[username]`: visitantes veem avatar, banner, card do perfil e posts com tema.
- `/saved`: posts salvos preservam o tema publico do autor.
- `/post/[id]`: link direto do post preserva o tema publico do autor.

## Avatar ring

O componente `ProfileAvatarFrame` centraliza a moldura de avatar:

- recebe `tier`, `themeKey`, `avatarUrl`, `name`, `username` ou `children`;
- aplica ring base, cor de tier e cor do tema efetivo;
- renderiza imagem quando existe;
- renderiza inicial segura quando nao existe avatar;
- aceita `children` para telas que precisam colocar botoes de editar ou ampliar a foto.

## Temas de torcida

Os temas de torcida nao usam bandeiras nem imagens oficiais. Eles usam apenas combinacoes de cores:

- `team-brazil`: verde, amarelo e azul.
- `team-argentina`: azul claro e branco.
- `team-france`: azul, branco e vermelho.
- `team-portugal`: verde e vermelho.
- `team-germany`: preto, vermelho e amarelo.
- `team-congo`: azul, amarelo e vermelho.
- `team-japan`: branco e vermelho.
- `team-usa`: azul, branco e vermelho.

## Regras de acesso

- Gratuito/comum: `default` e todos os temas `team-*`.
- VIP: `vip-blue` e `vip-neon`.
- VIP Premium: `vip-premium-fuchsia`, alem dos temas VIP.
- Anciao: `elder-gold` e `elder-royal`, alem dos demais temas.

A validacao continua em `lib/profile-themes.ts` e na rota `app/api/profile/theme/route.ts`. Se um beneficio expirar, `getEffectiveProfileTheme` retorna `default`.

## Migration

Foi criada a migration:

`supabase/migrations/20260702_add_team_profile_themes.sql`

Ela amplia a constraint `profiles_profile_theme_check` para aceitar os temas `team-*`. A migration nao foi aplicada automaticamente. Para salvar novos temas de torcida em producao, ela precisa ser aplicada manualmente no Supabase.

## Limitacoes

- Os temas de torcida sao estaticos e sem animacao.
- O feed usa apenas a cor/gradiente do tema, sem imagens de bandeira.
- Em telas que nao carregam badges permanentes do autor, a deteccao de Anciao depende dos dados ja disponiveis naquela tela.

## Proximos passos

- Adicionar mais selecoes e paletas sazonais.
- Criar efeitos animados leves para campanhas especificas.
- Oferecer loja de temas com ItaCash.
- Adicionar badges especiais de Copa.
- Medir engajamento de posts com tema no analytics sem expor dados sensiveis.

# Temas de perfil VIP e Anciao

## Objetivo

O Pacote 33 cria uma vantagem visual concreta para usuarios VIP, VIP Premium e Anciao: escolher um tema predefinido para o proprio perfil. A personalizacao e limitada a templates seguros, sem CSS livre, HTML livre, cores livres ou URLs externas.

## Temas disponiveis

- `default`: tema padrao para todos.
- `vip-blue`: tema VIP azul discreto.
- `vip-neon`: tema VIP moderno com brilho controlado.
- `vip-premium-fuchsia`: tema exclusivo para VIP Premium e Anciao.
- `elder-gold`: tema exclusivo Anciao com destaque dourado.
- `elder-royal`: tema exclusivo Anciao com visual nobre em ambar/royal.

## Regra de acesso

A regra de tier continua centralizada em `lib/user-tiers.ts`.

- Usuario comum pode usar apenas `default`.
- VIP pode usar `default`, `vip-blue` e `vip-neon`.
- VIP Premium pode usar os temas VIP e `vip-premium-fuchsia`.
- Anciao pode usar todos os temas.
- Anciao tem prioridade visual sobre VIP porque `resolveUserTier` prioriza `elder`.

## Fallback

O helper `lib/profile-themes.ts` aplica fallback automatico:

- tema desconhecido cai para `default`;
- usuario comum com tema VIP salvo cai para `default`;
- VIP que perde status cai para `default`;
- VIP tentando tema Anciao cai para `default`;
- Anciao pode manter qualquer tema.

O perfil publico tambem calcula o tema efetivo no client antes de aplicar classes visuais.

## Persistencia

Foi criada a migration:

`supabase/migrations/20260620_add_profile_theme_to_profiles.sql`

Ela adiciona `profiles.profile_theme text not null default 'default'` e cria a constraint `profiles_profile_theme_check` com os valores permitidos.

A migration nao foi aplicada automaticamente. Antes de testar persistencia real no Supabase, aplique essa migration no ambiente desejado.

## Como testar

1. Aplique a migration no Supabase.
2. Entre em `/profile`.
3. Confira a secao "Tema do perfil".
4. Tente salvar temas com usuarios de tiers diferentes.
5. Abra `/u/[username]` e confira o visual publico.
6. Remova/expire o beneficio VIP e confirme que o perfil volta visualmente para `default`.
7. Confira mobile para garantir que cards, capa e avatar continuam sem sobreposicao.

## Proximos passos

- adicionar mais templates;
- criar tema Copa/Brasil;
- permitir personalizacao controlada de capa;
- criar vitrine de criador;
- expor um detalhe discreto do tema no feed quando `profile_theme` estiver disponivel nos dados ja carregados.

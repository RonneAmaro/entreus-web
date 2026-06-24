# Segurança 18+ e moderação reforçada

## Regra central de acesso

`lib/content-access.ts` é a fonte única para classificação e acesso 18+. O acesso falha fechado: somente um usuário autenticado com `is_minor = false`, opt-in ativo (`wants_18_plus = true`) e `age_verification_status = approved` pode ver ou criar conteúdo adulto. Ausência de perfil, idade/status desconhecidos, conta menor, pendência, recusa ou consentimento parental não liberam 18+.

Posts `general/safe` continuam visíveis. Conteúdo `sensitive` não adulto preserva o overlay existente. Um post é adulto quando `community_type` ou `content_rating` é `adult_18plus`; as categorias legadas `adulto`, `sensual` e `18plus` também são tratadas como adultas.

## Superfícies protegidas

- O feed geral limita a consulta a `general/safe` e exclui categorias adultas legadas, inclusive como defesa no cliente.
- Perfil público, itens salvos e post direto aplicam os mesmos filtros antes de renderizar. Salvos só pedem mídia depois que os posts já passaram pela decisão de acesso.
- `PostCard` tem uma barreira final: se receber um post adulto sem autorização explícita, exibe apenas uma mensagem genérica, sem texto, mídia, preview de link, autor ou metadados do post.
- O compositor normaliza comunidade, rating e categoria juntos. Escolher a categoria legada 18+ promove o post a `adult_18plus`; usuários sem autorização não podem selecioná-la nem submeter o post.
- Mídia adulta nova permanece em `adult_private`, sem URL pública permanente, e é servida por URL assinada curta. A rota de signed URL exige sessão e aplica novamente a regra central.

## Banco de dados e implantação

`supabase/migrations/20260624_harden_legacy_adult_post_classification.sql` normaliza registros legados e impede combinações inconsistentes, como categoria `18plus` com `general/safe`. Ela deve ser aplicada junto da política RLS de `20260621_harden_adult_content_rls.sql`, que restringe `posts`, interações, reposts e `post_media` pelo post pai.

Não houve migração automática de objetos de storage. Mídias adultas legadas sem metadata privada continuam indisponíveis na interface; URLs públicas já distribuídas só deixam de existir após um backfill aprovado para storage privado e a retirada controlada das referências antigas. Consulte `docs/adult-media-storage-risk.md` antes de executar qualquer migração de mídia.

## Administração e moderação

- `/admin/age-verifications` exige papel administrativo e não aprova uma solicitação sem data de nascimento que confirme 18 anos ou mais.
- A rota de signed URL de documentos de idade valida a sessão admin, vincula o documento à solicitação pedida, aceita apenas caminhos privados seguros e emite URL de cinco minutos.
- `/admin/reports` e `/admin/moderation` continuam acessíveis apenas a administradores, preservando o contexto de classificação para revisão e os fluxos de ocultar, restaurar e resolver denúncias.

## Verificação

Os testes unitários em `tests/unit/content-access.test.ts` cobrem visitante anônimo, menor, consentimento parental, verificação ausente/pendente, adulto aprovado, conteúdo seguro, status desconhecido e criação de post adulto. `tests/unit/post-visibility.test.ts` também cobre o filtro de categorias adultas legadas.

Além das validações locais, faça uma verificação em staging com contas fictícias para confirmar a RLS aplicada e execute os checks agregados já documentados. Não use URLs, textos de posts, documentos ou dados reais em relatórios de validação.

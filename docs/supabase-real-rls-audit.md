# Auditoria real de RLS no Supabase

Esta auditoria compara migrations versionadas com metadados do banco realmente aplicado. O Codex não executa SQL, não usa service role e não consulta dados de usuários ou posts.

1. Abra o Supabase Dashboard e vá para **SQL Editor**.
2. Copie `supabase/sql/rls-current-policies-audit.sql` e execute-o manualmente.
3. Baixe ou copie apenas metadados: nomes de policies, `qual`, `with_check`, grants, funções e views.
4. Nunca compartilhe secrets.

O SQL lista RLS, policies reais, grants para `anon`/`authenticated`/`service_role`, funções `security definer` e views. As tabelas críticas incluem posts, mídia, comentários, salvos, reações, denúncias, notificações, perfis, verificação de idade, anexos e `storage.objects`.

Risco alto: `posts` sem RLS; `SELECT` amplo sem excluir adulto; `post_media` sem vínculo ao post pai; ou views/funções que retornam posts sem checagem. Depois, rode `npm.cmd run audit:rls:local` e compartilhe somente os metadados para uma proposta segura de migration.

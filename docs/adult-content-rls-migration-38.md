# Migration RLS 18+ — Pacote 38

Aplicação manual: revise `supabase/migrations/20260621_harden_adult_content_rls.sql`, execute no SQL Editor e então execute `supabase/sql/verify-adult-content-rls.sql`. Em caso de falha, revise `supabase/sql/rollback-20260621_harden_adult_content_rls.sql`; ele não desliga RLS.

A migration habilita RLS em posts, comentários e curtidas; limita mídia e repost ao post pai; exige `is_minor = false`, `wants_18_plus = true` e `age_verification_status = 'approved'` para adulto; e permite `is_admin()` para moderação. Teste feed, post individual, perfil, salvos, comentários, curtidas e admin com visitante, menor, não verificado e adulto aprovado.

Ela não resolve URLs de mídia pública em storage.

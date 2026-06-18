# Auditoria estendida de midias/anexos para R2

## Objetivo

O comando `npm.cmd run media:migration:extended-dry-run` executa uma auditoria somente leitura de referencias de midia e anexos que podem estar no Supabase Storage, no Cloudflare R2, em URLs externas, em arquivos locais do `public/` ou sem valor.

Ele gera o relatorio local:

```powershell
reports/media-migration-extended-dry-run.json
```

## Garantias do dry-run

- Nao altera banco.
- Nao cria migration SQL.
- Nao faz upload para R2.
- Nao apaga arquivos no Supabase Storage.
- Nao apaga objetos no R2.
- Nao imprime secrets, service role key, tokens ou signed URLs completas.

## Areas publicas auditadas

- Posts e comentarios: `posts.image_url`, `posts.video_url`, `post_media.media_url`, `comment_media.media_url`.
- Perfis: `profiles.avatar_url`, `profiles.banner_url`.
- Catalogos publicos auxiliares: `digital_gifts.media_url` e `community_challenges.banner_url`, quando existirem.

Arquivos locais como `/gifts/videos/estrela-cadente.mp4` e `/gifts/videos/parabens-confetes.mp4` sao classificados como `local-public`, nao como `unknown`.

## Areas privadas ou sensiveis

- Mensagens privadas: `message_attachments.storage_path` e `conversation_user_state.chat_background_url`.
- Meet: `meet_room_chat_messages.attachment_path`.
- Verificacao 18+: `age_verification_requests.document_front_path`, `document_back_path` e `selfie_path`.
- Consentimento parental: `parental_consent_requests.guardian_selfie_path`.
- Comprovantes de pagamento/ItaCash: `itacash_purchase_requests.proof_path` e `proof_url`, quando existirem.

Essas fontes usam exemplos mascarados no relatorio, como `supabase-storage://[redacted]`, `r2://[redacted]` ou `external-url://[redacted]`.

## Separacao obrigatoria

Midias publicas podem ser planejadas em uma migracao propria para reduzir cached egress. Arquivos 18+, verificacao de idade, consentimento parental e comprovantes nao devem ser migrados junto com midias publicas.

Qualquer migracao futura dessas areas sensiveis precisa de plano separado para privacidade, retencao, autorizacao, auditoria de acesso e signed URLs curtas.

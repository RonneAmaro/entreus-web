# Private adult media flow (39C)

New adult post uploads are presigned into `protected/adult-post-media/` and never receive a permanent public URL. The post composer saves R2 provider, bucket, key, and `adult_private` in `post_media`; its legacy `media_url` is null.

The signed download route authenticates the requester, relies on post/media RLS, checks the parent post classification and approved 18+ opt-in, then produces a short-lived R2 GET URL. The response exposes only the temporary URL, expiry, and media type.

`ProtectedPostMedia` requests that URL only for `adult_private` media. Adult media without reliable private metadata is rendered as an unavailable placeholder and its legacy URL is never used. Public media keeps its normal public URL flow.

Backfill remains a separate manual operation: copy legacy adult objects into protected storage, update metadata, verify counts with the SQL check, and only then retire legacy public references. This package does not move or delete objects and does not apply migrations.

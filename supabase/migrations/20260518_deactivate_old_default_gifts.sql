-- Deactivate legacy default gifts without deleting records or history.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

update public.digital_gifts
set
  is_active = false,
  updated_at = now()
where
  (
    slug in (
      'rosa-digital',
      'cafe-virtual',
      'coracao-entreus',
      'aplausos',
      'foguete-de-apoio',
      'trofeu-destaque',
      'diamante-premium',
      'coroa-elite'
    )
    or lower(name) in (
      'rosa digital',
      'cafe virtual',
      'coracao entreus',
      'aplausos',
      'foguete de apoio',
      'trofeu destaque',
      'diamante premium',
      'coroa elite'
    )
  )
  and (
    media_url is null
    or media_type <> 'video'
    or media_url not like '/gifts/videos/%'
  );

alter table public.conversation_user_state
  add column if not exists chat_theme_color text null,
  add column if not exists chat_background_preset text null,
  add column if not exists chat_background_url text null,
  add column if not exists chat_background_opacity numeric null;

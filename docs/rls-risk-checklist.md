# Checklist de risco RLS

- [ ] `posts` tem RLS e não possui `SELECT` amplo para `anon`.
- [ ] Contas sem verificação aprovada, menores e consentimento parental não leem adulto.
- [ ] `post_media`, comentários, salvos e reposts seguem a visibilidade do post pai.
- [ ] Notificações não exibem preview adulto a contas bloqueadas.
- [ ] Views públicas e funções `security definer` validam autorização.
- [ ] `storage.objects` não dá leitura pública à mídia adulta protegida.
- [ ] Bypass administrativo usa `is_admin()` seguro e permanece administrativo.

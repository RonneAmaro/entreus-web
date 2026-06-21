# Painel básico do criador

O painel mostra apenas os posts e analytics pertencentes ao usuário autenticado. Usa `post_analytics` quando disponível e `posts` para a lista recente; falhas de analytics retornam estado amigável sem quebrar a página.

Posts recentes mostram trecho, data e classificação, mas não renderizam mídia: isso evita expor URLs públicas, signed URLs, chaves de storage ou mídia adulta protegida. Métricas atuais são iniciais e dependem dos dados já existentes em analytics.

O painel não implementa saldo, gorjetas, ItaCash financeiro, posts pagos, assinatura ou saque. Esses recursos exigem pacote futuro específico. Testar login, ausência de posts, falha de analytics e post adulto próprio sem verificar qualquer URL de mídia.

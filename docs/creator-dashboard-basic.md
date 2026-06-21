# Painel básico do criador

O painel mostra apenas os posts e analytics pertencentes ao usuário autenticado. Usa `post_analytics` quando disponível e `posts` para a lista recente; falhas de analytics retornam estado amigável sem quebrar a página.

Posts recentes mostram trecho, data e classificação, mas não renderizam mídia: isso evita expor URLs públicas, signed URLs, chaves de storage ou mídia adulta protegida. Métricas atuais são iniciais e dependem dos dados já existentes em analytics.

O painel não implementa saldo, gorjetas, ItaCash financeiro, posts pagos, assinatura ou saque. Esses recursos exigem pacote futuro específico. Testar login, ausência de posts, falha de analytics e post adulto próprio sem verificar qualquer URL de mídia.

As métricas básicas usam posts próprios e, quando disponível, `post_analytics`. Métricas opcionais devem aparecer como zero/indisponíveis se RLS, tabela ou dados não permitirem consulta. O helper de métricas normaliza posts recentes removendo mídia e metadata de storage; posts adultos aparecem só como indicador para o dono. Próximos passos: gorjetas com ItaCash, posts pagos, assinatura, saque e analytics avançado, todos em pacotes financeiros separados.

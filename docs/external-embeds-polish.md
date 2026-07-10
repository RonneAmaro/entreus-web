# Polimento de embeds externos

O Pacote 46A melhora embeds do feed sem scraping, download, backend novo ou APIs com token.

- TikTok: URLs canonicas com `/@usuario/video/{id}` usam o player oficial `www.tiktok.com/player/v1/{id}` em um container vertical 9:16, responsivo e sem overflow. Links curtos ou sem ID seguro recebem um card com link externo.
- Instagram: posts, Reels, IGTV e Stories continuam usando o script oficial `embed.js`, agora dentro de wrapper responsivo com overflow controlado e aviso para abrir no Instagram se o player falhar.
- Facebook: formatos claramente incorporaveis continuam no plugin oficial. URLs `/share/...`, `/share/r/...` e formatos desconhecidos usam fallback externo para evitar iframes quebrados.
- YouTube: a deteccao e o player `youtube-nocookie` foram preservados.

Autoplay depende do navegador e nao e garantido. Nenhum token Meta/TikTok e usado.

## Proximos passos

- Resolver URLs curtas do TikTok em backend seguro.
- Adicionar previews OpenGraph e cache de metadados.
- Avaliar Meta oEmbed oficial com app/token.
- Adicionar botao para copiar o link original.

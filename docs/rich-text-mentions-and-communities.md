# Menções e comunidades em textos

Posts e comentários do EntreUS reconhecem menções com `@usuario` e comunidades com `#comunidade`.

## Como usar

Escreva uma menção usando `@` antes do nome público do usuário:

```text
Parabéns @fernanda pelo conteúdo.
```

O texto `@fernanda` vira link interno para:

```text
/u/fernanda
```

Escreva uma comunidade usando `#` antes do tema:

```text
Hoje tem conversa em #esporte.
```

O texto `#esporte` vira link interno para o feed filtrado:

```text
/feed?community=sports
```

Aliases amigáveis em português são normalizados para os filtros existentes quando possível. Exemplos:

- `#esporte` e `#esportes` apontam para `sports`.
- `#geopolitica` e `#geopolítica` apontam para `geopolitics`.
- `#militar` aponta para `military`.
- `#conteudo-adulto`, `#conteúdo-adulto`, `#adulto` e `#18plus` apontam para `adult_18plus`.

Hashtags sem comunidade existente ainda recebem slug seguro e apontam para `/feed?community=<slug>`, preparando o caminho para páginas agregadoras futuras.

## Onde funciona

- Textos de posts no feed.
- Textos de posts em cards reutilizados por perfil próprio, perfil público e salvos.
- Página individual do post.
- Comentários no feed.
- Comentários na página individual do post.
- Preview do post no modal de resposta do feed.

O conteúdo de post pago bloqueado continua sem renderizar o texto protegido. O renderer só roda quando o conteúdo já está liberado pela lógica existente.

## Visual

- `@usuario`: azul/ciano, semibold, com underline no hover.
- `#comunidade`: verde/esmeralda, semibold, com underline no hover.
- Links externos continuam azuis e sublinhados, como antes.
- Quebras de linha são preservadas pelas classes `whitespace-pre-wrap` já usadas nas áreas de texto.

## Segurança

O parser de `lib/rich-text-links.ts` retorna apenas tokens estruturados:

- `text`
- `mention`
- `community`

Ele não retorna HTML. O componente `app/components/RichTextLinks.tsx` renderiza texto normal como conteúdo React, menções e comunidades como `next/link`, e URLs externas como `<a>` com `rel="noopener noreferrer"`.

Não há `dangerouslySetInnerHTML`. Caracteres especiais, tags falsas e payloads simples de XSS continuam sendo tratados como texto comum e escapados pelo React. Menções dentro de e-mails e tokens dentro de URLs não são transformados.

## Próximos passos

- Autocomplete de usuários.
- Autocomplete de comunidades.
- Notificação quando alguém for mencionado.
- Página agregadora de hashtag/comunidade.
- Contador de uso de hashtags.

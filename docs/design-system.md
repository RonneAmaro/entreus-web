# Design visual do EntreUS

## Marca

`EntreUSWordmark` é a representação visual universal do nome. “Entre” herda a cor principal do contexto; “US” usa `text-blue-600` no tema claro e `dark:text-blue-400` no escuro. A marca não quebra e é anunciada como uma única palavra. Contextos técnicos, metadados, ARIA, `alt`, URLs e texto copiado mantêm `EntreUS` em texto simples.

## Tokens atuais

O produto reutiliza a escala Tailwind já adotada. Azul 600/400 representa a marca. Cores funcionais usam variantes 500 com baixa opacidade no fundo e 200 no ícone sobre o tema escuro: blue, cyan, emerald, fuchsia, indigo, red, violet e amber. Textos permanecem em white/zinc para preservar hierarquia e contraste.

O tema escuro é o padrão visual atual. O tema claro funciona com os tokens existentes, mas ainda depende de auditoria visual completa em todas as páginas.

## Cores funcionais

Accents identificam famílias de recursos sem substituir nome, ícone ou estado acessível. A configuração pertence ao item em `lib/navigation/navigation-items.ts`; componentes consumidores não devem redefinir a cor de um recurso. Itens sem accent usam azul.

As cores devem ocupar áreas pequenas: ícone, fundo suave, ring e sombra de interação. Evitar grandes superfícies saturadas, neon e texto longo colorido.

## Movimento

Microinterações permitidas são acionadas somente por abertura, hover, foco ou clique. Usar transform, opacity, cor e sombra, entre 150 e 250 ms, com deslocamentos de até 4 px e escala máxima aproximada de 1.04.

São proibidos movimento contínuo, rotação ou pulsação infinita, partículas, grandes deslocamentos, animação de layout e timers permanentes. `prefers-reduced-motion` deve remover deslocamento e escala, mantendo apenas mudanças simples de cor.

## Layout do Feed

Em desktop largo, sidebar, Feed e rail formam um conjunto equilibrado. O Feed ocupa a fração flexível e o rail usa largura responsiva limitada. O conjunto possui largura máxima para evitar linhas excessivas. Tablet e mobile permanecem em coluna única; o rail segue oculto abaixo do breakpoint desktop existente.

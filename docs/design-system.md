# Design visual do EntreUS

## Expressões

Emojis, GIFs e stickers usam o `ExpressionPicker` compartilhado e os tokens de surface, border e brand. Tabs expõem texto e `aria-selected`, alvos têm ao menos 44 px, mobile usa sheet e desktop painel. `ExpressionAttachment` limita tamanho, preserva proporção, alt, fallback e preview estático com redução de movimento. Não criar seletores específicos por tela; consulte `docs/unified-expressions.md`.

## Marca

`EntreUSWordmark` é a representação visual universal do nome. “Entre” herda a cor principal do contexto; “US” usa `text-blue-600` no tema claro e `dark:text-blue-400` no escuro. A marca não quebra e é anunciada como uma única palavra. Contextos técnicos, metadados, ARIA, `alt`, URLs e texto copiado mantêm `EntreUS` em texto simples.

O ativo oficial do símbolo é `/logo-icon.png`; o slogan oficial é “Só Entre Nós”. Símbolo e wordmark devem manter ao menos 8 px de separação, área de toque mínima de 44 px quando interativos e altura visual mínima recomendada de 20 px para o nome. Não distorcer, recolorir o símbolo, separar “Entre” de “US”, quebrar a palavra ou substituir o azul oficial.

## Tokens atuais

O produto reutiliza a escala Tailwind já adotada. Azul 600/400 representa a marca. Cores funcionais usam variantes 500 com baixa opacidade no fundo e 200 no ícone sobre o tema escuro: blue, cyan, emerald, fuchsia, indigo, red, violet e amber. Textos permanecem em white/zinc para preservar hierarquia e contraste.

| Token | Claro | Escuro | Finalidade |
| --- | --- | --- | --- |
| `background` | `#ffffff` | `#0a0a0a` | fundo da aplicação |
| `foreground` | `#171717` | `#ededed` | texto principal |
| `surface` | `#ffffff` | `#09090b` | cards, menus e modais |
| `surface-muted` | `#f4f4f5` | `#18181b` | inputs e áreas secundárias |
| `text-muted` | `#52525b` | `#a1a1aa` | texto auxiliar |
| `border` | `#e4e4e7` | `#27272a` | divisores e contornos |
| `brand` | `#2563eb` | `#3b82f6` | ações e foco |
| `brand-light` | `#60a5fa` | `#60a5fa` | wordmark e realces |
| `brand-dark` | `#134a99` | `#134a99` | identidade profunda/PWA |
| `glow` | `#22d3ee` | `#22d3ee` | brilho ciano moderado |
| `success` | `#059669` | `#34d399` | sucesso |
| `warning` | `#d97706` | `#fbbf24` | aviso |
| `danger` | `#dc2626` | `#f87171` | erro e ação destrutiva |

O tema escuro é o padrão. O claro é uma alternativa persistida e deve receber a mesma cobertura funcional.

## Tipografia

Geist Sans (`--font-geist-sans`) é a fonte principal e Geist Mono a fonte técnica. Títulos usam peso 700–900 e line-height compacto; corpo usa 400–600 e line-height entre 1.5 e 1.75; labels usam 600–800; auxiliares usam tamanho menor, mas devem manter contraste AA. Evitar tracking amplo em parágrafos.

## Superfícies e estados

Página usa `background/foreground`; cards e modais usam `surface`; inputs e skeletons usam `surface-muted`; bordas usam `border`. Overlay modal pode permanecer preto translúcido em ambos os temas. Sidebar, barra mobile e Hub devem usar variantes claras e `dark:` correspondentes.

Hover altera superfície ou opacidade; foco usa ring azul visível; active pode comprimir até 0.98; selected combina fundo, texto e atributo acessível; disabled reduz contraste sem apagar a label; loading preserva dimensões; sucesso, aviso e erro usam os tokens semânticos e nunca dependem apenas de cor.

## Cores funcionais

Accents identificam famílias de recursos sem substituir nome, ícone ou estado acessível. A configuração pertence ao item em `lib/navigation/navigation-items.ts`; componentes consumidores não devem redefinir a cor de um recurso. Itens sem accent usam azul.

As cores devem ocupar áreas pequenas: ícone, fundo suave, ring e sombra de interação. Evitar grandes superfícies saturadas, neon e texto longo colorido.

## Movimento

Microinterações permitidas são acionadas somente por abertura, hover, foco ou clique. Usar transform, opacity, cor e sombra, entre 150 e 250 ms, com deslocamentos de até 4 px e escala máxima aproximada de 1.04.

São proibidos movimento contínuo, rotação ou pulsação infinita, partículas, grandes deslocamentos, animação de layout e timers permanentes. `prefers-reduced-motion` deve remover deslocamento e escala, mantendo apenas mudanças simples de cor.

## Layout do Feed

Em desktop largo, sidebar, Feed e rail formam um conjunto equilibrado. O Feed ocupa a fração flexível e o rail usa largura responsiva limitada. O conjunto possui largura máxima para evitar linhas excessivas. Tablet e mobile permanecem em coluna única; o rail segue oculto abaixo do breakpoint desktop existente.

## Temas e validação

`next-themes` aplica `dark` ou `light` no `<html>`, armazena a escolha na chave `theme` e inicia novos usuários em `dark`, sem depender do sistema operacional. Novos componentes devem partir de tokens semânticos ou pares claro/`dark:`. Validar em 1440×900 e 390×844, teclado, zoom de 200%, redução de movimento e a suíte `theme-audit.spec.ts`.

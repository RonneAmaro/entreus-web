# Nova navegação e Hub EntreUS

## Arquitetura

O Pacote 50 substitui a apresentação duplicada da navegação anterior sem alterar URLs, regras server-side, páginas ou fluxos internos. As páginas continuam montando `AppSidebar` e `MobileNavigation` com as mesmas props; esses componentes agora são superfícies responsivas sobre uma fonte única em `lib/navigation/`.

Componentes e módulos:

- `AppSidebar`: rail compacto para desktop;
- `MobileNavigation`: barra inferior para celular e tablet estreito;
- `EntreUSHub`: dialog responsivo compartilhado;
- `useNavigationRuntime`: sessão, papel administrativo e contador existente de mensagens;
- `navigation-items.ts`: cinco ações oficiais e catálogo único do Hub;
- `navigation-types.ts`: tipos fechados para rota, categoria, ícone e audiência;
- `navigation-search.ts`: normalização, busca, permissão e estado ativo;
- `hub-usage.ts`: recentes e frequência local por usuário.

### Identidade visual da marca

Toda apresentação visual do nome da marca deve usar `EntreUSWordmark`: “Entre” herda a cor principal do contexto e “US” usa o azul oficial (`text-blue-600` no tema claro e `text-blue-400` no escuro). O componente herda tamanho, peso e alinhamento, aceita `className`, não permite quebra no meio da marca e é anunciado por tecnologias assistivas como uma única palavra: “EntreUS”.

Contextos técnicos e não visuais — URLs, rotas, identificadores, chaves, logs, APIs, metadados, clipboard, `aria-label`, `alt` e documentação — continuam usando `EntreUS` em texto simples. Menções gramaticais no conteúdo também podem permanecer texto simples quando não representam um wordmark de marca.

`MoreMenu` permanece no repositório para consumidores legados, mas deixa de fazer parte das superfícies principais. Nenhuma página ou rota foi removida.

## Ordem e comportamento responsivo

A ordem oficial, idêntica em todos os viewports, é:

1. Casa — `/feed`;
2. Mensagens — `/messages`, reutilizando o contador existente;
3. EntreUS — abre o Hub e não navega diretamente;
4. Perfil — `/profile`;
5. Postar — reutiliza `COMPOSE_ACTION_EVENT`, `getComposeHref` e o composer do Feed.

Em desktop, a navegação é um rail vertical fixo de 76 px. Em larguras abaixo de 1024 px, ela vira uma barra inferior com cinco colunas e padding de `safe-area-inset-bottom`. O botão EntreUS usa `/logo-icon.png`, a identidade já adotada no produto. Conteúdo existente continua responsável pelo espaçamento lateral e inferior já usado pelas páginas.

## Hub

O Hub usa um dialog modal amplo e centralizado no desktop e ocupa a tela disponível no celular. A organização se inspira conceitualmente em uma central moderna de aplicativos: busca dominante, atalhos em grade e listas leves, sem reproduzir elementos proprietários do Windows. Ele possui título, fechamento explícito, rolagem interna, categorias não vazias e estado sem resultado.

A primeira composição, alinhada à direita e limitada a `max-w-3xl`, foi descartada por se comportar como um drawer e competir com o rail. A revisão visual usa entre 75% e 90% da largura útil, respeita um máximo de 1280 px e mantém margens externas. Um portal no `document.body`, overlay integral e camada modal única colocam o Hub acima da sidebar e da barra inferior; a navegação de fundo permanece renderizada, mas escurecida e não interativa.

No celular, o dialog usa `100dvh`, safe areas no cabeçalho e rodapé e rolagem apenas no conteúdo central. Busca e botão de fechar permanecem fora da área rolável, reduzindo conflitos com teclado virtual e barra inferior.

Itens fixos em destaque:

- EntreUS Lab — `/lab`;
- EntreUS Meet — `/meet`.

Os fixados são atalhos compactos sem cards permanentes. “Ver todos” troca a área central, sem navegar ou fechar o Hub, por uma lista completa agrupada. A busca permanece montada no topo nos dois modos e os grupos vazios não são renderizados.

Categorias atuais:

- Destaques;
- Comunicação;
- Conteúdo e comunidades;
- Criador e monetização;
- Conta e segurança;
- Ferramentas;
- Administração.

Não existe hoje uma rota geral `/communities`; por isso nenhum link fictício foi criado. Desafios ocupa a categoria de conteúdo/comunidades, e a busca existente `/search` continua sendo o caminho para pessoas e publicações.

## Busca

A versão 1 pesquisa localmente título, descrição e palavras-chave dos itens permitidos. Ela ignora caixa e acentos, não renderiza HTML e não aceita URLs fornecidas pelo usuário. Resultados administrativos são removidos antes da busca para usuários comuns.

Busca remota de pessoas, comunidades e publicações não foi duplicada. A rota `/search` existente continua disponível e poderá receber um adaptador seguro em pacote futuro.

## Recentes e mais utilizados

O Hub registra somente IDs controlados e contagens numéricas em `entreus:hub-usage:v1:<user-id>`. Não armazena buscas, conteúdo, mensagens, tokens, segredos, URLs ou dados administrativos. O histórico recente é limitado a cinco itens e separado por usuário. Falha ou bloqueio de `localStorage` não impede a navegação.

Lab e Meet permanecem fixos independentemente do uso. A ordenação de recentes e mais utilizados é calculada quando o Hub abre, evitando movimentação durante a interação.

## Cores funcionais e microinterações

O catálogo em `navigation-items.ts` é a fonte única do `accent` de cada recurso. O renderizador compartilhado aplica o mesmo tratamento em Fixados, busca, Todos os aplicativos, recentes e mais utilizados:

- Lab: ciano; Meet e ferramentas de segurança: esmeralda;
- Mensagens e presentes: fúcsia; notificações: vermelho suave;
- Feed: azul; busca e perfil: índigo;
- Carteira, desafios e VIP: âmbar;
- Configurações, salvos e Creator Studio: violeta.

Itens sem configuração usam azul como fallback. As cores aparecem no ícone, fundo, ring e sombra de interação; títulos e descrições permanecem neutros, e texto/ícone continuam comunicando a função sem depender da cor.

Hover e foco deslocam o ícone somente alguns pixels e aplicam escala máxima de `1.04`; clique usa compressão curta. Todas as transições duram cerca de 200 ms, animam apenas transform, cor e sombra, não usam listeners ou timers e têm `motion-reduce:transform-none`. Não há animação contínua.

No Feed desktop, o conjunto principal usa grid fluido após a sidebar: Feed em `minmax(0, 1fr)`, rail em `clamp(18rem, 22vw, 24rem)` e gap responsivo. A área útil é limitada a 1600 px. Abaixo de `xl`, o comportamento existente de coluna única e rail oculto é preservado.

## Papéis, permissões e badges

O papel administrativo é consultado em `profiles.role` após `supabase.auth.getUser()` e validado com `isAdminRole`. O Hub não usa `localStorage` como fronteira de autorização. A ocultação do item Admin é apenas UX; APIs, páginas administrativas, RLS e validações server-side permanecem inalteradas.

O contador de mensagens reutiliza as tabelas e regras já usadas pela navegação anterior. Notificações continuam usando a contagem fornecida pelas páginas. Alertas administrativos continuam usando `useAdminPendingAlerts`.

Creator Studio mantém a disponibilidade autenticada que já possuía; nenhuma nova regra de habilitação foi inventada neste pacote.

## Acessibilidade

- landmarks com nome acessível;
- `aria-current="page"` para ações de rota ativas;
- `aria-expanded` e `aria-controls` no botão EntreUS;
- dialog com `aria-modal` e título associado;
- foco inicial na busca;
- contenção de Tab enquanto o Hub está aberto;
- Escape fecha o Hub;
- foco retorna ao botão EntreUS;
- foco visível e áreas de toque adequadas;
- fechamento por backdrop e botão explícito;
- animações discretas com fallback `motion-reduce`;
- estado ativo comunicado por cor, fundo e `aria-current`.

## Segurança e performance

Todas as rotas são literais controladas pelo código. Os tipos aceitam somente caminhos internos iniciados por `/`. Não há `dangerouslySetInnerHTML`, `eval`, URL arbitrária, token adicional, migration ou dependência nova.

O Hub usa Lucide, Next Image e componentes já presentes. A busca é local e imediata; consultas opcionais não bloqueiam o Feed. Apenas a superfície correspondente ao breakpoint consulta estado de navegação.

## Testes

Testes unitários cobrem ordem, rotas, destaques, IDs, URLs controladas, permissões, busca por título/descrição/palavra-chave, normalização, estado ativo, recentes, frequência, isolamento por usuário, storage indisponível e atributos acessíveis.

Os E2E usam sessão fictícia e interceptam integralmente o host Supabase, sem tocar em produção. Cobrem desktop e celular, cinco ações, Hub, busca, estado vazio, Escape, foco restaurado, Lab, viewport e cenário administrativo autorizado.

## Auditoria visual

Validado no build local automatizado:

- desktop largo (1440 × 900);
- celular grande (390 × 844);
- rail e barra inferior;
- botão central, labels, safe area e estados ativos;
- abertura, busca, rolagem e fechamento do Hub;
- teclado, Escape e retorno de foco;
- páginas Feed e Lab;
- cenário administrativo simulado.

As capturas obrigatórias da revisão visual cobrem Hub fechado e aberto, resultado de busca, todos os aplicativos, mobile aberto e mobile sem resultado. A comparação deve verificar especificamente a eliminação do painel estreito, a redução de caixas e bordas, a neutralização visual da sidebar e o melhor uso da tela.

Ainda requer conferência e aprovação visual do proprietário antes do deploy:

- notebook e tablet físicos;
- celular pequeno e teclado virtual;
- modo claro em todas as páginas consumidoras;
- zoom de 200%;
- leitor de tela real;
- páginas com conteúdo muito longo;
- Meet e Creator Studio com contas controladas reais.

## Limitações e próximos passos

- os textos legados `Search feed`, `Open lab`, `Coming next` e `My profile` permanecem como pendência visual futura do Feed e não fazem parte deste ajuste;
- não há busca remota unificada de pessoas, comunidades e posts dentro do Hub;
- não há favoritos porque a plataforma ainda não possui infraestrutura compartilhada adequada;
- Creator Studio não possui hoje um sinal separado e confiável de elegibilidade no shell;
- recentes são locais ao navegador e não sincronizam entre dispositivos;
- a navegação ainda é montada por cada página, preservando a arquitetura atual em vez de fazer uma migração global de sessão/layout.

O Pacote 51 poderá reutilizar a mesma disciplina de fonte única para o Sistema Unificado de Expressões.

## Rollback

Reverter `AppSidebar` e `MobileNavigation` para suas versões anteriores e remover `EntreUSHub`, `useNavigationRuntime` e `lib/navigation/`. Nenhuma reversão de banco, migration, dependência ou configuração é necessária. As rotas e páginas permanecem intactas durante o rollback.

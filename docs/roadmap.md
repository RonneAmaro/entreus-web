# Roadmap oficial do EntreUS

## Pacote 51 — Sistema unificado de emojis, GIFs e stickers

Implementação preparada com picker compartilhado, APIs server-side, Tenor sob feature flag, posts/comentários/mensagens/Meet, migration incremental não aplicada e testes focados. Marcar como concluído somente após suíte integral, staging e aprovação visual desktop/mobile nos dois temas.

Este documento consolida a sequência oficial de evolução do produto. Checklists, planos técnicos e guias operacionais em `docs/` continuam válidos em seus próprios contextos, mas não substituem este roadmap.

## Estado técnico atual

### Pacote 49 — Automação segura da limpeza de mídias órfãs

**Status:** Implementado e enviado ao GitHub

**Commit:** `a03a00a feat: automate profile media orphan dry runs`

Entregas concluídas:

- rota `GET /api/internal/cron/profile-media-orphan-dry-run`;
- Vercel Cron diário às `03:30 UTC`;
- execução exclusivamente em `dryRun: true`;
- lote fixo de 10;
- autenticação com `CRON_SECRET`;
- comparação com SHA-256 e `timingSafeEqual`;
- falha fechada quando a configuração é inválida;
- registro auditável das execuções;
- lock contra jobs simultâneos;
- recuperação de jobs travados após aproximadamente 30 minutos;
- RLS habilitada e nenhuma policy pública;
- permissões mínimas para `service_role`, sem `DELETE` ou `TRUNCATE`;
- logs e respostas sanitizados;
- nenhuma chamada automática a `DeleteObjectCommand`;
- nenhum uso automático de `--execute`;
- nenhuma exclusão real de objeto executada.

Validações concluídas:

- 16/16 testes focados;
- 364/364 testes unitários;
- 31/31 E2E contra build de produção local;
- build aprovado;
- lint aprovado;
- `npm audit`: 0 vulnerabilidades;
- `git diff --check` aprovado.

Pendências operacionais:

- deploy do commit na Vercel;
- confirmação do cron no painel da Vercel;
- primeira execução em produção;
- confirmação da linha de auditoria;
- confirmação de que a fila permaneceu inalterada;
- uma fila vazia não exercita HEAD contra objeto real.

## Fase — Experiência Beta 1.0

Sequência oficial:

1. Pacote 50 — Nova navegação e Hub EntreUS;
2. Pacote 51 — Sistema Unificado de Expressões;
3. Pacote 52 — Feed Premium e personalização VIP;
4. Pacote 53 — Creator Experience;
5. Pacote 54 — Beta Ready.

### Pacote 50 — Nova navegação e Hub EntreUS

O Pacote 50B consolida o design system e adiciona auditoria automática dos temas escuro e claro. Seu estado deve ser considerado concluído somente após build, unitários, E2E, audit e revisão das capturas.

**Status:** Em revisão visual

Entregue no Pacote 50:

- rail compacto no desktop e barra inferior responsiva no celular;
- ordem oficial Casa, Mensagens, EntreUS, Perfil e Postar;
- botão central com a identidade existente do EntreUS;
- Hub compartilhado com Lab e Meet em destaque;
- catálogo único de rotas, categorias, palavras-chave e permissões;
- busca local sem diferença de caixa ou acentos;
- recentes e mais utilizados em armazenamento local separado por usuário;
- filtros administrativos baseados no perfil autenticado;
- badges existentes de mensagens, notificações e pendências administrativas;
- navegação por teclado, Escape, foco controlado e atributos ARIA;
- nenhuma rota removida, migration criada ou dependência adicionada.

A revisão visual do Hub está em andamento. O Pacote 50 não deve ser marcado como concluído antes da aprovação visual do proprietário. O pacote ainda não foi enviado ao GitHub nem implantado.

Objetivo: substituir a navegação atual por uma estrutura mais enxuta, moderna, profissional, responsiva e escalável.

#### Barra principal

A barra deve possuir cinco ações padronizadas:

1. **Casa:** abre o Feed e representa a página inicial.
2. **Mensagens:** abre mensagens e chats e suporta indicador de não lidas.
3. **EntreUS:** botão central com o símbolo ou identidade visual do EntreUS; abre o Hub EntreUS.
4. **Perfil:** abre o perfil do usuário e fornece acesso às configurações pessoais.
5. **Postar:** abre o fluxo unificado de criação, respeitando permissões e tipos de publicação.

A navegação deverá funcionar em desktop, tablet e celular, incluindo áreas administrativas e de criador. A apresentação poderá variar por viewport, mas a arquitetura e as ações devem permanecer padronizadas.

#### Hub EntreUS

O botão central abre um Hub com os recursos da plataforma. `EntreUS Lab` e `EntreUS Meet` devem permanecer sempre destacados.

Os demais recursos devem ser organizados por categorias, incluindo comunidades, notificações, Creator Studio, carteira, monetização, assinaturas, segurança, configurações, administração e ferramentas atuais ou futuras. Itens administrativos aparecem somente para usuários autorizados.

#### Busca unificada

O topo do Hub deve conter uma busca preparada para localizar:

- ferramentas e páginas;
- pessoas;
- comunidades;
- publicações;
- recursos internos.

A arquitetura deverá permitir integração futura com o Assistente EntreUS.

#### Hub inteligente

O design deve permitir evolução para recursos mais acessados, acessos recentes, favoritos, atalhos personalizados e sugestões contextuais. A personalização avançada não é obrigatória neste pacote, mas a arquitetura não deve impedir sua inclusão futura.

#### Padronização

A navegação deve usar componentes reutilizáveis. Alterações no componente principal devem refletir em todas as áreas que o utilizam, evitando menus duplicados com comportamentos divergentes.

### Pacote 51 — Sistema Unificado de Expressões

**Status:** Planejado

Objetivo: criar um componente compartilhado de interação textual para comentários, respostas, mensagens privadas, chat, EntreUS Meet, publicações e Creator Studio.

Recursos planejados:

- emojis, GIFs e stickers;
- busca por palavras-chave;
- recentes e favoritos;
- suporte móvel e acessibilidade;
- estados de carregamento;
- fallback quando o provedor estiver indisponível.

GIFs e stickers devem usar uma camada interna de abstração, sem chamadas diretas a um fornecedor externo espalhadas por vários componentes. A solução deve preparar suporte futuro para stickers próprios do EntreUS, pacotes de comunidades, pacotes VIP e campanhas ou eventos sazonais.

### Pacote 52 — Feed Premium e personalização VIP

**Status:** Planejado

Escopo do Feed Premium:

- refinamento dos cards e da hierarquia visual;
- comentários, respostas e reações;
- mídia e animações discretas;
- estados vazios e carregamento;
- responsividade e consistência entre desktop e celular.

Personalização VIP:

- molduras, badges, temas e cores de destaque;
- conquistas e efeitos discretos;
- itens sazonais;
- personalização por comunidade.

Itens temporários, como bandeiras de campeonatos, deverão possuir data de início, data de encerramento, fallback e possibilidade de reutilização futura.

### Pacote 53 — Creator Experience

**Status:** Planejado

Escopo:

- perfil do criador, área pública e área exclusiva;
- assinaturas e publicações pagas;
- Creator Studio e métricas essenciais;
- monetização e gestão de conteúdo;
- moderação e onboarding;
- estados vazios e experiência do assinante.

O criador deverá compreender facilmente o que pode publicar, onde publicar, quem pode visualizar, os resultados do conteúdo, seus ganhos e as pendências que precisam de atenção.

### Pacote 54 — Beta Ready

**Status:** Planejado

Escopo:

- congelamento de funcionalidades não essenciais;
- correção de bugs;
- performance e responsividade;
- acessibilidade e segurança;
- tratamento de erros;
- revisão de textos e mensagens;
- testes e observabilidade;
- documentação operacional e plano de rollback.

Depois do Pacote 54, iniciar beta fechado com um grupo pequeno de criadores e usuários.

## Pós-beta

### Versão 1.1 — EntreUS Lab

Área permanente de ferramentas e experiências, em evolução contínua.

Requisitos futuros:

- feature flags;
- acesso gradual;
- coleta de feedback;
- identificação clara de recursos experimentais;
- desativação e rollback rápidos.

### Versão 1.2 — Assistente EntreUS

Assistente inteligente para usuários e criadores.

Funções iniciais:

- localizar recursos e áreas da plataforma;
- orientar onboarding e explicar funcionalidades;
- ajudar criadores;
- encontrar comunidades;
- auxiliar na utilização do EntreUS.

A estratégia inicial deve usar um modelo de IA existente com uma camada própria do EntreUS para identidade, contexto, ferramentas, permissões, segurança e auditoria. A primeira versão não prevê treinamento de um modelo do zero.

### Versão 1.3 — EntreUS Admin Copilot

Assistente administrativo preparado para responder o que precisa de atenção, quais moderações e notificações são prioritárias, quais jobs falharam, quais erros aumentaram, quais métricas mudaram e quais áreas exigem intervenção.

Requisitos:

- permissões server-side;
- auditoria e origem identificável dos dados;
- links para as áreas corretas;
- nenhuma exposição de segredo;
- nenhuma ação destrutiva sem confirmação;
- separação entre fatos, sugestões e ações.

## Regra oficial de priorização

Toda nova ideia deve ser classificada como:

1. essencial para o Beta 1.0;
2. melhoria pós-beta;
3. experimento do EntreUS Lab.

Uma nova ideia não deve interromper automaticamente o pacote em andamento.

Funcionalidades compartilhadas devem utilizar componentes reutilizáveis e padrões únicos. Isso inclui campos de mensagens, emojis, GIFs, stickers, navegação, busca, upload, modais, estados de carregamento e tratamento de erros.
# Pacote 52 — Feed premium e comentários encadeados

Status: implementação preparada, aguardando validação em banco descartável e matriz
E2E completa antes de marcar como concluído.

- [x] migration incremental não aplicada;
- [x] integridade, profundidade, RPCs e exclusão segura;
- [x] paginação independente e contagem transacional;
- [x] resposta com texto, emoji, GIF e sticker;
- [x] documentação e testes estruturais;
- [x] denúncia contextual e remoção moderada não destrutiva;
- [x] E2E específico simulado (8/8);
- [x] capturas desktop, tablet e mobile revisadas;
- [ ] aplicar Pacote 51 e 52 em ambiente descartável;
- [ ] repetir a suíte E2E integral após estabilizar o theme-audit/hydration;
- [ ] validar concorrência, grants, RLS e bloqueios em PostgreSQL descartável.

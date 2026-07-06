# Busca admin e atalhos de postagem

## Busca no painel admin

O `/admin` tem uma busca client-side no topo do painel, sem API e sem banco. Os cards são filtrados com `filterAdminCards`, em `lib/admin-search.ts`, usando:

- título;
- descrição;
- rota;
- palavras-chave (`keywords`).

O texto é normalizado antes da comparação, então buscas com acento ou caixa diferente continuam funcionando. Exemplos úteis:

- `financeiro` encontra Financeiro;
- `idade` encontra Verificações 18+;
- `denúncia` encontra Denúncias e Moderação;
- `beta` encontra Checklist Beta Fechado;
- `ItaCash` encontra áreas relacionadas a ItaCash;
- `saque` encontra Saques de criadores.

Quando nenhum card combina com a busca, o painel mostra: `Nenhuma área administrativa encontrada.`

## Botões Postar e +

O botão desktop `Postar`, no `AppSidebar`, agora usa o fluxo de composição:

- se já estiver no `/feed`, dispara o evento interno `entreus:compose-action` para abrir/focar o composer;
- se estiver fora do `/feed`, navega para `/feed?compose=1`.

O botão mobile `+`, no `MobileNavigation`, mantém o menu de criação e envia cada ação para o feed:

- Publicar: `/feed?compose=1`;
- Foto: `/feed?compose=photo`;
- Vídeo: `/feed?compose=video`.

Quando o usuário já está no `/feed`, o mobile chama o callback local para abrir o composer sem depender de recarregar a mesma URL.

## Parâmetros aceitos

- `/feed?compose=1`: abre o composer com intenção de texto;
- `/feed?compose=photo`: abre o composer e tenta preparar seleção de foto;
- `/feed?compose=video`: abre o composer e tenta preparar seleção de vídeo.

Valores inválidos são ignorados de forma segura.

## Seletor de arquivo

Browsers podem bloquear a abertura automática do seletor de arquivo quando a ação não vem diretamente do clique do usuário. Por isso, o composer tenta abrir o input adequado e mantém a instrução para o usuário clicar em `Adicionar mídia` caso o seletor não abra automaticamente.

## Próximos passos

- Modal global de criação independente do feed.
- Composer como drawer mobile.
- Atalhos rápidos dedicados de foto/vídeo.
- Testes E2E autenticados para o fluxo completo de postagem.

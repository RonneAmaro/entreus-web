# Busca admin e atalhos de postagem

## Busca no painel admin

O `/admin` tem uma busca client-side no topo do painel, sem API e sem banco. Os cards são filtrados com `filterAdminCards`, em `lib/admin-search.ts`, usando:

- título;
- descrição;
- rota;
- palavras-chave (`keywords`).

O texto é normalizado antes da comparação, então buscas com acento ou caixa diferente continuam funcionando. Exemplos úteis:

- `financeiro` encontra Financeiro;
- `idade` ou `verificação` encontra Verificações 18+;
- `denúncia`, `moderacao` ou `moderação` encontra Denúncias e Moderação;
- `beta` encontra Checklist Beta Fechado;
- `ItaCash` encontra áreas relacionadas a ItaCash;
- `saque` ou `repasse` encontra Saques de criadores;
- `r2` encontra Auditoria R2;
- `selo` encontra Selos de usuários;
- `segurança` encontra Checklist de segurança;
- `feedback` encontra Feedbacks e Bugs.

Quando nenhum card combina com a busca, o painel mostra: `Nenhuma área administrativa encontrada.`

No hotfix 48A, quando existe texto no campo de busca, os cards de pendências também entram no filtro e os banners gerais saem do caminho. Isso evita a impressão de que a tela não mudou quando a busca filtrou apenas a grade principal.

## Botões Postar e +

O botão desktop `Postar`, no `AppSidebar`, agora usa o fluxo de composição:

- se já estiver no `/feed`, atualiza a URL para `/feed?compose=1` sem recarregar e dispara o evento interno `entreus:compose-action` para abrir/focar o composer;
- se estiver fora do `/feed`, navega para `/feed?compose=1`.

O botão mobile `+`, no `MobileNavigation`, mantém o menu de criação e envia cada ação para o feed:

- Publicar: `/feed?compose=1`;
- Foto: `/feed?compose=photo`;
- Vídeo: `/feed?compose=video`.

Quando o usuário já está no `/feed`, o mobile atualiza a query sem recarregar e dispara o evento local. Para Foto/Vídeo, o `PostComposer` tenta abrir o seletor no mesmo gesto do clique e mantém o fallback manual.

## Parâmetros aceitos

- `/feed?compose=1`: abre o composer com intenção de texto;
- `/feed?compose=photo`: abre o composer e tenta preparar seleção de foto;
- `/feed?compose=video`: abre o composer e tenta preparar seleção de vídeo.

Valores inválidos são ignorados de forma segura.

## Seletor de arquivo

Browsers podem bloquear a abertura automática do seletor de arquivo quando a ação não vem diretamente do clique do usuário. Por isso, o composer tenta abrir o input adequado e mantém a instrução para o usuário clicar em `Adicionar mídia` caso o seletor não abra automaticamente.

O fallback exibido é: `Clique em adicionar mídia para escolher a foto/vídeo.`

## Checklist manual 48A

- `/admin`: buscar `financeiro` deve mostrar Financeiro.
- `/admin`: buscar `idade` ou `verificação` deve mostrar Verificações 18+.
- `/admin`: buscar `denúncia`, `moderacao` ou `moderação` deve mostrar Denúncias e Moderação.
- `/admin`: buscar `itacash` deve mostrar áreas ItaCash.
- `/admin`: buscar `saque` ou `repasse` deve mostrar Saques de criadores.
- `/admin`: buscar `beta`, `r2`, `selo`, `segurança` e `feedback` deve encontrar os cards correspondentes.
- `/admin`: buscar um termo inválido deve mostrar `Nenhuma área administrativa encontrada.`
- `/feed?compose=1`: deve abrir/focar o composer.
- `/feed?compose=photo`: deve abrir o composer e preparar seleção de foto.
- `/feed?compose=video`: deve abrir o composer e preparar seleção de vídeo.
- Desktop `Postar`: deve navegar/atualizar para `/feed?compose=1` e focar o composer.
- Mobile `+ > Publicar`: deve navegar/atualizar para `/feed?compose=1`.
- Mobile `+ > Foto`: deve navegar/atualizar para `/feed?compose=photo` e acionar o fluxo de mídia.
- Mobile `+ > Vídeo`: deve navegar/atualizar para `/feed?compose=video` e acionar o fluxo de mídia.

## Próximos passos

- Modal global de criação independente do feed.
- Composer como drawer mobile.
- Atalhos rápidos dedicados de foto/vídeo.
- Testes E2E autenticados para o fluxo completo de postagem.

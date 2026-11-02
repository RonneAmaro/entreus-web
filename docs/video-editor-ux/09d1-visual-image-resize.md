# Package 09D.1 — redimensionamento de imagem na prévia

Data: 18/10/2026. Diretório: `C:\Projetos\EntreUS\entreus-web`. Branch: `feature/video-editor-core-package-09b`. Continuação do [plano 09D.0](09d0-visual-editor-plan.md).

## Estado inicial e preservação

`git status --short` já continha numerosas alterações rastreadas e não rastreadas dos pacotes anteriores, inclusive `VideoEditor.tsx`, testes, documentação e `.local-backups/`. Nenhuma delas foi descartada. Antes da primeira edição, o componente foi copiado para `.local-backups/09d1-pre-edit-20261018-130602/VideoEditor.tsx`; origem e cópia tinham o mesmo SHA-256 `eac67e2ffba4d2e6afdd03715004f7cbc2f3937333c83fd968780190e951b58f`.

A alça de canto já era desenhada no canvas, mas `handlePointerDown` tratava qualquer ponto da imagem como início de movimento. `ImageOverlay` já guardava `x/y/width/height/rotation`; a prévia já usava esses valores e o FFmpeg já aplicava `scale` e `overlay` para PNG/JPEG. O histórico visual não incluía geometria de imagem. `handleLoadedMetadata` alterava `canvasSize` ao carregar qualquer clipe, inclusive um segundo vídeo vertical.

## Implementação

- `app/components/VideoEditor.tsx`: a alça da imagem ativa, sem rotação, inicia um gesto de redimensionamento separado do arraste. O alvo de toque e a alça visual são dimensionados em relação ao retângulo CSS real do canvas. Um único `pointerId` controla o gesto; captura, soltura, cancelamento e perda da captura encerram o estado. Cancelamento restaura a geometria inicial. Clique fora limpa a seleção; arraste normal permanece disponível.
- `lib/video-editor/overlay-geometry.ts`: cálculo puro ancora o canto superior esquerdo, preserva a proporção e limita a imagem ao quadro lógico, com largura mínima de 32 unidades quando houver espaço. O início do gesto reproduz exatamente a geometria anterior, sem salto. Os estados `ImageOverlay.x/y/width/height` continuam sendo a única fonte dos parâmetros de prévia e exportação.
- A importação ajusta uma imagem vertical grande ao quadro antes de centralizar. O controle de largura existente também limita a altura pelo aspecto. Ao trocar para outro clipe de vídeo, sua dimensão intrínseca deixa de redefinir o canvas do projeto; o vídeo usa `object-contain` na prévia e a sequência FFmpeg usa `scale`/`pad` no mesmo quadro.
- O histórico existente guarda apenas as transformações de imagens por ID, junto dos demais estados visuais. Durante o gesto, ignora atualizações intermediárias; soltar o ponteiro grava uma entrada para desfazer/refazer. Não serializa `File` nem `blob:` URL. A duração da camada e o playhead não são alterados pelo resize.
- O teste temporal revelou uma falha anterior: para um vídeo sem áudio, o grafo principal referenciava `[0:a]`, falhava e o fallback retirava `enable` da imagem. Agora imagens com entrada/saída parciais só usam tentativas que preservam o filtro temporal; o fallback final mantém `enable`. Isso evita exportar a imagem fora da duração escolhida.

Não houve troca de codec, de FFmpeg, de timeline ou de arquitetura de distribuição.

## Coordenadas e paridade

`getCanvasPoint` converte a posição do ponteiro do retângulo CSS atual para as dimensões intrínsecas do canvas. O gesto guarda ponto e geometria iniciais nesse espaço lógico. Assim, mudar viewport ou painéis não altera `ImageOverlay`. A posição da imagem inclui as áreas pretas de enquadramento: o vídeo base é contido na prévia e clipes de proporção diferente são normalizados por `scale`/`pad` na exportação. O teste com segundo clipe 90×160 verificou que o canvas 160×90 e a caixa da imagem permaneceram estáveis após o seek. Não se mediu pixel a pixel uma exportação de sequência mista neste pacote.

O E2E de MP4 usou vídeo WebM sintético curto em 160×90 e PNG verde 40×20. Após arrastar a alça, mediu a caixa dos pixels verdes no canvas e em três quadros decodificados do MP4. A imagem foi limitada a 0,3–1,0 s: não apareceu em 0,1 s nem em 1,2 s; apareceu em 0,6 s. Para `x`, `y`, largura e altura, cada diferença entre prévia e quadro intermediário ficou dentro da tolerância de **3 pixels**, que cobre arredondamento do canvas e compressão H.264. O teste verificou também as dimensões 160×90 do MP4. A fixture serviu Worker/core ESM e WASM apenas por interceptação local do Playwright, a partir dos artefatos auditados em TEMP.

## Validação

| Verificação | Resultado |
| --- | --- |
| Unitários: geometria e timeline (`vitest`) | 10/10 passaram em 2 arquivos. |
| E2E 09D.1 | 4/4 passaram: mouse, JPEG como segunda imagem, troca de tamanho da prévia, seleção/arraste e undo/redo; toque via CDP com cancelamento; clipe vertical; MP4 curto com geometria e tempo. Resultado final isolado em `%TEMP%/entreus-09d1-complete-20261018-133301/`. |
| Regressões E2E 09C.1/09C.3 | 6/7 passaram. A falha restante é uma expectativa histórica de altura do cabeçalho 48–56 px; a interface atual mede 40 px e teste posterior 09C.4 aceita 36–44 px. Nenhum arquivo desse teste foi alterado. Resultado em `%TEMP%/entreus-09d1-regression-20261018-131547/`. |
| TypeScript completo e lint focado | Passaram. |
| `git diff --check` | Passou; avisos existentes de futura conversão LF/CRLF não são erros de whitespace. |
| Build Next.js completo com `NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG=0` | Passou: compilação, TypeScript, geração de 89 páginas e finalização. |

O primeiro build após os testes encontrou `.next/dev/types/routes.d.ts` gerado com texto duplicado inválido. A cópia foi preservada em `%TEMP%/entreus-09d1-generated-types-20261018-133557/`. Em seguida, a pasta gerada `.next/dev/types/` foi preservada em `%TEMP%/entreus-09d1-dev-types-20261018-133753/`; o build de produção, sem esses tipos de desenvolvimento corrompidos, terminou integralmente. Nenhum arquivo fonte ou teste antigo foi removido para resolver isso.

## Limites e segurança

Rotação de imagem/sticker continua sem equivalência no MP4 e não entrou no cenário de aceite; por isso a alça desta entrega aparece apenas com rotação zero. WebP continua somente na prévia. O teste automatizado exercitou JPEG na interação, mas a comparação pixel a pixel do MP4 foi feita com PNG. O toque foi exercitado por eventos reais do Chromium via CDP, não em aparelho físico. O histórico restaura transformações de imagens existentes; não restaura um arquivo de imagem removido, cuja `blob:` URL é revogada. Não há persistência após recarregar a página.

O core `@ffmpeg/core@0.12.10` permanece somente em TEMP/fixture local. Nenhum WASM foi copiado para `public/` ou preparado para distribuição. A [auditoria 09C.6.11](09c611-ffmpeg-provenance-audit.md) continua bloqueando publicação até a conformidade de fonte/licença ser resolvida. Não houve instalação, API paga, compra, commit, push, merge ou deploy. Próxima melhoria possível, sujeita a novo escopo: rotação com paridade entre prévia e MP4; este pacote para aqui.

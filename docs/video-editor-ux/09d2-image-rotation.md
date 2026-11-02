# Package 09D.2 — rotação visual de PNG/JPEG com paridade no MP4

Data: 18/10/2026. Diretório: `C:\Projetos\EntreUS\entreus-web`. Branch: `feature/video-editor-core-package-09b`. Continuação do [09D.0](09d0-visual-editor-plan.md) e [09D.1](09d1-visual-image-resize.md). O `git status --short` inicial já continha numerosas alterações rastreadas e arquivos novos de trabalhos anteriores; nenhuma foi descartada. O estado final mantém essas alterações e acrescenta apenas os arquivos deste pacote. Não houve commit, push, merge, deploy, instalação de dependências, serviço pago ou distribuição GPL.

## Preservação e arquivos

Antes da edição, os quatro arquivos existentes foram copiados para `.local-backups/09d2-pre-edit-20261018-164921/`, com hash SHA-256 idêntico entre origem e cópia:

| Arquivo | SHA-256 |
| --- | --- |
| `app/components/VideoEditor.tsx` | `5D6641AD0CFBF917888A588B79BB834997D25CED289157C0881D100E8E970760` |
| `lib/video-editor/overlay-geometry.ts` | `09B2A60BC63BA8611CF4F699986A9289C40121941F3EDC929E71967ABDD5FCB3` |
| `tests/unit/video-editor-overlay-geometry.test.ts` | `EA2CEAD16823A7B3161ACC0C55D5D80BFF2DB11FA9BEA14098B81D7E8287F859` |
| `tests/e2e/video-editor-09c1-timeline.spec.ts` | `D7E58E322F1EC93C95F635D54B859E8A8125C6E817877C26E89C5B1B64A38E92` |

Arquivos editados: os quatro acima. Arquivos novos: `tests/e2e/video-editor-09d2.spec.ts` e este relatório. `VideoEditor.tsx` já estava modificado antes do pacote e permaneceu assim; não se deve interpretar seu diff total contra HEAD como trabalho apenas do 09D.2.

## Geometria e interação

`ImageOverlay` já tinha `x/y/width/height/rotation/startTime/endTime`; estes campos continuam sendo a fonte única da transformação. `x/y` são o canto superior esquerdo da imagem sem giro e o pivô é `(x + width/2, y + height/2)` em pixels lógicos do canvas. A interface guarda graus normalizados em `(-180, 180]`; somente o grafo FFmpeg os converte para radianos. Imagens sem um ângulo válido usam 0° ao restaurar snapshots antigos. O caminho de exportação de 0° conserva o mesmo `scale`/`overlay` e arredondamento do 09D.1.

`overlay-geometry.ts` agora oferece conversão de ponto local/mundo, teste de acerto no retângulo girado, centro, caixa delimitadora, normalização do ângulo e redimensionamento proporcional de imagem girada. O redimensionamento mantém parado o canto oposto **já rotacionado**. A expansão máxima considera as dimensões da bounding box; uma imagem posicionada junto à borda pode ser cortada pelo quadro, tanto na prévia quanto no MP4. O canvas do projeto não muda ao trocar para clipe vertical ou ao alterar o tamanho CSS da prévia.

A imagem selecionada mostra uma alça circular acima da borda e a alça quadrada de redimensionamento em seu canto local inferior direito, ambas acompanhando o giro. O gesto usa `pointerdown/move/up/cancel`, captura um único ponteiro e limpa referências na liberação, perda de captura ou desmontagem. O cancelamento restaura o ângulo inicial. A seleção agora testa a forma girada; o giro não inicia arraste nem resize. O slider de imagem foi ampliado para ±180° e acompanha a alça; o slider de sticker permanece em ±45°. No layout desktop, a barra flutuante da imagem fica oculta porque cobria a alça girada; os controles continuam no painel de propriedades. A barra móvel continua disponível no layout menor.

O histórico visual registra `rotation` junto de `x/y/width/height`. Um gesto contínuo só grava a transformação ao soltar o ponteiro; desfazer/refazer restauram o ângulo. Resize e arraste após o giro usam a mesma geometria. A duração dos clipes não é alterada.

## Exportação

Os três caminhos de composição de imagens sobre vídeo e sequência usam agora o mesmo construtor de filtros. Para ângulo não zero, ele aplica `scale`, `format=rgba`, `rotate=<radianos>:ow=<largura expandida>:oh=<altura expandida>:c=none` e depois `overlay` no centro lógico original. A caixa expandida é calculada de `|w cos θ| + |h sin θ|` e `|w sin θ| + |h cos θ|`, com margem transparente de dois pixels para a interpolação; o deslocamento da caixa é arredondado uma vez. O [manual oficial do filtro rotate](https://ffmpeg.org/ffmpeg-filters.html#rotate) confirma radianos, sentido horário e `c=none`. A transparência foi verificada no MP4 JPEG a −45°. O `enable='between(t,início,fim)'` existente continua no `overlay`, inclusive no fallback para vídeo de entrada sem áudio; os ensaios confirmaram ausência antes e depois da janela.

Não houve mudança de codec, infraestrutura FFmpeg ou ordem de camadas. Rotação de sticker e WebP continuam com as limitações anteriores; os avisos agora distinguem a rotação de PNG/JPEG, que é exportada.

## Validação

| Verificação | Resultado |
| --- | --- |
| Unitários de geometria e timeline | 13/13 passaram. Cobrem centro, conversão local/mundo, hit test, caixa, ângulos e âncora do resize. |
| E2E conjunto: 09C.1, 09C.3, 09C.4, 09D.1 e primeira versão de 09D.2 | 20/20 passaram. |
| E2E final de 09D.2 após acrescentar JPEG | 5/5 passaram: mouse, toque/CDP e cancelamento, undo/redo, resize e arraste após giro, ângulos 0/45/90/180/−45, PNG 90° e JPEG −45° em MP4 real. Resultado isolado em `%TEMP%/entreus-09d2-20261018-165253/results/`. |
| Comparação prévia/MP4 | Vídeos 160×90, marcadores vermelho/verde assimétricos: centros dos dois marcadores dentro de **3 px** da prévia no quadro de 0,6 s; sentido do giro correto. Marcadores ausentes em 0,1 e 1,2 s, com intervalo 0,3–1,0 s. O JPEG −45° foi posicionado junto à borda direita e manteve o azul do vídeo de fundo num canto da caixa expandida. |
| TypeScript completo, lint focado e `git diff --check` | Passaram. `git diff --check` emitiu apenas avisos preexistentes de futura conversão LF/CRLF. |
| Build Next.js com `NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG=0` | Passou: compilação, TypeScript, 89 páginas e finalização. |
| Artefatos GPL | Nenhum `ffmpeg-core.js`, `ffmpeg-core.wasm` ou outro WASM encontrado em `public/`, `.next/static/` ou `.next/server/`. |

O teste histórico de `09c1-timeline.spec.ts` exigia 48–56 px. O componente usa `xl:h-10` (40 px), medido novamente pela suíte 09C.4. Somente aquela expectativa foi ajustada para 36–44 px; largura e alinhamento do cabeçalho e as demais asserções da timeline foram preservados. A regressão passou.

Após uma sessão `next dev`, `.next/dev/types/routes.d.ts` e `validator.ts` foram encontrados com trechos duplicados. Não havia processo Next ativo nem listener na porta 3100. A pasta gerada foi preservada em `%TEMP%/entreus-09d2-dev-types-corrupt-20261018-171327/types/`, com `hashes.json`; hashes dos dois arquivos: `F23FA0786FB623092E19515825D3A56C6CDB1ABD5B8E28F0023A70D798E9E044` e `B11025F7045BAB184AC98820BD5855A01CACA7AE5BDE3B6DBC8958470FA932A3`. A última sessão de desenvolvimento reproduziu o problema; os novos originais e hashes foram preservados em `%TEMP%/entreus-09d2-dev-types-corrupt-final-20261018-171659/` (`routes.d.ts`: `17EE51E8E0160E33BC65B5194832646888F767AEB7AB7830428075538D890C8C`; `validator.ts`: `1E2542DD5F8974FB8ECC05281DFAACEE0A71075E5293E15E1D0C7349ECDDAD29`). O comando oficial [`next typegen`](https://nextjs.org/docs/app/api-reference/cli/next#next-typegen-options) regenerou os tipos de rotas de produção e `tsc --noEmit` passou. Nenhum arquivo fonte foi apagado ou alterado para contornar o erro; toda a pasta `.next` foi preservada.

## Limites e próxima etapa

O toque foi exercitado por eventos reais do Chromium via CDP, sem aparelho físico. A comparação do MP4 usa dois ângulos e vídeos curtos; os cinco ângulos foram verificados na prévia. Não há persistência durável de projeto nem ordem livre de camadas. Fora do quadro, a imagem é cortada pela borda do projeto. O FFmpeg GPL auditado permanece apenas na fixture em TEMP para testes locais; a decisão de distribuição pública continua sujeita à [auditoria 09C.6.11](09c611-ffmpeg-provenance-audit.md). Uma próxima etapa possível é o pacote 09D.3 de ordem de camadas, mediante escopo próprio. Este pacote termina aqui.

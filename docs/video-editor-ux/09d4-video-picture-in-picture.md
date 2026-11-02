# Package 09D.4 — vídeo sobreposto e Picture-in-Picture

Data: 19/10/2026. Diretório: `C:\Projetos\EntreUS\entreus-web`. Branch: `feature/video-editor-core-package-09b`.

## Estado inicial, backup e isolamento

Antes de editar, foram conferidos diretório, branch e `git status --short`; os relatórios 09D.3 e 09D.2 e a documentação de Client Components da versão instalada do Next.js (`node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`) foram lidos. A árvore já continha muitas alterações rastreadas e arquivos não rastreados de trabalhos anteriores. Nenhuma alteração preexistente foi descartada. O arquivo diretamente alterado que já existia recebeu backup em `.local-backups/09d4-pre-edit-20261019-111855/app/components/VideoEditor.tsx`; SHA-256 da origem e da cópia antes das edições: `A3554CE020DC3A26C8BBC3F1FAA0BA208FD1B8E6F36487AE4E5A562B3056DA65`.

Arquivos deste pacote: `app/components/VideoEditor.tsx` (já modificado antes do pacote), `lib/video-editor/video-overlay.ts`, `tests/unit/video-editor-video-overlay.test.ts`, `tests/e2e/video-editor-09d4.spec.ts` e este relatório. O runner de Playwright também atualizou `test-results/.last-run.json`, que já estava modificado no estado inicial. O diff integral de `VideoEditor.tsx` contra `HEAD` inclui pacotes anteriores; o backup permite isolar a edição 09D.4.

## Diagnóstico da arquitetura

`extraVideos` e `timelineClips` representavam clipes sequenciais na faixa principal, sem um segundo vídeo simultâneo. Imagens, figurinhas e textos eram camadas temporizadas acima do vídeo. A prévia usava um `<video>` para o clipe principal, um canvas transparente para as camadas e tempo global em `currentTime`; o MP4 era produzido pelo FFmpeg do Studio. O histórico visual guardava snapshots de geometria e estilo. Não havia documento persistido de projeto com schema de camadas para migrar: mídia e composição são mantidas na sessão do editor. O projeto/nome e o layout têm mecanismos locais separados, mas não restauram uma composição de vídeo após recarregar a página.

A implementação acrescenta uma faixa `videoOverlays` independente da sequência. Ela conserva as ações de trim, split e reordenação do vídeo principal. Cada PiP tem `id`, arquivo, URL local, posição, dimensões, rotação, início/fim na timeline e início/fim no arquivo de origem. O limite atual é de três PiPs de até 30 MB cada, além do vídeo principal. A ordem de inserção define a composição entre PiPs: o último fica acima dos anteriores. Na prévia o vídeo principal usa camada 10, os PiPs 11 e o canvas de imagens/figurinhas/textos 40. O hit test percorre PiPs na ordem inversa. O FFmpeg compõe os PiPs na ordem de inserção antes das imagens, figurinhas e textos.

## Edição visual e timeline

O usuário importa um segundo vídeo pelo painel de mídia e o vê em uma faixa própria quando a timeline é expandida. Arrastar o corpo da faixa move o intervalo; as bordas ajustam entrada e saída. Mover conserva `trimStart/trimEnd`; ajustar uma borda altera o corte no arquivo de origem. O painel contextual oferece largura, ângulo, entrada, saída e remoção. Remover um PiP libera só sua URL e mantém as demais mídias.

O canvas de interação reaproveita a geometria do 09D.2: hit test rotacionado, alça inferior direita, alça circular, transformação em torno do centro e resize proporcional com limites. Mouse e toque usam Pointer Events e captura do ponteiro. O contorno e as alças azul claras identificam apenas o PiP selecionado. Arrastar, redimensionar e girar atualizam a prévia; `pointercancel` restaura o estado anterior. Um gesto concluído cria uma entrada de undo/redo. Snapshots agora incluem geometria e tempos do PiP. A seleção por clique/toque no próprio vídeo foi verificada após limpar a seleção. Textos, imagens e figurinhas preservam seus caminhos anteriores.

## Reprodução e sincronização

Cada PiP mantém seu `<video>` montado, mudo e posicionado em percentuais derivados do canvas lógico; isso mantém a geometria quando a prévia ou os painéis mudam de tamanho. Fora da janela `[startTime,endTime)` ele fica oculto e pausado. Dentro dela, `videoOverlaySourceTime` mapeia o playhead para `trimStart + tempoGlobal - startTime`. Seek, play e pause do principal atualizam o PiP; a prévia corrige uma diferença acima de 180 ms durante reprodução e acima de 30 ms em pausa. O áudio do PiP não toca duas vezes.

No Chromium da fixture, três amostras consecutivas em reprodução deram diferença entre os relógios de 129,708, 129,712 e 129,712 ms, sem crescimento entre elas. Esse é um ensaio curto de aproximadamente 0,18 s, não uma garantia de sincronismo para vídeos longos ou navegadores diferentes. O E2E verificou seek, pausa, retomada, início tardio e fim antecipado. O valor exato das amostras está em `%TEMP%/entreus-09d4-final5-e2e-20261019/.../09d4-preview-sync.json`.

## MP4 e áudio

Todos os caminhos de renderização de vídeo recebem os PiPs como entradas FFmpeg: vídeo simples, vídeo com fotos sequenciais e sequência avançada. A entrada superior usa `trim`, `setpts`, `scale`, `format=rgba`, `rotate` com `c=none` quando há giro e `overlay` com `eof_action=pass:repeatlast=0`. A posição do retângulo expandido é calculada pelo mesmo centro da prévia. O teste real confirmou que um pixel fora do retângulo girado continua azul, sem canto preto opaco. Os índices de voz e imagens foram deslocados para incluir as entradas de vídeo sem alterar a seleção das faixas de áudio.

Os dois MP4 geométricos têm contêiner `ftyp`, amostra de vídeo `avc1`, 160 × 90 px e duração aproximada de 2,23 s. Quadros em 0,1, 0,8 e 1,8 s confirmaram ausência do PiP antes/depois e presença durante sua janela. A saída com fundo e PiP contendo áudio tem `mp4a`/`soun`; o tom de 440 Hz do vídeo principal teve potência 0,125064, enquanto o tom de 880 Hz do PiP ficou em 0,000284. Isso confirma que a exportação preservou o áudio principal e não misturou o áudio da camada superior nesse cenário. Os filtros e volumes existentes para música e voz não foram reestruturados; sua regressão anterior continuou passando. Volume e mixagem independentes para PiPs ficam fora deste pacote.

### Comparação visual medida

A fixture usa vídeo superior dividido em vermelho e verde sobre fundo azul. As coordenadas são medidas pelos centros das máscaras de cor na captura da prévia e nos quadros decodificados do MP4. O tamanho é a distância entre os dois centros, não a largura total da caixa. A tolerância automatizada é de 4 px para centros e tamanho e 8° para diferença angular; ela considera compressão H.264, rasterização do navegador e antialiasing.

| Giro | Centro ΔX / ΔY | Ângulo prévia → MP4 | Distância prévia → MP4 |
| --- | ---: | ---: | ---: |
| +45° | 0,346 / 0,004 px | 44,481° → 45,096° | 23,852 → 25,548 px |
| −45° | 1,606 / 0,787 px | −45,932° → −45,128° | 23,713 → 25,654 px |

As máscaras não são equivalentes pixel a pixel. Os dois arquivos, medições JSON e ensaio de áudio ficam exclusivamente em `%TEMP%/entreus-09d4-final5-e2e-20261019/`. Os WebM sintéticos sem áudio acionaram o fallback já existente porque o grafo primário espera `[0:a]`; o fallback produziu MP4 com tempos corretos. No ensaio com áudio original, o grafo primário produziu o MP4 com AAC.

## Verificação e regressão

| Verificação | Resultado |
| --- | --- |
| Unitários de timeline e geometria de imagem/texto/vídeo | 23/23 passaram, incluindo mapeamento temporal, cortes, valores inválidos, centro, rotação e resize proporcional. |
| E2E 09D.4 final | 5/5 passaram: mouse, toque/CDP, alças, resize após giro, seleção, undo/redo, cancelamento, reprodução, seek, duas exportações giradas e áudio. |
| Regressão 09C.1, 09C.3, 09C.4, 09D.1, 09D.2 e 09D.3 | 24/24 passaram, incluindo timeline, trim/split, layout, imagens, textos, áudio e MP4 reais. Artefatos em `%TEMP%/entreus-09d4-regression-20261019/`. |
| ESLint focado e `git diff --check` | Passaram, sem erros. O Git emitiu apenas avisos LF/CRLF nos arquivos já existentes. |
| TypeScript completo | Passou após regenerar os tipos gerados pelo Next.js. |
| Build completo com `NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG=0` | Passou: compilação, TypeScript e 89 páginas. |
| Binários GPL | Nenhum `ffmpeg-core.js`, `ffmpeg-core.wasm` ou núcleo FFmpeg em `public/`, `.next/static/` ou `.next/server/`. A fixture auditada permaneceu em `%TEMP%`. |

## Tipos gerados do Next.js

A corrupção recorrente de `.next/dev/types` reapareceu durante as sessões de `next dev`. Houve erros em `routes.d.ts` a partir da linha 204 e, em outra sessão, também em `validator.ts`. Foram preservadas cópias e hashes em `%TEMP%/entreus-09d4-dev-types-corrupt-20261019-114700/`, `%TEMP%/entreus-09d4-build-types-corrupt-20261019-120700/`, `%TEMP%/entreus-09d4-final-types-corrupt-20261019/` e `%TEMP%/entreus-09d4-final5-types-corrupt-20261019/`. A última ocorrência reproduziu os hashes já vistos no 09D.3: `routes.d.ts` = `17EE51E8E0160E33BC65B5194832646888F767AEB7AB7830428075538D890C8C`; `validator.ts` = `279BD850E6013B6ED12179AD7460946EBB45BAC0DCD0B5A03EEAA6833DB74DAA`. A segunda ocorrência teve hashes `8165F11D075B4EA437B680055D06B5921F430A36E48819C1123B1A83BA85785E` e `A312728BB1D8B3901384265DAD3A9AE74FBEB54AA4B5FF3D5CFF65EB0F8C816D`.

As cópias contêm os arquivos alterados e a lista de processos Node conhecidos. Só `routes.d.ts` e `validator.ts` gerados foram removidos, com caminhos absolutos verificados dentro de `.next/dev/types`; `next typegen` os regenerou. Não foi apagada a pasta `.next`, nem encerrado processo de outro projeto. A inspeção de cinco linhas finais antes do primeiro build era insuficiente para provar integridade; o arquivo preservado já continha texto extra, portanto não há evidência de que o build tenha causado a corrupção. A causa permanece para investigação dedicada. Após a última regeneração, TypeScript passou.

## Limites e encerramento

O PiP não tem volume próprio: é intencionalmente mudo na prévia e sua faixa de áudio não entra no MP4. A composição não é restaurada após recarregar a página, pois o Studio ainda não persiste o estado completo do projeto; não houve alteração de schema nem migração. O ensaio cobre vídeos curtos 160 × 90 e Chromium; desempenho de várias camadas ou mídias longas e diferenças entre navegadores não foram medidos. Um próximo pacote pode tratar mixagem independente e persistência do projeto, após autorização específica.

Estado final: branch autorizada mantida e alterações preexistentes preservadas. **Sem commit, push, merge, deploy, serviços pagos, binários GPL distribuídos ou modificações em projetos externos.** Nenhum trabalho do 09D.5 foi iniciado.

## Retomada após interrupção — 19/10/2026

Na retomada, foram reconfirmados o diretório e a branch acima, o estado Git e as cinco alterações do 09D.4: `VideoEditor.tsx`, `video-overlay.ts`, os testes unitários, os testes E2E e este relatório. O diff do editor contra o backup anterior ao pacote mostra a implementação de PiP; os demais quatro arquivos e os artefatos de testes anteriores já existiam. Nenhuma etapa funcional pendente foi encontrada e não foi necessário alterar o código. O trabalho anterior e as alterações de outros pacotes foram preservados.

Antes de editar este relatório, uma cópia focada dos cinco arquivos e de `test-results/.last-run.json` foi criada em `.local-backups/09d4-resume-precheck-20261019-151015/`; todos os hashes SHA-256 da origem e da cópia coincidiram (`manifest.json`).

| Verificação repetida na retomada | Resultado |
| --- | --- |
| Unitários de vídeo, timeline e geometria | 23/23 passaram. |
| TypeScript completo | `node node_modules/typescript/bin/tsc --noEmit` passou. |
| ESLint dos arquivos de código e testes do 09D.4 | Passou sem erro. `git diff --check -- app/components/VideoEditor.tsx` também passou. |
| E2E 09D.4 em Chromium com FFmpeg auditado local | 5/5 passaram com código de saída 0, incluindo mouse, toque, sincronização, janela temporal, MP4 girado em ±45° e áudio. Resultado e MP4s em `%TEMP%/entreus-09d4-resume-external-e2e-20261019/`. |
| Build de produção com `NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG=0` | Passou: compilação, TypeScript e 89 páginas. |
| Auditoria de binários | Zero arquivos `ffmpeg-core.js` ou `ffmpeg-core.wasm` em `public/` e `.next/`. |
| ESLint global (`eslint .`) | Não passou: 77 erros e 128 avisos em arquivos fora do código e dos testes do 09D.4, por exemplo páginas administrativas e scripts de migração. Não foram alterados por esta retomada; o lint focado do pacote passou. |

Uma primeira repetição dos cinco E2E mostrou todos como aprovados e gerou os artefatos, mas o runner permaneceu aberto após o último teste durante o encerramento da fixture. A execução foi interrompida e repetida com servidor local externo; esta segunda execução terminou normalmente com 5/5 e código 0. A nova medição de sincronização apresentou diferenças estáveis de 127,767–127,775 ms nas três amostras. As duas exportações geométricas produziram MP4 de aproximadamente 2,22 s com o PiP visível somente no quadro intermediário; a diferença entre centros da prévia e do MP4 permaneceu abaixo de 1,6 px e a angular abaixo de 1°. Na exportação com áudio, a potência do tom principal de 440 Hz foi 0,125064, contra 0,000284 do tom de 880 Hz do PiP.

Pendências externas ao 09D.4: o lint global do repositório, a causa da corrupção intermitente dos tipos gerados pelo Next.js já documentada acima e os limites de produto descritos em “Limites e encerramento”. O Package 09D.5 não foi iniciado.

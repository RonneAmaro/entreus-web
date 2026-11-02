# Package 09C.6.9 — ciclo de vida do FFmpeg

Data: 15/10/2026. Branch: `feature/video-editor-core-package-09b`.

## Ownership e timeout

O Studio mantém uma instância por montagem do componente. Uma exportação possui um identificador e um `AbortController`; apenas a operação atual pode atualizar estágio, progresso e resultado. O Worker saudável permanece carregado para a próxima exportação. Cancelamento, falha de carregamento e desmontagem invalidam a operação, removem listeners e descartam a instância afetada. O gravador mantém um singleton independente, com fila serial; falhas de carga ou conversão descartam somente esse singleton.

O prazo de inicialização é de 90 segundos no build comum e 10 segundos na fixture local (`NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG=1`). Ele inclui download do core e inicialização WASM. A diferença permite ensaiar o timeout sem executar um teste longo, enquanto o limite comum acomoda máquinas e conexões lentas. Não há prazo máximo fixo para a renderização. Download do core é abortado no timeout; Promises de `ffmpeg.load()` são rejeitadas por `terminate()`. URLs `blob:` criadas para o core são revogadas na falha ou no descarte da instância.

O botão **Cancelar exportação** encerra o Worker durante preparação ou codificação, fecha a etapa de exportação, mantém os clipes e permite nova tentativa. O botão não aparece durante envio ao servidor, pois essa etapa já saiu do processamento FFmpeg. Não foi adicionada interface de cancelamento ao gravador. Quando o Worker continua responsivo após erro de renderização, os arquivos do sistema virtual são removidos; no cancelamento, o encerramento descarta o sistema virtual inteiro.

## Validação local

Build Next.js de produção em `127.0.0.1:3100`, com core ESM/WASM auditado entregue somente pela fixture Playwright:

- 8/8 E2E focados: WASM indisponível, core HTTP 503, Worker sem inicialização, cancelamento durante carga e codificação, falha de codificação, navegação interna durante `exec` e falha seguida de nova conversão no gravador. Resultado final: `%TEMP%/entreus-ffmpeg-local-anPA0w`.
- 2/2 E2E reais: MP4 curto do Studio com vídeo, áudio, cortes e segunda exportação; conversão WebM→MP4 do gravador. Resultado: `%TEMP%/entreus-ffmpeg-local-DJoO7Q`.
- 4/4 regressões de timeline passaram antes da última mudança no carregador; essa mudança não altera a timeline. Resultado: `%TEMP%/entreus-ffmpeg-local-FSwE7u`.

Os contadores do teste confirmaram chamadas a `terminate()` e recriação após falhas; eles não medem devolução física da memória do WASM. A navegação interna desmonta o componente e chama `terminate()`. No fechamento da aba, o navegador também descarta seu contexto, mas a execução do efeito React antes desse descarte não é garantida.

TypeScript completo, lint dos arquivos alterados, `git diff --check` e build Next.js completo passaram. O build final foi gerado com `NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG=0`: nenhum chunk público contém o caminho da fixture, e nenhum core, WASM ou Worker de teste foi encontrado em `public/`, `.next/static` ou `.next/server`.

O núcleo `@ffmpeg/core@0.12.10` usado nos ensaios permanece em `%TEMP%`, sob a fixture. Nenhum endpoint de distribuição foi criado. A licença declarada é GPL-2.0-or-later; conformidade para eventual distribuição permanece pendente de análise separada.

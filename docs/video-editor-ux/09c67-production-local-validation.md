# Package 09C.6.7 — exportação MP4 em build de produção local

Data: 15/10/2026. Branch: `feature/video-editor-core-package-09b`.

## Escopo e método

O Next.js 16.2.10 foi compilado com `NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG=1` apenas para o teste e executado por `next start -H 127.0.0.1 -p 3100`. O carregador escolhe o Worker ESM local em produção somente quando a origem do navegador é exatamente `http://127.0.0.1:3100`; a condição anterior de desenvolvimento continua disponível. O servidor não expõe o core: GET direto em `/__entreus_ffmpeg_local/ffmpeg-core.wasm` retornou 404.

O Playwright registrou `browserContext.route` antes de abrir o Studio e respondeu às URLs de mesma origem usando arquivos auditados em `%TEMP%`. A mudança de `page.route` para `browserContext.route` foi necessária porque a importação dinâmica do core dentro do Worker falhava com `net::ERR_ABORTED` no primeiro ensaio. A fixture conferiu SHA-512 do pacote e SHA-256 dos arquivos antes de responder. O MIME do WASM foi `application/wasm`; os módulos JavaScript foram servidos como `text/javascript`. Não houve requisição ao CDN do core no teste do Studio.

Este ensaio comprova o código de cliente compilado e o fluxo real de exportação no Chromium. A entrega do core foi simulada pela interceptação de rede do Playwright, não por uma rota HTTP do Next.js nem por infraestrutura pública de produção. Cache de CDN, CSP de um ambiente implantado e compatibilidade mobile não foram comprovados. Nenhuma configuração CSP foi alterada.

## Artefatos auditados e procedência

O pacote `%TEMP%/entreus-ffmpeg-core-0.12.10-audit/core-0.12.10.tgz` corresponde ao endereço informado no metadado npm `https://registry.npmjs.org/@ffmpeg/core/-/core-0.12.10.tgz`. O metadado registra integridade SHA-512 Base64 `dzNplnn2Nxle2c2i2rrDhqcB19q9cglCkWnoMTDN9Q9l3PvdjZWd1HfSPjCNWc/p8Q3CT+Es9fWOR0UhAeYQZA==`.

| Arquivo | SHA-256 |
| --- | --- |
| `core-0.12.10.tgz` | `d00089ce82e1bdf637ddbe42e0c3d41a1ba8cf4c9e825e7fa4d0bb970e844bd4` |
| `dist/esm/ffmpeg-core.js` | `67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3` |
| `dist/esm/ffmpeg-core.wasm` | `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7` |

O Worker ESM e seus imports `worker.js`, `const.js` e `errors.js` vieram do `node_modules/@ffmpeg/ffmpeg/dist/esm` instalado, versão `0.12.15`. A fixture registrou as solicitações de `worker.js`, `ffmpeg-core.js` e `ffmpeg-core.wasm`. O carregamento do WASM e a execução são comprovados também pelo MP4 exportado.

## Medições

O teste usou o botão normal de exportação do Studio, dois clipes WebM de cores e tons distintos, trim dos dois, reordenação, divisão, fade, volume de vídeo em 50% e música WAV de 1000 Hz em 75%.

| Execução | Saída | Duração de vídeo | Duração de áudio | Tempo até download | Inicialização FFmpeg |
| --- | --- | ---: | ---: | ---: | ---: |
| Curta | `Viagem Azul.mp4`, 160×90, 47.648 bytes | 2,716009 s | 2,716729 s | 4.981 ms | não medida nesse ensaio |
| 720p | `Viagem Azul.mp4`, 1280×720, 55.733 bytes | 2,700000 s | 2,701479 s | 14.029 ms | 1.416 ms |
| Repetição curta | segundo download com mesmo nome | não reinspecionada | não reinspecionada | 1.912 ms | instância já carregada |

O contêiner contém `ftyp`; as caixas `avcC`/`avc1` e `mp4a`/`esds` indicam H.264 e AAC. O Chromium abriu o vídeo e decodificou o áudio. Amostras centrais em 0,8 s e 2,2 s confirmaram a ordem das cenas após reordenação; a amostra em 1,62 s confirmou transição visual. As amostras examinadas não eram pretas. Análise espectral mostrou o tom da primeira cena em 660 Hz, da segunda em 440 Hz e a música de 1000 Hz no início e no fim. A diferença entre durações de áudio e vídeo foi inferior a 2 ms nos dois ensaios, uma checagem básica de sincronização. Não houve inspeção de todos os quadros ou medição independente por `ffprobe`, que não estava instalado.

O computador informou cerca de 16 GB de RAM total e 4,1 GB livres antes do teste 720p. Não foi medida a memória atribuível ao Worker/WASM. Como havia pouca margem livre e outros processos Chromium ativos, 1080p não foi executado. Não foram feitos testes longos.

## Ciclo de vida e regressão

`VideoEditor` mantém a instância em `ffmpegRef` e a reutiliza quando `loaded` é verdadeiro. A segunda exportação observou `ffmpeg_already_loaded`. O código não encerra o Worker ao terminar a exportação; ele permanece disponível enquanto a página vive. Os arquivos temporários do sistema de arquivos FFmpeg são removidos nos caminhos de exportação, mas a liberação de memória do Worker após falha ou cancelamento não foi medida. Uma falha durante `ffmpeg.load` pode deixar a instância anterior sem encerramento explícito antes de uma tentativa nova; isto merece teste e correção separados antes de distribuição ampla.

Os dois E2E principais passaram no build local: exportação do Studio e conversão do gravador. O E2E de 720p e a repetição curta passaram. Os quatro testes de timeline 09C.3 passaram após o teste escolher um ponto divisível no meio da duração restante, respeitando as margens de 0,5 s e o passo de 0,05 s do slider. TypeScript, lint focado, `git diff --check` e build Next.js completo passaram.

## Licença e distribuição pendente

O [manifesto de `@ffmpeg/core@0.12.10`](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/packages/core/package.json) declara `GPL-2.0-or-later`. O [Dockerfile do projeto na tag v12.15](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/Dockerfile) usa `--enable-gpl` e vincula bibliotecas como x264, x265, libvpx, LAME, Opus, Vorbis e libass; os [scripts de compilação](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v12.15/build) estão disponíveis. O [guia jurídico do FFmpeg](https://ffmpeg.org/legal.html) explica que componentes opcionais GPL mudam o regime aplicável ao FFmpeg compilado e pede fonte correspondente e instruções de compilação na distribuição. A correspondência exata entre o arquivo npm auditado, o código-fonte da tag e os parâmetros de compilação ainda precisa ser verificada. Também faltam decisão sobre avisos, oferta de código-fonte correspondente e avaliação jurídica da integração com a plataforma; não há conclusão jurídica sobre o restante do EntreUS.

Nenhum binário do core foi copiado para `public/`, incluído no Git ou encontrado em `.next/static` ou `.next/server`. Nenhuma rota pública fornece o core. O caminho comum do carregador ainda contém fallback para UMD no unpkg em ambientes que não são o teste local; isso **não** resolve a decisão de licença nem foi usado como estratégia de distribuição neste ensaio. O build local com a flag de teste não deve ser implantado. Um build final sem essa flag foi gerado após os testes.

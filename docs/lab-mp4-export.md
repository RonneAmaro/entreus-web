# Exportacao MP4 no Lab

Este pacote melhora a compatibilidade de download no `/lab/screen-recorder` e documenta o estado do `/lab/video-editor`.

## Por que alguns navegadores gravam WebM

O Screen Recorder usa `MediaRecorder`, uma API do navegador. Cada navegador decide quais containers e codecs aceita para gravacao local. Chrome e Edge geralmente oferecem WebM com VP8/VP9/Opus; alguns ambientes tambem podem aceitar MP4 com H.264/AAC.

Renomear um arquivo WebM para `.mp4` nao cria um MP4 real. Por isso, o EntreUS agora escolhe a extensao pelo `mimeType` real usado na gravacao.

## Ordem de preferencia

O helper `lib/screen-recorder-formats.ts` tenta:

1. `video/mp4;codecs=h264,aac`
2. `video/mp4;codecs=avc1.42E01E,mp4a.40.2`
3. `video/webm;codecs=vp9,opus`
4. `video/webm;codecs=vp8,opus`
5. `video/webm`

Quando MP4 e suportado pelo `MediaRecorder`, a gravacao sai direto como MP4 real. Quando MP4 nao e suportado, o gravador mantem WebM.

## Download no Screen Recorder

O nome segue:

- MP4 real: `entreus-gravacao-tela-YYYY-MM-DD-HH-mm.mp4`
- WebM real: `entreus-gravacao-tela-YYYY-MM-DD-HH-mm.webm`

A UI mostra:

- `Baixar MP4`, quando o Blob final e `video/mp4`;
- `Baixar WebM`, quando o Blob final e WebM;
- `Exportar MP4`, quando a gravacao ficou em WebM e o navegador consegue carregar FFmpeg.wasm.

## Conversao WebM para MP4

Como o projeto ja possui FFmpeg.wasm, o Screen Recorder reaproveita o helper de video para converter WebM para MP4 real no navegador. A conversao usa H.264/AAC, `yuv420p`, `+faststart` e gera um Blob `video/mp4`.

Limitacoes:

- videos longos podem demorar;
- navegadores sem WebAssembly, Worker, File, Blob ou memoria suficiente podem falhar;
- se a conversao falhar, o WebM original continua disponivel para download;
- nenhum arquivo e enviado para API, Supabase, R2 ou servidor durante a gravacao/conversao local.

## Video Editor

O `/lab/video-editor` ja exporta MP4 real. A auditoria encontrou:

- FFmpeg.wasm carregado em `app/components/VideoEditor.tsx`;
- comandos de renderizacao escrevendo `entreus_output.mp4`;
- `Blob` final criado com `type: 'video/mp4'`;
- download final como `entreus-lab-video.mp4`;
- modo download sem criar post no feed.

Neste pacote, a microcopy do editor foi ajustada para deixar claro que o download final e MP4.

## Proximos passos

- Conversao server-side para videos longos ou navegadores fracos.
- Presets de qualidade.
- Escolha de resolucao e bitrate no Screen Recorder.
- Exportacao MP4 avancada no editor, com perfis mais claros por plataforma.

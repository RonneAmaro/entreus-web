# Gravador de Tela do EntreUS Lab

Atualizacao MP4: o gravador agora tenta usar MP4 real quando o navegador suportar `video/mp4` no `MediaRecorder`. Quando o navegador so suportar WebM, o download continua em `.webm` e a UI oferece exportacao MP4 via FFmpeg.wasm quando o ambiente permitir.

O Gravador de Tela adiciona uma ferramenta local em `/lab/screen-recorder` para gravar tela, microfone opcional, webcam opcional, pré-visualizar o resultado e baixar o arquivo no computador.

## Fluxo

1. O usuário abre o EntreUS Lab e acessa **Gravador de Tela**.
2. Antes de iniciar, escolhe microfone, webcam e áudio da tela/aba quando o navegador oferecer.
3. O navegador solicita a tela, janela ou aba que será capturada.
4. Durante a gravação, a página mostra o preview composto, tempo decorrido, pausa/continuação quando suportadas, caneta de marcação e botão para parar.
5. Ao parar, o vídeo vira um `Blob` local, recebe um `Object URL`, aparece em um player `<video controls>` e pode ser baixado como `.webm`.

## Modo Composto

Quando o navegador permite, o gravador usa um canvas local como fonte visual:

1. desenha a tela capturada no canvas;
2. desenha a webcam por cima, se estiver ativa;
3. desenha as marcações da caneta por cima da tela;
4. grava o canvas com `canvas.captureStream(30)`;
5. combina o vídeo do canvas com o áudio da tela/aba e do microfone.

Esse modo faz a webcam e as marcações aparecerem no vídeo final. Se `canvas.captureStream()` não estiver disponível, o gravador mantém o fallback seguro: grava a tela normalmente, sem webcam ou marcações embutidas, e mostra um aviso.

## Privacidade

- A gravação acontece no navegador do usuário.
- O vídeo não é enviado para API, Supabase, R2, banco de dados ou servidor da EntreUS.
- As permissões de tela, microfone e webcam são controladas pelo navegador.
- Se a aba for fechada antes de baixar ou abrir no editor, a gravação pode ser perdida.
- Gravações longas podem consumir bastante memória do computador, porque o arquivo fica local enquanto o usuário decide baixar ou editar.

## Áudio

O microfone é solicitado apenas quando a opção está ativa. O áudio da tela/aba depende do navegador e da fonte selecionada; alguns navegadores só oferecem áudio em abas, outros não oferecem áudio do sistema.

Quando microfone e áudio da tela estão presentes, a página tenta misturar as fontes com `AudioContext`. Se o navegador não permitir a mistura, a gravação segue com uma fonte de áudio disponível e mostra aviso.

## Webcam

A webcam é opcional e, no modo composto, é embutida no vídeo final como picture-in-picture. A posição pode ser escolhida antes de iniciar:

- inferior direita;
- inferior esquerda;
- superior direita;
- superior esquerda.

A webcam não vira uma janela sempre por cima do Windows como um app nativo. Ela aparece por cima da tela dentro do vídeo gravado.

## Integração com o editor

O botão **Abrir no editor de vídeo** salva temporariamente o `Blob` da gravação no IndexedDB do próprio navegador e redireciona para:

`/lab/video-editor?source=screen-recorder`

O editor detecta essa origem, carrega o arquivo local como `File` e remove o rascunho temporário depois da importação. Não há upload nem endpoint envolvido.

Se IndexedDB não estiver disponível, o usuário deve baixar o vídeo e importá-lo manualmente no editor.

## Marcações

A caneta desenha sobre o preview composto e as marcações entram no vídeo final. O usuário pode escolher:

- vermelho;
- amarelo;
- verde;
- azul;
- branco;
- preto;
- espessura fina, média ou grossa.

Também há ações para limpar todas as marcações e desfazer o último traço. O desenho usa mouse ou touch/pointer events e guarda os pontos normalizados em memória local do navegador.

Próximos passos planejados:

- setas;
- marca-texto;
- círculos;
- texto;
- borracha;
- arrastar a webcam diretamente no canvas.

## Arquivo gerado

O download usa nome amigável:

`entreus-gravacao-tela-YYYY-MM-DD-HH-mm.webm`

O formato preferencial é WebM com o melhor `mimeType` suportado pelo `MediaRecorder` do navegador.

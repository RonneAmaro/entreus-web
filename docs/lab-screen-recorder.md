# Gravador de Tela do EntreUS Lab

Atualizacao MP4: o gravador agora tenta usar MP4 real quando o navegador suportar `video/mp4` no `MediaRecorder`. Quando o navegador so suportar WebM, o download continua em `.webm` e a UI oferece exportacao MP4 via FFmpeg.wasm quando o ambiente permitir.

O Gravador de Tela adiciona uma ferramenta local em `/lab/screen-recorder` para gravar tela, microfone opcional, webcam opcional, pré-visualizar o resultado e baixar o arquivo no computador.

## Fluxo

1. O usuário abre o EntreUS Lab e acessa **Gravador de Tela**.
2. Antes de iniciar, escolhe microfone, webcam e áudio da tela/aba quando o navegador oferecer.
3. O navegador solicita a tela, janela ou aba que será capturada.
4. Durante a gravação, a página mostra o preview composto, tempo decorrido, pausa/continuação quando suportadas, barra compacta de marcações e botão para parar.
5. Ao parar, o vídeo vira um `Blob` local, recebe um `Object URL`, aparece em um player `<video controls>` e pode ser baixado como `.webm`.

## Modo Composto

Quando o navegador permite, o gravador usa um canvas local como fonte visual:

1. desenha a tela capturada no canvas;
2. desenha a webcam por cima, se estiver ativa;
3. desenha as marcações por cima da tela;
4. grava o canvas com `canvas.captureStream(30)`;
5. combina o vídeo do canvas com o áudio da tela/aba e do microfone.

Esse modo faz a webcam e as marcações aparecerem no vídeo final, usando posição, tamanho e formato atuais dos overlays no preview. Se `canvas.captureStream()` não estiver disponível, o gravador mantém o fallback seguro: grava a tela normalmente, sem webcam ou marcações embutidas, e mostra um aviso.

Quando não há webcam nem ferramenta de marcação ativa no início, o gravador pode usar o stream bruto da tela. Esse modo simples tende a depender menos da renderização do preview do EntreUS e pode ser mais estável quando a janela não está em foco. Para usar webcam ou marcações no vídeo final, o gravador precisa usar o stream composto.

## Janela minimizada e congelamento visual

No modo composto, a trilha visual depende de um canvas local e de um loop de desenho. Quando a janela ou aba do EntreUS fica oculta, minimizada ou fortemente limitada pelo navegador, `requestAnimationFrame`, timers e desenho em canvas podem ser pausados ou reduzidos. Nessa situação, o áudio pode continuar porque vem de tracks de mídia independentes, enquanto a parte visual do canvas pode congelar ou atualizar muito lentamente.

O gravador tenta reduzir o impacto usando `requestAnimationFrame` enquanto a página está visível e um fallback com timer em FPS reduzido quando `document.hidden` está ativo. Ainda assim, o navegador não garante renderização contínua com janela minimizada.

Recomendações:

- não minimize o EntreUS durante gravações com webcam ou marcações;
- para gravar outros aplicativos, prefira escolher **Tela inteira** ou **Janela** em vez de capturar somente a aba do EntreUS;
- mantenha a janela do EntreUS visível em um canto ou segundo monitor quando usar overlays;
- use gravação simples da tela quando não precisar de webcam ou marcações.

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

A webcam é opcional e, no modo composto, é embutida no vídeo final como picture-in-picture. O overlay pode ser arrastado sobre o preview, redimensionado pelo canto inferior e alternado entre formato retangular arredondado ou circular.

A posição, o tamanho e o formato ficam em `localStorage` para manter a preferência local do navegador. Se o modo composto não estiver disponível, a webcam continua aparecendo no preview como fallback visual, mas não entra no arquivo final.

A webcam não vira uma janela sempre por cima do Windows como um app nativo. Ela aparece no preview do EntreUS e é embutida no arquivo final quando o modo composto está ativo.

## Limite do overlay web

No navegador, webcam e marcações aparecem dentro do preview do EntreUS e entram no vídeo final no modo composto. Quando a aba do EntreUS é minimizada ou outra janela do Windows fica por cima, esses overlays web não continuam flutuando sobre o sistema inteiro.

Isso é uma limitação de segurança do navegador: uma página web não pode criar uma janela transparente sempre no topo por cima de outros aplicativos do Windows.

Também é uma limitação prática do runtime do navegador: ele pode pausar ou limitar renderização de canvas e `requestAnimationFrame` quando a janela está minimizada. Por isso o gravador web não promete gravação visual perfeita com a aba minimizada.

Para overlay global será necessário um pacote futuro separado: **EntreUS Recorder Desktop**, usando Electron ou Tauri.

Recursos planejados para esse pacote desktop:

- janela transparente sempre no topo;
- anotações sobre qualquer app;
- webcam global;
- captura da área de trabalho com overlays globais.

## Integração com o editor

O botão **Abrir no editor de vídeo** salva temporariamente o `Blob` da gravação no IndexedDB do próprio navegador e redireciona para:

`/lab/video-editor?source=screen-recorder`

O editor detecta essa origem, carrega o arquivo local como `File` e remove o rascunho temporário depois da importação. Não há upload nem endpoint envolvido.

Se IndexedDB não estiver disponível, o usuário deve baixar o vídeo e importá-lo manualmente no editor.

## Marcações

As marcações desenham sobre o preview composto e entram no vídeo final. Os controles ficam em uma barra flutuante compacta e arrastável sobre o preview, com:

- mover/cursor;
- lápis;
- texto;
- círculo;
- retângulo;
- desfazer;
- limpar.

Ao clicar no lápis, a página mostra um popover pequeno com cores e slider de espessura. O slider vai da esquerda para a direita: fino para grosso.

O usuário pode escolher:

- vermelho;
- amarelo;
- verde;
- azul;
- branco;
- preto;
- espessura por slider.

Também há ações para limpar todas as marcações e desfazer o último objeto desenhado. A posição da barra flutuante fica em `localStorage`. O desenho usa mouse ou touch/pointer events e guarda pontos normalizados em memória local do navegador.

Próximos passos planejados:

- setas;
- marca-texto;
- borracha por área.

## Arquivo gerado

O download usa nome amigável:

`entreus-gravacao-tela-YYYY-MM-DD-HH-mm.webm`

O formato preferencial é WebM com o melhor `mimeType` suportado pelo `MediaRecorder` do navegador.

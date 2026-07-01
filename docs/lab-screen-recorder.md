# Gravador de Tela do EntreUS Lab

O Gravador de Tela adiciona uma ferramenta local em `/lab/screen-recorder` para gravar tela, microfone opcional, webcam opcional, pré-visualizar o resultado e baixar o arquivo no computador.

## Fluxo

1. O usuário abre o EntreUS Lab e acessa **Gravador de Tela**.
2. Antes de iniciar, escolhe microfone, webcam e áudio da tela/aba quando o navegador oferecer.
3. O navegador solicita a tela, janela ou aba que será capturada.
4. Durante a gravação, a página mostra preview, tempo decorrido, pausa/continuação quando suportadas e botão para parar.
5. Ao parar, o vídeo vira um `Blob` local, recebe um `Object URL`, aparece em um player `<video controls>` e pode ser baixado como `.webm`.

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

Nesta primeira versão, a webcam é opcional e aparece como preview flutuante na página. Ela ainda não é embutida no vídeo final, para preservar um MVP estável sem composição por canvas.

Próximo passo possível: compor tela + webcam em canvas e gravar o canvas como vídeo final.

## Integração com o editor

O botão **Abrir no editor de vídeo** salva temporariamente o `Blob` da gravação no IndexedDB do próprio navegador e redireciona para:

`/lab/video-editor?source=screen-recorder`

O editor detecta essa origem, carrega o arquivo local como `File` e remove o rascunho temporário depois da importação. Não há upload nem endpoint envolvido.

Se IndexedDB não estiver disponível, o usuário deve baixar o vídeo e importá-lo manualmente no editor.

## Marcações

A interface já reserva espaço para caneta, cores e limpeza, mas nesta rodada elas ficam desabilitadas com o aviso de próximo pacote.

Próximos passos planejados:

- caneta com várias cores;
- setas;
- marca-texto;
- círculos;
- texto;
- borracha;
- webcam flutuante embutida no vídeo final.

## Arquivo gerado

O download usa nome amigável:

`entreus-gravacao-tela-YYYY-MM-DD-HH-mm.webm`

O formato preferencial é WebM com o melhor `mimeType` suportado pelo `MediaRecorder` do navegador.

# Upload inteligente de video

## Objetivo

O fluxo de posts valida a midia antes de solicitar uma URL assinada do Cloudflare R2. Quando o arquivo e um video valido, o `PostComposer` tambem tenta gerar uma versao MP4 otimizada antes de anexar a midia ao post.

O objetivo e reduzir custo, armazenamento, trafego e tempo de upload sem impedir o envio quando o navegador nao conseguir otimizar um video que ja esta dentro dos limites.

## Limites atuais

- Imagem: ate 5 MB.
- Video: ate 30 MB.
- Duracao de video de post: ate 60 segundos, validada no navegador quando os metadados podem ser lidos.
- Imagens: JPEG, PNG, WebP e GIF.
- Videos: MP4, WebM e MOV (`video/quicktime`).
- Ate 5 midias por post, conforme o comportamento existente do composer.

As constantes e os helpers compartilhados ficam em `lib/media/upload-limits.ts`.

## Validacao

O `PostComposer` valida tipo, tamanho e, para videos, duracao antes de anexar a midia. A duracao e lida com um elemento `video` temporario e `URL.createObjectURL`; a URL e sempre revogada. Se o navegador nao conseguir ler os metadados, o arquivo segue para as validacoes de tipo e tamanho.

Depois dessas validacoes, videos dentro do limite passam por `lib/media/video-compression.ts`. O helper verifica suporte do navegador, carrega FFmpeg.wasm sob demanda e tenta gerar um MP4 720p com bitrate conservador. A compressao so substitui o arquivo original quando a saida fica menor. Se a saida nao ficar menor, se o FFmpeg falhar ou se o navegador nao suportar a estrategia, o `PostComposer` mantem o arquivo original e mostra um aviso.

O feed repete a validacao de tipo e tamanho imediatamente antes do presign. O endpoint `/api/r2/presign` exige `fileSize`, valida o tipo normalizado e aplica novamente o limite correspondente. O `Content-Type` validado tambem faz parte do comando assinado para o R2.

O tamanho recebido pelo presign e declarado pelo client. Uma URL assinada de PUT nao inspeciona o conteudo real nem substitui verificacao server-side do arquivo. A protecao atual evita erros e abuso acidental no fluxo oficial; protecao contra um client malicioso exigira upload intermediado, regras adicionais na borda ou processamento posterior.

## Otimizacao antes do upload

A otimizacao roda somente no navegador e somente depois que o video passou pelas validacoes do Pacote 15:

- o arquivo precisa ser MP4, WebM ou MOV;
- o tamanho original precisa estar em ate 30 MB;
- a duracao precisa estar em ate 60 segundos quando o navegador consegue ler os metadados;
- arquivos acima do limite continuam bloqueados antes de qualquer tentativa de compressao.

Durante a tentativa, o composer mostra `Otimizando video...` e desabilita a publicacao. Se a saida otimizada for menor, o composer usa o novo arquivo e mostra `Video otimizado para publicar mais rapido.`. Se nao for possivel otimizar, mas o original ainda estiver dentro dos limites, o usuario pode seguir com o original e ve `Nao foi possivel otimizar o video, mas ele ainda pode ser enviado se estiver dentro dos limites.`.

Quando o navegador nao oferece os recursos minimos para a estrategia com FFmpeg.wasm, o composer mostra `Seu navegador nao permitiu otimizar o video automaticamente.` e mantem o fluxo normal para videos validos.

O FFmpeg ja existia no projeto por causa do editor de video. Este pacote reaproveita a dependencia instalada e nao altera `package.json`.

## Limitacoes

- A compressao depende de WebAssembly, Worker, Blob, File e URL no navegador.
- O carregamento do core do FFmpeg acontece sob demanda e pode falhar por rede, CSP, memoria ou limitacoes do aparelho.
- Em celulares mais fracos, otimizar pode demorar; por isso o fluxo tem fallback e nao bloqueia videos validos.
- A otimizacao nao aumenta limites e nao transforma formatos proibidos em formatos permitidos.
- A saida otimizada so e usada se ficar menor que o original.

## Como testar

1. Publicar um post apenas com texto.
2. Anexar e publicar uma imagem JPEG/PNG/WebP/GIF menor que 5 MB.
3. Anexar e publicar um MP4, WebM ou MOV menor que 30 MB e com ate 60 segundos.
4. Confirmar que, ao selecionar video valido em navegador suportado, aparece `Otimizando video...`.
5. Confirmar que, se a saida ficar menor, a midia anexada usa o arquivo otimizado e a mensagem `Video otimizado para publicar mais rapido.` aparece.
6. Confirmar que, se a otimizacao falhar ou nao reduzir tamanho, o original continua anexando quando esta dentro dos limites.
7. Confirmar que, quando o navegador nao permite otimizar, aparece `Seu navegador nao permitiu otimizar o video automaticamente.`.
8. Confirmar que um video acima de 30 MB e bloqueado antes do upload.
9. Confirmar que AVI, MKV, M4V, OGG e outros formatos nao permitidos sao bloqueados.
10. Confirmar que um video com mais de 60 segundos e bloqueado quando o navegador le seus metadados.
11. Misturar arquivos validos e invalidos e confirmar que midias ja anexadas permanecem no composer.
12. Confirmar que GIF, publicacao de texto e os botoes de IA continuam funcionando.
13. Confirmar que o botao de publicar fica desabilitado durante `Otimizando video...`.
14. Enviar manualmente ao presign um tipo ou tamanho invalido e confirmar respostas HTTP 415 ou 413.
15. Executar `npm.cmd run build`.

## Cuidados operacionais

- Nao alterar CORS, bucket ou credenciais do R2 para esta validacao.
- Nao usar Supabase Storage como fallback silencioso para uploads rejeitados pelo R2.
- Nao registrar tokens, URLs assinadas completas ou segredos.
- Nao criar migration ou alterar o schema do banco para este pacote.

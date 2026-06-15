# Upload inteligente de video

## Objetivo

O fluxo de posts valida a midia antes de solicitar uma URL assinada do Cloudflare R2. Isso reduz o risco de uploads muito grandes, consumo desnecessario de armazenamento e egress, e lentidao em dispositivos moveis.

Este pacote nao comprime videos. Ele estabelece um contrato unico entre o `PostComposer`, o upload do feed e `/api/r2/presign`.

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

O feed repete a validacao de tipo e tamanho imediatamente antes do presign. O endpoint `/api/r2/presign` exige `fileSize`, valida o tipo normalizado e aplica novamente o limite correspondente. O `Content-Type` validado tambem faz parte do comando assinado para o R2.

O tamanho recebido pelo presign e declarado pelo client. Uma URL assinada de PUT nao inspeciona o conteudo real nem substitui verificacao server-side do arquivo. A protecao atual evita erros e abuso acidental no fluxo oficial; protecao contra um client malicioso exigira upload intermediado, regras adicionais na borda ou processamento posterior.

## Proximo pacote

O pacote de compressao deve:

- gerar saidas 720p e/ou 480p antes do presign;
- exibir progresso de preparacao e upload;
- oferecer fallback quando o navegador nao suportar a estrategia escolhida;
- impedir que um video original gigante seja enviado diretamente;
- manter a validacao final no backend mesmo depois da compressao.

Nao foi adicionado FFmpeg nem dependencia neste pacote.

## Como testar

1. Publicar um post apenas com texto.
2. Anexar e publicar uma imagem JPEG/PNG/WebP/GIF menor que 5 MB.
3. Anexar e publicar um MP4, WebM ou MOV menor que 30 MB e com ate 60 segundos.
4. Confirmar que um video acima de 30 MB e bloqueado antes do upload.
5. Confirmar que AVI, MKV, M4V, OGG e outros formatos nao permitidos sao bloqueados.
6. Confirmar que um video com mais de 60 segundos e bloqueado quando o navegador le seus metadados.
7. Misturar arquivos validos e invalidos e confirmar que midias ja anexadas permanecem no composer.
8. Confirmar que GIF, publicacao de texto e os botoes de IA continuam funcionando.
9. Enviar manualmente ao presign um tipo ou tamanho invalido e confirmar respostas HTTP 415 ou 413.
10. Executar `npm.cmd run build`.

## Cuidados operacionais

- Nao alterar CORS, bucket ou credenciais do R2 para esta validacao.
- Nao usar Supabase Storage como fallback silencioso para uploads rejeitados pelo R2.
- Nao registrar tokens, URLs assinadas completas ou segredos.
- Nao criar migration ou alterar o schema do banco para este pacote.

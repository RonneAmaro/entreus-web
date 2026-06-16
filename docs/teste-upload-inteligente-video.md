# Teste manual do upload inteligente de video

## Objetivo

Validar manualmente o fluxo completo dos Pacotes 15, 16 e 17: validacao de midia no composer, otimizacao de video com FFmpeg.wasm, indicador de economia, envio para R2 via presign e publicacao no feed.

Este roteiro e de auditoria. Ele nao exige mudanca de limites, banco, R2, CORS, bucket ou variaveis de ambiente.

## Preparacao

1. Rode `git status --short` e registre qualquer arquivo ja modificado antes do teste.
2. Rode `npm.cmd run build` e confirme que o build passa.
3. Inicie o app localmente em `http://localhost:3001` com `npm.cmd run dev -- --port 3001`.
4. Entre com um usuario valido. O fluxo de upload exige sessao para pedir presign ao R2.
5. Confirme que Supabase Auth, feed e R2 estao funcionando no ambiente usado para teste.
6. Abra o DevTools do navegador nas abas `Console` e `Network`.
7. Separe arquivos de teste: imagens validas, imagem maior que 5 MB, videos MP4/WebM/MOV validos, video maior que 30 MB, video maior que 60 segundos e um formato de video nao permitido, como OGG.

## Estado Inicial

- `git status --short` deve estar conhecido e registrado.
- `npm.cmd run build` deve passar antes dos testes manuais.
- `/feed` deve carregar sem erro.
- O usuario deve conseguir abrir o `PostComposer`.
- O console nao deve mostrar erro de configuracao de Supabase, Auth ou R2 antes de iniciar o upload.

## Testes de Texto

1. Abra o composer e publique um post apenas com texto.
2. Confirme que o post aparece no feed.
3. Abra o composer novamente, escreva pelo menos 3 caracteres e acione as opcoes de IA.
4. Confirme que a IA retorna sugestao/melhoria ou uma mensagem de erro amigavel quando o ambiente nao estiver configurado.
5. Confirme que o fluxo de texto nao depende de midia e nao aciona presign.

Resultado esperado:

- Post de texto publica normalmente.
- IA do composer continua acessivel.
- Nenhum indicador de economia de video aparece.

## Testes com Imagem

1. Anexe uma imagem JPG, PNG, WebP ou GIF menor que 5 MB.
2. Confirme que a imagem aparece no preview.
3. Publique e confirme que a imagem aparece no feed.
4. Anexe uma imagem maior que 5 MB.
5. Confirme que o composer bloqueia o arquivo com mensagem de tamanho.
6. Tente anexar um formato invalido, quando houver arquivo de teste.
7. Confirme que o formato invalido e bloqueado.

Resultado esperado:

- Imagem valida passa pelo preview, presign e PUT no R2.
- Imagem acima de 5 MB nao segue para upload.
- Imagem nao mostra `Video otimizado: X MB -> Y MB` nem `Economia de Z%`.

## Testes com Video Valido

1. Anexe um MP4 menor que 30 MB e com ate 60 segundos.
2. Em navegador suportado, confirme que aparece `Otimizando video...` enquanto o FFmpeg.wasm roda.
3. Se a saida otimizada ficar menor, confirme o indicador:
   - `Video otimizado: X MB -> Y MB`
   - `Economia de Z%`
4. Publique e confirme no Network que o presign usa o tamanho e o `Content-Type` do arquivo final anexado.
5. Confirme que o PUT para R2 recebe header `Content-Type` coerente com o retorno do presign.
6. Repita com WebM dentro do limite.
7. Repita com MOV dentro do limite, se o navegador e o ambiente de teste permitirem selecionar/ler o arquivo.

Resultado esperado:

- Videos validos passam por validacao de tipo, tamanho e duracao antes de anexar.
- A publicacao fica desabilitada durante `Otimizando video...`.
- Quando ha reducao real, o arquivo otimizado e usado no upload.
- Quando ha indicador, ele mostra apenas economia real.

## Testes de Bloqueio

1. Anexe um video maior que 30 MB.
2. Confirme que o composer bloqueia antes de tentar upload.
3. Anexe um video maior que 60 segundos.
4. Se o navegador conseguir ler os metadados, confirme bloqueio por duracao.
5. Tente anexar formato nao permitido, como OGG.
6. Confirme que OGG e bloqueado pela regra atual.
7. Confirme no Network que arquivos bloqueados nao pedem `/api/r2/presign`.

Resultado esperado:

- Video acima de 30 MB e bloqueado.
- Video acima de 60 segundos e bloqueado quando a duracao e lida.
- Formatos fora de MP4, WebM e MOV sao bloqueados.
- OGG nao e aceito pela regra atual.

## Testes de Fallback

1. Anexe um video valido que normalmente nao fica menor apos compressao.
2. Confirme que o original valido permanece anexado.
3. Confirme que nao aparece indicador de economia.
4. Simule ou observe falha de FFmpeg/navegador fraco, quando possivel.
5. Confirme que aparece aviso amigavel de fallback.
6. Publique o video original valido e confirme que o fluxo segue.

Resultado esperado:

- Falha de otimizacao nao bloqueia video que ja esta dentro dos limites.
- Saida maior ou igual ao original nao substitui o arquivo.
- Nao aparece economia falsa.

## Testes de Troca e Remocao

1. Anexe um video que gere indicador de economia.
2. Remova o video pelo botao de remover midia.
3. Confirme que o preview e o indicador somem.
4. Anexe outro video.
5. Confirme que a economia e recalculada para o novo arquivo, quando houver reducao real.
6. Anexe uma imagem depois de testar video.
7. Confirme que a imagem nao herda indicador de economia.
8. Se usar o botao `Trocar midia`, observe o comportamento atual do composer com multiplas midias. Para validar substituicao limpa, remova a midia anterior e selecione a nova.

Resultado esperado:

- O indicador pertence ao item de video anexado.
- Remover o item remove o indicador.
- Novo video calcula nova economia.
- Imagens seguem sem indicador de video.

## Testes de UX e Mobile

1. Abra o feed em largura mobile pelo DevTools ou em aparelho real.
2. Abra o composer.
3. Anexe imagem e video.
4. Confirme que previews, avisos e botoes nao sobrepoem texto.
5. Confirme que o botao de publicar fica desabilitado durante otimizacao.
6. Confirme que mensagens de erro/fallback ficam visiveis.
7. Feche e reabra o composer durante um estado normal, sem upload em andamento.
8. Confirme que o composer nao trava e nao publica automaticamente.

Resultado esperado:

- Layout responsivo permanece usavel.
- Nao ha modal extra para economia.
- Nao ha clique adicional para ver o indicador.
- Publicacao depende de acao explicita do usuario.

## Testes de R2 e Presign

1. Publique uma imagem valida e observe `/api/r2/presign` no Network.
2. Confirme payload com `fileName`, `contentType`, `fileSize` e `folder`.
3. Confirme resposta com `uploadUrl`, `publicUrl`, `key`, `contentType` e `expiresIn`.
4. Confirme que o PUT para R2 usa metodo `PUT` e header `Content-Type`.
5. Repita com video valido.
6. Confirme que arquivo pesado bloqueado no composer nao chama presign.
7. Se testar presign manualmente, envie tamanho acima do limite e confirme HTTP 413.
8. Se testar tipo invalido manualmente, confirme HTTP 415.

Resultado esperado:

- O feed valida novamente tipo e tamanho antes do presign.
- O endpoint `/api/r2/presign` exige usuario autenticado, tipo permitido, tamanho valido e folder aceito.
- Upload valido segue sem mexer em CORS, bucket ou credenciais.

## Checklist de Regressao

- [ ] Feed carrega.
- [ ] Post apenas texto publica.
- [ ] IA do composer continua funcionando ou falha com mensagem amigavel.
- [ ] Upload de imagem valida continua funcionando.
- [ ] Imagem maior que 5 MB e bloqueada.
- [ ] MP4 valido e aceito.
- [ ] WebM valido e aceito.
- [ ] MOV valido e aceito, quando suportado pelo navegador de teste.
- [ ] Video maior que 30 MB e bloqueado.
- [ ] Video maior que 60 segundos e bloqueado quando metadados sao lidos.
- [ ] OGG e bloqueado.
- [ ] `Otimizando video...` aparece quando a compressao e tentada.
- [ ] Publicar fica desabilitado durante otimizacao.
- [ ] Indicador de economia aparece apenas quando o arquivo final fica menor.
- [ ] Remover video remove o indicador.
- [ ] Fallback de compressao nao bloqueia original valido.
- [ ] Presign recebe `contentType` e `fileSize`.
- [ ] PUT para R2 conclui para midia valida.
- [ ] Links externos continuam funcionando.
- [ ] `npm.cmd run build` passa apos os testes.

## Evidencias para Registrar

- Saida de `git status --short` antes e depois.
- Saida resumida de `npm.cmd run build`.
- Navegador e sistema usados no teste.
- Tamanho, tipo e duracao aproximada dos arquivos usados.
- Prints do indicador de economia quando aparecer.
- Status HTTP de `/api/r2/presign` e do PUT no R2.
- Mensagens exibidas ao usuario em bloqueios e fallbacks.

## Riscos e Limitacoes

- A compressao depende de WebAssembly, Worker, Blob, File, URL, memoria disponivel e carregamento do core do FFmpeg.wasm.
- Nem todo video fica menor; nesses casos o indicador nao deve aparecer.
- A validacao de duracao depende do navegador conseguir ler metadados do video.
- O presign confia no tamanho declarado pelo client; a URL assinada de PUT nao inspeciona sozinha o conteudo real.
- Em aparelhos fracos, otimizar pode demorar ou falhar; o comportamento esperado e fallback para o original valido.

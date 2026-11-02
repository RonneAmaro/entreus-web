# Package 09C.6.11 — auditoria de procedência do FFmpeg WASM

Data: 15/10/2026. Escopo: investigação documental e inspeção **somente leitura** de artefatos já presentes; nenhuma autorização para distribuição. Complementa a [decisão 09C.6.10](09c610-ffmpeg-distribution-decision.md), sem repetir a validação de exportação.

## Resumo executivo

O arquivo `core-0.12.10.tgz` preservado em TEMP tem SHA-512 e SHA-1 idênticos aos campos `dist.integrity` e `dist.shasum` do metadado npm **preservado na auditoria anterior**. Seus cinco membros foram lidos diretamente do tarball e comparados byte a byte aos arquivos extraídos: todos coincidem. O WASM contém uma linha de configuração FFmpeg que confirma `--enable-gpl`, `--enable-libx264`, `--enable-libx265`, outras bibliotecas e `-O3 -msimd128`. Os ESM e UMD usam o mesmo WASM. A [release oficial v12.15](https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v12.15) associa `@ffmpeg/core@0.12.10` ao commit [`71aa99d37c02a7b4c435275ca9ef50e612f6efa1`](https://github.com/ffmpegwasm/ffmpeg.wasm/commit/71aa99d37c02a7b4c435275ca9ef50e612f6efa1).

**Conclusão delimitada:** há identificação e forte consistência *local* entre tarball, metadado salvo e extração. A correspondência exata entre o WASM publicado e um conjunto imutável de fontes, dependências e instruções de build **não foi comprovada**. Não foi possível consultar novamente o endpoint de metadados do registry npm nesta sessão, nem comparar com um segundo download independente ou verificar criptograficamente a assinatura registrada no metadado. O core nem está instalado em `node_modules`: a fixture de teste usa a cópia extraída em TEMP. O pacote de conformidade e a análise jurídica continuam pendentes. Nenhum binário foi publicado ou copiado ao projeto.

## Ambiente e método

| Item | Constatação | Evidência |
| --- | --- | --- |
| Diretório | `C:\Projetos\EntreUS\entreus-web` | `Get-Location` |
| Branch | `feature/video-editor-core-package-09b` | `git branch --show-current` |
| Git inicial | Muitas modificações e arquivos não rastreados preexistentes, incluindo editor, carregador, testes e documentos anteriores | `git status --short` antes da escrita |
| Relatórios anteriores | `09c67-production-local-validation.md`, `09c69-ffmpeg-lifecycle.md`, `09c610-ffmpeg-distribution-decision.md` presentes | `Test-Path`; [09C.6.7](09c67-production-local-validation.md), [09C.6.9](09c69-ffmpeg-lifecycle.md) |
| Artefatos | `%TEMP%/entreus-ffmpeg-core-0.12.10-audit/` presente; `node_modules/@ffmpeg/ffmpeg` presente; `node_modules/@ffmpeg/core` ausente | `Test-Path`, listagem local |

Foram usados `Get-FileHash` e leitura por Node.js (`crypto`, `zlib`, `fs`) do tarball e do WASM. Nenhum código do pacote foi executado; não houve instalação, compilação, exportação MP4 ou build. A tentativa de consulta HTTPS a `registry.npmjs.org/%40ffmpeg%2Fcore/0.12.10` falhou por indisponibilidade de conexão no ambiente; a [página pública do pacote no npm](https://www.npmjs.com/package/%40ffmpeg/core?activeTab=versions) confirma versão e licença, mas não oferece nessa consulta um digest independente do tarball. O metadado salvo contém assinatura npm e `keyid`, **não verificados** aqui.

## Identidade, origem e integridade

O [`package-lock.json`](../../package-lock.json) registra `@ffmpeg/ffmpeg@0.12.15`, URL `https://registry.npmjs.org/@ffmpeg/ffmpeg/-/ffmpeg-0.12.15.tgz`, integridade `sha512-1C8Obr4GsN3xw+/1Ww6PFM84wSQAGsdoTuTWPOj2OizsRDLT4CXTaVjPhkw6ARyDus1B9X/L2LiXHqYYsGnRFw==` e licença declarada MIT. O [manifesto instalado](../../node_modules/@ffmpeg/ffmpeg/package.json) concorda com nome, versão e licença. O lockfile **não registra `@ffmpeg/core`**, que é buscado pelo [carregador](../../lib/media/ffmpeg-load.ts) por URL, ou entregue pela fixture local. Logo, não se deve tratar o core como dependência npm instalada no projeto.

O metadado npm salvo em `%TEMP%/entreus-ffmpeg-core-0.12.10-audit/npm-metadata.json` registra `@ffmpeg/core@0.12.10`, `GPL-2.0-or-later`, URL `https://registry.npmjs.org/@ffmpeg/core/-/core-0.12.10.tgz`, `fileCount: 5`, `unpackedSize: 64689644`, editor npm `lucasgelfond`, Node de publicação `18.20.2`, npm `10.5.0`, assinatura e chave de registry. Os digests registrados são:

- `dist.integrity`: `sha512-dzNplnn2Nxle2c2i2rrDhqcB19q9cglCkWnoMTDN9Q9l3PvdjZWd1HfSPjCNWc/p8Q3CT+Es9fWOR0UhAeYQZA==`.
- `dist.shasum`: `3177e88852bfbfaad5d258e9e0ac1fd9dffd3223`.
- SHA-256 calculado do tarball local: `d00089ce82e1bdf637ddbe42e0c3d41a1ba8cf4c9e825e7fa4d0bb970e844bd4` (20.634.719 bytes).

O SHA-512 Base64 e o SHA-1 foram **recalculados nesta sessão** e coincidem com o metadado salvo; o `fileCount` de cinco também coincide. A extração anterior e cada membro do tarball foram comparados byte a byte nesta sessão. Isso verifica integridade contra o registro local preservado, não a assinatura de publicação npm nem a identidade de um novo download. A origem exata do tarball local é **compatível com o URL oficial registrado**, mas sua aquisição não tem cadeia de custódia independente nesta auditoria. O `@ffmpeg/ffmpeg` instalado foi confrontado com o lockfile/manifesto; o tarball oficial do wrapper não estava disponível para comparação byte a byte, portanto sua integridade instalada também não recebeu essa verificação adicional.

### Arquivos do core — membros do tarball auditado

Todos os caminhos abaixo são relativos a `%TEMP%/entreus-ffmpeg-core-0.12.10-audit/extracted/package/`. **Origem registrada:** tarball `@ffmpeg/core@0.12.10`; **licença declarada pelo pacote:** `GPL-2.0-or-later` ([manifesto oficial na tag](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/packages/core/package.json)). Não existe licença própria declarada por arquivo.

| Caminho | Função | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `package.json` | Metadados/exports | 943 | `2d55b1f6df4c62955f286ae41b7ca6b27bb4165136ca7572d4101abe147695e0` |
| `dist/esm/ffmpeg-core.js` | Glue JavaScript ESM do core; usado na fixture | 111.804 | `67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3` |
| `dist/esm/ffmpeg-core.wasm` | Motor WASM; usado na fixture | 32.232.419 | `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7` |
| `dist/umd/ffmpeg-core.js` | Glue JavaScript UMD; formato buscado pelo carregador comum no unpkg | 112.059 | `b266ab5b952555881dd6310663986994a182acb2b7ff25cf10a25f7a37ac2b21` |
| `dist/umd/ffmpeg-core.wasm` | Motor WASM UMD | 32.232.419 | `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7` |

Os dois WASM são **byte a byte idênticos**. O tarball contém apenas esses cinco arquivos: não contém fonte correspondente, textos completos de licença, avisos, patches ou instruções de reconstrução. O caminho comum do app baixa a variante UMD de `unpkg.com` em tempo de execução; **os bytes servidos por esse CDN não foram capturados nem comparados nesta auditoria**. A [fixture local](../../tests/e2e/ffmpeg-local-fixture.ts) verifica integridade do arquivo TEMP e hashes ESM antes de responder às requisições em testes; isso não atesta o CDN.

### Wrapper e Worker usados na fixture

Arquivos abaixo relativos a `node_modules/@ffmpeg/ffmpeg/dist/esm/`; origem **declarada**: `@ffmpeg/ffmpeg@0.12.15` instalado pelo projeto; licença **declarada pelo pacote**: MIT ([manifesto na tag](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/packages/ffmpeg/package.json) e [texto MIT do repositório](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/LICENSE)). O tarball deste wrapper não foi rebaixado ou comparado nesta sessão.

| Caminho | Função | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `worker.js` | Worker ESM que importa/inicializa o core | 5.085 | `feff0ac937ea225e997e1fae997a74f8b8d572423a526da59eb56624b1f3cde7` |
| `const.js` | Constantes e tipos de mensagem importados pelo Worker | 1.016 | `9e3bc9dd84781c81daf459e2c46eeec815edac35089832681d9a9a0f383060d0` |
| `errors.js` | Erros importados pelo Worker | 332 | `619310d7ef5fe5fefa0a31927db862b7c291713cfef4d71753fa8aafd18f4db6` |

`classes.js` (9.747 bytes, SHA-256 `7a829c898bdbc3a8806652a5502d9101178ce4e988a2c50b3abc1306ce4fc919`) é parte do wrapper ESM que cria e controla o Worker; o bundle efetivo do Next.js pode transformá-lo, portanto esse hash identifica apenas o arquivo instalado. A licença MIT do wrapper não altera a licença declarada GPL do core. Não há arquivo `LICENSE` separado nos pacotes locais inspecionados.

## Fontes localizadas e configuração

### Commit, tag e dependências

A [release v12.15](https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v12.15) anuncia `v12.15` para o wrapper e `v12.10` para os cores. O [commit de release completo](https://github.com/ffmpegwasm/ffmpeg.wasm/commit/71aa99d37c02a7b4c435275ca9ef50e612f6efa1) atualiza `packages/core/package.json` e referências de exemplo para `0.12.10`. **Esse é o commit exato de release localizado, não um commit comprovado de compilação do tarball.** Não foi encontrado atestado que associe o SHA-256/SHA-512 do pacote a esse commit, a uma execução de CI e aos commits das bibliotecas.

O [Dockerfile da tag v12.15](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/Dockerfile) é a receita upstream candidata. Identifica Emscripten `3.1.40`, FFmpeg `n5.1.4` e as seguintes referências de bibliotecas. **São refs da receita, não commits imutáveis comprovados no binário**:

| Grupo | Referências no Dockerfile |
| --- | --- |
| Encoders de vídeo | fork `ffmpegwasm/x264` `4-cores`; fork `ffmpegwasm/x265` `3.4`; `ffmpegwasm/libvpx` `v1.13.1` |
| Áudio e contêiner | fork `ffmpegwasm/lame` `master`; Ogg `v1.3.4`; Theora `v1.1.1`; Opus `v1.3.1`; Vorbis `v1.3.3` |
| Imagem, texto e suporte | zlib `v1.2.11`; libwebp `v1.3.2`; FreeType `VER-2-10-4`; FriBidi `v1.0.9`; HarfBuzz `5.2.0`; libass `0.15.0`; zimg `release-3.0.5` |

O Dockerfile obtém muitos desses projetos por `ADD` de repositórios Git com refs; zimg é clonado por `git clone --recursive`. O repositório ffmpeg.wasm também tem submódulo de **dados de teste** (`testdata`) conforme [`.gitmodules` do projeto](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/.gitmodules); ele não fornece a cadeia de commits das bibliotecas ligadas pelo Dockerfile da release. Não se verificaram submódulos de cada fork no checkout da tag. Dependências de sistema, pacotes transitivos, patches aplicados nos forks e hashes dos conteúdos efetivamente usados não foram inventariados por um lock de build.

### Configuração presente no próprio WASM

Uma sequência ASCII contígua de **669 bytes no offset 27.245.875** do `dist/esm/ffmpeg-core.wasm` contém a configuração abaixo, recuperada sem executar o módulo. O UMD usa o mesmo WASM. Essa é evidência do **conteúdo do binário**, superior à mera leitura de um Dockerfile, embora uma string embutida ainda não ateste todos os objetos vinculados ou sua procedência:

```text
--target-os=none --arch=x86_32 --enable-cross-compile --disable-asm --disable-stripping --disable-programs --disable-doc --disable-debug --disable-runtime-cpudetect --disable-autodetect --nm=emnm --ar=emar --ranlib=emranlib --cc=emcc --cxx=em++ --objcc=emcc --dep-cc=emcc --extra-cflags='-I/opt/include -O3 -msimd128' --extra-cxxflags='-I/opt/include -O3 -msimd128' --disable-pthreads --disable-w32threads --disable-os2threads --enable-gpl --enable-libx264 --enable-libx265 --enable-libvpx --enable-libmp3lame --enable-libtheora --enable-libvorbis --enable-libopus --enable-zlib --enable-libwebp --enable-libfreetype --enable-libfribidi --enable-libass --enable-libzimg
```

As opções coincidem materialmente com o [Dockerfile](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/Dockerfile), o [`build/ffmpeg.sh`](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/build/ffmpeg.sh) e o alvo `prd` do [Makefile](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/Makefile), que usa `-O3 -msimd128`. O [`build/ffmpeg-wasm.sh`](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/build/ffmpeg-wasm.sh) descreve a ligação com bibliotecas FFmpeg, `ENVIRONMENT=worker`, `WASM_BIGINT`, SDL2, modularização e, para single-thread, memória inicial de 32 MB com crescimento. Estas últimas opções são **da receita publicada**, não todas verificadas no arquivo pela inspeção de string. O WASM contém a sequência `5.1.4`, compatível com o FFmpeg da receita, mas ela sozinha não identifica o commit exato do FFmpeg. `--enable-nonfree` não apareceu nessa configuração embutida; não é conclusão geral de conformidade.

### Codecs e licenças

- **Confirmado em funcionamento local anterior:** o [ensaio 09C.6.7](09c67-production-local-validation.md) produziu MP4 com caixas `avc1`/`avcC` (H.264) e `mp4a`/`esds` (AAC); o código do Studio e do gravador pede `libx264` e `aac`. Não se repetiu a execução aqui.
- **Confirmado como configuração embutida:** `--enable-libx264`, `--enable-libx265`, `--enable-libvpx`, `--enable-libmp3lame`, `--enable-libtheora`, `--enable-libvorbis`, `--enable-libopus`, `--enable-libwebp`, `--enable-libfreetype`, `--enable-libfribidi`, `--enable-libass`, `--enable-libzimg`, `--enable-zlib`. Isso não prova exercício de todos os codecs nos ensaios, nem versão ou presença de cada objeto em memória.
- **Licenças confirmadas por declarações upstream:** wrapper/Worker sob MIT declarado; core sob `GPL-2.0-or-later` declarado. O [FFmpeg explica](https://ffmpeg.org/legal.html) que partes GPL habilitadas mudam a licença do conjunto compilado; sua [documentação de licença](https://ffmpeg.org/doxygen/8.0/md_LICENSE.html) identifica `libx264` e `libx265` como bibliotecas GPL. A fonte base do FFmpeg é majoritariamente LGPL 2.1 ou posterior, mas este **core configurado com `--enable-gpl` não deve ser tratado como LGPL**.
- **Ainda não fechado:** textos integrais, titulares, versões e possíveis exceções de cada biblioteca adicional e componente transitivo. Não atribuir uma licença uniforme a Ogg, Opus, Vorbis, LAME, libass, fontes, runtime Emscripten ou outros sem examinar o código efetivamente incorporado. A declaração do manifesto tampouco substitui parecer sobre patentes H.264/AAC.

## Nível de rastreabilidade alcançado

| Nível pedido | Resultado | Limite da prova |
| --- | --- | --- |
| 1 — Identificação | **Atingido** para o tarball core local e arquivos da fixture; versão, tamanhos e hashes identificados. Wrapper instalado também identificado. | URL do CDN comum não teve bytes capturados. |
| 2 — Procedência | **Parcial:** cinco membros extraídos coincidem byte a byte com o tarball; SHA-512 e SHA-1 coincidem com metadado npm anteriormente salvo. | `@ffmpeg/core` não está instalado; registry inacessível nesta sessão; assinatura npm não verificada; wrapper instalado não comparado ao tarball oficial. Não declarar autenticidade independente/forte. |
| 3 — Fontes | **Parcial:** tag/commit de release, receita, versões de referência e configuração embutida localizados. | Não existem evidências que fixem commits de todos os forks/patches, toolchain efetiva e associação do build ao arquivo npm. |
| 4 — Correspondência forte | **Não atingido.** | Nenhum atestado verificável de publicação e nenhuma compilação/reprodução com comparação de hashes. Nem equivalência funcional estabelece identidade fonte/binário. |

Em suma: **commit de release conhecido; commit efetivo de build e fonte correspondente exata não comprovados**. O máximo defensável é nível 1 completo, com evidências parciais dos níveis 2 e 3. Não há reivindicação de build reproduzível.

## Pendências de conformidade e questões jurídicas

**Documentação técnica a obter antes de qualquer distribuição:**

1. Confirmar o tarball novamente por canal oficial independente, verificar integridade e assinatura npm quando houver chave verificável; capturar também bytes UMD efetivamente servidos no CDN e comparar com o tarball, se esse caminho continuar relevante.
2. Obter commits imutáveis de FFmpeg `n5.1.4`, forks x264/x265 e cada biblioteca; registrar patches e dependências transitivas, imagem Emscripten por digest, ferramentas e versões de sistema, argumentos de build e logs. Solicitar ao mantenedor evidência de qual build gerou o tarball ou produzir build controlado e comparar hashes. Se o build não for bit a bit, documentar diferenças e avaliar suficiência da correspondência de fontes sem alegar reprodução perfeita.
3. Preparar árvore ou arquivos de fonte correspondente, instruções de reconstrução, scripts, patches e configuração completa para o **binário concreto**; relacionar cada hash público ao pacote de fontes. O tarball npm atual não inclui esse material.
4. Reunir textos integrais GPL/LGPL/MIT e de cada biblioteca, titulares e avisos de copyright. Determinar como preservar avisos no frontend e no local de download, sem atribuir MIT ao core GPL.
5. Revisar a forma de disponibilização de fontes e direitos de redistribuição dos artefatos. O [checklist oficial do FFmpeg](https://ffmpeg.org/legal.html) é referência, mas não constitui parecer jurídico nem dispensa revisão do caso GPL atual.

**Perguntas para especialista:** Qual o alcance da GPL sobre Worker/WASM, frontend e demais módulos na arquitetura real? Qual conjunto de fontes e instruções é suficiente para este core e bibliotecas vinculadas? Que avisos, oferta de fonte e termos de uso são necessários no serviço público? Quais patentes/royalties podem incidir sobre H.264 e AAC? O uso comercial é compatível com GPL sob quais condições concretas? A GPL não proíbe uso comercial por si; também não se conclui que todo o EntreUS deva ser aberto sem análise da integração. O presente relatório não emite parecer jurídico.

## Desenho futuro de entrega, sem implementação

Se a decisão condicional do [09C.6.10](09c610-ffmpeg-distribution-decision.md) for aprovada posteriormente: servir **Worker ESM e imports, core JS ESM, WASM, licenças, avisos, fonte correspondente e manifesto de hashes** por URLs versionadas da mesma origem, mantendo todos os arquivos da mesma release juntos. O manifesto deve ligar versão e SHA-256 do tarball, JS e WASM aos fontes/avisos e ser validado antes de liberar uma versão. Servir JavaScript como `text/javascript` e WASM como `application/wasm` ([MIME](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types/Common_types)); testar `worker-src`, importações e permissão WebAssembly na CSP. Usar cache imutável apenas com URLs contendo versão/hash, preservar versão anterior no rollout e rollback, e manter fluxo de falha/cancelamento/recuperação do 09C.6.9. A entrega deve substituir o fallback externo somente após autorização e testes; a fixture `/__entreus_ffmpeg_local/` não é infraestrutura pública. Não se criou endpoint nem se alterou flag neste pacote.

## Riscos e próximos passos recomendados

O risco principal é distribuir um core GPL de 32,2 MB sem prova suficiente de fonte correspondente e sem inventário integral de avisos/licenças. Há riscos separados de versão misturada entre Worker/JS/WASM, de bytes UMD no CDN ainda não auditados, de CSP/cache em produção e de custo de transferência. A configuração do WASM demonstra que o núcleo testado habilita componentes GPL; não elimina essas lacunas.

**Próximo pacote recomendado, se autorizado:** fechar a cadeia de custódia do tarball e dos bytes CDN, obter atestado ou logs do build upstream, fixar commits e licenças de todas as dependências e definir um pacote de fontes correspondente para revisão jurídica. Qualquer recompilação, instalação, cópia pública, troca do carregador ou distribuição deve ser proposta separadamente. O 09C.6.11 encerra a investigação documental possível neste ambiente; **não aprova lançamento**.

## Validação e estado final

Recalcularam-se os hashes e a integridade do tarball, compararam-se seus cinco membros aos extraídos e inspecionou-se a configuração embutida sem executar terceiros. Validar este Markdown com verificação de whitespace e `git diff --check` (arquivo novo não rastreado exige checagem própria). O único arquivo criado neste pacote é este relatório. Nenhum binário GPL foi adicionado ao repositório; não houve alteração de módulos de produção, instalação, commit, push, merge ou deploy.

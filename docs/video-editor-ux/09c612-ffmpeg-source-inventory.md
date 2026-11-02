# Package 09C.6.12 — inventário de fontes candidatas ao core FFmpeg

Consulta às fontes oficiais: 20/10/2026. Método: leitura das páginas oficiais e inspeção estática dos tarballs e do WASM recém-baixados, conforme a [cadeia de custódia](09c612-ffmpeg-chain-of-custody.md). **Este é um mapa para montar fontes correspondentes, não um pacote de fontes completo.** Nenhum repositório foi clonado, compilado ou incorporado ao EntreUS.

## Níveis de conclusão

- **COMPROVADO:** conteúdo observado no WASM ou nos pacotes npm.
- **CORROBORADO:** versão, receita ou licença documentada pelo mantenedor, sem associação imutável ao WASM.
- **NÃO COMPROVADO:** commit ou conteúdo exato efetivamente usado no build.
- **BLOQUEADO:** ausência de fonte correspondente demonstrada para o binário que se cogita distribuir.

## Publicação, receita e configuração

**CORROBORADO:** a [release `v12.15`](https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v12.15) associa wrapper `0.12.15` e core `0.12.10` ao [commit `71aa99d37c02a7b4c435275ca9ef50e612f6efa1`](https://github.com/ffmpegwasm/ffmpeg.wasm/commit/71aa99d37c02a7b4c435275ca9ef50e612f6efa1). É um **commit de release**, não um atestado de que seu código produziu os bytes npm. Os metadados de versão e *packument* npm não trouxeram `gitHead` nem `dist.attestations` para esses pacotes na consulta de 20/10/2026.

**CORROBORADO:** o [Dockerfile da tag](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/Dockerfile) declara `emscripten/emsdk:3.1.40`, FFmpeg `n5.1.4` e as bibliotecas abaixo. O [Makefile](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/Makefile) oferece o alvo `prd` com `-O3 -msimd128`; [`build/ffmpeg.sh`](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/build/ffmpeg.sh) e [`build/ffmpeg-wasm.sh`](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/build/ffmpeg-wasm.sh) descrevem configuração e ligação do core. O Dockerfile inclui código de `src/bind`, `src/fftools` e scripts `build/*.sh`. A imagem é referida por *tag*, sem digest de imagem demonstrado aqui.

**COMPROVADO no WASM recém-baixado:** uma string ASCII de 669 bytes no offset 27.245.875 contém `--enable-gpl`, `--enable-libx264`, `--enable-libx265`, `--enable-libvpx`, `--enable-libmp3lame`, `--enable-libtheora`, `--enable-libvorbis`, `--enable-libopus`, `--enable-zlib`, `--enable-libwebp`, `--enable-libfreetype`, `--enable-libfribidi`, `--enable-libass`, `--enable-libzimg` e `-O3 -msimd128`. Não contém `--enable-nonfree`. Os WASM ESM e UMD são byte a byte idênticos. Uma string de configuração confirma as opções declaradas pelo binário, mas não identifica commits, objetos ligados, patches ou a escolha de licença de componentes com dupla licença.

## Componentes candidatos e licenças indicadas

Todos os *refs* abaixo vêm do [Dockerfile `v12.15`](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/Dockerfile). A coluna licença resume **declarações da fonte indicada**, não uma atribuição definitiva a cada objeto do WASM. Falta confirmar o commit efetivo e ler avisos e exceções arquivo por arquivo.

| Componente | Ref da receita | Indicação de licença na fonte pública | Evidência / limite |
| --- | --- | --- | --- |
| Wrapper `@ffmpeg/ffmpeg` | `0.12.15` | MIT declarado | [Manifesto da tag](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/packages/ffmpeg/package.json); os 21 arquivos instalados coincidem com o tarball npm. |
| Core `@ffmpeg/core` | `0.12.10` | GPL-2.0-or-later declarado | [Manifesto da tag](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/packages/core/package.json); conteúdo conferido, fonte correspondente não demonstrada. |
| FFmpeg | `n5.1.4` | Base majoritariamente LGPL-2.1-or-later; partes GPL-2-or-later quando habilitadas | [Licenciamento do FFmpeg nessa tag](https://github.com/FFmpeg/FFmpeg/blob/n5.1.4/LICENSE.md). O WASM registra `--enable-gpl`. |
| x264, x265 | fork x264 `4-cores`; x265 `3.4` | GPL-2-or-later segundo o FFmpeg | [Licenciamento FFmpeg 5.1](https://ffmpeg.org/doxygen/5.1/md_LICENSE.html); os encoders estão habilitados na configuração. Refs dos forks não são commits imutáveis comprovados do build. |
| libvpx | `v1.13.1` | Licença BSD e arquivo de patentes | [Licença do fork na tag](https://github.com/ffmpegwasm/libvpx/blob/v1.13.1/LICENSE). Verificar avisos e termos de patente do conteúdo efetivo. |
| LAME / libmp3lame | `master` do fork `ffmpegwasm/lame` | GNU Library GPL v2 no [README upstream](https://github.com/lameproject/lame/blob/master/README) e [COPYING do fork](https://github.com/ffmpegwasm/lame/blob/master/COPYING) | `master` é mutável; o README também menciona MPGLIB sob GPL. Identificar arquivos realmente ligados e suas licenças. |
| Ogg | `v1.3.4` | Estilo BSD | [COPYING da tag](https://github.com/xiph/ogg/blob/v1.3.4/COPYING). |
| Theora | `v1.1.1` | Estilo BSD | [COPYING da tag](https://github.com/xiph/theora/blob/v1.1.1/COPYING). |
| Vorbis | `v1.3.3` | Estilo BSD | [Repositório do mantenedor](https://github.com/xiph/vorbis), incluindo libvorbis, libvorbisenc e libvorbisfile. Texto da versão candidata ainda deve integrar o dossiê. |
| Opus | `v1.3.1` | Estilo BSD | [COPYING da tag](https://github.com/xiph/opus/blob/v1.3.1/COPYING); avisos de patentes exigem inventário. |
| zlib | `v1.2.11` | Licença zlib | [Licença oficial](https://www.zlib.net/zlib_license.html); confirmar texto da versão efetiva. |
| libwebp | `v1.3.2` | Estilo BSD, com `PATENTS` | [COPYING upstream](https://github.com/webmproject/libwebp/blob/main/COPYING); confirmar texto e patente da versão efetiva. |
| FreeType | `VER-2-10-4` | Escolha entre FreeType License e GPLv2 | [Explicação do projeto](https://freetype.org/license). A escolha aplicável ao conjunto GPL e exceções por arquivo exigem revisão; não assumir automaticamente a FTL. |
| FriBidi | `v1.0.9` | LGPL-2.1-or-later | [Licença declarada pelo projeto](https://github.com/fribidi/fribidi); confirmar texto da tag e avisos. |
| HarfBuzz | `5.2.0` | Old MIT, com exceções por arquivo | [COPYING do projeto](https://github.com/harfbuzz/harfbuzz/blob/main/COPYING); confirmar o texto e subdiretórios da ref candidata. |
| libass | `0.15.0` | ISC | [COPYING da tag](https://github.com/libass/libass/blob/0.15.0/COPYING). |
| zimg | `release-3.0.5` | WTFPL v2 no arquivo principal | [COPYING da tag](https://github.com/sekrit-twc/zimg/blob/release-3.0.5/COPYING); clonado com `--recursive`, portanto submódulos e arquivos com outros avisos precisam de inventário. |
| SDL2 / runtime Emscripten | `embuilder build sdl2 sdl2-mt`; SDK `3.1.40` | SDL2 sob zlib segundo [documentação SDL](https://github.com/libsdl-org/sdlwiki/blob/main/SDL2/FAQLicensing.md); runtime/toolchain com composição a inventariar | Versões e objetos efetivamente incorporados não foram fixados por digest. |

O Dockerfile também usa ferramentas de build e pacotes do sistema (`pkg-config`, Autoconf, Automake, Libtool, Ragel, Git). São parte das instruções e da cadeia de ferramentas; a presença de seu código no WASM não foi afirmada. As bibliotecas listadas por `FFMPEG_LIBS` na receita incluem ainda Ogg, Vorbis, WebP, FreeType, FriBidi e HarfBuzz. A receita é evidência de intenção de ligação; a linha de configuração embutida é evidência de opções FFmpeg; nenhuma delas, isoladamente, faz inventário binário de cada objeto.

## Material necessário para fonte correspondente — NÃO COMPROVADO / BLOQUEADO

1. Evidência do mantenedor que associe o SHA-256 do tarball/WASM a uma execução de build, ao commit do monorepo e às versões **imutáveis** de FFmpeg, forks e bibliotecas, inclusive `master`, `4-cores` e submódulos recursivos.
2. Digest da imagem Emscripten, versões das ferramentas e pacotes de sistema, variáveis de ambiente, argumentos exatos, patches, logs e arquivos gerados do build efetivo.
3. Árvore de fontes de **cada componente realmente incorporado**, scripts de compilação e ligação, configuração, patches e instruções de reconstrução para o binário concreto. Comparar hashes se houver reprodução; se não for byte a byte, documentar diferenças e evidência alternativa, sem afirmar equivalência não demonstrada.
4. Textos integrais de licenças, titulares e avisos de cada versão e arquivo relevante, com atenção a LAME/MPGLIB, FreeType, HarfBuzz, zimg/submódulos e runtime Emscripten. Associar esse material aos hashes publicados.
5. Revisão jurídica da suficiência desse conjunto e das condições de redistribuição. O [guia jurídico do FFmpeg](https://ffmpeg.org/legal.html) é referência técnica de conformidade, não parecer para esta integração.

**Estado:** fonte provável e receita documentada pelo mantenedor: **CORROBORADO**. Fonte correspondente do WASM publicado: **NÃO COMPROVADO**. Build reproduzido ou atestado verificável: **NÃO COMPROVADO**. Dossiê completo para distribuição: **BLOQUEADO**.

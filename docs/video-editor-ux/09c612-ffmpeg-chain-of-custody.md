# Package 09C.6.12 — cadeia de custódia dos pacotes FFmpeg

Consulta: 20/10/2026. Projeto: `C:\Projetos\EntreUS\entreus-web`. Branch: `feature/video-editor-core-package-09b`. Este documento identifica artefatos; **não autoriza distribuição**. Nenhum código baixado foi executado. Downloads e extrações ficaram em `%TEMP%/entreus-09c612-20261020/`.

Antes da escrita, `git status --short` mostrava 78 arquivos modificados, 2 excluídos e 50 entradas não rastreadas (na visão agrupada do Git). Existiam backups anteriores em `.local-backups/` e `%TEMP%`, inclusive `entreus-09c67-20261015-120218`, `entreus-09c68-backup-20261015-134042` e `entreus-09c69-backup-20261015-152021`. Foram preservados; nenhum backup novo foi necessário para os três Markdown novos. Os demais arquivos preexistentes não foram editados.

## Critério de evidência

- **COMPROVADO:** bytes e verificações reproduzíveis nesta sessão.
- **CORROBORADO:** informação oficial consistente com os bytes, sem vínculo completo com o build.
- **NÃO COMPROVADO:** evidência necessária ainda ausente.
- **BLOQUEADO:** lacuna material para recomendar distribuição pública.

## Aquisição e comparação — COMPROVADO

Os metadados de versão, os metadados completos (*packuments*) e os tarballs foram baixados por HTTPS diretamente do [registro npm](https://registry.npmjs.org/), sem autenticação. Os endpoints consultados foram `https://registry.npmjs.org/%40ffmpeg%2Fcore/0.12.10`, `https://registry.npmjs.org/%40ffmpeg%2Fffmpeg/0.12.15`, as URLs de tarball abaixo e `https://registry.npmjs.org/-/npm/v1/keys`. SHA-256, SHA-512, SHA-1 e a assinatura ECDSA foram verificados com `node:crypto`; os arquivos foram extraídos com `tar` em TEMP e comparados por SHA-256, sem instalação nem scripts de pacote. A [documentação npm de assinaturas](https://docs.npmjs.com/about-registry-signatures/) define a mensagem assinada como `nome@versão:dist.integrity`.

| Pacote | Tarball oficial consultado | Publicação registrada no npm (UTC) | Bytes | SHA-256 calculado | SHA-512 `dist.integrity` / SHA-1 `dist.shasum` |
| --- | --- | --- | ---: | --- | --- |
| `@ffmpeg/core@0.12.10` | [core-0.12.10.tgz](https://registry.npmjs.org/@ffmpeg/core/-/core-0.12.10.tgz) | 07/01/2025 10:13:14 | 20.634.719 | `d00089ce82e1bdf637ddbe42e0c3d41a1ba8cf4c9e825e7fa4d0bb970e844bd4` | **Coincidem** com metadados recém-consultados; SHA-512 `dzNplnn2Nxle2c2i2rrDhqcB19q9cglCkWnoMTDN9Q9l3PvdjZWd1HfSPjCNWc/p8Q3CT+Es9fWOR0UhAeYQZA==` |
| `@ffmpeg/ffmpeg@0.12.15` | [ffmpeg-0.12.15.tgz](https://registry.npmjs.org/@ffmpeg/ffmpeg/-/ffmpeg-0.12.15.tgz) | 07/01/2025 10:10:00 | 18.455 | `c8a23365fb39b46d3d1d9baa2e74b522d00ce5d57e8b20471ad2665eaad38e3e` | **Coincidem** com metadados recém-consultados e com `package-lock.json`; SHA-512 `1C8Obr4GsN3xw+/1Ww6PFM84wSQAGsdoTuTWPOj2OizsRDLT4CXTaVjPhkw6ARyDus1B9X/L2LiXHqYYsGnRFw==` |

Os cinco membros do tarball recém-baixado do core coincidem, arquivo por arquivo, com a extração anterior em `%TEMP%/entreus-ffmpeg-core-0.12.10-audit/`. O tarball anterior tem o mesmo SHA-256. Os 21 arquivos do tarball recém-baixado do wrapper coincidem, arquivo por arquivo, com `node_modules/@ffmpeg/ffmpeg/`; não há arquivos extras nessa instalação. `@ffmpeg/core` não está instalado em `node_modules` nem registrado no lockfile.

Os metadados de versão do npm indicam `_npmUser.name = lucasgelfond` para os dois pacotes e os SHA-1 `3177e88852bfbfaad5d258e9e0ac1fd9dffd3223` (core) e `e5b05c2b5c946f3464b3aa85461e4654a4649d80` (wrapper); os SHA-1 foram recalculados e coincidiram. Nome de usuário publicado e datas fornecidos pelo registro são metadados, não prova independente da identidade da pessoa nem do processo de build.

As URLs públicas `https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js` e `https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm` também foram baixadas em TEMP nesta data. O JS (112.059 bytes, SHA-256 `b266ab5b952555881dd6310663986994a182acb2b7ff25cf10a25f7a37ac2b21`) e o WASM (32.232.419 bytes, SHA-256 `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7`) coincidem com os membros UMD do tarball npm. Isto é uma comparação dos bytes servidos **nesta consulta**, não uma garantia permanente do CDN. O [carregador atual](../../lib/media/ffmpeg-load.ts) usa essas URLs no caminho comum.

## Assinatura do registro — COMPROVADO com limite

Os dois metadados npm contêm uma assinatura ECDSA com `keyid` `SHA256:jl3bwswu80PjjokCgh0o2w5c2U4LhQAE57gj9cz1kzA`. Com a chave pública retornada por `/-/npm/v1/keys`, `node:crypto.verify('sha256', ...)` retornou **true** para a mensagem `nome@versão:dist.integrity` de cada pacote. Os digests dos tarballs conferem com as integridades assinadas. O registro informa publicação em 07/01/2025 e expiração dessa chave em 29/01/2025. A chave está expirada na data desta consulta; a data de publicação e a chave vieram do próprio registro, sem carimbo de tempo independente ou verificação externa de revogação. Portanto a assinatura comprova consistência criptográfica **sob a chave apresentada pelo npm**, não a identidade do código-fonte nem qual pipeline gerou o WASM. Não foi encontrada entrada `dist.attestations` nos metadados consultados; isto registra ausência de evidência de atestado ali, sem afirmar que nenhum outro atestado exista.

## Identidade do conteúdo — COMPROVADO

| Artefato do tarball oficial | Bytes | SHA-256 |
| --- | ---: | --- |
| Core `dist/esm/ffmpeg-core.js` | 111.804 | `67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3` |
| Core `dist/esm/ffmpeg-core.wasm` | 32.232.419 | `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7` |
| Core `dist/umd/ffmpeg-core.js` | 112.059 | `b266ab5b952555881dd6310663986994a182acb2b7ff25cf10a25f7a37ac2b21` |
| Core `dist/umd/ffmpeg-core.wasm` | 32.232.419 | `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7` |
| Wrapper `dist/esm/worker.js` | 5.085 | `feff0ac937ea225e997e1fae997a74f8b8d572423a526da59eb56624b1f3cde7` |
| Wrapper `dist/esm/const.js` | 1.016 | `9e3bc9dd84781c81daf459e2c46eeec815edac35089832681d9a9a0f383060d0` |
| Wrapper `dist/esm/errors.js` | 332 | `619310d7ef5fe5fefa0a31927db862b7c291713cfef4d71753fa8aafd18f4db6` |
| Wrapper `dist/esm/classes.js` | 9.747 | `7a829c898bdbc3a8806652a5502d9101178ce4e988a2c50b3abc1306ce4fc919` |

Os dois WASM do tarball têm o mesmo hash. O quinto membro do tarball core é `package.json`. O wrapper declara MIT e o core declara GPL-2.0-or-later em seus manifestos npm e nos manifestos da [release v12.15](https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v12.15).

## Limite da cadeia — NÃO COMPROVADO / BLOQUEADO

**A cadeia do registro npm até as cópias locais e os bytes UMD observados no CDN está comprovada para esta data. A cadeia do código-fonte e das ferramentas de compilação até o WASM publicado permanece NÃO COMPROVADA e BLOQUEIA recomendação de distribuição.** O tarball core contém apenas `package.json` e os pares JS/WASM ESM e UMD; não contém fontes correspondentes, avisos completos, patches, instruções de reconstrução ou um atestado que associe o digest ao build. A assinatura npm protege a integridade declarada do pacote, não atesta seus commits de origem. Consulte o [inventário de fontes](09c612-ffmpeg-source-inventory.md) e a [avaliação de distribuição](09c612-ffmpeg-distribution-readiness.md).

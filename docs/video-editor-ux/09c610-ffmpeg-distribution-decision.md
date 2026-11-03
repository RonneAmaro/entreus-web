# Package 09C.6.10 — decisão sobre distribuição do FFmpeg

Data: 15/10/2026. Escopo: análise técnica e de licenciamento; nenhuma distribuição ou mudança de produção neste pacote.

## Decisão

**Recomendação técnica condicional: A, manter o núcleo atual para uma eventual entrega pela mesma origem, somente após avaliação jurídica e comprovação da fonte correspondente.** É a única alternativa que já produziu, no Studio existente, MP4 com H.264 e AAC, cortes, reordenação, fades e música em build local de produção. A recomendação **não autoriza lançamento**: a cadeia de proveniência do binário e as consequências da GPL para a integração ainda estão abertas. Se a avaliação jurídica impedir A, fazer uma prova curta de B com H.264/AAC antes de decidir por uma reescrita C. C é uma linha de pesquisa de médio prazo, não uma troca imediata com paridade demonstrada.

Critérios inegociáveis para publicação: MP4 reproduzível com vídeo H.264 e áudio AAC quando presente; exportação, cancelamento e reexportação no Studio e no gravador; entrega auditável; revisão jurídica das obrigações e de patentes. Nenhuma das três alternativas está liberada para uso público por este relatório.

## Estado e evidências locais

- Diretório confirmado: `C:\Projetos\EntreUS\entreus-web`; branch: `feature/video-editor-core-package-09b`.
- `git status --short` já mostrava muitas modificações e arquivos não rastreados, inclusive editor, carregador, testes e documentos de pacotes anteriores. Foram preservados. O único arquivo criado no 09C.6.10 é este relatório.
- O carregador atual em [`lib/media/ffmpeg-load.ts`](../../lib/media/ffmpeg-load.ts) fixa `@ffmpeg/core@0.12.10`. A rota ESM de teste exige `NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG=1` e ambiente local; a fixture fornece Worker/core/WASM. Fora dessa condição, o código busca **UMD do unpkg no navegador** e cria URLs `blob:`. Isto é uma dependência externa efetiva do caminho comum, não uma entrega própria auditada nem aprovação de licença. O Next.js sozinho não entrega o core ESM da fixture.
- Os [resultados 09C.6.7](09c67-production-local-validation.md) registram exportação curta e 720p H.264/AAC em Chromium, com Worker e core ESM/WASM interceptados pelo Playwright; não demonstram CDN, CSP implantada ou mobile. Os [resultados 09C.6.9](09c69-ffmpeg-lifecycle.md) registram cancelamento, timeout, reexportação e 8/8 cenários de falha, além de 2/2 exportações reais. O teste de memória física do Worker/WASM ainda não foi feito. Os resultados de build, TypeScript e lint são herdados desses relatórios, sem nova execução aqui.
- O pacote local `@ffmpeg/ffmpeg@0.12.15` declara **MIT** no manifesto; seu `dist/esm/worker.js` foi usado na fixture. O manifesto de [`@ffmpeg/core@0.12.10`](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/packages/core/package.json) declara **GPL-2.0-or-later**. A licença MIT do wrapper e do Worker não substitui a licença do motor. O repositório [v12.15 do wrapper](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/packages/ffmpeg/package.json) confirma sua versão e declaração MIT.

### Artefatos auditados

| Artefato local | Tamanho | SHA-256 |
| --- | ---: | --- |
| Pacote npm `core-0.12.10.tgz` em `%TEMP%/entreus-ffmpeg-core-0.12.10-audit/` | 20.634.719 bytes | `d00089ce82e1bdf637ddbe42e0c3d41a1ba8cf4c9e825e7fa4d0bb970e844bd4` |
| `dist/esm/ffmpeg-core.js` extraído | 111.804 bytes | `67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3` |
| `dist/esm/ffmpeg-core.wasm` extraído | 32.232.419 bytes (30,74 MiB) | `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7` |
| `node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js` | 5.085 bytes | `feff0ac937ea225e997e1fae997a74f8b8d572423a526da59eb56624b1f3cde7` |

O metadado npm preservado no mesmo diretório TEMP aponta para `https://registry.npmjs.org/@ffmpeg/core/-/core-0.12.10.tgz`, com integridade SHA-512 `dzNplnn2Nxle2c2i2rrDhqcB19q9cglCkWnoMTDN9Q9l3PvdjZWd1HfSPjCNWc/p8Q3CT+Es9fWOR0UhAeYQZA==`. A fixture 09C.6.7 conferiu essa integridade e os hashes ESM antes de responder às requisições. O tarball contém apenas `package.json` e pares JS/WASM ESM e UMD: **não contém fontes, textos de licença, avisos ou instruções de compilação**. O pacote instalado do wrapper também não contém arquivo `LICENSE` separado. Portanto, declarações de licença no manifesto não são, por si, um pacote de conformidade para redistribuição.

### O que a fonte pública demonstra e o que ainda falta

O [`Dockerfile` da tag v12.15](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/Dockerfile) usa Emscripten `3.1.40`, indica FFmpeg `n5.1.4`, passa `--enable-gpl`, `--enable-libx264`, `--enable-libx265`, `--enable-libvpx`, `--enable-libmp3lame`, `--enable-libtheora`, `--enable-libvorbis`, `--enable-libopus`, `--enable-libwebp`, `--enable-libfreetype`, `--enable-libfribidi`, `--enable-libass`, `--enable-libzimg` e `--enable-zlib`, e liga essas bibliotecas e dependências como Ogg e HarfBuzz. Os [scripts da tag](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v12.15/build) mostram o procedimento proposto de compilação. O [guia oficial de licenças do FFmpeg](https://ffmpeg.org/legal.html) explica que componentes GPL ativados fazem o FFmpeg compilado seguir GPL; ele cita libx264 em especial. O Studio e o gravador chamam `libx264` e `aac` no código atual; o MP4 validado confirma esses fluxos no núcleo ensaiado.

**Limite da prova:** a tag, o Dockerfile e os scripts são candidatos de fonte correspondente, mas não há registro que reproduza byte a byte o WASM do tarball npm: faltam commits efetivos de todas as bibliotecas, configuração extraída do binário, patches, versões exatas das dependências, opções e logs de build, avisos e inventário de licenças por biblioteca. Branches como `master` e `4-cores` não bastam para identificar um commit imutável. Nem todas as bibliotecas listadas no Dockerfile foram verificadas dentro do WASM distribuído. Exigir essa correspondência antes de publicar ou reconstruir o core com proveniência controlada. Não assumir que a ausência de `--enable-nonfree` resolve todas as verificações de licença.

## Comparação das alternativas

**A — FFmpeg GPL atual.** Reaproveita carregador, comandos e ciclo de vida. H.264/AAC está comprovado em Chromium local. A entrega pública exige Worker ESM, imports, core JS e WASM versionados e o pacote jurídico correspondente. Hospedar em CDN, em domínio separado ou em `public/` não elimina obrigações de distribuição. A [FAQ da GNU](https://www.gnu.org/licenses/gpl-faq.en.html) permite atividade comercial sob GPL e ressalta que a análise de obra combinada depende da forma real de integração; não se conclui aqui que toda a plataforma deva ser aberta nem que o uso comercial seja proibido. O limite entre Worker, frontend, páginas e serviços do EntreUS precisa de parecer específico.

**B — core FFmpeg com configuração compatível com LGPL.** O [FFmpeg descreve](https://ffmpeg.org/legal.html) uma compilação sem `--enable-gpl` e `--enable-nonfree` como ponto de partida, sujeita às licenças de todas as bibliotecas vinculadas. Remover x264 e x265 elimina os encoders usados hoje: os comandos `-c:v libx264` do Studio e do gravador falhariam até serem substituídos. O encoder [`aac` nativo do FFmpeg](https://ffmpeg.org/ffmpeg-codecs.html) é candidato para manter áudio; isso não prova o build WASM. O [`libopenh264` documentado pelo FFmpeg](https://ffmpeg.org/ffmpeg-codecs.html) e o [código BSD da Cisco](https://github.com/cisco/openh264/blob/master/LICENSE) são candidatos a H.264, mas **não** há build WASM, teste de desempenho/paridade ou parecer sobre condições de patentes e distribuição desse binário. Um MP4 com outro codec não substitui automaticamente o requisito H.264/AAC. Tamanho menor e velocidade melhor seriam hipóteses; compilar, inventariar licenças, mudar comandos e repetir E2E exigem trabalho novo. Mesmo LGPL impõe obrigações, incluindo fonte correspondente, avisos e questões de vinculação/substituição a avaliar em WASM.

**C — WebCodecs com multiplexação MP4.** [`VideoEncoder` e `AudioEncoder`](https://www.w3.org/TR/webcodecs/) geram chunks codificados, não um arquivo MP4; seria necessária uma biblioteca de mux com licença auditada, timestamps, metadados AVC/AAC, alinhamento A/V e fechamento de arquivo. A especificação permite que cada implementação suporte subconjuntos de codecs. Antes de exportar, é necessário verificar `VideoEncoder.isConfigSupported()` para o perfil H.264, resolução e taxa de quadros e `AudioEncoder.isConfigSupported()` para AAC no **dispositivo real**. O [guia de codecs da MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection) aponta lacunas de AAC em Firefox e Linux desktop e recomenda H.264/AAC em MP4 para ampla reprodução; disponibilidade da API não garante esses encoders. Renderizar cortes, composição, texto, fades e mixagem de áudio exigiria um novo pipeline de frames e áudio, controles de fila e pressão de memória, além de uma estratégia de fallback para dispositivos sem AAC. Operação offline após carregar o app é plausível, mas não foi testada. Usar codecs fornecidos pelo navegador evita distribuir este core GPL, porém não dispensa revisão de licença do muxer nem avaliação de patentes de H.264/AAC.

### Matriz de decisão

Legenda: **comprovado** = observado nos ensaios locais citados; **provável** = arquitetura tecnicamente plausível, ainda sem ensaio; **não comprovado** = depende de teste, orçamento ou parecer; **incompatível hoje** = falha um requisito com o código atual.

| Critério | A — atual GPL | B — FFmpeg LGPL | C — WebCodecs + mux |
| --- | --- | --- | --- |
| Custo mensal | Não comprovado; tráfego do WASM e cache na hospedagem | Não comprovado; tamanho e tráfego do novo WASM desconhecidos | Não comprovado; menor download do motor é provável, mux/app ainda trafegam |
| Custo de implementação | Menor esforço técnico relativo; inventário jurídico e entrega ainda necessários | Maior: build reproduzível, encoder substituto, comandos e testes | Maior: pipeline de mídia e mux novos |
| Complexidade técnica | Moderada: distribuição, CSP, integridade e atualização | Alta: toolchain, bibliotecas e paridade de codecs | Alta: composição, áudio, timestamps e fallback |
| Risco de licenciamento | Alto até parecer e fonte correspondente | Menor em tese; não comprovado para o binário, vinculação e patentes | Sem GPL deste core; mux e patentes ainda exigem revisão |
| H.264/AAC em MP4 | **Comprovado** no Chromium local | **Incompatível hoje** sem x264; substituto não comprovado | Possível sob suporte por dispositivo; não comprovado no Studio |
| Navegadores | Chromium local comprovado; matriz ampla pendente | Não comprovado | Suporte de API e de codecs varia; matriz pendente |
| Mobile | Não comprovado; risco de memória e tempo | Não comprovado | Não comprovado; suporte/recursos variam por aparelho |
| Desempenho esperado | Curto e 720p medidos; cargas longas pendentes | Não mensurado; menor core não garante encoder rápido | Aceleração possível, mas throughput e mixagem não medidos |
| Estabilidade | Falhas e recuperação locais comprovadas; produção pendente | Não comprovada | Não comprovada |
| Manutenção futura | Mantém FFmpeg e dívida de proveniência/licença | Mantém fork/build próprios e atualizações de dependências | Mantém pipeline e matriz de navegadores em evolução |
| Serviço externo | Caminho comum atual depende do unpkg; entrega própria removeria isso | Entrega própria possível, não implementada | Sem serviço de codificação obrigatório; app/mux ainda precisam ser entregues |
| Código existente | Maior reutilização; comandos e lifecycle já testados | Reutiliza wrapper e parte do pipeline, mas troca encoder/comandos | Pouca reutilização do exportador; UI e modelo de edição podem permanecer |
| R$ 0 adicional em infraestrutura | **Possível**, condicionado à franquia de tráfego/armazenamento existente | Possível, sob as mesmas condições e após build | Possível, condicionado à entrega do app/mux e aos navegadores-alvo |

Estimativa de capacidade para A: apenas o WASM ESM tem 32.232.419 bytes; **1.000 downloads frios** equivalem a cerca de **32,2 GB** de transferência do WASM, antes de JS, cabeçalhos, repetição e eventual compressão HTTP. É uma conta de volume, **não** um preço. Cache reduz downloads repetidos, mas não o primeiro acesso nem necessariamente o tráfego faturado. Não há medição da taxa de compressão, audiência, franquia ou tarifa do provedor; portanto não há previsão monetária honesta. Engenharia, análise jurídica e eventuais licenças de patentes também não se tornam gratuitas por usar infraestrutura já contratada.

## Arquitetura proposta para A, sem implementação

1. **Fechar a proveniência e a licença primeiro.** Identificar por hash cada Worker/import, core JS, WASM, bibliotecas e fontes correspondentes. Preparar textos integrais de licenças, avisos, patches, configuração, toolchain e instruções de reprodução. Fazer revisão jurídica da forma de integração e da oferta de fonte antes de qualquer publicação.
2. **Entrega de mesma origem, imutável por versão e hash.** Em etapa autorizada futura, servir Worker ESM e seus imports, core ESM e WASM por URLs fixas da origem do EntreUS, com manifesto de versão único. Usar `classWorkerURL`, `coreURL` e `wasmURL` explícitos. Não reutilizar a rota `__entreus_ffmpeg_local`, reservada ao ensaio, nem o fallback unpkg como solução final. Não misturar JS de uma versão com WASM de outra. Entregar `text/javascript` para módulos e `application/wasm` para WASM, conforme [tipos MIME documentados](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types/Common_types).
3. **Integridade e cache.** Conferir SHA-256 dos bytes na preparação/publicação e em teste de fumaça; tratar qualquer diferença como bloqueio. SRI em tag HTML não cobre automaticamente `new Worker`, import dinâmico e carga WASM, então definir mecanismo de validação real antes de prometer integridade no cliente. Usar nomes com hash, `Cache-Control` longo e `immutable` somente para arquivos que jamais mudem no mesmo URL; trocar URLs ao atualizar a versão e manter a versão anterior durante transição, conforme [orientação de cache](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control). Evitar pré-carregar 32 MB a cada visita ao app.
4. **CSP e isolamento.** Testar `worker-src` para Worker de mesma origem, `script-src` para módulos/WebAssembly (incluindo necessidade de `wasm-unsafe-eval`) e `connect-src` para os arquivos; não alargar a política global sem ensaio. O [construtor de Worker](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker) e a [regra CSP para WASM](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src) são pontos de referência. Separar flags e manifestos de desenvolvimento, teste local e produção; a flag experimental do Playwright não deve habilitar distribuição pública.
5. **Falhas e recuperação.** Reutilizar timeout, cancelamento, descarte e nova tentativa do 09C.6.9. Falha de hash, HTTP, MIME, CSP ou inicialização deve encerrar o Worker, liberar URLs `blob:` que ainda existam, manter o projeto editável e explicar a nova tentativa ao usuário. Só habilitar exportação quando todos os artefatos da mesma versão carregarem. Rollback significa apontar para versão anterior completa, nunca sobrescrever bytes de URL imutável.
6. **PWA/offline.** Carregar sob demanda e oferecer armazenamento offline apenas depois de medir quota e política de atualização; cache do PWA não implica presença garantida do WASM. O navegador pode remover dados, conforme [limites de armazenamento](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria). Testar sessão realmente sem rede, atualização de versão, pouca quota e limpeza de versão antiga antes de prometer exportação offline.

## Funcionalidades futuras

| Recurso | Interface/plano de renderização | Exigência do motor na exportação |
| --- | --- | --- |
| Camadas de vídeo e imagem; textos posicionáveis; redimensionamento e rotação | Editor de camadas, tempo, transformações e prévia | Composição sincronizada e rasterização final; A tem filtros/overlay, mas cada uso exige teste |
| 9:16, 16:9 e 1:1 | Presets, crop, composição e prévia | Escala/crop, pixels e metadados corretos no arquivo |
| Transições; stickers animados | Controles, keyframes e ativos | Composição temporal e decodificação/frames do sticker |
| Legendas automáticas; destaque de palavras | Transcrição, alinhamento, edição e temporização dependem de componentes fora do encoder | Renderizar texto/realce ou muxar trilha de legenda, conforme produto; a geração da transcrição não vem do FFmpeg/WebCodecs |
| AutoReels | Seleção de trechos, regras, narrativa e planejamento | Renderizar plano já calculado, com cortes, camadas, áudio e proporção; automação de seleção não é função do codec |

A conserva uma linguagem de filtros útil para essas saídas, mas isso não comprova desempenho em composições complexas. C exige implementação explícita de cada etapa de composição. Nenhuma funcionalidade futura foi implementada neste pacote.

## Gates, perguntas jurídicas e etapas posteriores

**Perguntas para especialista:** (1) Qual é a extensão das obrigações GPL quando o core WASM e o Worker são baixados pelo navegador e chamados pelo frontend atual? Que partes, se houver, formam uma obra combinada? (2) Qual é a forma suficiente de fornecer fonte correspondente, scripts, bibliotecas, avisos e termos para este binário exato, inclusive quando entregue por CDN? (3) Quais obrigações de cada biblioteca vinculada e quais versões da GPL/LGPL valem no build concreto? (4) Há obrigações ou royalties de patentes H.264/AAC para o uso comercial e para cada rota de distribuição, inclusive OpenH264 ou WebCodecs? (5) Como documentar avisos, EULA, direito de engenharia reversa e atualização de versões na interface? A [página jurídica do FFmpeg](https://ffmpeg.org/legal.html) oferece checklist, mas declara não ser aconselhamento jurídico. Não há parecer nesta auditoria.

**Etapas propostas, cada uma dependente de autorização humana para execução:**

1. Revisão jurídica e reconstrução da cadeia de fonte do core; decidir se A é aceitável. Se não houver fonte comprovável do npm, avaliar build reproduzível próprio antes de distribuir.
2. Aprovar orçamento de tráfego/armazenamento, escopo de navegadores e política de patentes. Só então especificar local de hospedagem, avisos e acesso à fonte.
3. Implementar entrega versionada e CSP em ambiente de ensaio, sem usar a fixture como infraestrutura; remover dependência comum do unpkg apenas quando houver substituto aprovado.
4. Testar instalação limpa, download, hashes/MIME/CSP, falhas e rollback; validar MP4 H.264/AAC e reexportação no Studio e gravador em Chromium, Firefox, Safari e aparelhos mobile representativos. Medir memória, tempo, download e quota em clipes maiores. Testar offline somente se for promessa do produto.
5. Fazer revisão final de licença e segurança, decidir publicação e só então autorizar distribuição/deploy. Se A falhar no gate jurídico, experimentar B com encoder H.264 auditado e AAC antes de estimar migração C.

**Decisões humanas pendentes:** aceitação do alcance da GPL no frontend; publicação ou reconstrução do core; escolha e custo da hospedagem; cobertura oficial de navegadores/mobile; política de patentes e avisos; autorização para alterar carregador/exportador e, depois, para publicar. Até lá, manter os binários apenas na fixture local.

## Verificação deste pacote

Leituras do Git, arquivos locais, manifestos e hashes foram feitas sem modificar código. Este relatório é o único artefato novo. Não foram executados build, TypeScript, lint, E2E, instalação, compilação de WASM ou serviços externos do projeto. A validação final deste documento é leitura, `git status` e `git diff --check` do arquivo criado. A decisão técnica encerra o **escopo de análise 09C.6.10**, mas não encerra a autorização jurídica ou técnica para lançamento público.

# ENTREUS Studio — 09E-B.1 — Whisper Tiny local

Data da execução: 25/10/2026

Diretório: `C:\Projetos\EntreUS\entreus-web`

Branch: `feature/video-editor-core-package-09b`

Situação: **APROVADO somente para a prova de conceito 09E-B.1**. O 09E-B completo não está concluído e nenhuma integração de interface foi iniciada.

## 1. Limites respeitados

- Nenhuma dependência npm foi instalada.
- `package.json` e `package-lock.json` não foram alterados por este pacote.
- `VideoEditor.tsx`, exportação MP4, Supabase, pagamentos, autenticação, RLS e dados reais não foram alterados.
- Modelo e runtime ficaram em `%TEMP%\entreus-whisper-09eb1`, fora de `public/` e do Git.
- Não houve commit, push, merge, deploy, publicação ou mudança remota.
- A inferência ocorreu no navegador local; o áudio não foi enviado a terceiros.

## 2. Recuperação e estado Git

O `AGENTS.md` foi lido antes das alterações. A branch encontrada corresponde à esperada. O worktree já estava extensamente modificado, com alterações de Studio e SECURITY 02/02.1, dois arquivos rastreados removidos e muitos arquivos não rastreados. Não havia `.git/index.lock`, mas havia várias sessões de VS Code/Codex e cinco worktrees ativos.

Estado inicial: dirty, incluindo `app/components/VideoEditor.tsx`, `package.json`, `package-lock.json`, arquivos de segurança e toda a implementação local dos pacotes anteriores.

Estado final: continua dirty; todo o estado anterior foi preservado e este pacote acrescentou somente os arquivos listados na seção 10 e o backup focado.

Não havia evidência anterior do 09E-B.1, nem modelo Tiny ou runtime Whisper em cache local.

## 3. Runtime, modelo e procedência

Runtime usado: build WASM oficial publicado em [ggml.ai/whisper.cpp](https://ggml.ai/whisper.cpp/), identificado pela própria página como commit [`231638a0`](https://github.com/ggml-org/whisper.cpp/commit/231638a0), build de 19/10/2026. O build padrão é single-file: o WASM está incorporado em `main.js`, conforme a [documentação oficial do exemplo](https://github.com/ggml-org/whisper.cpp/tree/master/examples/whisper.wasm). Não houve compilação local.

Modelo: Whisper Tiny multilíngue `ggml-tiny.bin`, repositório oficial `ggerganov/whisper.cpp`, commit `5359861c739e955e79d9a303bcbc70fb988958b1`. O repositório e o model card declaram licença MIT.

| Artefato | Bytes | SHA-256 |
|---|---:|---|
| `index.html` | 33.230 | `3e184abb5c52084e83702c74ce4a43cb1a3bcd660198df35f83374adb9e95ed5` |
| `helpers.js` | 6.521 | `5371c69265551a7f7d48a7953d118e6503d8a5d480710966dfb9c2a52981a4d8` |
| `main.js` com WASM incorporado | 1.770.840 | `11ffd6ca6345033d319c14855309ece7aa21d59b02fad70f9eab4c2311e08b9f` |
| `ggml-tiny.bin` | 77.691.713 | `be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21` |

Download inicial estimado de runtime + modelo: 79.502.304 bytes, ou 75,819 MiB. Os hashes foram verificados antes de cada execução.

## 4. Ambiente efetivamente testado

- Windows, Intel Core i5-3470 3,20 GHz, 4 núcleos/4 processadores lógicos.
- 15,89 GiB de RAM.
- Intel HD Graphics integrada; sem GPU dedicada. O log do motor confirma execução CPU/WASM (`WASM_SIMD = 1`, quatro threads), sem backend de GPU.
- Chromium Headless 149.0.7827.55.
- Google Chrome 155.0.8059.86.
- Microsoft Edge 156.0.4314.42.
- `crossOriginIsolated`, `SharedArrayBuffer` e WASM SIMD foram confirmados nos três navegadores.

Chrome e Edge estão comprovados somente no Windows desktop e em modo headless. Android, Safari, iPhone e dispositivos físicos não foram testados.

## 5. Áudio de referência e preparação

Áudio fictício gerado localmente pela voz Windows “Microsoft Maria Desktop — Portuguese (Brazil)”.

- WAV fonte: mono, PCM 16-bit, 22.050 Hz, 1.022.908 bytes.
- SHA-256: `ecbd556a97aed449a4387dba780dab9d5085c0d532de1731fa00def304895a8c`.
- Preparação no navegador: 371.106 amostras `Float32`, mono, 16.000 Hz, 23,194125 s.
- Pico observado: 0,76269; RMS: 0,06516; valores finitos.

Texto esperado:

> Olá, este é um teste de transcrição automática do EntreUS Studio. Hoje é um bom dia para criar vídeos, revisar legendas e compartilhar histórias. Depois de uma pequena pausa, continuamos com clareza, atenção e segurança.

## 6. Resultado real

O resultado foi idêntico nas três famílias Chromium testadas:

> Olá, este é um teste de transcrição automática do entre o S-Studio. Hoje é um bom dia para criar vídeos, revisar legendas e compartilhar histórias. Depois de uma pequena pausa, continuamos com plareza, atenção e segurança.

Comparação normalizada: 4 edições em 35 palavras, WER de 11,43%. Os erros observados foram principalmente o nome do produto e “clareza”.

Timestamps fornecidos pelo motor, por segmento:

| Início | Fim | Texto reconhecido |
|---|---|---|
| 00:00:00.000 | 00:00:06.760 | Olá, este é um teste de transcrição automática do entre o S-Studio. |
| 00:00:07.260 | 00:00:14.880 | Hoje é um bom dia para criar vídeos, revisar legendas e compartilhar histórias. |
| 00:00:15.400 | 00:00:22.560 | Depois de uma pequena pausa, continuamos com plareza, atenção e segurança. |

Não houve timestamps por palavra e o adaptador não os inventa.

## 7. Desempenho observado

Medições de parede, incluindo chamada JS e inferência:

| Navegador | Execução 1 | Execução final | Fator final vs. áudio |
|---|---:|---:|---:|
| Chromium 149 | 13,198 s | 55,160 s | 2,378× |
| Chrome 155 | 14,863 s | 20,130 s | 0,868× |
| Edge 156 | 13,626 s | 17,643 s | 0,761× |

A saída textual e os timestamps permaneceram determinísticos. A grande variação do Chromium ocorreu com várias sessões e processos de desenvolvimento ativos; contenção de CPU é a explicação provável, não comprovada. Por isso, os números não devem ser tratados como benchmark definitivo.

Na execução final:

- carregamento da página/runtime: 0,233 a 0,451 s;
- cópia do modelo para o FS WASM: 0,151 a 0,312 s, sem incluir o download porque o arquivo já estava no cache local;
- inicialização do modelo: 0,225 a 0,362 s;
- preparação do áudio: 0,047 a 0,237 s.

Memória observável:

- heap linear WASM ao iniciar: 512 MiB reservados;
- após inicializar o modelo e após a fala: 614,44 MiB;
- após a inferência de silêncio: 711,69 MiB;
- após `Module.free`, remoção do modelo e limpeza das referências: ainda 711,69 MiB;
- heap JS usado após a fala: aproximadamente 82,7–83,0 MiB.

`Module.free` liberou o contexto, mas WebAssembly não devolveu a memória linear já expandida ao navegador. A aba/Worker precisa ser encerrada para recuperação forte de memória.

## 8. Testes negativos e limitações encontradas

- Modelo ausente: tratado, `Module.init` retornou `0`.
- Áudio inválido: `decodeAudioData` rejeitou o arquivo e não iniciou inferência.
- Áudio ausente: tratado com `js: no audio data`.
- Cancelamento da preparação PCM: coberto por teste unitário com `AbortSignal`.
- Cancelamento da inferência: não testável cooperativamente; o binding `full_default` é síncrono e não expõe cancelamento. O 09E-B.2 deverá executar em Worker descartável e terminar o Worker para cancelamento forte.
- Limpeza: contexto, áudio e arquivo virtual foram liberados; a reserva do heap WASM permaneceu.
- Silêncio de 2 s: o Tiny produziu a alucinação `[MÚSICA]`, com timestamp 00:00:00.000–00:00:10.000. VAD/filtro de silêncio e validação de duração são obrigatórios antes de inserir legendas.
- O runtime requer cabeçalhos COOP/COEP para `SharedArrayBuffer` e pthreads.
- O build oficial usado é um artefato da demo associado a um commit, não um asset versionado de release. Uma distribuição de produção precisa de artefato reproduzível e pinado.
- A reserva de 512–712 MiB torna Android e Safari/iPhone de alto risco até teste físico. Nenhuma compatibilidade móvel é afirmada.
- O nome próprio “EntreUS Studio” não foi reconhecido corretamente pelo Tiny.

## 9. Validações de código

- Prova real em Chromium, Chrome e Edge: aprovada.
- Testes unitários focados: 2 arquivos, 8 testes, todos aprovados.
- Preparação PCM: mono/16 kHz, métricas, áudio vazio, canais divergentes, limite de duração e cancelamento.
- Parser/adaptador: timestamps, IDs determinísticos, ordem, persistência com `validSubtitle`, ausência de palavras inventadas e rejeição de sobreposição.
- TypeScript focado, excluindo `.next`: aprovado.
- ESLint focado: aprovado.
- `git diff --check`: aprovado.
- Build não executado: não houve mudança de Next/UI/exportação que o justificasse, havia outras sessões ativas e o typecheck global já é bloqueado por corrupção preexistente em `.next/dev/types/routes.d.ts` (SHA-256 `8165f11d075b4ea437b680055d06b5921f430a36e48819c1123b1a83ba85785e`). Esse cache não foi apagado nem regenerado.

Resultados completos das últimas execuções ficaram somente no cache local:

- `%TEMP%\entreus-whisper-09eb1\result-chromium.json`
- `%TEMP%\entreus-whisper-09eb1\result-chrome.json`
- `%TEMP%\entreus-whisper-09eb1\result-edge.json`

## 10. Arquivos acrescentados e backup

- `lib/video-editor/transcription.ts`: preparação PCM, parser do log e adaptador para `SubtitleSegment`.
- `tests/unit/video-editor-transcription.test.ts`: testes unitários focados.
- `scripts/run-whisper-09eb1-poc.mjs`: executor local auditável da prova.
- `docs/video-editor-ux/09eb1-whisper-tiny-poc.md`: este relatório.

Backup focado anterior às edições:

- `.local-backups/09eb1-pre-edit-20261025-075623/`
- `SHA256.txt` registra `AGENTS.md`, manifests, `subtitles.ts` e `VideoEditor.tsx`.
- Uma cópia integral de `lib/video-editor/subtitles.ts` foi preservada.

## 11. Plano recomendado para 09E-B.2

1. Autorizar e produzir um build WASM reproduzível, pinado a tag/commit, ou obter asset oficial versionado; registrar licença, SBOM e hashes.
2. Manter modelo fora de `public/`, com download explícito, verificação SHA-256, cache IndexedDB/OPFS e opção de remoção pelo usuário.
3. Executar Whisper em Worker dedicado; cancelamento deve terminar o Worker e recuperar o heap da aba.
4. Aplicar VAD/limiar de energia e rejeitar segmentos que excedam a duração real para conter alucinações de silêncio.
5. Dividir áudios longos em janelas com sobreposição controlada e reconciliar timestamps.
6. Reusar `prepareWhisperPcm`, `parseWhisperCppSegments` e `whisperSegmentsToSubtitles`, mas só inserir legendas após revisão e confirmação explícita.
7. Testar fala humana autorizada, sotaques PT-BR, ruído, música, pausas e nomes próprios; definir limiar de WER aceitável.
8. Testar Chrome/Edge visíveis e dispositivos Android/iPhone reais, incluindo falha por pouca memória e ausência de SIMD/isolamento.
9. Só então criar a interface de transcrição, sem modificar o exportador MP4 e sem ativar publicação externa.

Nenhum item do 09E-B.2 foi iniciado por este pacote.

# 09E-B.2 — Integração do Whisper Tiny ao EntreUS Studio

Data da retomada: 26/10/2026\
Branch: `feature/video-editor-core-package-09b`\
Diretório: `C:\Projetos\EntreUS\entreus-web`\
Status deste checkpoint: **APROVADO — implementação recuperada e validada em 26/10/2026**

## Estado encontrado após o reinício

O pacote não foi reiniciado. O disco contém uma integração 09E-B.2 substancial, posterior ao relatório 09E-B.1: painel cliente, preparação de áudio, Worker descartável, runtime/modelo Tiny verificados por SHA-256, testes unitários e E2E. Com exceção de `app/components/VideoEditor.tsx`, os principais arquivos do pacote ainda são novos e não rastreados no Git.

O worktree possui muitas alterações preexistentes fora deste escopo. Elas foram mantidas. Existem outros quatro worktrees, mas nenhum arquivo foi escrito neles. Não houve troca de branch, commit, push, merge, deploy, instalação de dependências nem alteração de Supabase, RLS ou pagamentos.

## Classificação inicial

| Item | Estado inicial | Evidência no disco |
| --- | --- | --- |
| Runtime Whisper Tiny | CONCLUÍDO | `whisper-runtime.ts` injeta o runtime oficial verificado no Worker. |
| Modelo multilíngue | CONCLUÍDO | `ggml-tiny.bin` multilíngue, hash fixado, idioma `pt`. |
| Carregamento sob demanda | CONCLUÍDO | download só começa após confirmação do usuário. |
| Download inicial informado | CONCLUÍDO | painel informa aproximadamente 75,8 MB antes de iniciar. |
| Processamento local | CONCLUÍDO | PCM é transferido ao Worker; não existe upload de áudio. |
| Web Worker | CONCLUÍDO | inferência isolada em `public/workers/whisper-runtime-worker.js`. |
| Controle de memória WASM | CONCLUÍDO | instância liberada, arquivo do FS removido e Worker encerrado ao terminar/cancelar. |
| Cancelamento real | CONCLUÍDO | AbortController durante preparação/download e `Worker.terminate()` durante inferência síncrona; `taskId` descarta respostas antigas. |
| Tratamento de silêncio | CONCLUÍDO, a revalidar | silêncio global e por segmento é filtrado com limiares conservadores para preservar fala baixa. |
| Extração/preparação do áudio | CONCLUÍDO | vídeo, narração e música são decodificados e compostos conforme a timeline. |
| PCM mono/16 kHz | CONCLUÍDO | mixagem, reamostragem e limite de 120 segundos em `transcription.ts`. |
| PT-BR real | PARCIAL | aprovado no 09E-B.1; ainda não repetido nesta retomada. |
| Timestamps | CONCLUÍDO | segmentos do whisper.cpp são preservados; não há tempos inventados por palavra. |
| Painel automático | CONCLUÍDO | confirmação, etapas reais, erro, silêncio, cancelamento e revisão. |
| Integração ao editor | CONCLUÍDO | painel inserido na ferramenta de legendas do `VideoEditor`. |
| Revisão manual | CONCLUÍDO | texto, início, fim e remoção editáveis antes da inserção. |
| Inserção/proteção da timeline | CONCLUÍDO | segmentos gerados são anexados; legendas existentes não são substituídas. |
| Persistência | CONCLUÍDO, a revalidar | reutiliza `subtitles` do projeto persistido. |
| Exportação MP4 | CONCLUÍDO, a revalidar | reutiliza overlays de legenda do pipeline de exportação. |
| Testes automatizados | PARCIAL | unitários, TypeScript e lint focado passaram; E2E ainda pendente neste checkpoint. |

## Evidências iniciais desta retomada

- Unitários focados: 3 arquivos, 21 testes aprovados.
- TypeScript: `npx.cmd tsc --noEmit -p tsconfig.whisper.json` aprovado.
- ESLint focado: aprovado sem saída.
- Node.js: v24.18.0.
- Next.js instalado: 16.2.10; documentação local de Client Components e `public/` consultada antes de qualquer alteração de código.
- Porta 3000: nenhum listener foi encontrado na inspeção inicial.

## Preservação

Backup anterior ao pacote: `.local-backups/09eb2-pre-edit-20261025-091231`.\
Backup da sessão anterior: `.local-backups/09eb2-resume-20261025-184421`.\
Backup desta retomada, antes de editar: `.local-backups/09eb2-recovery-pre-edit-20261026-084500`.\
O último backup contém 21 arquivos e `SHA256.txt` com hashes individuais.

## Pendências deste checkpoint

1. Executar a inferência real PT-BR e a prova de cancelamento no Worker com os artefatos locais auditados.
2. Executar o E2E 09E-B.2, incluindo falha do modelo, silêncio, revisão, preservação, persistência e MP4.
3. Inspecionar o MP4 produzido, quadros e áudio.
4. Executar build Next.js e `git diff --check` sem apagar caches compartilhados.
5. Iniciar ou reutilizar o servidor local e registrar a URL.
6. Corrigir somente falhas demonstradas dentro do escopo e atualizar este relatório com o resultado final.

## Comandos seguros de retomada

```powershell
git branch --show-current
git status --short --untracked-files=all
npx.cmd vitest run tests/unit/video-editor-transcription.test.ts tests/unit/video-editor-subtitles.test.ts tests/unit/video-editor-project-persistence.test.ts
npx.cmd tsc --noEmit -p tsconfig.whisper.json
npx.cmd eslint app/components/VideoEditor.tsx app/components/video-editor/AutomaticSubtitlesPanel.tsx lib/video-editor/transcription.ts lib/video-editor/whisper-runtime.ts tests/unit/video-editor-transcription.test.ts tests/e2e/video-editor-09eb2.spec.ts tests/e2e/whisper-local-fixture.ts
node scripts/run-whisper-worker-probe.mjs
$env:NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG='1'
npx.cmd playwright test tests/e2e/video-editor-09eb2.spec.ts --project=chromium --workers=1 --reporter=list
```

## Resultado final da retomada

### O que já estava pronto e foi recuperado

- `VideoEditor.tsx` já extraía e decodificava áudio de vídeo, narração e música, respeitando posição, trim e duração dos clipes.
- `transcription.ts` já compunha PCM mono em 16 kHz, limitava a timeline a 120 segundos, preservava timestamps por segmento e filtrava silêncio com limiares conservadores.
- `whisper-runtime.ts` e o template do Worker já fixavam runtime/modelo Tiny oficiais por URL e SHA-256, carregavam sob demanda e mantinham o áudio no navegador.
- `AutomaticSubtitlesPanel.tsx` já informava download, uso aproximado de memória e processamento local; também implementava etapas reais, revisão manual, cancelamento forte e descarte de respostas antigas.
- A inserção já anexava as novas legendas sem substituir as existentes. Persistência, preview, timeline e exportação já reutilizavam o sistema de legendas profissionais do 09E-A.
- A sessão anterior ainda não tinha produzido relatório 09E-B.2, mas deixou testes unitários/E2E e um MP4 de evidência.

### Trabalho feito nesta execução

- Reconstrução do estado real do pacote a partir dos fontes, backups, hashes e testes.
- Backup focado novo com 21 arquivos; 21/21 hashes foram revalidados.
- Criação e conclusão deste relatório permanente.
- Execução de inferência real PT-BR no Worker, inclusive cancelamento durante `full_default`.
- Execução de testes unitários, TypeScript, ESLint, E2E, exportação MP4, build Next.js e `git diff --check`.
- Restauração do `tsconfig.json` após a reformatação automática do Next no build isolado.
- Recuperação de `test-results/.last-run.json` pela cópia preexistente mais recente depois que o runner o removeu.
- Remoção exclusiva do diretório temporário `.next-09eb2-validation`; o `.next` compartilhado não foi apagado.
- Inicialização do servidor de desenvolvimento normal em `http://localhost:3000`.

Nenhum arquivo de implementação do Studio precisou ser modificado nesta retomada: as pendências eram de validação e documentação, e a implementação recuperada passou nas provas.

## Evidências finais

### Inferência real

`node scripts/run-whisper-worker-probe.mjs` terminou com código 0 usando os artefatos auditados já presentes em `%TEMP%/entreus-whisper-09eb1`:

- CPU + WebAssembly, `crossOriginIsolated: true` e áudio PCM de 16 kHz.
- Três segmentos reais em português, de 0,000 s a 22,560 s.
- Inferência concluída em aproximadamente 22,744 s.
- Heap WASM observado: 644.284.416 bytes, aproximadamente 614 MiB.
- Cancelamento efetuado durante a etapa `transcribing`; nenhum resultado tardio foi recebido.
- O modelo foi reutilizado do cache local na execução completa.

### Testes automatizados

| Camada | Resultado final |
| --- | --- |
| Unitários focados | 3 arquivos e 21/21 testes aprovados. |
| TypeScript focado | Aprovado com `tsconfig.whisper.json`. |
| ESLint focado | Aprovado sem diagnósticos. |
| E2E Chromium | 2/2 cenários imprimiram `ok`: principal em 1,3 min e silêncio em 5,2 s. |
| Falha do modelo | Hash propositalmente inválido gerou erro seguro de integridade. |
| Silêncio | Nenhuma legenda e zero requisições externas ao Whisper. |
| Persistência | Texto revisado permaneceu no `localStorage`, reapareceu após nova página e reassociação da mídia. |
| MP4 real | Gerado com 219.686 bytes e SHA-256 `596677c389a983e0a626f55c1fac5461367d32f220bd94c3db59e577eb92d6d1`. |
| Quadro e áudio | O E2E decodificou o MP4, confirmou duração > 3,5 s, pixels claros da legenda > 40 e áudio RMS > 0,001. |
| Build Next.js | Aprovado: compilação, TypeScript e 89 páginas. |
| `git diff --check` | Código 0; somente avisos de normalização LF/CRLF em arquivos preexistentes. |

A primeira chamada do E2E foi executada sem `NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG=1` e, corretamente, não conseguiu buscar o CDN externo no ambiente de teste. A repetição com a fixture FFmpeg auditada local passou integralmente. Depois de imprimir os dois testes aprovados, o processo Playwright ficou preso na desmontagem do servidor; ele foi interrompido manualmente. Isso não alterou o resultado das asserções, mas permanece uma irregularidade operacional do runner a acompanhar.

## Servidor e ambiente

- Node.js: v24.18.0.
- Next.js: 16.2.10 com webpack no modo de desenvolvimento.
- URL: `http://localhost:3000/lab/video-editor`.
- Resposta verificada: HTTP 200, `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: require-corp`.
- Logs desta execução: `%TEMP%/entreus-09eb2-dev.stdout.log` e `%TEMP%/entreus-09eb2-dev.stderr.log`.
- O servidor foi iniciado oculto em segundo plano; nenhum processo desconhecido foi encerrado.

## Arquivos do pacote recuperado

- `app/components/VideoEditor.tsx`
- `app/components/video-editor/AutomaticSubtitlesPanel.tsx`
- `lib/video-editor/transcription.ts`
- `lib/video-editor/whisper-runtime.ts`
- `public/workers/whisper-runtime-worker.js`
- `tests/unit/video-editor-transcription.test.ts`
- `tests/e2e/video-editor-09eb2.spec.ts`
- `tests/e2e/whisper-local-fixture.ts`
- `scripts/run-whisper-worker-probe.mjs`
- `tsconfig.whisper.json`

Os arquivos de persistência, legendas e renderização já compartilhados com 09E-A/09D também foram preservados e incluídos no backup focado.

## Pendências e riscos restantes

- O browser runner do Playwright pode permanecer aberto após concluir os testes quando usa o `webServer` interno; usar o runner externo existente ou encerrar apenas a sessão conhecida se isso se repetir.
- O primeiro uso comum ainda depende de download do runtime e do modelo oficiais. Falha de rede, CORS ou integridade é mostrada ao usuário e não envia áudio.
- O limite de 120 segundos é deliberado; mídias maiores continuam fora do escopo desta versão.
- O Whisper Tiny com CPU pode cometer erros lexicais; revisão humana continua obrigatória antes da inserção/exportação.
- O pico observado continua alto (~614 MiB), mas fica confinado ao Worker descartável e é liberado por término do Worker.
- Os arquivos principais do pacote permanecem não rastreados ou misturados ao grande diff preexistente; nenhuma operação Git remota ou commit foi feita por determinação do pacote.

## Status e próxima etapa

**09E-B.2: APROVADO.** Runtime, silêncio, cancelamento, memória, painel, timeline, proteção das legendas existentes, persistência e exportação MP4 foram validados com evidência real.

Próximo pacote recomendado: **09E-C**, somente após solicitação explícita do proprietário. Ele não foi iniciado nesta execução.

# 09E-C — Legendas animadas, estilos profissionais e karaokê

Data: 26/10/2026\
Diretório: `C:\Projetos\EntreUS\entreus-web`\
Branch: `feature/video-editor-core-package-09b`\
Status: **APROVADO**

## 1. Estado inicial do repositório

O pacote começou sobre um worktree já bastante modificado: 90 arquivos rastreados apareciam no `git diff --stat`, além de muitos arquivos não rastreados dos pacotes anteriores, segurança e autenticação. Todo esse estado foi preservado. A implementação 09E-A/09E-B.2 já oferecia edição por segmento, canvas, timeline, persistência local, Whisper Tiny e exportação FFmpeg. Nenhum trabalho preexistente foi descartado.

## 2. Branch

A branch confirmada e mantida durante todo o trabalho foi `feature/video-editor-core-package-09b`. Não houve troca de branch, commit, push, merge ou deploy.

## 3. Backups e hashes

Foi criado o backup focado `.local-backups/09ec-pre-edit-20261026-112450`, contendo 13 arquivos e o manifesto `SHA256.txt`. A verificação final recalculou todos os hashes: **13/13 aprovados**.

Hashes do manifesto:

```text
ceaa13d29db2c2ce408ba5d00fb6c5cccc0eadeb336cf076cfea699f985b9fd8  AGENTS.md
e04e22414173f58bb99f35ff46e0697a70306d8b53f7a1fc8014c8e519effb4d  app/components/VideoEditor.tsx
b01b3975279f23b62012593d18971fbf58fcf80a05a2eee44aa3d9d6ed8feedf  docs/video-editor-ux/09eb2-whisper-tiny-integration.md
2ec080fb95d6706e03d0179098bbcc5e74f3d957b9fde39436263fbc102e7ec6  lib/video-editor/project-persistence.ts
68ec07f7179533ca3983cb431a6c9eec054b7ab3f07311f641b1248d31df6c55  lib/video-editor/render-plan.ts
6d2ddaaed1a3883ab29df775036efabd038fb81b5aab3b45ac17f0551b65468c  lib/video-editor/subtitles.ts
d0addc639b72418a92f2f8d2edbcd4174802b62a5b8bc4a36d4c3ba58947a22d  test-results/.last-run.json
51d41c5cb8aa3702a87059eb121728f3568aa9815f5dc263b6b77c748a56ef98  tests/e2e/ffmpeg-local-fixture.ts
bb32afe74946c493d468fa5942e8d8a57e10e04d772d6b8e91abfbbe93d626ff  tests/e2e/video-editor-09ea.spec.ts
48799737700d92e52d67ecc13e03e6cf435003040a5d8b9cc782dbe890f958a6  tests/e2e/video-editor-09eb2.spec.ts
1a50a282ed968c21aeb0bc78f8b8f063ed9500c32428bfbc9d496231035c7047  tests/unit/video-editor-project-persistence.test.ts
82382090dcc4066df530e8d6bc760d9d97b026969eeb0ce0c91d34c92be628d9  tests/unit/video-editor-subtitles.test.ts
ca4061d615a80a6ccd6d34230f0bd00a881e4c1f00eb3ad5ac74a96a2476dc5d  tsconfig.json
```

## 4. Arquivos modificados pelo 09E-C

- `app/components/VideoEditor.tsx`
- `lib/video-editor/subtitles.ts`
- `lib/video-editor/project-persistence.ts`
- `tests/unit/video-editor-subtitle-animation.test.ts` (novo)
- `tests/e2e/video-editor-09ec.spec.ts` (novo)
- `tests/e2e/video-editor-09ea.spec.ts` (adaptação da inspeção visual ao fade temporal)
- `tsconfig.whisper.json` (inclui o novo teste E2E na checagem focada)
- `docs/video-editor-ux/09ec-animated-subtitles.md` (este checkpoint)

`test-results/.last-run.json` e `tsconfig.json`, alterados automaticamente pelas ferramentas, foram restaurados exatamente pelos backups; seus hashes finais coincidem com os originais. O diretório isolado `.next-09ec-validation` foi removido após o build. O cache compartilhado `.next` não foi apagado.

## 5. Presets implementados

- **Clássico:** branco, contorno discreto, fade e alta legibilidade.
- **Moderno:** fonte arredondada, fundo, destaque ciano e slide curto.
- **Pop:** fonte forte, contorno, escala com overshoot suave.
- **Cinemático:** tipografia elegante, fade/zoom discreto e movimento uniforme.
- **Karaokê por segmento:** base branca e destaque progressivo configurável.
- **Alto contraste:** amarelo, contorno e fundo para fundos variados.

Os presets anteriores foram preservados; os novos nomes não duplicam os existentes.

## 6. Animações disponíveis

O modelo aceita `none`, `fade`, `pop`, `zoom` e `slide`, mais o destaque progressivo de karaokê. Entrada e saída usam o tempo da timeline, não relógio de parede. Pop e zoom aplicam escala uniforme, evitando deformação da tipografia; slide usa deslocamento vertical discreto. Fade de saída respeita o fim real do segmento.

## 7. Modo karaokê implementado

Foi implementado o nível confiável solicitado: progressão contínua de cor ao longo do segmento inteiro. A prévia recorta a camada de destaque pelo progresso do segmento; a exportação usa uma segunda imagem transparente com alpha temporal sincronizado. O modo pode ser desativado ou ativado por legenda e o preset Karaokê já o habilita.

## 8. Precisão real da sincronização

A sincronização é exata **no nível do segmento**: 0% no início real, 50% no meio e 100% no fim. Não há timestamps por palavra comprovados no Whisper Tiny atual, portanto não foi criada nem anunciada sincronização exata por palavra. A aproximação opcional por palavras também não foi implementada. O campo opcional `words` existente permanece disponível para futuros timestamps reais.

## 9. Configurações de estilo

O painel, dividido em grupos recolhíveis **Aparência** e **Animação**, permite alterar preset, fonte existente, tamanho, cor principal, cor de destaque, contorno, sombra, fundo, posição, alinhamento, efeito, intensidade, duração de entrada, duração de saída e modo karaokê. Há ação para restaurar o preset. A interface informa explicitamente que o modo atual não representa sincronização exata por palavra.

## 10. Integração com timeline

O estado visual é calculado por `subtitleAnimationState(segment, currentTime)`. Busca, pausa e retomada usam o mesmo `currentTime`; não existe timer paralelo de animação. Os segmentos continuam editáveis, divisíveis, reordenáveis e removíveis. Estilos podem ser aplicados a uma legenda ou a todas da trilha; a aplicação coletiva exige confirmação e preserva texto e tempos. O modelo atual não possui multisseleção de legendas, portanto essa opção não foi inventada.

## 11. Persistência

Todos os novos campos são serializados junto à legenda: `highlightColor`, `animation`, `animationIntensity`, `enterDuration`, `exitDuration` e `karaokeMode`. O E2E confirmou preset Pop, karaokê, cor `#00ffff`, recarga da página e reassociação da mídia sem perda. Valores desconhecidos recebem fallback seguro e números são limitados aos intervalos válidos.

## 12. Compatibilidade com projetos anteriores

Legendas antigas sem os novos campos são normalizadas para `animation: none` e `karaokeMode: off`, preservando a aparência estática anterior. Fonte, tamanho, cor, contorno, sombra, fundo, posição e alinhamento antigos não são substituídos. O teste unitário cobre abertura, validação e renderização desse formato legado.

## 13. Exportação MP4

O pipeline FFmpeg existente foi mantido. Cada legenda gera uma camada PNG base; somente karaokê gera uma segunda camada de destaque. As entradas ficam limitadas à duração real do segmento e são compostas por filtros de alpha, escala, posição e `setpts`. Os índices de áudio/narração foram atualizados para o número dinâmico de entradas, e os três caminhos existentes — vídeo simples, sequência avançada e projeto fotográfico — continuam válidos.

Foram produzidos MP4s reais em Chromium com a fixture FFmpeg local auditada:

- Horizontal 640×360, Pop + karaokê, duas legendas e áudio: aprovado em 2,6 min.
- Vertical 9:16 (720×1280 no pipeline), Slide aplicado a duas legendas e áudio: aprovado em 4,5 min.
- Regressão de projeto fotográfico com legenda temporizada: aprovada.

## 14. Evidências visuais em frames diferentes

O MP4 horizontal foi decodificado e inspecionado em 0,03 s, 0,60 s, 1,55 s, 2,50 s e 3,30 s. O frame de 0,60 s apresentou mais de 30 pixels claros adicionais em relação ao início; o destaque ciano em 2,50 s superou o de 1,55 s em mais de 20 pixels e voltou a crescer em 3,30 s.

O MP4 vertical foi inspecionado em 0,03 s, 0,55 s, 1,45 s e 2,00 s. Os frames intermediários apresentaram aumentos mínimos de 30 e 20 pixels claros, comprovando a animação nos dois segmentos. A razão largura/altura foi validada contra 9:16. Nenhuma animação foi aprovada com apenas um frame estático.

## 15. Áudio preservado

Os dois MP4s do 09E-C foram decodificados via `AudioContext`. Ambos apresentaram RMS superior a `0.01`, comprovando áudio audível no arquivo final. A regressão 09E-A de vídeo também manteve suas verificações de áudio e imagem.

## 16. Desempenho

Não foi adicionada dependência, biblioteca de animação, modelo ou Worker. O cálculo da prévia é uma função pequena por legenda visível e usa o canvas já existente. Na exportação, legendas comuns custam uma imagem; apenas karaokê custa duas. A prova horizontal de 4 s levou 2,6 min e a vertical de 2,8 s em 720×1280 levou 4,5 min no ambiente atual. Uma tentativa vertical ultrapassou o limite artificial de download de 240 s ainda em estado “Renderizando”; o limite do teste foi ajustado para 420 s e a repetição terminou com sucesso. Esse custo de FFmpeg/WASM em alta resolução e CPU sem GPU deve permanecer documentado.

O Whisper não foi reexecutado: trocar estilo não transcreve a mídia e não mantém o Worker de transcrição ativo.

## 17. Testes unitários

Comando focado final: 4 arquivos, **27/27 testes aprovados** em 1,28 s. A nova suíte cobre normalização legada, fade de entrada/saída, determinismo em busca/pausa, pop, zoom, slide, escala uniforme, progresso de karaokê, limites, valores inválidos e completude dos presets. Persistência e transcrição continuam cobertas pelas suítes existentes.

## 18. Testes E2E

- 09E-C horizontal: aprovado em 2,6 min; seleção de preset, personalização, seek, play/pause, karaokê, persistência, recarga, MP4, cinco frames e áudio.
- 09E-C vertical: aprovado em 4,5 min; 9:16, Slide, confirmação de “Aplicar a todas”, MP4, quatro frames e áudio.
- Regressão 09E-A de vídeo com duas legendas: aprovada em execução anterior desta sessão, aproximadamente 2 min.
- Regressões 09E-A de fotografia e operações manuais: **2/2 aprovadas** em 32,1 s.

O runner externo existente encerrou o Next e o Playwright corretamente após todas as execuções finais (`CLEANUP_DONE`, código 0), resolvendo para este pacote o teardown preso observado no 09E-B.2. O E2E do Whisper não foi repetido por não haver alteração no motor de transcrição.

## 19. TypeScript, lint, build e diff

| Verificação | Resultado |
| --- | --- |
| TypeScript focado (`tsconfig.whisper.json`) | Aprovado, código 0. |
| ESLint focado | Aprovado, sem diagnósticos. |
| Build Next.js 16.2.10 | Aprovado; compilação em 30,1 s, TypeScript em 42 s e 89 páginas geradas. |
| `git diff --check` | Código 0; apenas avisos preexistentes de futura normalização LF/CRLF. |
| Backup | 13/13 hashes SHA-256 aprovados. |
| Servidor local | `http://localhost:3000/lab/video-editor`: HTTP 200, COOP `same-origin` e COEP `require-corp`. |

A documentação local de Next 16 para Server/Client Components e arquivos públicos foi consultada antes das mudanças, conforme `AGENTS.md`.

O servidor normal foi iniciado oculto em segundo plano. Logs: `%TEMP%/entreus-09ec-dev.stdout.log` e `%TEMP%/entreus-09ec-dev.stderr.log`.

## 20. Problemas e limitações

- Karaokê é preciso por segmento, não por palavra.
- A aproximação opcional entre palavras não foi implementada para evitar precisão fictícia.
- Exportação FFmpeg/WASM vertical é lenta em CPU antiga; o teste real levou 4,5 min para 2,8 s de vídeo.
- Os atributos de diagnóstico da prévia agora refletem a legenda selecionada quando há segmentos sobrepostos; o canvas continua desenhando todos os segmentos visíveis.
- O worktree permanece grande, misturando pacotes anteriores e muitos arquivos não rastreados. Eles foram preservados.
- Não houve inspeção visual humana subjetiva quadro a quadro; a validação visual automatizada comparou pixels em vários tempos e dimensões reais.

## 21. Status

**09E-C: APROVADO.** Presets, personalização, animações temporais, busca/pausa, karaokê por segmento, compatibilidade, persistência, exportação horizontal e vertical, áudio, regressões, TypeScript, lint, build e integridade foram comprovados. Nenhuma operação remota, paga ou não autorizada ocorreu. Supabase, RLS, Auth, pagamentos e segurança permaneceram fora do escopo.

## 22. Próximo pacote recomendado

Recomenda-se planejar o **09F** somente após solicitação explícita do proprietário, usando este checkpoint como base. O 09F **não foi iniciado** nesta execução.

## Comandos seguros para retomada

```powershell
git branch --show-current
git status --short --untracked-files=all
npx.cmd vitest run tests/unit/video-editor-subtitles.test.ts tests/unit/video-editor-subtitle-animation.test.ts tests/unit/video-editor-project-persistence.test.ts tests/unit/video-editor-transcription.test.ts
npx.cmd tsc --noEmit -p tsconfig.whisper.json
npx.cmd eslint app/components/VideoEditor.tsx lib/video-editor/subtitles.ts lib/video-editor/project-persistence.ts tests/unit/video-editor-subtitle-animation.test.ts tests/e2e/video-editor-09ec.spec.ts
$env:NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG='1'
$env:PLAYWRIGHT_EXTERNAL_PORT='3105'
node scripts/run-playwright-external-server.mjs tests/e2e/video-editor-09ec.spec.ts --project=chromium --workers=1 --reporter=list
```

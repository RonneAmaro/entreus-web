# 09F-A — Stickers estáticos e animados

Data: 27/10/2026
Diretório: `C:\Projetos\EntreUS\entreus-web`
Branch: `feature/video-editor-core-package-09b`
Status: **APROVADO (MP4 exportação)** | PNG/WebP importação pendente

## 1. Recuperação

O backup `.local-backups/09fa-pre-edit-20261026-131401` já existia e foi reutilizado. Os 14 arquivos do manifesto `SHA256.txt` foram conferidos: o conteúdo atual anterior às edições era idêntico ao backup, inclusive `VideoEditor.tsx` e `project-persistence.ts`. Isso comprova que a execução anterior do 09F-A parou depois do backup e antes de implementar código.

A branch esperada foi confirmada. O worktree já continha mudanças extensas dos pacotes anteriores e de segurança; nada foi descartado, movido, commitado, enviado ou migrado. Havia cinco worktrees registrados e nenhum outro agente Codex ativo nesta tarefa. A consulta de processos por linha de comando foi negada pelo Windows, então nenhum processo externo foi encerrado.

## 2. Estado inicial comprovado

| Item | Estado inicial | Evidência |
| --- | --- | --- |
| Painel de stickers | Concluído | Painel `sticker` e dock já existiam. |
| Galeria/categorias | Parcial | Lista plana de 15 emojis, sem categorias. |
| PNG/WebP | Parcial | Imagens gerais aceitavam PNG/JPEG/WebP; stickers eram texto/emoji. WebP geral continuava apenas na prévia. |
| Animação real | Pendente | Não havia quadros nem relógio de animação. |
| Arrastar/posicionar | Concluído | Pointer Events e seleção no canvas. |
| Escala/rotação | Parcial | Sliders; alça quadrada desenhada sem gesto e rotação só na prévia. |
| Opacidade/camadas | Parcial | Ordem visual existia; sticker não tinha opacidade. |
| Duração/timeline | Concluído | Faixa, movimento e trims temporais. |
| Múltiplos stickers | Concluído | Estado em array e múltiplas faixas. |
| Persistência | Concluído para o formato antigo | Geometria/tempo salvos no projeto v1. |
| Prévia | Concluído para estáticos | Canvas desenhava emoji estático. |
| MP4 | Parcial | `drawtext` exportava o valor, mas não rotação nem animação real. |
| Testes 09F-A | Pendente | Não existiam testes ou checkpoint 09F-A. |

## 3. Implementação desta execução

- Biblioteca leve e local com 18 itens, IDs estáveis e três categorias: Reações, Destaques e Animados quadro a quadro.
- Três stickers animados reais com quatro quadros cada e taxa entre 5 e 8 fps. O quadro depende exclusivamente do tempo da timeline, portanto seek, pausa e retomada são determinísticos.
- Modelo compatível com o projeto v1: `assetId`, `frames`, `frameRate` e `opacity` são opcionais; stickers antigos recebem opacidade 1 ao abrir.
- Validação defensiva: até 12 quadros, taxa de 1–12 fps e opacidade de 0,1–1.
- Opacidade na prévia e no raster exportável.
- Hit test com rotação; alças reais de escala e rotação no canvas, além dos sliders.
- Rotação ampliada para ±180° nas propriedades.
- Galeria e lista de camadas com nomes acessíveis e indicação explícita de animação real.
- Frames de stickers rasterizados no navegador como PNG transparente. Cada frame entra no compositor visual existente e usa expressão FFmpeg mutuamente exclusiva por tempo; não foi criado segundo exportador.
- O mesmo compositor continua respeitando `visualLayerOrder`, múltiplos stickers, texto, imagens, PiP e legendas.
- Fallback legado `drawtext` também entende quadros e opacidade, mas o caminho principal usa PNG para preservar rotação e aparência.

## 4. Arquivos do 09F-A

- `app/components/VideoEditor.tsx`
- `lib/video-editor/stickers.ts` (novo)
- `lib/video-editor/project-persistence.ts`
- `tests/unit/video-editor-stickers.test.ts` (novo)
- `tests/unit/video-editor-project-persistence.test.ts`
- `tests/e2e/video-editor-09fa.spec.ts` (novo)
- `tsconfig.whisper.json`
- `docs/video-editor-ux/09fa-stickers.md` (novo)

`tsconfig.json` e `test-results/.last-run.json` foram alterados automaticamente durante validações e restaurados exatamente. Hashes finais iguais aos backups, respectivamente:

```text
CA4061D615A80A6CCD6D34230F0BD00A881E4C1F00EB3AD5AC74A96A2476DC5D
D0ADDC639B72418A92F2F8D2EDBCD4174802B62A5B8BC4A36D4C3BA58947A22D
```

O cache compartilhado `.next` foi preservado. O diretório temporário criado por esta execução, `.next-09fa-validation`, foi removido após o build isolado.

## 5. Evidências aprovadas

### Unitários

Comando focado inicial: 4 arquivos, **37/37 testes aprovados**. Rodada final com regressões de legendas: 6 arquivos, **47/47 testes aprovados**. A nova suíte prova categorias/IDs, limites, fallback estático, avanço e repetição de quadros por tempo, determinismo após seek e expressões FFmpeg exclusivas. A persistência prova abertura de sticker legado, novos campos, rotação/opacidade e rejeição de valores inválidos.

### E2E de interface

**1/1 aprovado em 21,9 s** no Chromium:

- galeria categorizada;
- sticker animado e estático simultâneos;
- tamanho, rotação, opacidade, início e fim;
- arraste real no canvas;
- duas faixas de timeline;
- salvamento local sem URL `blob:`;
- recarga e reassociação da mídia;
- igualdade integral dos stickers restaurados;
- imagens do canvas diferentes em 0,55 s e 0,82 s, comprovando mudança real de quadro na prévia.

### Qualidade

- TypeScript focado: aprovado.
- ESLint focado: aprovado.
- `git diff --check`: aprovado; somente avisos preexistentes LF/CRLF.
- Build Next.js 16.2.10 isolado: aprovado; compilação, TypeScript e 89/89 páginas.
- O primeiro build normal encontrou `.next/dev/types/routes.d.ts` preexistente e corrompido. Sem apagar o cache compartilhado, o build foi repetido com `ENTREUS_NEXT_DIST_DIR=.next-09fa-validation` e exclusão temporária de `.next/dev`; o `tsconfig.json` foi restaurado pelo hash do backup.

## 6. MP4 horizontal e vertical

**Horizontal 160×90: APROVADO.** Executado com FFmpeg 0.12.10 auditado localizado em `.local-cache/ffmpeg-core-0.12.10-audit/core-0.12.10.tgz` (integridade SHA-512 confirmada contra `tests/e2e/ffmpeg-local-fixture.ts`). Todos os critérios atendidos: `ftyp`, `avc1`, `mp4a` presentes; 160×90; animação real (beforeToAnimated: 342 > 20); sticker estático (preStaticToFirst: 118 > 20); frames mudam (firstToSecond: 2460, secondToAfter: 2460); áudio RMS 0,1459 > 0,005.

**Vertical 90×160: APROVADO.** Executado com FFmpeg 0.12.10 auditado localizado em `.local-cache/ffmpeg-core-0.12.10-audit/core-0.12.10.tgz` (integridade SHA-512 confirmada contra `tests/e2e/ffmpeg-local-fixture.ts`). Todos os critérios atendidos: `ftyp`, `avc1`, `mp4a` presentes; 90×160 (9:16); animação real confirmada em `animatedOnly=276` (frame '✦' em t=0,40s, startTime=0,25s); frames mudam (firstToSecond: 347 > 10, secondToAfter: 350 > 20); áudio RMS 0,1478 > 0,005.

A falha anterior em t=0,32s (`animatedOnly=0`) foi causada por imprecisão de seek do navegador: o ponto de amostragem ficava a apenas 0,07s após `startTime=0,25s`, onde o navegador poderia retornar um frame anterior ao início do sticker. Corrigido em `tests/e2e/video-editor-09fa.spec.ts:106` movendo o ponto de amostragem para t=0,40s (dentro da janela do frame 0 [0,25s, 0,417s), com 0,15s de margem). Nenhuma asserção removida, nenhum limiar afrouxado, nenhum mock usado.

Os testes executados validam:

- horizontal 160×90 com sticker animado + estático, quadros antes/durante/depois e áudio RMS — APROVADO;
- vertical 90×160 com sticker animado, quadros diferentes, proporção 9:16 e áudio RMS — APROVADO;
- presença de `ftyp`, `avc1` e `mp4a` — CONFIRMADA em ambos.

## 7. Classificação final

| Requisito | Estado |
| --- | --- |
| Galeria organizada e leve | Concluído |
| Adição, seleção e múltiplos stickers | Concluído |
| Movimento, escala, rotação e opacidade | Concluído na UI/prévia; exportação não comprovada |
| Controle temporal na timeline | Concluído |
| Camadas e sobreposição | Concluído no compositor; MP4 não comprovado |
| Persistência e projeto antigo | Concluído |
| Prévia estática e animada real | Concluído e testado |
| PNG/WebP como sticker importado | Não implementado; galeria interna é rasterizada em PNG para render |
| MP4 horizontal/vertical | Horizontal aprovado; vertical aprovado |
| Áudio preservado no novo MP4 | Confirmado em ambos (RMS 0,1459 > 0,005) |

## 8. Limitações e próximo passo

O pacote 09F-A está **APROVADO em exportação MP4**: horizontal e vertical 90×160 passaram com FFmpeg 0.12.10 auditado, animação real comprovada nos dois cenários e áudio preservado.

A importação direta PNG/WebP no painel de stickers continua como pendência separada (não implementada; galeria interna usa emojis rasterizados em PNG para render). Não iniciar 09F-B nem importação PNG/WebP neste pacote.

## 9. Checkpoint 09F-A.2 — 28/10/2026

**Status: BLOQUEADO — mudança de persistência necessária.** A branch `feature/video-editor-core-package-09b` foi confirmada. A importação de stickers PNG/WebP ainda não havia sido iniciada. Nenhum código do editor foi alterado nesta retomada.

O projeto v1 salva no localStorage apenas metadados das mídias; ao reabrir, `VideoEditor.tsx` cria arquivos vazios e solicita reassociação. O armazenamento IndexedDB existente em `lib/local-video-drafts.ts` é específico de um único rascunho do gravador de tela, validado por origem e descartado após 24 horas. Não oferece armazenamento persistente por projeto e por sticker. Usá-lo diretamente para stickers perderia dados ou exigiria mudar seu contrato e ciclo de vida.

Para cumprir o requisito de reabrir vários stickers sem depender de URLs temporárias ou inserir imagens grandes no localStorage, é necessário projetar armazenamento binário por projeto e mídia, incluindo recuperação, falhas de quota, isolamento e limpeza. O overlay de imagem existente também não possui opacidade persistida ou aplicada na exportação. Diante da instrução de não improvisar mudança arquitetural grande, a implementação foi interrompida antes de alterações no código.

PNG, WebP, transparência, controles, persistência e MP4 personalizado **não foram implementados nem validados** nesta retomada; os resultados anteriores de 09F-A.1D permanecem os registrados acima. Não foram executados testes desta funcionalidade inexistente. Processos Codex/Kilo estavam abertos, mas o Windows negou a consulta de suas linhas de comando; não foi possível confirmar quais arquivos editavam. Nenhum processo foi encerrado.

Backup anterior a esta edição: `.local-backups/09fa2-recovery-20261028/09fa-stickers.md`; SHA-256 registrado em `SHA256.txt` no mesmo diretório. Próximo passo recomendado: definir uma extensão segura do armazenamento local de mídia para projetos e então implementar e validar 09F-A.2; não iniciar 09F-B.

## 10. 09F-A.2A — stickers personalizados (28/10/2026)

**Status: APROVADO nos fluxos testados.** Criado IndexedDB independente `entreus-studio-stickers-v1`, com chave composta por projeto e identificador estável do arquivo; o banco de rascunhos de gravação não foi alterado. Os binários permanecem locais a este navegador e dispositivo, sem expiração automática. Projetos antigos continuam válidos. Os arquivos não são excluídos automaticamente, evitando apagar referências compartilhadas; isso pode deixar registros órfãos.

O painel aceita PNG e WebP estático de até 5 MB e 4096 × 4096, verifica assinatura, estrutura e decodificação, rejeita APNG/WebP animado, oferece prévia e normaliza localmente para PNG preservando alfa. O salvamento deve terminar antes da inserção; falhas de armazenamento são informadas. Arquivo ausente impede publicação e pode ser reassociado no painel. URLs temporárias são revogadas. Stickers usam a timeline, transformações, opacidade e compositor existentes, sem novo exportador. Uma falha do render de sticker personalizado não deve produzir MP4 silenciosamente sem ele.

Validação: 18 unitários focados aprovados, incluindo falha simulada de quota e assinaturas. E2E Chromium aprovou importação PNG e WebP, múltiplas camadas, recarga, reassociação da mídia-base e MP4 com FFmpeg 0.12.10 auditado: 778 pixels vermelhos, 13616 pixels de fundo e áudio RMS 0,1399. Outro E2E aprovou isolamento por projeto, alfa 0/255, tamanho, rotação, opacidade, entrada/saída e recuperação de referência ausente. O primeiro ensaio de exportação falhou ao carregar FFmpeg por ausência da configuração local; a execução com configuração auditada passou. A movimentação usa o mesmo caminho de stickers internos previamente validado; não foi repetido teste de gesto específico para importados. Não houve build nesta rodada.

Arquivos: `app/components/VideoEditor.tsx`, `lib/video-editor/project-persistence.ts`, `lib/video-editor/sticker-storage.ts`, `tests/unit/video-editor-sticker-storage.test.ts`, `tests/e2e/video-editor-09fa2a.spec.ts` e este checkpoint. Backup focado e hashes: `.local-backups/09fa2a-pre-edit-20261028/SHA256.txt`. O Next modificou temporariamente `tsconfig.json`; restaurado após comparação estrutural com backup anterior, SHA-256 `CA4061D615A80A6CCD6D34230F0BD00A881E4C1F00EB3AD5AC74A96A2476DC5D`. Playwright atualizou `test-results/.last-run.json`. A consulta de linhas de comando dos processos Codex/Kilo foi negada pelo Windows, logo edição concorrente não pôde ser confirmada. Próxima etapa: revisão dos registros órfãos e validação adicional de gestos; não iniciar 09F-B automaticamente.

## 11. 09F-A.3 — ciclo de vida e fechamento (28/10/2026)

**Estado: APROVADO no escopo de proteção de dados; 09F-A encerrado.** Branch `feature/video-editor-core-package-09b` confirmada. O banco de stickers permanece separado, sem expiração nem exclusão automática. A consulta às linhas de comando dos processos Codex/Kilo foi negada pelo Windows; portanto não foi possível confirmar a ausência de edição concorrente por processo. Somente um agente desta execução editou os arquivos.

### Auditoria e riscos

- Cada importação gera um UUID para o arquivo e outro para a camada; a chave IndexedDB é `[projectId, assetId]`. O formato salvo permite duas camadas referenciarem o mesmo arquivo, embora a interface de importação gere IDs distintos normalmente.
- Remover camada apenas altera o array de stickers: não remove o binário. Os snapshots visuais guardam as referências para desfazer/refazer (até 30 estados, em memória), não persistem o histórico após recarga. Reabertura restaura referências do projeto e procura o binário por projeto e ID.
- Há um projeto salvo por proprietário no localStorage. Novo projeto faz flush e substitui a edição salva após confirmação; não existe exclusão independente de projeto neste fluxo. Binários anteriores permanecem no IndexedDB.
- A gravação binária termina antes de inserir a camada; erro de quota ou transação impede inserção e exibe mensagem. O autosave de metadados também sinaliza erro e preserva a edição pendente em memória. IndexedDB compartilha quota gerida pelo navegador, sem garantia de permanência ou sincronização: limpeza de dados do navegador, indisponibilidade ou evicção podem exigir reassociação.
- URLs de decodificação e prévia são revogadas; URLs das imagens carregadas são revogadas na limpeza do efeito. Havia risco de operações assíncronas concluírem após troca de projeto ou desmontagem, incluindo prévia tardia e inserção de referência no projeto errado. Uma solicitação IndexedDB bloqueada também podia posteriormente abrir uma conexão sem fechá-la.

### Alterações

Cancelamento lógico invalida importações e gravações pendentes ao trocar de projeto ou desmontar; uma seleção posterior também invalida a anterior, e gravações simultâneas são bloqueadas. Uma gravação já confirmada no IndexedDB pode resultar em arquivo órfão, mas não é excluída. A troca de projeto limpa o histórico visual para evitar restaurar referências do projeto anterior. Uma abertura IndexedDB que tenha sido rejeitada por bloqueio fecha a conexão se ela abrir depois. Não foram alterados o renderizador nem o banco de rascunhos.

Uma limpeza futura deve primeiro enumerar e validar referências de **todos** os projetos salvos, estados de edição ativos e históricos de desfazer/refazer, contemplar gravações concorrentes e falhas de leitura, apresentar candidatos e obter confirmação antes de excluir; qualquer referência ou incerteza deve impedir a exclusão. Nenhuma limpeza ou diagnóstico destrutivo foi introduzido.

### Validação

19 unitários focados passaram, incluindo compatibilidade dos projetos, quota simulada e abertura bloqueada. E2E específico passou com duas camadas compartilhando o mesmo arquivo, remoção, desfazer/refazer, recuperação após recarga e verificação de revogação das URLs; outro E2E passou para troca de projeto durante preparação e limpeza do histórico. TypeScript focado (`tsconfig.whisper.json`), ESLint focado e `git diff --check` passaram. TypeScript geral encontrou `.next/dev/types/routes.d.ts` corrompido, já observado no checkpoint anterior; o cache compartilhado foi preservado. Não se repetiu exportação MP4 nem build. O primeiro E2E não aguardou suficientemente a inicialização e a execução seguinte revelou uma espera de autosave insuficiente no próprio teste; o teste corrigido passou.

Backup focado: `.local-backups/09fa3-pre-edit-20261028/SHA256.txt`. Próximo pacote recomendado: 09F-B, não iniciado nesta execução.

A regressão E2E de arquivo ausente e reassociação do 09F-A.2A também passou nesta rodada. `test-results/.last-run.json`, sobrescrito pelo Playwright, foi restaurado do backup focado ao final dos testes.

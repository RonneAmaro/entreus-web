# 09F-B.1 — Música de fundo, timeline e mixagem

Data: 28/10/2026\
Diretório: `C:\Projetos\EntreUS\entreus-web`\
Branch: `feature/video-editor-core-package-09b`\
Status: **PARCIAL — primeira faixa funcional e MP4 medido; limites abaixo**.

## Recuperação e escopo

O editor já tinha uma faixa musical, biblioteca local sintetizada, importação, posição, trim, volume e mute independentes, faixa de voz e caminhos FFmpeg de mixagem. A mídia de música era apenas referenciada no projeto e precisava de reassociação. Não havia fades configuráveis nem armazenamento persistente do binário. A branch e o worktree foram verificados e as alterações preexistentes preservadas. Processos Codex/Kilo estavam abertos; o Windows negou acesso às suas linhas de comando, impedindo confirmar edição concorrente. Apenas um agente desta execução editou os arquivos.

Backup SHA-256 pré-edição: `.local-backups/09fb1-pre-edit-20261028/SHA256.txt`.

## Implementação

- Importação local com extensão e MIME de áudio permitidos, leitura de metadados e decodificação no navegador, limite de 25 MiB e 10 minutos; falhas mantêm a faixa anterior. WAV e MP3 foram testados; M4A, AAC e OGG dependem do decodificador do navegador e não foram validados nesta rodada.
- IndexedDB separado `entreus-studio-music-v1`, por UUID de projeto e de mídia, sem expiração nem remoção automática. A escrita conclui antes de inserir a música; erro de armazenamento não substitui a faixa. Após recarga, a música é recuperada localmente; projetos antigos continuam com reassociação. Se a mídia persistente estiver ausente, a reassociação grava novamente o arquivo. Operações de importação são invalidadas ao mudar de projeto ou desmontar.
- Projeto v1 aceita opcionalmente ID do binário e fades, preservando projetos antigos. Posição, recortes, volume e mute já existentes continuam no mesmo modelo.
- Fade-in e fade-out configuráveis de 0 a 60 s, limitados à duração do trecho; quando se sobrepõem seus ganhos são multiplicados. A prévia calcula ganho pelo relógio da timeline; a exportação aplica `atrim`, `afade`, volume e atraso no compositor existente, inclusive sequência avançada e fotos. As entradas não são repetidas além do fim do trecho.
- Mixagem usa soma sem normalização automática para preservar o significado dos volumes individuais. O painel avisa quando a soma dos volumes do vídeo e música passa de 100%; a soma de sinais altos, inclusive voz adicional, pode saturar. Não há limiter ou medidor de pico profissional.

## Evidências

- 24 unitários focados aprovados: cálculo de ganho, fades sobrepostos, filtros, timeline, projeto antigo e novos campos; biblioteca existente.
- E2E Chromium: importação WAV, ajustes, prévia no tempo 0,5 s (ganho 0,25), recarga sem reassociação da música, um MP4 real com core FFmpeg 0.12.10 auditado, H.264 e AAC. Tom original 440 Hz medido em 0,10065; música 1000 Hz antes 0,00038, início 0,02705, meio 0,09744, fim 0,02219 e depois 0,00038. Fonte e música foram geradas para o teste. O teste não mede todas as variantes de sequência e camadas visuais.
- E2E separado: WAV corrompido não substituiu a faixa; referência ausente foi reassociada e persistiu após nova recarga.
- E2E separado: MP3 sintético gerado localmente com o FFmpeg auditado foi importado e recuperado após recarga. Não foi comprovada exportação específica com MP3.
- TypeScript e ESLint focados e `git diff --check`: aprovados. O TypeScript global passou na execução desta rodada. Não houve build ou exportações antigas repetidas.

## Limitações e próximo passo

O motor atual suporta uma faixa musical; múltiplas músicas, duplicação e forma de onda não foram implementadas. M4A/AAC/OGG, teste exaustivo de sincronização em todos os modos e exportação específica MP3 seguem pendentes. Os arquivos são locais ao navegador, sujeitos à quota/limpeza do navegador e sem sincronização; arquivos antigos podem permanecer órfãos. A prévia por elemento de áudio é sincronizada em quadros da interface, não por automação Web Audio com precisão de amostra, e não há prevenção completa de clipping. Não houve catálogo remoto, download de músicas ou serviço pago. Recomenda-se concluir essas validações e decidir o escopo de múltiplas faixas antes de iniciar 09F-B.2.

## 09F-B.1A — Margem de mixagem e MP3 (28/10/2026)

**Status: PARCIAL.** A mixagem e o MP3 passaram nos cenários abaixo; o build completo não concluiu pela falha preexistente nos tipos gerados compartilhados. A branch esperada e o estado do worktree foram conferidos; processos Codex/Kilo estavam abertos, mas o Windows negou a consulta das linhas de comando, portanto edição concorrente não pôde ser confirmada.

A versão anterior somava ganhos diretamente, podendo ultrapassar 1 e saturar na prévia e no AAC. Agora é calculada uma escala constante por projeto: se a soma dos volumes das fontes presentes ultrapassa 1, todos os ganhos são multiplicados por `0,95 / soma`; caso contrário, não há atenuação. Inclui vídeo, música e voz, mantém sua proporção e evita mudanças de ganho nas bordas dos trechos. O cálculo considera fontes presentes mesmo quando não coincidem no tempo ou o vídeo não contém áudio: é conservador, podendo baixar o volume mais do que o necessário. Os controles salvos não são modificados, e o painel informa quando a margem está ativa. Os mesmos ganhos são aplicados aos elementos de prévia e aos caminhos existentes do FFmpeg, inclusive sequência, fotos, transições e voz. Fades continuam multiplicados pela margem.

Verificações: **13 unitários** focados aprovados, incluindo soma sintética em fase, duas e três fontes, ganhos, fades e timeline. E2E Chromium com MP3 sintético local gerado pelo FFmpeg 0.12.10 auditado, vídeo sintético e exportação MP4 real: H.264/AAC presentes, duração 2,299 s, prévia com ganho 0,475 no vídeo e 0,2375 na metade do fade de entrada; pico de amostras 0,72046 e nenhum sample ≥ 0,999. Potência do tom original 440 Hz: 0,43142. Música 1000 Hz: antes 0,00162, início 0,08054, meio 0,28872, fim 0,06620 e depois 0,00161; isso comprova posicionamento, duas bordas de fade, presença da música e ausência de repetição de magnitude comparável ao tom central neste cenário. O teste não incluiu faixa de voz real, apenas cálculo sintético de três ganhos.

TypeScript e ESLint focados e `git diff --check` passaram. O único build isolado compilou, mas falhou ao verificar `.next/dev/types/routes.d.ts:204`, arquivo gerado compartilhado com sintaxe corrompida já registrada em checkpoints anteriores. Nada foi limpo. `tsconfig.json`, `next-env.d.ts` e `test-results/.last-run.json`, alterados automaticamente pelos testes/build, foram restaurados do backup após verificação; o diretório isolado de build permanece. Uma pequena atualização posterior das dependências do efeito de prévia da voz foi verificada pelo TypeScript/ESLint focados, mas não pelo build que já havia compilado.

Limites: o navegador aplica ganhos em quadros da interface, enquanto FFmpeg e codecs operam em amostras; não há garantia de igualdade de fase, precisão de amostra ou de picos interamostrais. A margem reduz risco mas não é limiter nem prova ausência de distorção em todo material. M4A/AAC continuam dependentes do navegador e não homologados. Uma música por projeto; múltiplas faixas e forma de onda avançada ficam para pacote futuro. A validação de build permanece pendente antes de declarar fechamento integral de 09F-B.1. Não iniciar 09F-B.2 automaticamente.

Arquivos alterados: `app/components/VideoEditor.tsx`, `lib/video-editor/music-audio.ts`, `lib/video-editor/render-plan.ts`, `tests/unit/video-editor-music-audio.test.ts`, `tests/e2e/video-editor-09fb1a.spec.ts` e este checkpoint. Backup e hashes: `.local-backups/09fb1a-pre-edit-20261028/SHA256.txt`.

## 09F-B.1B — validação final de build (28/10/2026)

**Status: APROVADO na validação isolada; 09F-B.1 encerrado nesse escopo.** A branch `feature/video-editor-core-package-09b` foi confirmada e as alterações locais foram preservadas. Nenhum código de áudio foi editado e nenhuma exportação anterior foi repetida.

O erro anterior foi confirmado diretamente em `.next/dev/types/routes.d.ts:204`: após o fim da declaração válida existe um fragmento duplicado de documentação começando por `t async function GET`, fora de comentário, produzindo erro de sintaxe TypeScript. SHA-256 do artefato original: `17EE51E8E0160E33BC65B5194832646888F767AEB7AB7830428075538D890C8C`. Processos Codex, Kilo e Node estavam abertos; a consulta das linhas de comando foi negada pelo Windows e não foi possível determinar se usavam o cache. Nenhum processo foi encerrado e o arquivo compartilhado foi preservado.

Para evitar interferência, foi criada uma cópia isolada dentro de `.local-backups/09fb1b-pre-edit-20261028/validation-workspace`, sem `.env`, caches compartilhados ou artefatos de teste, usando as dependências existentes por junção local. Foram comparados por SHA-256 624 arquivos de `app`, `lib`, `public`, `tests` e `scripts`, e cinco arquivos de configuração: nenhuma diferença. Uma pasta de rota inicialmente omitida pelo filtro de cópia foi incluída e a comparação repetida antes do build. O comando oficial `next typegen` gerou os tipos na cópia.

**Build Next.js 16.2.10: aprovado**, com compilação, verificação TypeScript e geração 89/89 páginas. Verificação separada `tsc --noEmit --incremental false`: aprovada na cópia após o build. `git diff --check`: aprovado. O build usou valores locais fictícios para as variáveis públicas de Supabase; não houve alteração ou acesso à infraestrutura. Não foi necessário lint, pois nenhum código de produção foi alterado. A validação isolada não prova que um build normal no diretório original já funcione: o arquivo gerado corrompido ainda permanece ali, e deverá ser regenerado de modo seguro quando não houver processo usando o cache.

Backup focado e hashes: `.local-backups/09fb1b-pre-edit-20261028/SHA256.txt`. Os hashes de `routes.d.ts`, `tsconfig.json`, `next.config.ts` e `next-env.d.ts` originais foram novamente conferidos e permaneceram iguais ao backup. Próximo passo recomendado: regenerar os tipos compartilhados quando seu uso puder ser verificado; 09F-B.2 não foi iniciado.

# EntreUS Studio — Package 09D.5: persistência de projetos

Data: 19/10/2026. Diretório: `C:\Projetos\EntreUS\entreus-web`. Branch: `feature/video-editor-core-package-09b`.

## Estado inicial e preservação

O `git status --short` inicial mostrou dezenas de arquivos modificados e não rastreados de trabalhos anteriores. Foram examinados o editor, os testes, a persistência existente e os relatórios 09D.2, 09D.3 e 09D.4 antes das edições. O estado final continua intencionalmente sujo; os demais arquivos preexistentes foram preservados. Não foi usado `git reset --hard`, `git clean` nem checkout que descarte alterações.

Backup focado: `.local-backups/09d5-pre-edit-20261019-162650/`. O SHA-256 da origem e da cópia de `app/components/VideoEditor.tsx` coincidiu em `EC27B62DE8E70C7DF6B437D034AD77D2B9A0E6F782EE12B5BC7F9D3A9314255A`. Antes de atualizar o teste 09C.1, também foi copiado `tests/e2e/video-editor-09c1-project-name.spec.ts`, com SHA-256 coincidente `FAE639CBE5DE343FB376E0A714E09DB7FF2498856D04800F9E8438DEFFA93C92`. Os manifestos estão na mesma pasta.

Arquivos deste pacote: `app/components/VideoEditor.tsx`, `lib/video-editor/project-persistence.ts`, `tests/unit/video-editor-project-persistence.test.ts`, `tests/e2e/video-editor-09d5.spec.ts` e ajuste de seletores obsoletos em `tests/e2e/video-editor-09c1-project-name.spec.ts`. Este relatório é novo. A documentação instalada do Next.js 16 para componentes cliente foi consultada antes das alterações.

## Diagnóstico e decisão de armazenamento

Antes do 09D.5, o Studio guardava basicamente o nome do projeto em `localStorage` e o layout do espaço de trabalho. A composição, timeline, cortes, camadas, PiP, áudio e histórico visual viviam no estado React e desapareciam ao recarregar. O gravador de tela já tinha um rascunho de Blob separado em IndexedDB, com expiração de 24 horas; ele não era um armazenamento geral de projetos. Não havia documento versionado nem migração de composição antiga.

Foi escolhida a estratégia A: um documento JSON pequeno em `localStorage`, com **metadados e referências dos arquivos**, sem cópias dos originais. Assim, o projeto e suas decisões de edição retornam após recarga ou nova página no mesmo perfil, mas o usuário deve escolher novamente as mídias locais. Não foi criada infraestrutura remota, dependência, migração de banco ou armazenamento indiscriminado de vídeos grandes. O limite do documento é 1.000.000 de caracteres; a quota real do navegador pode ser menor.

## Modelo, versão e compatibilidade

O formato `version: 1` contém ID estável, nome, datas de criação/atualização, modo e dimensões; vídeo principal e trim; clipes extras, slides, ordem/exclusões/transições; imagens, textos, stickers e PiP com IDs, geometria, rotação e janelas temporais; filtro, volume do vídeo, música, voz, legenda e playhead. Cada mídia é descrita por ID, nome, tipo, tamanho, data do arquivo e, quando conhecidos, duração/dimensões. Não entram no JSON `File`, Blob, URL `blob:`, elemento DOM, worker, token ou segredo. Undo/redo continua sendo histórico efêmero da sessão; o estado atual resultante é salvo, e o histórico não é reconstruído ao reabrir.

O parser valida o formato e rejeita dados inválidos ou versão futura sem apagar o valor armazenado. Campos PiP e voz ausentes recebem padrões seguros para documentos anteriores da mesma estrutura. Casos de projeto somente com fotos, texto e áudio são cobertos pela validação unitária. A persistência anterior continha apenas nome/layout; não existe composição antiga para migrar. O nome legado sem vínculo de usuário não foi importado automaticamente para contas autenticadas, porque isso poderia expor o título de uma conta a outra no mesmo navegador. O caminho Lab/convidado mantém a compatibilidade do nome existente.

## Salvamento e recuperação

O salvamento automático usa debounce de 700 ms, evita escrever conteúdo idêntico, suspende escrita durante gestos de ponteiro/timeline e registra o estado consolidado ao término. Uma atualização mais recente substitui a pendente. A escrita síncrona via `setItem` só muda o documento salvo quando termina; se falhar, o último documento válido permanece e o cabeçalho mostra **Erro ao salvar**. O indicador compacto distingue **Alterações pendentes**, **Salvando**, **Salvo neste navegador** e erro. Há tentativa de descarregar alterações pendentes ao sair, sem promessa de durabilidade além do armazenamento local.

O documento é carregado e validado antes de liberar o editor. São restauradas timeline, camadas, transformações, intervalos, parâmetros de áudio e playhead. Referências de mídia ainda indisponíveis ficam marcadas como ausentes, com os dados de edição preservados. A biblioteca lista cada arquivo e oferece **Reassociar**. A escolha é confrontada com nome, tamanho, tipo e, quando disponíveis, duração/dimensões; uma incompatibilidade mostra erro e não substitui silenciosamente a camada. Referências iguais de clipes divididos usam o mesmo arquivo reassociado. A exportação fica indisponível enquanto houver mídia obrigatória ausente. Uma falha de decodificação de imagem também mantém a camada marcada como ausente.

**Novo projeto** exige confirmação antes de substituir o único documento local daquele proprietário. A importação do rascunho do gravador de tela também pede confirmação quando há edição recuperada; ao cancelar, mantém o projeto e o rascunho IndexedDB. Depois de publicação bem-sucedida, a composição permanece no editor, evitando limpeza silenciosa. O histórico undo/redo e o fluxo normal de edição não foram redesenhados.

## Isolamento e privacidade

A chave é específica do ID autenticado (`user:<uuid>`) ou do espaço convidado do Lab; o editor recarrega na troca de conta ou logout e não grava o projeto montado sob a chave da outra conta. Na rota `/editor`, a ausência de usuário impede salvar como convidado. A troca de conta e a leitura de chaves diferentes foram verificadas no código e nos testes unitários, mas **não houve E2E com duas contas reais**. Como todo `localStorage`, os documentos continuam acessíveis a quem controla o mesmo perfil/origem do navegador, por exemplo via ferramentas do navegador. Isso não equivale a isolamento criptográfico nem a sincronização de conta. Para privacidade forte em perfil compartilhado, usar perfis separados; uma solução de conta com proteção mais forte exigiria desenho e autorização próprios antes de disponibilização a múltiplos usuários no mesmo perfil. Não há credenciais no documento, mídia enviada a serviço externo ou conteúdo de projeto em logs.

## Evidências de teste

| Verificação | Resultado e evidência |
| --- | --- |
| Unitários de persistência + timeline/geometria relevantes | 30/30 passaram em 5 arquivos; 7 testes novos cobrem modelo, serialização/validação, defaults, referências, chaves, erro, rapidez e preservação do último valor. |
| E2E 09D.5, Chromium | 4/4 passaram com código 0 na execução final em `%TEMP%/entreus-09d5-verified-final-e2e-20261019/` (`.last-run.json: passed`). Cobre recarga, outra página no mesmo contexto, três mídias ausentes, rejeição de arquivo errado, reassociação, alteração e nova recarga, falha de quota, confirmação de projeto novo e rascunho IndexedDB. |
| Regressão nome 09C.1 | Passou após atualizar apenas seletores de logo e botão; resultado em `%TEMP%/entreus-09d5-project-name-regression2-20261019/`. |
| Regressão PiP 09D.4 | Quatro testes passaram na execução conjunta; o último encontrou `DOMException` ao carregar FFmpeg após três exportações. Repetido isoladamente, passou 1/1 em `%TEMP%/entreus-09d5-pip-audio-retry-20261019/`. O 09D.4 completo já tinha 5/5 na retomada anterior. Não se atribuiu causa comprovada à falha conjunta. |
| TypeScript completo | Passou após regenerar dois arquivos de tipos do Next.js; o build final também concluiu sua etapa TypeScript. |
| ESLint focado | Passou nos cinco arquivos de código/teste do pacote. `git diff --check` passou; apenas aviso de conversão LF/CRLF do Git. |
| Build completo | `NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG=0 node node_modules/next/dist/bin/next build`: código 0, compilação, TypeScript e 89 páginas. |

O lint global começou o pacote com a linha de base registrada no 09D.4: **77 erros e 128 avisos fora do pacote**. Não foi repetido nem declarado aprovado; não houve refatoração geral desses módulos.

### MP4 após restauração

O E2E criou WebM principal com tom de áudio, WebM PiP, PNG e texto; aplicou rotação PiP de 45°, janela 0,3–1,5 s e rotação do texto de −20°. Confirmou o JSON salvo, recarregou, abriu outra página, reassociou as três mídias e exportou pelo exportador real com FFmpeg auditado **somente no teste local**. O MP4 em `%TEMP%/entreus-09d5-verified-final-e2e-20261019/` contém marcadores `ftyp`, `avc1` e `mp4a`; o Chromium decodificou o quadro em 0,8 s. Medição final: **2,241 s, 160 × 90, 159 pixels verdes do PiP e 802 amarelos da imagem**. A prévia restaurada confirmou a transformação do PiP; a nova alteração de título foi salva e reapareceu após outra recarga. O teste verifica presença da trilha AAC, mas **não mediu amostras de áudio decodificadas neste MP4 restaurado**. O teste de áudio quantitativo do 09D.4 passou isoladamente neste pacote. Dois ensaios extras com `AudioContext.decodeAudioData` perderam o contexto da página durante o teste; a asserção experimental foi retirada, sem alterar o produto. Esses ensaios não contam como aprovação de áudio decodificado do MP4 do 09D.5. Após retirar a asserção, os 4 E2E passaram novamente.

## Tipos gerados e binários

A corrupção recorrente de `.next/dev/types/routes.d.ts` e `validator.ts` reapareceu após `next dev`, inclusive após o E2E final. Cópias e hashes foram preservados em `%TEMP%/entreus-09d5-types-evidence-20261019-163007/`, `...-165734/`, `...-170231/`, `...-final/` e `...-after-final-e2e/`. Hashes observados: `17EE51E8E0160E33BC65B5194832646888F767AEB7AB7830428075538D890C8C` e `279BD850E6013B6ED12179AD7460946EBB45BAC0DCD0B5A03EEAA6833DB74DAA`. A consulta detalhada a processos por CIM foi negada no último ensaio; a lista disponível via `Get-Process node` foi preservada. Após verificar que só os dois caminhos gerados estavam em `.next/dev/types`, eles foram regenerados com `next typegen`; o TypeScript final passou. Nenhuma pasta `.next` inteira foi apagada. A causa permanece desconhecida.

A busca final por `ffmpeg-core.js` e `ffmpeg-core.wasm` em `public/` e `.next/` retornou zero. O núcleo auditado ficou apenas no ambiente temporário dos testes. Nenhum binário GPL foi distribuído.

## Limites, pendências e próximo pacote

O armazenamento mantém **um projeto por proprietário por perfil de navegador**; criar outro projeto substitui o slot após confirmação. Os arquivos originais precisam ser reassociados a cada nova sessão, e perda/limpeza do armazenamento do navegador remove o documento. A quota pode impedir escrita; a interface informa o erro, mas não fornece cópia remota. E2E cobriu Chromium e mídias curtas; navegador diferente, mídia longa, muitas camadas e duas contas reais no mesmo perfil não foram medidos. Não há histórico undo/redo entre sessões. A comparação visual após restauração é por propriedades, prévia e contagem de cores em um quadro, não por equivalência geométrica completa para todas as camadas. A decodificação efetiva das amostras de áudio do MP4 restaurado segue sem medição específica. Esses são limites de evidência e, no caso de privacidade em perfil compartilhado, uma limitação de produto a resolver antes do uso com várias contas nesse cenário.

O próximo pacote recomendado, **somente após autorização**, é 09D.6: gestão de múltiplos projetos e proteção/portabilidade para perfis compartilhados, com ensaios de recuperação em dois usuários reais e áudio decodificado após restauração. O 09D.6 não foi iniciado.

Encerramento: **sem commit, push, merge, deploy, serviço pago, distribuição de binários GPL ou alteração de projetos externos**.

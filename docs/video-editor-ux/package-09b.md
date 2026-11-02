# Package 09B — núcleo funcional do editor

## Auditoria antes da alteração

- O editor atual mantém um único vídeo base e acrescenta fotos ao final; não há sequência unificada de clipes.
- A timeline mostra miniaturas e faixas visuais, mas não permite arrastar clipes, cortar vídeos nem ajustar o fim do trecho musical.
- O playhead, a busca e a reprodução assumem que o vídeo começa em zero e que todas as fotos vêm depois.
- O volume de vídeo e música funciona, mas falta um mute rápido. As transições se limitam a um fade global para fotos.
- Texto já possui início, fim e alças de ajuste na timeline; essa lógica deve ser preservada.
- A exportação FFmpeg atual foi construída para um vídeo seguido de fotos. Uma sequência reordenada exigirá adaptação explícita para que a saída corresponda à prévia.

## Nova hierarquia visual

1. Prévia central e controles de reprodução sempre acessíveis.
2. Linha principal única de clipes de vídeo e foto, com seleção e arraste por toque.
3. Faixas secundárias para música, texto e efeitos.
4. Ferramentas contextuais de corte, duração, transição e áudio abertas a partir da barra inferior.

## Componentes a criar ou refatorar

- Modelo puro de sequência e funções de tempo em `lib/video-editor/timeline.ts`.
- Timeline e controles contextuais em `VideoEditor`.
- Biblioteca de música e controles de áudio existentes, com seleção de trecho e offset.
- Testes unitários das operações da sequência.

## Execução e validação

Em andamento.

# AutoReels — matriz de contraste 09H-C.3-FINAL

Data: 01/11/2026. Escopo: Chromium local, janelas de 390 × 900 e 1440 × 900, painel escuro existente. A preferência clara/escura do sistema não cria outro tema no painel. Os resultados referem-se somente aos estados e amostras descritos, não à acessibilidade integral.

| Item e estado | Situação | Evidência e critério |
| --- | --- | --- |
| Texto da música selecionada no seletor fechado | **APROVADO** | `#ffffff` sobre `#09090b`, 19,89:1 em ambas as larguras; axe-core, referência 4,5:1 para texto normal. |
| Amostras do foco nativo: resumo, foto selecionada, botão de reordenação, formato, sincronização, duração e música | **APROVADO** | Nas duas larguras, pixels brancos `#ffffff` adjacentes a `#101010`, 19,03:1, em pelo menos duas bordas por controle; referência 3:1 para contraste não textual. |
| Amostras do foco nativo: confirmar fallback e cancelar proposta | **APROVADO** | `#ffffff` adjacente a `#101010`, 19,03:1 nas duas larguras; no botão de confirmação em 390 px foram obtidas amostras nas bordas superior e direita. Critério não textual de 3:1 nas amostras, sem afirmar medição integral de todo o contorno. |
| Foco explícito de analisar e cancelar análise | **APROVADO** | Medição 09H-C.3: `#b8e6fe` sobre `#141d2c`, 12,71:1, nas duas larguras; referência 3:1. |
| Texto do fallback e erro | **APROVADO** | Medições 09H-C.3: fallback `#fee685` sobre `#141d2d`, 13,56:1; erro `#dff2fe` sobre `#141d2d`, 14,69:1; referência 4,5:1. |
| Foto selecionada e marca interna | **APROVADO** | Medição visual por pixels da captura de 390 px do 09H-C.3: caixa `#99c8ff` sobre `#131c2c`, aproximadamente 9,80:1; marca `#3b3b3b` sobre `#99c8ff`, aproximadamente 6,43:1. Amostra restrita a Chromium nessa largura. |
| Controles desabilitados | **NÃO HOMOLOGADO** | Não foram atribuídas razões numéricas; controles inativos têm exceção nos critérios de contraste pertinentes. |
| Foco não amostrado, bordas não visíveis, menu nativo de opções aberto e estados gráficos restantes | **NÃO HOMOLOGADO** | As amostras não comprovam todo o contorno, todas as opções nem todas as configurações do sistema. |
| Outros navegadores e tecnologias assistivas | **NÃO HOMOLOGADO** | Firefox e WebKit não foram executados; Narrador/NVDA dependem de teste real de fala e compreensão. Usar [a ficha manual](09hc3-roteiro-leitor.md). |

Nenhum item medido recebeu a classificação **FALHOU**. Não houve alteração de estilos; isso não aprova os estados não medidos.

## Método e limitações

O teste `tests/e2e/video-editor-09hc3-final.spec.ts` cria mídias sintéticas locais, usa o fluxo real do painel e captura cada controle nativo antes e depois do foco por teclado. Em uma faixa externa à caixa do controle, compara pixels alterados com pixels adjacentes na imagem focada. Só registra uma razão quando encontra pelo menos cinco pixels da mesma combinação de cores em duas ou mais bordas. O teste também usa axe-core para o texto da música selecionada. Os resultados por largura estão em `.local-cache/09hc3-final-results-3/`.

Uma razão acima do limiar em amostras não prova automaticamente que todos os pixels do indicador, todas as combinações de estado ou todos os critérios WCAG foram cumpridos. Não foram usados percentuais simulados nem recursos remotos.

**Decisão:** concluir apenas as verificações automatizadas aqui descritas. A homologação final de acessibilidade do AutoReels permanece dependente da ficha com leitor de tela real e da avaliação dos estados não homologados relevantes ao lançamento.

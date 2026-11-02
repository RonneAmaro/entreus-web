# AutoReels — ficha de homologação com leitor de tela

Esta ficha é para execução manual no Windows 11. Os testes automatizados de ARIA, contraste e teclado não comprovam o que um leitor de tela anuncia. Execute em um projeto local de teste, sem substituir uma edição importante.

**Data e responsável:** ____________________\
**Leitor e versão:** Narrador / NVDA ____________________\
**Navegador e versão:** ____________________\
**Largura da janela e escala do Windows:** ____________________\
**Resultado geral:** PENDENTE / PASSOU / FALHOU

## Preparação

1. Abra o EntreUS Studio local no navegador, ative Narrador ou NVDA e use apenas teclado e as teclas do leitor para navegar.
2. Em um projeto de teste, importe pelo menos três fotos ou vídeos pequenos e uma música local de até 60 segundos e 10 MiB que contenha ritmo audível. Importe também, se disponível, um WAV silencioso válido para exercitar o fallback.
3. Abra **Mídia → AutoReels**. Repita o fluxo em janela de aproximadamente 390 px e em janela desktop, quando possível.

## Verificações

Marque **PASSOU**, **FALHOU** ou **NÃO TESTADO**; registre literalmente o anúncio observado quando houver divergência. Não marque PASSOU apenas porque o texto apareceu na tela.

| Verificação | Resultado | Observação / anúncio ouvido |
| --- | --- | --- |
| Ao percorrer as mídias, o leitor anuncia nome, tipo e estado de seleção. |  |  |
| Ao ativar sincronização, o campo de música é anunciado como obrigatório e sua orientação é compreensível. |  |  |
| Ao focar a duração, o leitor anuncia o nome, valor e instruções aplicáveis. |  |  |
| Ao iniciar a análise, o leitor anuncia o carregamento sem percentual inventado. |  |  |
| Cancelar anuncia o cancelamento; o foco retorna ao comando de análise e o projeto permanece sem proposta aplicada. |  |  |
| Uma nova análise após cancelar funciona sem recarregar a página. |  |  |
| Ao concluir com música rítmica, o leitor anuncia que a proposta está pronta; os detalhes e a confirmação são alcançáveis sem salto inesperado de foco. |  |  |
| Com WAV silencioso, o fallback é anunciado, identifica que não há sincronização e não produz anúncios redundantes confusos. |  |  |
| Com duração inválida ou arquivo de teste ausente, o erro é anunciado de forma compreensível e o usuário consegue corrigir e tentar novamente. |  |  |
| Ordem de Tab e indicador de foco permanecem compreensíveis nas duas larguras. |  |  |

**Como reproduzir o erro de duração:** no modo regular, informe `0` na duração e acione **Gerar proposta**; depois corrija para um valor válido. Não apague arquivos de projetos reais para simular mídia ausente.

**Evidências e limitações:** ________________________________________________\
**Responsável e data da decisão:** __________________________________________

Marque o resultado geral como PASSOU somente se os cenários aplicáveis tiverem sido executados e aprovados. Itens não executados permanecem NÃO TESTADO e devem constar da decisão final.

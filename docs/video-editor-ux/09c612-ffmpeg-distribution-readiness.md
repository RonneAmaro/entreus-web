# Package 09C.6.12 — preparação para eventual distribuição do FFmpeg

Avaliação em 20/10/2026. Método: comparar a [cadeia de custódia verificada](09c612-ffmpeg-chain-of-custody.md), o [inventário de fontes](09c612-ffmpeg-source-inventory.md), o [ensaio 09C.6.7](09c67-production-local-validation.md), o [ciclo de vida 09C.6.9](09c69-ffmpeg-lifecycle.md) e fontes oficiais indicadas abaixo. Este documento não é parecer jurídico nem aprovação de lançamento.

Legenda: **COMPROVADO** = observado em bytes ou testes documentados; **CORROBORADO** = consistente com fonte oficial sem vínculo completo com o build; **NÃO COMPROVADO** = evidência insuficiente; **BLOQUEADO** = lacuna que impede recomendar distribuição.

## Decisão atual — BLOQUEADO

**A cadeia de custódia do núcleo utilizado está comprovada?** **Parcialmente.** A identidade dos bytes do registro npm, da cópia local, do wrapper instalado e do UMD observado no unpkg em 20/10/2026 está **COMPROVADA** por digests, comparação arquivo a arquivo e assinatura ECDSA válida sob a chave pública apresentada pelo npm. A associação do WASM publicado a um conjunto imutável de fontes, dependências, patches e execução de build está **NÃO COMPROVADA**.

**Há evidências suficientes para considerar distribuição pública?** **Não. BLOQUEADO.** A assinatura do registro protege o digest do tarball, não prova fonte correspondente. O tarball core não contém as fontes, os avisos e as instruções para o binário concreto. A avaliação jurídica da integração, da oferta de fontes e de patentes H.264/AAC também está pendente. Nenhum core foi copiado ao projeto ou disponibilizado por endpoint público neste pacote.

O [FFmpeg Legal](https://ffmpeg.org/legal.html) informa que partes GPL opcionais tornam GPL o FFmpeg compilado e pede fonte correspondente ao binário e instruções de compilação em seu checklist. O [licenciamento do FFmpeg 5.1](https://ffmpeg.org/doxygen/5.1/md_LICENSE.html) inclui `libx264` e `libx265` entre as bibliotecas GPL. O WASM auditado contém `--enable-gpl`, `--enable-libx264` e `--enable-libx265`. Isso fundamenta a classificação técnica do **core atual** como GPL declarado; não determina automaticamente a licença de todo o EntreUS. Hospedar em CDN, origem separada ou `public/` não é prova de conformidade.

## Separação das tarefas

| Verificação técnica ainda necessária | Decisão jurídica ainda necessária |
| --- | --- |
| Fixar commits e conteúdos efetivos de todas as bibliotecas, inclusive refs mutáveis e submódulos. | Determinar o alcance das obrigações GPL sobre Worker, WASM, frontend e demais módulos na arquitetura concreta. |
| Obter digest da toolchain, patches, configuração, logs e evidência que ligue o build ao SHA-256 do WASM npm; montar fontes e instruções correspondentes. | Julgar a suficiência do pacote de fontes e do modo de disponibilizá-lo, além dos avisos e termos de uso. |
| Inventariar textos, titulares e exceções de licença por versão/arquivo, inclusive LAME/MPGLIB, FreeType, HarfBuzz e runtime. | Examinar compatibilidade das licenças realmente incorporadas e condições de redistribuição. |
| Medir custo de tráfego e armazenamento, CSP, memória, navegadores e mobile em pacote posterior autorizado. | Avaliar patentes e eventual licenciamento de H.264/AAC por jurisdição e modalidade de uso. |

Não existe atestado de build identificado nos metadados npm consultados, nem reprodução do WASM. Se o mantenedor não puder relacionar o tarball às fontes exatas, um build controlado com proveniência própria seria uma **nova decisão e um novo escopo**, não uma conclusão deste pacote.

## Alternativas — avaliação técnica

| Critério | A — core GPL atual | B — build FFmpeg sem partes GPL | C — WebCodecs + mux MP4 |
| --- | --- | --- | --- |
| Evidência funcional | **COMPROVADO localmente:** MP4 H.264/AAC, cortes, música, reexportação e recuperação no Chromium em 09C.6.7–09C.6.9. | **NÃO COMPROVADO:** nenhum build ou teste de paridade deste tipo foi feito. | **NÃO COMPROVADO:** nenhum pipeline do Studio foi implementado. |
| Impacto no código | Menor: preserva comandos `libx264` e lifecycle; exigiria entrega versionada e auditável do core após os gates. | Médio/alto: remover x264/x265 torna os comandos atuais incompatíveis; precisa encoder H.264 substituto, ajustes e testes. O AAC nativo do [FFmpeg](https://ffmpeg.org/ffmpeg-codecs.html) é candidato, não prova do novo WASM. | Alto: composição de quadros, áudio, timestamps, mux, cancelamento e fallback precisam de implementação própria. |
| Navegadores e desempenho | Curto e 720p no Chromium local; mobile, projetos longos e memória do Worker não medidos. | Core menor ou mais rápido é hipótese; desempenho e suporte mobile desconhecidos. | A [especificação WebCodecs](https://www.w3.org/TR/webcodecs/) não exige codec específico. H.264/AAC requer suporte real por navegador/dispositivo, mux licenciado e testes. |
| Licenças e patentes | Core GPL-2.0-or-later declarado; fonte correspondente e análise jurídica abertas. Patentes H.264/AAC abertas. | Desabilitar `--enable-gpl` é apenas ponto de partida; LGPL, bibliotecas, fonte, vinculação WASM e patentes continuam a avaliar. | Evita distribuir **este** core GPL, mas muxer, bibliotecas e patentes H.264/AAC continuam a avaliar. |
| Distribuição e custo | WASM de 32.232.419 bytes por download frio. Mil downloads são cerca de 32,2 GB só de WASM, antes de cache, JS e repetições. Preço não medido. | Tamanho, tráfego, custo de build e manutenção ainda desconhecidos. | Não exige transferir este WASM, mas app/mux e trabalho de engenharia têm custo possível. |

**Recomendação técnica condicional:** preservar A como referência funcional enquanto se busca a fonte correspondente e uma decisão jurídica. Se A não passar nesses gates, fazer uma prova controlada de B com H.264/AAC antes de estimar a reescrita C. Nenhuma alternativa está liberada para publicação nem tem custo adicional de R$ 0 comprovado. CDN não substitui fonte e avisos; LGPL não garante H.264 no código atual; WebCodecs não garante codecs ou mux.

## Critérios para uma futura decisão de distribuição

1. Manifesto que ligue cada hash do Worker/imports, core JS e WASM a fonte, licença, aviso, patch e instrução de reconstrução; evidência de build ou explicação verificável das diferenças.
2. Revisão jurídica documentada para GPL/LGPL de cada componente, forma de integração, oferta de fontes, avisos e patentes H.264/AAC. O [FFmpeg Legal](https://ffmpeg.org/legal.html) expressamente não se apresenta como aconselhamento jurídico.
3. Orçamento de tráfego e armazenamento dentro de recursos autorizados; alcance de navegadores e mobile definido pelo produto. Não prometer R$ 0 em produção sem medição.
4. Em etapa posterior autorizada: entrega versionada e íntegra, teste real de CSP/MIME/cache/rollback, falhas e reexportação no Studio e no gravador. A fixture local `__entreus_ffmpeg_local` permanece exclusiva dos testes; não é infraestrutura de distribuição.

**Estado final do 09C.6.12:** dossiê técnico parcial concluído; decisão de distribuição **BLOQUEADA** pelas lacunas de fonte correspondente e análise jurídica. Próxima ação recomendada: solicitar ao mantenedor atestado/log do build de `@ffmpeg/core@0.12.10` e commits imutáveis de todas as dependências, montar o pacote de fontes/avisos e submetê-lo a avaliação especializada. Isso não foi executado como pacote seguinte.

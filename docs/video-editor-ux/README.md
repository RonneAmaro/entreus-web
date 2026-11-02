# Editor de vídeo — Package 09A

## Auditoria curta

O editor já tinha preview, camadas, efeitos, áudio e exportação. A entrada principal, porém, espalhava ações em uma lateral longa e em seis faixas técnicas. A faixa de vídeo mostrava blocos genéricos, a música dependia de upload e o preview perdia espaço para controles.

## Nova hierarquia

1. Cabeçalho compacto: voltar, desfazer, refazer e avançar/exportar.
2. Preview central como foco da tela.
3. Timeline compacta com texto, miniaturas reais de vídeo e música; camadas extras abrem em **Camadas**.
4. Dock inferior: **Editar, Som, Texto, Efeitos, Magia, Stickers, Ajustar**. Os detalhes abrem em painel, com os ícones sempre visíveis.

## Componentes

- `VideoEditor`: shell, timeline, seleção de ferramentas, histórico visual e controles rápidos refatorados.
- `EditorToolDock`: navegação principal de sete ações.
- `VideoFilmstrip`: captura de oito quadros reais para a faixa de vídeo.
- `MusicLibrary`: busca, categorias, favoritos, recentes, preview e aplicação da trilha.
- `editor-music`: cinco loops instrumentais originais gerados localmente como WAV, sem catálogo externo.
- Páginas `/editor` e `/lab/video-editor`: apresentação mais compacta; o Lab permite começar com vídeo ou fotos.

## Evidências

- [Editor móvel](./mobile-editor.png)
- [Biblioteca musical móvel](./mobile-music.png)
- [Editor desktop](./desktop-editor.png)

## Validação local

- `next build`: passou.
- ESLint nos arquivos alterados: zero erros; permanecem avisos de dependências de efeitos e de uso de `img` no editor.
- `vitest run tests/unit/editor-music.test.ts`: passou.
- Fluxo local no `/lab/video-editor`: vídeo e fotos carregam; slideshow avança; miniaturas reais aparecem; música toca e entra na timeline; texto pode ser desfeito/refeito; presets e ajustes abrem sem erros de página, em 390 × 844 e 1365 × 900.

## Próxima etapa funcional

O atalho de tesoura reduz a duração da foto selecionada. Corte de vídeo, histórico completo de mídia, Auto cut, IA e templates ainda exigem trabalho no motor de edição. **Em alta** usa uma seleção curada das trilhas originais; não representa tendências em tempo real.

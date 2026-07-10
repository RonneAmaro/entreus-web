# Personalizacao visual de perfis

O Pacote 44 centraliza os destaques visuais usados em avatares, cards do feed e perfis, sem adicionar campos ao banco ou alterar regras de acesso, monetizacao e conteudo adulto.

## Prioridade visual

`lib/profile-visuals.ts` resolve um unico status nesta ordem:

1. Anciao
2. VIP Premium
3. VIP ativo
4. Criador fundador
5. Criador
6. Usuario comum

Anciao usa ambar, VIP Premium usa fuchsia e VIP usa azul. Os estados de criador estao preparados no helper, mas nao sao ativados pela interface enquanto nao houver um campo confiavel no perfil. Usuario comum mantem o visual neutro.

## Aplicacao

- O avatar recebe um anel discreto, responsivo e compativel com imagem ausente.
- O `PostCard` recebe borda, sombra e acento do tema sem cobrir conteudo, paywall ou protecoes 18+.
- O perfil publico e o perfil proprio usam a mesma prioridade, badge e tema efetivo.
- A tela de perfil permite pre-visualizar e salvar somente os temas que ja existem e que o nivel atual permite.
- Temas desconhecidos ou indisponiveis caem com seguranca no tema padrao.

As cores de torcida existentes usam gradientes discretos, sem reproduzir bandeiras como moldura. Brasil e Congo ja estao disponiveis, alem das paletas neutra, azul e dourada cobertas pelos temas base e de nivel.

## Limitacoes e proximos passos

- Identificar criador e criador fundador depende de um conceito persistido e confiavel; nenhuma migration foi criada neste pacote.
- Temas por evento podem ser ampliados quando houver uma estrategia de ciclo de vida e curadoria.
- Tema personalizado para criadores e bordas adicionais por pais/Copa podem reutilizar o helper central.
- Uma futura loja de temas com ItaCash exige desenho separado de produto e regras financeiras.
- Temas exclusivos VIP/Anciao podem crescer sem alterar a prioridade visual atual.

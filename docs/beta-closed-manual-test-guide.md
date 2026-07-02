# Guia de testes manuais para beta fechado de criadores

Este guia organiza os testes manuais do EntreUS antes de convidar criadores reais para o beta fechado. O foco e validar fluxos ponta a ponta com contas controladas, sem usar dados reais, documentos reais, senhas reais ou comprovantes reais.

Use este roteiro para separar problemas em cinco frentes:

- Tecnico: rotas, estados, responsividade, build e navegacao.
- Monetizacao: ItaCash, carteira, gorjetas, posts pagos e dashboard.
- Seguranca: 18+, moderacao, denuncias, admin e acesso a midias protegidas.
- UX: clareza das mensagens, fluxo de criador e mobile/PWA.
- Conteudo: comunidades, classificacao, links, midias e personalizacao visual.

## 1. Objetivo do beta fechado

O beta fechado existe para testar a plataforma com criadores fundadores antes de abrir para um publico maior. A meta nao e testar volume alto; e encontrar bloqueadores reais nos caminhos mais importantes:

- cadastro, login e recuperacao de acesso;
- criacao e consumo de posts;
- descoberta de criadores e perfis publicos;
- pagamentos internos com ItaCash;
- posts pagos e conteudo protegido;
- seguranca 18+ e verificacao de idade;
- dashboard de criador e analytics basico;
- admin, moderacao e atendimento;
- Lab, Screen Recorder, Video Editor e Meet;
- mobile/PWA e primeiras impressoes.

## 2. Perfis de teste necessarios

Crie contas de teste sem dados reais. Use e-mails, nomes, avatares e documentos ficticios de ambiente controlado.

| Perfil | Objetivo | Observacoes |
| --- | --- | --- |
| Usuario comum | Testar feed, interacoes, compra de ItaCash e perfil basico. | Sem badge especial. |
| Criador | Publicar, receber seguidores, gorjetas e criar posts pagos. | Pode ter dashboard habilitado. |
| Criador VIP | Validar selo VIP, tema VIP e beneficios visuais. | VIP ativo e dentro da validade. |
| Criador VIP Premium | Validar prioridade de tier e tema premium. | Deve superar VIP comum. |
| Anciao | Validar selo/tier maximo e tema Anciao. | Deve superar VIP Premium. |
| Usuario menor ou sem 18+ | Validar bloqueios de conteudo adulto. | Nao usar documento real. |
| Usuario adulto verificado | Validar acesso adulto quando as regras permitirem. | Preferir ambiente controlado. |
| Administrador | Revisar age verification, reports, moderacao e filas admin. | Nunca compartilhar credenciais. |

## 3. Cadastro, login e perfil

- [ ] Abrir `/signup` e criar conta nova.
- [ ] Confirmar mensagens de erro para e-mail invalido, senha fraca ou campos obrigatorios.
- [ ] Abrir `/login` e entrar com a conta criada.
- [ ] Fazer logout e login novamente.
- [ ] Abrir `/forgot-password` e validar o fluxo visual de recuperacao.
- [ ] Abrir `/complete-profile` e completar username, nome e dados obrigatorios.
- [ ] Validar username duplicado ou invalido.
- [ ] Abrir `/profile`.
- [ ] Atualizar avatar.
- [ ] Atualizar banner.
- [ ] Salvar bio, cidade, estado, pais e site.
- [ ] Abrir `/u/[username]` em outra conta.
- [ ] Confirmar que perfil publico mostra nome, username, avatar, banner, selos e posts visiveis.
- [ ] Confirmar que usuario bloqueado ou privado nao vaza dados indevidos, se aplicavel.

## 4. Feed, comunidades e composer

- [ ] Abrir `/feed` com usuario comum.
- [ ] Criar post comum somente texto.
- [ ] Criar post com imagem.
- [ ] Criar post com video.
- [ ] Criar post com link e validar preview/link clicavel.
- [ ] Criar post em comunidade geral.
- [ ] Criar post em comunidade de esportes, geopolitica, militar ou outra disponivel.
- [ ] Abrir opcoes avancadas do composer.
- [ ] Publicar com classificacao segura.
- [ ] Publicar com classificacao sensivel/18+ usando conta autorizada.
- [ ] Tentar publicar classificacao 18+ com conta sem permissao, se a UI permitir chegar nesse ponto.
- [ ] Criar post com post pago desligado.
- [ ] Criar post com post pago ligado.
- [ ] Validar preco ItaCash minimo, maximo e mensagens de erro.
- [ ] Validar loading, sucesso e erro do composer.
- [ ] Confirmar que o feed novo aparece sem refresh manual quando esperado.
- [ ] Confirmar que filtros de comunidade nao mostram conteudo fora da classificacao permitida.

## 5. PostCard e interacoes

- [ ] Curtir post.
- [ ] Remover curtida.
- [ ] Comentar em post.
- [ ] Editar ou apagar comentario, se disponivel.
- [ ] Repostar.
- [ ] Remover repost.
- [ ] Salvar post.
- [ ] Abrir `/saved` e confirmar post salvo.
- [ ] Remover salvo.
- [ ] Abrir `/post/[id]`.
- [ ] Clicar no autor e abrir `/u/[username]`.
- [ ] Compartilhar/copiar link do post.
- [ ] Denunciar post.
- [ ] Confirmar que post ocultado por moderacao aparece bloqueado ou some da lista publica.
- [ ] Ver tema visual do autor no feed.
- [ ] Ver avatar ring do autor.
- [ ] Ver cores de torcida em autor comum.
- [ ] Ver destaque VIP, VIP Premium ou Anciao.
- [ ] Confirmar que visual nao atrapalha leitura no mobile.

## 6. ItaCash, carteira e gorjetas

- [ ] Abrir `/wallet`.
- [ ] Conferir saldo inicial de ItaCash.
- [ ] Abrir `/buy-itacash`.
- [ ] Criar solicitacao manual/Pix, se o fluxo estiver habilitado.
- [ ] Ver solicitacao no admin em `/admin/itacash-purchases`, se existir no ambiente.
- [ ] Aprovar compra em ambiente controlado.
- [ ] Confirmar saldo atualizado na carteira.
- [ ] Abrir `/itacash` e conferir explicacao/fluxo disponivel.
- [ ] Abrir perfil ou post de criador.
- [ ] Enviar gorjeta ItaCash.
- [ ] Confirmar reducao de saldo do remetente.
- [ ] Confirmar aumento/registro para o criador.
- [ ] Conferir transacao na carteira.
- [ ] Confirmar notificacao de gorjeta ou apoio, se implementada.
- [ ] Validar saldo insuficiente.
- [ ] Validar que usuario nao envia gorjeta para si mesmo, se a regra existir.

## 7. Posts pagos

- [ ] Criador cria post pago com preco valido.
- [ ] Outra conta ve paywall no feed.
- [ ] Outra conta abre `/post/[id]` e ve paywall.
- [ ] Validar saldo insuficiente.
- [ ] Desbloquear post pago com saldo suficiente.
- [ ] Confirmar que conteudo e midias aparecem apos desbloqueio.
- [ ] Confirmar que autor nao compra o proprio post.
- [ ] Confirmar que desbloqueio persiste ao recarregar a pagina.
- [ ] Confirmar que midia protegida nao abre antes do desbloqueio.
- [ ] Confirmar que conteudo adulto continua bloqueado para quem nao pode ver, mesmo se houver paywall.
- [ ] Confirmar que post pago adulto so aparece para usuario adulto permitido e desbloqueado.
- [ ] Conferir registro no dashboard/carteira do criador, se aparecer.

## 8. Dashboard do criador e analytics

- [ ] Abrir `/creator-dashboard`.
- [ ] Ver total de posts.
- [ ] Ver curtidas recebidas.
- [ ] Ver comentarios recebidos.
- [ ] Ver reposts.
- [ ] Ver salvos.
- [ ] Ver seguidores.
- [ ] Ver apoios/gorjetas.
- [ ] Ver posts pagos ou receita associada, se aparecer.
- [ ] Ver visualizacoes/analytics.
- [ ] Abrir um post individual com outra conta.
- [ ] Confirmar visualmente se `post_views`/metricas aumentam quando esperado.
- [ ] Reabrir o mesmo post no mesmo dia e observar dedupe diario quando possivel.
- [ ] Validar empty states para criador sem posts.
- [ ] Validar loading e mensagens de erro sem expor detalhes sensiveis.

## 9. Seguranca 18+ e verificacao de idade

- [ ] Usuario menor ou nao verificado nao ve conteudo adulto.
- [ ] Conteudo adulto nao aparece no feed de quem nao pode ver.
- [ ] Usuario adulto verificado ve conteudo adulto somente quando a regra e opt-in permitir.
- [ ] Overlay/bloqueio aparece antes de conteudo sensivel.
- [ ] Midia adulta protegida nao monta antes do reveal/autorizacao.
- [ ] URL direta de midia adulta protegida nao abre para usuario sem permissao.
- [ ] Abrir `/age-verification`.
- [ ] Enviar solicitacao de verificacao com dados ficticios de teste.
- [ ] Abrir `/admin/age-verifications`.
- [ ] Aprovar verificacao em ambiente controlado.
- [ ] Reprovar verificacao e conferir mensagem/status.
- [ ] Confirmar que documentos 18+ usam acesso admin/signed URL, sem URL publica permanente.
- [ ] Confirmar que logs e telas nao exibem documento sensivel fora do admin.

## 10. Denuncias e moderacao

- [ ] Denunciar post no feed.
- [ ] Denunciar post em `/post/[id]`.
- [ ] Abrir `/admin/reports`.
- [ ] Confirmar denuncia pendente.
- [ ] Recusar denuncia.
- [ ] Criar nova denuncia e marcar em analise, se aplicavel.
- [ ] Ocultar conteudo denunciado.
- [ ] Abrir `/admin/moderation`.
- [ ] Confirmar conteudo ocultado na lista.
- [ ] Restaurar conteudo quando aplicavel.
- [ ] Confirmar que conteudo ocultado some da lista publica ou aparece com bloqueio apropriado.
- [ ] Confirmar notificacao ao criador, se implementada.
- [ ] Confirmar que usuario comum nao abre `/admin/reports` ou `/admin/moderation`.

## 11. Personalizacao visual, selos e VIP

- [ ] Abrir `/profile`.
- [ ] Selecionar tema padrao.
- [ ] Selecionar tema de torcida.
- [ ] Selecionar tema VIP com conta VIP.
- [ ] Selecionar tema VIP Premium com conta VIP Premium.
- [ ] Selecionar tema Anciao com conta Anciao.
- [ ] Tentar tema VIP com conta comum e validar bloqueio/fallback.
- [ ] Ver perfil publico apos salvar tema.
- [ ] Ver tema no feed.
- [ ] Ver tema em `/post/[id]`.
- [ ] Ver tema em `/saved`.
- [ ] Confirmar avatar ring.
- [ ] Confirmar faixa do card sem poluir leitura.
- [ ] Abrir `/selos`.
- [ ] Confirmar selos VIP/VIP Premium/Anciao quando existirem.
- [ ] Abrir `/vip-plus` e validar copy de beneficios visuais.

## 12. Convite, criadores e onboarding

- [ ] Abrir `/convite`.
- [ ] Validar textos para criadores fundadores.
- [ ] Conferir que a pagina explica ItaCash, posts pagos, dashboard e selos sem prometer recurso inexistente.
- [ ] Abrir `/creators`.
- [ ] Abrir `/creators/apply`.
- [ ] Enviar interesse de criador com dados ficticios.
- [ ] Validar mensagem de sucesso.
- [ ] Validar campos obrigatorios e erros.
- [ ] Confirmar que criador entende proximos passos.

## 13. Lab: Screen Recorder e Video Editor

Screen Recorder em `/lab/screen-recorder`:

- [ ] Gravar tela.
- [ ] Gravar tela com microfone.
- [ ] Gravar tela com webcam.
- [ ] Usar anotacoes.
- [ ] Baixar MP4 direto quando suportado.
- [ ] Baixar WebM quando MP4 nao for suportado.
- [ ] Exportar WebM para MP4.
- [ ] Abrir arquivo gerado em player local.
- [ ] Testar cancelamento de permissao de tela/mic/camera.
- [ ] Testar em navegador alternativo quando possivel.

Video Editor em `/lab/video-editor`:

- [ ] Importar video.
- [ ] Exportar MP4 real.
- [ ] Abrir MP4 no player.
- [ ] Testar video curto.
- [ ] Testar erro com arquivo grande.
- [ ] Confirmar que UI nao congela sem feedback.

## 14. Meet

- [ ] Abrir `/meet`.
- [ ] Criar sala.
- [ ] Entrar em `/meet/[roomName]` com duas contas.
- [ ] Pedir acesso com segunda conta.
- [ ] Aceitar acesso.
- [ ] Rejeitar acesso em outro teste.
- [ ] Testar microfone.
- [ ] Testar camera.
- [ ] Testar chat.
- [ ] Testar mao levantada.
- [ ] Testar anexos, se habilitados.
- [ ] Testar gravacao, se habilitada no ambiente.
- [ ] Abrir no mobile e validar entrada/controles.
- [ ] Confirmar que usuario nao aprovado nao acessa sala.

## 15. Mobile e PWA

- [ ] Abrir no celular real.
- [ ] Abrir no modo responsivo do navegador.
- [ ] Instalar PWA via `/instalar`.
- [ ] Abrir app instalado.
- [ ] Testar feed.
- [ ] Testar composer.
- [ ] Testar upload de imagem/video dentro das limitacoes do celular.
- [ ] Testar post pago.
- [ ] Testar perfil e perfil publico.
- [ ] Testar wallet.
- [ ] Testar notificacoes visuais.
- [ ] Testar Screen Recorder observando limitacoes do celular.
- [ ] Confirmar que textos nao quebram botoes/cards.

## 16. Admin

- [ ] Abrir `/admin` com administrador.
- [ ] Abrir `/admin` com usuario comum e confirmar bloqueio.
- [ ] Abrir `/admin/reports`.
- [ ] Abrir `/admin/moderation`.
- [ ] Abrir `/admin/age-verifications`.
- [ ] Abrir `/admin/itacash-purchases`.
- [ ] Abrir `/admin/creator-withdrawals`.
- [ ] Abrir `/admin/badges`.
- [ ] Abrir `/admin/r2-orphans`.
- [ ] Abrir `/admin/security-check`.
- [ ] Abrir `/admin/feedback`.
- [ ] Confirmar que areas financeiras iniciais nao mostram secrets ou dados indevidos.
- [ ] Confirmar que signed URLs aparecem somente no momento de revisao, se aplicavel.
- [ ] Confirmar empty states e mensagens de erro.

## 17. Busca, mensagens e notificacoes

- [ ] Abrir `/search` e buscar usuarios.
- [ ] Buscar termos de posts quando disponivel.
- [ ] Abrir `/notifications` e validar notificacoes recentes.
- [ ] Criar interacao que gere notificacao.
- [ ] Abrir `/messages`.
- [ ] Iniciar conversa com outro usuario.
- [ ] Enviar mensagem.
- [ ] Abrir `/messages/[id]`.
- [ ] Validar bloqueios entre usuarios, se existirem.

## 18. Criterios de aprovacao para convidar criadores

Classifique cada problema encontrado:

- Bloqueador: impede cadastro, publicacao, seguranca 18+, compra/uso de ItaCash, paywall, admin critico ou build.
- Importante: afeta fluxo principal, mas existe contorno manual seguro.
- Melhoria futura: UX, texto, polimento ou recurso desejavel.
- Aprovado: testado com sucesso, sem evidencia de problema.

Recomendacao para chamar criadores:

- [ ] Nenhum bloqueador aberto.
- [ ] Problemas importantes documentados e com contorno conhecido.
- [ ] Fluxos de dinheiro interno testados com contas de teste.
- [ ] Fluxos 18+ testados com contas de teste.
- [ ] Admin consegue revisar filas principais.
- [ ] Guia de registro de bugs esta sendo usado.

## 19. Modelo de registro de bugs

Use este modelo em issue, planilha ou ferramenta interna:

```text
Data:
Rota:
Conta usada:
Perfil de teste:
Ambiente/navegador:
Passos para reproduzir:
Resultado esperado:
Resultado obtido:
Print/video:
Prioridade: Bloqueador | Importante | Melhoria futura
Status: Aberto | Em analise | Corrigido | Validado | Adiado
Responsavel:
Observacoes:
```

## 20. Proximos pacotes sugeridos

- Admin financeiro completo.
- Saque/repasse manual com minimo 1000 ItaCash.
- Tutorial/video animado do ItaCash.
- LiveKit proprio na Oracle.
- RPC/view segura para feeds, perfis e salvos.
- Onboarding guiado para criadores.
- Loja de temas/skins com ItaCash.

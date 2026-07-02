# Checklist rapido do beta fechado

Use junto com `docs/beta-closed-manual-test-guide.md`. Marque somente testes feitos com contas ficticias/controladas.

## Conta e perfil

- [ ] Criar conta em `/signup`.
- [ ] Entrar em `/login`.
- [ ] Testar logout e novo login.
- [ ] Testar recuperacao em `/forgot-password`.
- [ ] Completar perfil em `/complete-profile`.
- [ ] Atualizar avatar e banner em `/profile`.
- [ ] Abrir perfil publico em `/u/[username]`.
- [ ] Confirmar username, bio, cidade/pais, selos e posts.

## Post e composer

- [ ] Criar post texto.
- [ ] Criar post com imagem.
- [ ] Criar post com video.
- [ ] Criar post com link.
- [ ] Criar post por comunidade.
- [ ] Abrir opcoes avancadas.
- [ ] Testar classificacao segura.
- [ ] Testar classificacao sensivel/18+ com conta permitida.
- [ ] Testar post pago desligado.
- [ ] Testar post pago ligado.
- [ ] Validar preco ItaCash e erros.
- [ ] Curtir, comentar, repostar e salvar.
- [ ] Abrir `/post/[id]`.
- [ ] Confirmar tema visual/avatar ring no feed.

## Monetizacao

- [ ] Abrir `/wallet`.
- [ ] Conferir saldo.
- [ ] Abrir `/buy-itacash`.
- [ ] Criar compra manual/Pix em ambiente controlado.
- [ ] Revisar compra em `/admin/itacash-purchases`, se aplicavel.
- [ ] Enviar gorjeta.
- [ ] Confirmar saldo do remetente.
- [ ] Confirmar recebimento do criador.
- [ ] Criar post pago.
- [ ] Ver paywall no feed.
- [ ] Ver paywall em `/post/[id]`.
- [ ] Desbloquear com outra conta.
- [ ] Testar saldo insuficiente.
- [ ] Confirmar que autor nao compra o proprio post.

## 18+

- [ ] Conta menor/nao verificada nao ve adulto.
- [ ] Adulto verificado ve adulto somente quando permitido.
- [ ] Conteudo adulto nao aparece no feed indevido.
- [ ] Overlay/bloqueio aparece.
- [ ] Midia adulta protegida nao abre por URL direta.
- [ ] Enviar verificacao ficticia em `/age-verification`.
- [ ] Aprovar/reprovar em `/admin/age-verifications`.
- [ ] Confirmar signed URL/admin para documentos.

## Admin

- [ ] `/admin` abre para admin.
- [ ] `/admin` bloqueia usuario comum.
- [ ] Revisar `/admin/reports`.
- [ ] Revisar `/admin/moderation`.
- [ ] Revisar `/admin/age-verifications`.
- [ ] Revisar `/admin/itacash-purchases`.
- [ ] Revisar `/admin/creator-withdrawals`.
- [ ] Revisar `/admin/badges`.
- [ ] Revisar `/admin/r2-orphans`.
- [ ] Revisar `/admin/security-check`.
- [ ] Revisar `/admin/feedback`.
- [ ] Confirmar que telas admin nao exibem secrets.

## Lab

- [ ] Abrir `/lab/screen-recorder`.
- [ ] Gravar tela.
- [ ] Gravar com microfone.
- [ ] Gravar com webcam.
- [ ] Usar anotacoes.
- [ ] Baixar MP4 direto quando suportado.
- [ ] Baixar WebM quando necessario.
- [ ] Converter WebM para MP4.
- [ ] Abrir arquivo em player.
- [ ] Abrir `/lab/video-editor`.
- [ ] Importar video.
- [ ] Exportar MP4.
- [ ] Testar erro com arquivo grande.

## Meet

- [ ] Abrir `/meet`.
- [ ] Criar sala.
- [ ] Entrar com duas contas.
- [ ] Pedir acesso.
- [ ] Aceitar/rejeitar acesso.
- [ ] Testar microfone/camera.
- [ ] Testar chat.
- [ ] Testar mao levantada.
- [ ] Testar mobile.

## Mobile e PWA

- [ ] Abrir no celular.
- [ ] Instalar PWA em `/instalar`.
- [ ] Testar feed.
- [ ] Testar composer.
- [ ] Testar post pago.
- [ ] Testar perfil.
- [ ] Testar wallet.
- [ ] Testar Lab observando limitacoes mobile.
- [ ] Confirmar que textos nao quebram layout.

## Aprovacao final

- [ ] Nenhum bloqueador aberto.
- [ ] Build local passou.
- [ ] Testes unitarios passaram.
- [ ] Fluxos de ItaCash testados com contas controladas.
- [ ] Fluxos 18+ testados com contas controladas.
- [ ] Admin consegue revisar filas principais.
- [ ] Bugs registrados com rota, conta, passos, esperado, obtido, prioridade e status.
- [ ] Criadores fundadores podem ser chamados com riscos conhecidos.

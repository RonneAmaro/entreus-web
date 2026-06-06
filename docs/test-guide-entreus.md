# Guia Geral de Testes - EntreUS

Este guia serve para testar a plataforma antes de convidar usuarios reais.

## 1. Preparacao do ambiente

Execute antes de iniciar os testes:

```powershell
cd C:\Porjetos\EntreUS\entreus-web
git status --short
git pull origin main
npm.cmd run build
```

Conferir:

- [ ] Build passando.
- [ ] Git limpo.
- [ ] Supabase online.
- [ ] Vercel deploy atualizado.
- [ ] Variaveis principais configuradas.
- [ ] Buckets privados conferidos.

## 2. Migrations e buckets criticos

Migrations:

- [ ] `meet_room_chat_messages` aplicada.
- [ ] `add_meet_chat_attachments` aplicada.
- [ ] `create_manual_user_badges` aplicada.
- [ ] `add_badge_awarded_notifications` aplicada.
- [ ] `add_manual_vip_base_fields` aplicada.
- [ ] `process_vip_payment_orders` aplicada.
- [ ] Moderation fields aplicada.
- [ ] Moderation notification type aplicada.
- [ ] Harden admin sensitive RLS aplicada.
- [ ] Parental consent/terms migrations aplicadas.

Buckets:

- [ ] `meet-chat-attachments` privado.
- [ ] `age-verifications` privado.
- [ ] `payment-proofs` privado, se existir.
- [ ] R2 configurado para posts/comments.

## 3. Login e cadastro

- [ ] Cadastro normal.
- [ ] Login normal.
- [ ] Logout.
- [ ] Login Google.
- [ ] Google cria profile se nao existir.
- [ ] Complete-profile.
- [ ] Data de nascimento.
- [ ] Aceite de termos.
- [ ] Erro amigavel se algo falhar.

## 4. Menores e consentimento parental

- [ ] Menor se cadastra.
- [ ] Menor vai para `account-pending`.
- [ ] Responsavel recebe/gera link.
- [ ] Responsavel aprova.
- [ ] Responsavel recusa.
- [ ] Menor nao acessa 18+.
- [ ] Usuario adulto segue fluxo normal.

## 5. Feed e posts

- [ ] Criar post texto.
- [ ] Criar post com imagem.
- [ ] Criar post com video.
- [ ] Limite de upload.
- [ ] Upload R2 via presign.
- [ ] Comentario.
- [ ] Comentario com midia se existir.
- [ ] Curtir.
- [ ] Repostar.
- [ ] Salvar.
- [ ] Abrir post direto.
- [ ] Excluir/ocultar se houver.
- [ ] Mobile.

## 6. Conteudo sensivel e 18+

- [ ] Post sensivel aparece com overlay.
- [ ] Midia sensivel nao carrega antes do reveal.
- [ ] Video sensivel nao toca antes do reveal.
- [ ] Usuario nao verificado nao acessa.
- [ ] Menor nao acessa.
- [ ] Usuario 18+ aprovado acessa.
- [ ] Link direto `/post/[id]` respeita bloqueio.

## 7. Perfis e selos

- [ ] Perfil privado `/profile`.
- [ ] Perfil publico `/u/[username]`.
- [ ] Avatar.
- [ ] Bio.
- [ ] Posts do usuario.
- [ ] UserBadges.
- [ ] UserBadgesPanel.
- [ ] Selo Comunidade.
- [ ] Selo Anciao.
- [ ] VIP.
- [ ] VIP Premium.
- [ ] Pagina `/selos`.

## 8. Admin Badges

- [ ] Usuario admin acessa `/admin/badges`.
- [ ] Usuario comum bloqueado.
- [ ] Busca por nome.
- [ ] Busca por username.
- [ ] Busca por e-mail.
- [ ] Conceder Selo Comunidade.
- [ ] Remover selo.
- [ ] Conceder Selo Anciao.
- [ ] Conceder VIP manual.
- [ ] Cancelar VIP.
- [ ] Sugestoes de Selo Comunidade.
- [ ] Notificacao `badge_awarded`.
- [ ] Nao duplicar selo/notificacao.

## 9. VIP

- [ ] `/vip-plus` usuario comum.
- [ ] Planos 30/90/365.
- [ ] Preparar pedido VIP.
- [ ] Pedido fica `pending`.
- [ ] Nao vira VIP sem pagamento.
- [ ] VIP manual admin.
- [ ] VIP pago via webhook aprovado.
- [ ] Webhook duplicado nao estende duas vezes.
- [ ] VIP expirado/cancelado volta a comum.
- [ ] `/profile` mostra VIP.
- [ ] Meet VIP 60 minutos.
- [ ] Usuario comum Meet 20 minutos.

## 10. ItaCash e pagamentos

- [ ] Wallet.
- [ ] Compra manual ItaCash.
- [ ] Pix manual.
- [ ] Comprovante.
- [ ] Admin aprova.
- [ ] Admin recusa.
- [ ] Notificacao aprovada/recusada.
- [ ] Mercado Pago ItaCash.
- [ ] Webhook duplicado nao duplica saldo.
- [ ] Logs sem tokens/secrets.
- [ ] `/admin/security-check` pagamentos.

## 11. EntreUS Meet

- [ ] Criar sala.
- [ ] Sala comum 20 min.
- [ ] Sala VIP 60 min.
- [ ] Contador no header.
- [ ] Aviso 60 segundos.
- [ ] Tela final.
- [ ] Pedido de entrada.
- [ ] Aceitar/recusar.
- [ ] Tela de espera.
- [ ] Participantes.
- [ ] Badge de solicitacao.
- [ ] Som de alerta.
- [ ] Microfone.
- [ ] Camera.
- [ ] Compartilhar tela.
- [ ] Layout de apresentacao com tela grande.
- [ ] Miniaturas.
- [ ] Chat.
- [ ] Historico do chat.
- [ ] Usuario entra depois e ve mensagens.
- [ ] Links no chat.
- [ ] Emojis no chat.
- [ ] Anexos no chat.
- [ ] Download de anexo.
- [ ] Arquivo bloqueado.
- [ ] Arquivo maior que 5 MB.
- [ ] Auditoria `/admin/meet-attachments`.
- [ ] Mobile.

## 12. Mensagens privadas

- [ ] Listar conversas.
- [ ] Abrir conversa.
- [ ] Enviar mensagem.
- [ ] Responder.
- [ ] Editar.
- [ ] Excluir para mim.
- [ ] Excluir para todos.
- [ ] Arquivar/desarquivar.
- [ ] Limpar conversa.
- [ ] Personalizar conversa.
- [ ] Upload de midia se existir.
- [ ] Mobile.

## 13. Notificacoes

- [ ] Curtida.
- [ ] Comentario.
- [ ] Presente.
- [ ] Compra ItaCash aprovada/recusada.
- [ ] Post ocultado.
- [ ] `badge_awarded`.
- [ ] VIP.
- [ ] Leitura/estado visual.
- [ ] Mobile.

## 14. Admin Reports e Moderacao

- [ ] `/admin/reports`.
- [ ] Marcar em analise.
- [ ] Recusar denuncia.
- [ ] Ocultar conteudo.
- [ ] Restaurar conteudo.
- [ ] Abrir post.
- [ ] Copiar link.
- [ ] Contador de pendencias.
- [ ] Notificacao ao criador.
- [ ] Usuario comum nao acessa admin.

## 15. Editor de video e EntreUS Lab

- [ ] `/editor`.
- [ ] Upload video.
- [ ] Texto.
- [ ] Imagem.
- [ ] Figurinha.
- [ ] Musica.
- [ ] Voz.
- [ ] Timeline.
- [ ] Exportar/publicar.
- [ ] `/lab/video-editor`.
- [ ] Baixar sem publicar.
- [ ] Testar mobile com cuidado.
- [ ] Videos grandes.
- [ ] Falha FFmpeg.wasm.

## 16. R2 e midias

- [ ] Upload imagem feed.
- [ ] Upload video feed.
- [ ] Upload comentario.
- [ ] `/api/r2/upload` retorna 410.
- [ ] `/api/r2/presign` funciona.
- [ ] Auditoria R2 orphans.
- [ ] Limites de tamanho.
- [ ] URLs invalidas bloqueadas.

## 17. Seguranca geral

- [ ] Usuario comum tentando `/admin`.
- [ ] Usuario comum tentando APIs admin.
- [ ] Usuario nao aprovado tentando anexos Meet.
- [ ] Webhook invalido.
- [ ] Pagamento duplicado.
- [ ] Post 18+ com menor.
- [ ] Bucket `age-verifications` privado.
- [ ] Bucket `meet-chat-attachments` privado.
- [ ] Logs sem secrets.

## 18. PWA e mobile

- [ ] Instalar PWA.
- [ ] Manifest.
- [ ] Icones.
- [ ] Tema.
- [ ] Navegacao mobile.
- [ ] Feed mobile.
- [ ] Meet mobile.
- [ ] Chat mobile.
- [ ] Notificacoes mobile.
- [ ] Offline basico, se existir.

## 19. Checklist antes de chamar usuarios reais

- [ ] Build passou.
- [ ] Migrations aplicadas.
- [ ] Buckets privados.
- [ ] Admin bloqueado para usuarios comuns.
- [ ] Pagamentos testados.
- [ ] 18+ testado.
- [ ] Meet testado.
- [ ] Upload testado.
- [ ] Moderacao testada.
- [ ] Termos/politicas revisados.
- [ ] Plano de suporte/feedback pronto.

## 20. Ordem recomendada de teste

1. Seguranca/migrations/buckets.
2. Login/cadastro.
3. Feed/posts.
4. Conteudo sensivel.
5. Meet.
6. Pagamentos/VIP/ItaCash.
7. Admin/moderacao.
8. Mobile/PWA.
9. Teste final com usuario convidado.

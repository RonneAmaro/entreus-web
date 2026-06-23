# Ativação manual da gravação do EntreUS Meet

Este guia prepara a ativação real da gravação de reuniões. Não aplique mudanças automaticamente e não habilite o opt-in enquanto migration, R2 privado e LiveKit Egress não estiverem prontos.

## 1. Conferir a versão em produção

1. Confirme que o commit `f682331 feat: add meet recording foundation` (ou um commit posterior que o inclua) está no deploy de produção.
2. Confirme que a página `/admin/meet-recording` está disponível apenas para administradores.
3. Consulte o diagnóstico. Ele mostra somente booleanos, itens pendentes e avisos; nunca valores de configuração.

## 2. Aplicar a migration manualmente

1. Abra o Supabase SQL Editor do ambiente correto.
2. Copie e execute manualmente [20260623_create_meet_room_recordings.sql](../supabase/migrations/20260623_create_meet_room_recordings.sql).
3. Em seguida, execute [verify-meet-room-recordings.sql](../supabase/sql/verify-meet-room-recordings.sql).
4. Revise se a tabela, RLS, políticas e constraints foram criadas. O verify não retorna linhas de gravações nem keys de storage.
5. Se houver problema, pare a ativação e revise o resultado. O rollback manual está em [rollback-20260623_create_meet_room_recordings.sql](../supabase/sql/rollback-20260623_create_meet_room_recordings.sql).

O rollback remove apenas metadata SQL e não apaga objetos R2. Revise obrigações de retenção antes de executá-lo. Se precisar de ajuda, copie o resultado do verify sem incluir dados de usuários, secrets ou URLs assinadas.

## 3. Criar bucket R2 privado

Crie um bucket dedicado, sugerido como `entreus-meet-recordings`:

- mantenha o acesso público desativado;
- não associe domínio público ou URL pública;
- use o bucket somente em processos server-side e LiveKit Egress;
- não permita uploads do navegador;
- use downloads somente por URL assinada temporária emitida após autorização.

O fluxo de Egress é server-to-server. Não é necessário habilitar CORS público para iniciar a gravação ou baixar pelo endpoint assinado; evite criar CORS aberto sem uma necessidade posterior validada.

## 4. Configurar variáveis server-side

Defina apenas no ambiente server-side, sem prefixo `NEXT_PUBLIC_` e sem inserir valores em código, logs ou documentação:

- `MEET_RECORDING_EGRESS_ENABLED=true`
- `R2_MEET_RECORDINGS_BUCKET_NAME`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

`R2_MEET_RECORDINGS_BUCKET_NAME` deve apontar para o bucket privado dedicado. Não reutilize `R2_PUBLIC_BASE_URL` ou qualquer bucket de mídia pública.

## 5. Verificar LiveKit Egress

1. Confirme com o provedor/plano LiveKit que Room Composite Egress é suportado.
2. Confirme que as credenciais LiveKit são exclusivamente server-side.
3. Confirme que o Egress tem permissão para gravar no bucket R2 privado com as credenciais R2 server-side.
4. Só então defina `MEET_RECORDING_EGRESS_ENABLED=true`.

Se faltar opt-in, bucket, credenciais R2 ou credenciais LiveKit, o sistema retorna “A gravação ainda não está configurada neste ambiente.” Não é iniciada gravação, não é criado arquivo e não há sucesso simulado.

## 6. Teste manual após o deploy

1. Faça redeploy no Vercel após configurar as variáveis.
2. Entre como administrador e abra `/admin/meet-recording`.
3. Confirme que o diagnóstico mostra as variáveis presentes. Ainda valide manualmente migration, bucket privado e suporte a Egress.
4. Entre em uma sala Meet como host VIP elegível.
5. Escolha **Iniciar gravação** e confirme o aviso.
6. Em uma segunda sessão autorizada, confirme o indicador **● Gravando** e o aviso aos participantes.
7. Pare a gravação como host/admin.
8. Aguarde `processing` mudar para `ready`.
9. Baixe pela URL assinada temporária.
10. Confirme no cliente que bucket, key, id de Egress, tokens e secrets não aparecem.
11. Confirme que um usuário sem permissão não lista nem baixa a gravação.

Não realize esse teste usando uma sala de produção com participantes sem aviso. Caso o diagnóstico ou qualquer teste falhe, mantenha o opt-in desligado e investigue sem expor dados sensíveis.

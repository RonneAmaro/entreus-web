# Gravação do EntreUS Meet — Pacote 49

## Status

O Pacote 49 entrega a base funcional para gravar salas Meet com LiveKit Egress, R2 privado, consentimento e autorização server-side. A configuração atual não possui a ativação explícita nem um bucket privado dedicado para gravações; por isso a gravação real fica bloqueada de modo seguro neste ambiente.

Quando a infraestrutura não estiver pronta, `POST /recordings/start` retorna:

> Gravação indisponível neste ambiente. Configure LiveKit Egress e armazenamento seguro.

Não há `MediaRecorder`, arquivo simulado, URL pública, nem registro marcado como gravado nessa condição.

## Arquitetura

1. O anfitrião/admin abre **Iniciar gravação** e confirma o aviso.
2. O backend revalida autenticação, papel, VIP, maioridade, sala ativa e consentimento.
3. Somente com a infraestrutura explicitamente habilitada ele cria metadata `preparing` e inicia o Room Composite Egress do LiveKit no servidor.
4. O Egress envia MP4 diretamente ao bucket R2 privado, sob `meet-recordings/<sala>/<id>.mp4`.
5. Após o Egress responder, a metadata passa a `recording`; ao parar, passa a `processing`.
6. A rota de status consulta o Egress para atualizar `recording`, `processing`, `ready` ou `failed`. O cliente consulta essa rota a cada cinco segundos dentro da chamada, garantindo o aviso visual para todos os participantes conectados.
7. Download só é emitido para uma pessoa autorizada, via URL R2 assinada de curta duração. A API nunca devolve bucket, key ou id de Egress ao cliente.

Os estados persistidos são `preparing`, `recording`, `processing`, `ready`, `failed` e `cancelled`.

## Consentimento e aviso

O modal informa: “Todos os participantes serão avisados de que a reunião está sendo gravada. A gravação ficará disponível apenas para pessoas autorizadas.”

O endpoint de início exige `consentConfirmed: true` e grava `consent_notice_shown_at`. Enquanto o estado é `recording`, todas as pessoas que permanecem na sala veem **● Gravando** e “Esta reunião está sendo gravada.” A consulta segura de status é a alternativa usada porque o Meet ainda não possui um canal server-to-client persistente para eventos de gravação.

## Permissões

O início exige, no servidor:

- sessão autenticada;
- anfitrião/dono ou administrador da sala, ou administrador global;
- VIP ativo;
- conta não marcada como menor de idade;
- sala ainda ativa;
- confirmação explícita do aviso.

Parar uma gravação exige anfitrião/admin, mesmo se o VIP expirar durante a chamada, para evitar deixar uma gravação sem controle. O histórico e download também ficam limitados a anfitrião/admin; participantes comuns só recebem o estado ativo necessário para o aviso.

## Storage e URLs assinadas

O R2 deve ser privado. O banco armazena somente provider, bucket e key no servidor; nenhuma URL pública é salva. A rota de download valida a autorização, o status `ready`, o provider R2 e o prefixo esperado antes de criar uma URL assinada com validade de 10 minutos.

As credenciais de LiveKit e R2 são usadas exclusivamente em `lib/meet/recording-server.ts`, importado apenas por rotas server-side. Elas não são retornadas ao browser e não são escritas em logs.

## Variáveis necessárias

Defina os nomes abaixo apenas no ambiente do servidor, sem prefixo `NEXT_PUBLIC_`:

- `MEET_RECORDING_EGRESS_ENABLED=true`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_MEET_RECORDINGS_BUCKET_NAME`

`R2_MEET_RECORDINGS_BUCKET_NAME` precisa apontar para um bucket dedicado e privado. Não reutilize um bucket público ou o `R2_PUBLIC_BASE_URL` de mídia pública. A presença de `LIVEKIT_*` isoladamente não habilita gravação; a flag explícita e o bucket dedicado são obrigatórios.

## Migration manual

Crie a tabela antes de habilitar o recurso:

- migration: `supabase/migrations/20260623_create_meet_room_recordings.sql`
- rollback: `supabase/sql/rollback-20260623_create_meet_room_recordings.sql`
- verificação somente leitura: `supabase/sql/verify-meet-room-recordings.sql`

A migration **foi apenas criada; não foi aplicada**. Ela ativa RLS, não define políticas de escrita para clientes e limita leitura direta a quem criou a gravação, anfitrião/moderador ou admin global. As mutações ficam nas rotas server-side com service role. O verify não seleciona nenhuma gravação nem key de storage. O rollback remove apenas metadata SQL e nunca apaga objetos R2; revisar retenção antes de usá-lo.

## APIs

- `GET /api/meet/rooms/[roomName]/recordings`: estado ativo para participantes autorizados e histórico seguro para host/admin.
- `POST /api/meet/rooms/[roomName]/recordings/start`: exige consentimento e tenta iniciar Egress somente com infraestrutura completa.
- `POST /api/meet/rooms/[roomName]/recordings/stop`: solicita a parada e muda para processamento.
- `GET /api/meet/rooms/[roomName]/recordings/[recordingId]/download`: gera a URL assinada privada apenas quando estiver pronta.

## Teste local

1. Mantenha `MEET_RECORDING_EGRESS_ENABLED` ausente ou diferente de `true` para confirmar o bloqueio seguro. Não use credenciais reais em testes.
2. Rode `npm.cmd run test:unit`; os testes de permissões e fluxo não usam LiveKit ou R2 reais.
3. Rode `npm.cmd run build` e `npm.cmd run qa:18plus`.
4. Para smoke, abra `/meet`; não entre em uma sala real nem aceite câmera/microfone. O smoke não deve chamar Egress.

## Validação de produção

Antes de habilitar a flag:

1. aplique a migration manualmente e execute o verify;
2. confirme que o bucket dedicado é privado e que não existe política ou domínio público para ele;
3. configure LiveKit Egress com permissão de Room Composite Egress;
4. crie uma sala de teste VIP, com participantes informados, e valide início, aviso em uma segunda sessão, parada, processamento e download assinado;
5. valide que a resposta pública não contém `storage_key`, bucket, segredo ou `egress_id`;
6. acompanhe falhas e defina uma política operacional de retenção antes de escalar o recurso.

## Limitações e próximos passos

- Não existe webhook de Egress ainda. O status é atualizado pela rota de consulta; uma integração autenticada de webhook pode reduzir a latência de `ready` e centralizar auditoria.
- Não há exclusão automática nem política de retenção configurada. Nada é removido de R2 por este pacote.
- O histórico aparece no menu da chamada para quem pode gerenciá-lo; uma biblioteca de gravações fora da chamada pode ser avaliada em outro pacote.
- Não foi realizado teste Egress/R2 real neste ambiente, porque a infraestrutura segura dedicada não está configurada.

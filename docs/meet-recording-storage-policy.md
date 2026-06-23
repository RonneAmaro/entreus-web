# Política de armazenamento das gravações do EntreUS Meet

## Objetivo

Antes de ativar o LiveKit Egress, as gravações devem ter uma política explícita de compactação, limite e retenção. Isso reduz o consumo do Cloudflare R2 sem sacrificar a qualidade mínima para reuniões e aulas.

## Perfil padrão

O único perfil selecionado automaticamente pelo servidor é `economy`:

- vídeo composto em 960×540, 20 fps e alvo de 1.100 kbps;
- áudio Opus a 64 kbps e 48 kHz;
- H.264 Main para compatibilidade de MP4;
- estimativa aproximada de 500 MB por hora;
- teto esperado de 600 MiB por gravação;
- duração máxima de 60 minutos.

O perfil `standard` existe apenas como configuração interna futura, com 1280×720, 24 fps, 2.000 kbps de vídeo, 96 kbps de áudio, teto esperado de 1 GiB e a mesma duração máxima. Ele não é selecionável pelo cliente, e não há perfil `high` ou ilimitado exposto publicamente.

Os valores são convertidos em `EncodingOptions` somente em `lib/meet/recording-server.ts`, junto do código server-side de LiveKit. Antes do primeiro Egress real, confirme a compatibilidade da versão do LiveKit e do provedor com essa configuração. Nenhum segredo, bucket, key ou endpoint é registrado como metadata público.

## Quem pode gravar

- Contas gratuitas não iniciam gravação real.
- VIP ativo usa sempre o perfil `economy` e seus limites.
- Administradores podem realizar teste controlado, mas continuam sujeitos ao perfil `economy`, consentimento, maioridade, sala ativa e aos mesmos limites.

Essa regra usa somente o status VIP já calculado no servidor. Ela não altera pagamentos, compra de VIP, Pix, ItaCash ou webhooks financeiros.

## Limites e resultado acima do teto

O servidor persiste o perfil, a estimativa de armazenamento e o prazo de retenção na metadata privada. Quando o LiveKit informar o resultado, `duration_seconds` e `file_size_bytes` são atualizados. A duração do Egress é convertida para segundos antes de ser salva.

Se a duração ou o tamanho final ultrapassar o teto do perfil, a gravação fica como `failed` e não recebe download assinado. O objeto privado não é apagado neste pacote; a limpeza física pertence ao futuro job de retenção. Como ainda não há cron de interrupção em tempo real, uma chamada muito longa pode gerar custo antes de ser detectada ao término. Por isso, o limite também deve ser comunicado e monitorado antes de liberar o recurso.

## Retenção e download

Cada nova gravação recebe `retention_expires_at` de 15 dias. O Meet exibe o prazo de disponibilidade, e o endpoint de download bloqueia gravações sem prazo válido ou já vencidas. Downloads válidos continuam sendo feitos somente por URL assinada curta, depois de autorização server-side; não há URL pública.

Expirar o acesso não remove o objeto do R2. Não há job, cron ou exclusão destrutiva neste pacote. Um pacote futuro deve implementar a limpeza privada, idempotente, auditável e compatível com as obrigações de retenção aplicáveis.

## Migration manual

A migration base `20260623_create_meet_room_recordings.sql` já deve estar aplicada. Para habilitar os novos campos, aplique manualmente:

- [20260623_add_meet_recording_compression_fields.sql](../supabase/migrations/20260623_add_meet_recording_compression_fields.sql)
- [verify-meet-recording-compression-fields.sql](../supabase/sql/verify-meet-recording-compression-fields.sql)

O rollback correspondente é [rollback-20260623_add_meet_recording_compression_fields.sql](../supabase/sql/rollback-20260623_add_meet-recording-compression-fields.sql). Ele remove apenas colunas e constraints SQL; nunca apaga objetos R2.

## Checklist antes do opt-in

1. Confirme a migration base e aplique manualmente a migration de compactação; execute ambos os verifies necessários.
2. Confirme que o bucket exclusivo de gravações continua privado, sem domínio nem URL pública.
3. Confirme suporte ao Room Composite Egress e valide a configuração `economy` no ambiente de teste autorizado.
4. Confirme retenção de 15 dias, bloqueio de download vencido e o plano operacional para o futuro job de limpeza.
5. Confirme autorização, VIP/admin, consentimento e aviso aos participantes.
6. Só então configure `MEET_RECORDING_EGRESS_ENABLED=true` no ambiente server-side e faça um teste controlado.

Neste repositório, a flag continua desligada: esta política não inicia Egress, não envia arquivos ao R2 e não altera `.env.local`.

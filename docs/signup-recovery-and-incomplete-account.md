# Recuperação de cadastro incompleto

Se o Auth criar a conta mas o profile falhar, uma nova tentativa pode retornar “User already registered”. A interface agora converte isso em orientação para entrar, recuperar senha ou reenviar confirmação, sem mostrar erro técnico.

Após login, `ensureProfile` verifica o profile e cria apenas o registro mínimo ausente, sem sobrescrever dados existentes. Perfis incompletos seguem para `/complete-profile`; menores pendentes seguem para `/account-pending`.

O admin não deve apagar usuários como primeiro passo. Testar conta existente, Auth sem profile, profile incompleto, menor, recuperação de senha e reenvio de confirmação com contas de teste. Intervenção manual só é necessária se a criação mínima também falhar por schema ou policy.

# Recuperação de senha e conta incompleta

## Fluxo de redefinição de senha

1. Em `/forgot-password`, a pessoa informa o e-mail e recebe a confirmação genérica: “Se este e-mail estiver cadastrado, enviaremos um link para redefinir sua senha.”
2. O Supabase envia o link usando o endereço atual do aplicativo e redireciona para `/reset-password?flow=recovery`.
3. A página `/reset-password` confirma a existência de uma sessão de recuperação antes de liberar os campos de nova senha.
4. A nova senha precisa ter pelo menos 8 caracteres e coincidir com a confirmação. Ao salvar, a página chama `supabase.auth.updateUser({ password })`.
5. Depois da confirmação, a sessão de recuperação local é encerrada e a pessoa é direcionada, por escolha, para `/login`.

O callback `/auth/callback` continua tratando login social, confirmação e os encaminhamentos de perfil normalmente. Se receber um retorno de recuperação legado, ele encaminha para `/reset-password` antes de executar qualquer lógica de perfil ou redirecionar para o feed.

## Como testar

1. Abra `/forgot-password` e verifique o campo de e-mail, o botão “Enviar link de recuperação” e o estado “Enviando link...”.
2. Solicite a recuperação com uma conta de teste. O e-mail deve direcionar para a tela “Redefinir senha”, não para o feed.
3. Na tela de redefinição, confirme as validações de campo vazio, senha curta e confirmação diferente.
4. Salve uma senha válida e confirme a mensagem de sucesso, seguida pelo link “Ir para login”.
5. Abra `/reset-password` sem uma sessão de recuperação. A tela deve mostrar “Solicite um novo link de recuperação.” e o botão para pedir outro link.

Se o link expirou ou já foi usado, solicite um novo link em `/forgot-password`; não há token visível nem erro técnico exposto na interface.

## Conta incompleta

Se o Auth criar a conta mas o perfil falhar, uma nova tentativa pode retornar “User already registered”. A interface converte esse cenário em orientação para entrar, recuperar a senha ou reenviar a confirmação, sem mostrar erro técnico.

Após o login, `ensureProfile` verifica o perfil e cria apenas o registro mínimo ausente, sem sobrescrever dados existentes. Perfis incompletos seguem para `/complete-profile`; menores pendentes seguem para `/account-pending`.

O reset de senha não altera os encaminhamentos existentes para `/complete-profile` ou `/account-pending`. Depois de entrar novamente, o fluxo normal de login continua verificando o perfil e as regras de conta pendente.

O admin não deve apagar usuários como primeiro passo. Teste conta existente, Auth sem perfil, perfil incompleto, menor, recuperação de senha e reenvio de confirmação com contas de teste. Intervenção manual só é necessária se a criação mínima também falhar por schema ou policy.

export function getAuthErrorMessage(error: { message?: string; code?: string } | null | undefined) {
  const value = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  if (value.includes('already registered') || value.includes('already exists') || value.includes('user_already_exists')) return 'Este e-mail já possui uma conta no EntreUS. Tente entrar com sua senha ou recupere sua senha.'
  if (value.includes('invalid login credentials')) return 'E-mail ou senha incorretos. Confira os dados ou recupere sua senha.'
  if (value.includes('email not confirmed')) return 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada ou solicite um novo link de confirmação.'
  if (value.includes('password should be at least') || value.includes('password')) return 'Sua senha precisa ter pelo menos 8 caracteres e combinar letras e números.'
  if (value.includes('network') || value.includes('fetch') || value.includes('connection')) return 'Não foi possível conectar agora. Verifique sua internet e tente novamente.'
  return 'Não conseguimos concluir agora. Tente novamente em instantes.'
}

export function isExistingAccountError(error: { message?: string; code?: string } | null | undefined) {
  const value = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  return value.includes('already registered') || value.includes('already exists') || value.includes('user_already_exists')
}

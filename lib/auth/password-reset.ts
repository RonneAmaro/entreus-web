export const PASSWORD_RESET_MIN_LENGTH = 8

export function getPasswordResetValidationMessage(
  password: string,
  confirmation: string,
) {
  if (!password.trim()) return 'Digite uma nova senha.'

  if (password.length < PASSWORD_RESET_MIN_LENGTH) {
    return `Sua nova senha precisa ter pelo menos ${PASSWORD_RESET_MIN_LENGTH} caracteres.`
  }

  if (password !== confirmation) return 'As senhas digitadas não são iguais.'

  return null
}

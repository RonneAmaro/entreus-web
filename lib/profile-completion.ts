export const CURRENT_TERMS_VERSION = '2026-05'
export const CURRENT_PRIVACY_VERSION = '2026-05'

export type ProfileCompletionStatus = {
  username: string | null
  birth_date: string | null
  terms_accepted_at?: string | null
  privacy_accepted_at?: string | null
  terms_version?: string | null
  privacy_version?: string | null
}

export type MinorAccessStatus = {
  is_minor: boolean | null
  parental_consent_status: string | null
}

export function sanitizeUsername(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30)
}

export function calculateAge(birthDateValue: string | null) {
  if (!birthDateValue) return null

  const birthDate = new Date(`${birthDateValue}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }

  return age
}

export function isProfileIncomplete(profile: ProfileCompletionStatus | null) {
  if (!profile?.username?.trim() || !profile.birth_date) return true

  if ('terms_accepted_at' in profile && !profile.terms_accepted_at) return true
  if ('privacy_accepted_at' in profile && !profile.privacy_accepted_at) return true

  return false
}

export function blocksMinorAccess(profile: MinorAccessStatus | null) {
  return Boolean(profile?.is_minor && profile.parental_consent_status !== 'approved')
}

export function isMissingProfileAcceptanceColumnError(error: { message?: string; code?: string } | null) {
  if (!error) return false

  const message = (error.message || '').toLowerCase()

  return (
    error.code === '42703' ||
    message.includes('terms_accepted_at') ||
    message.includes('privacy_accepted_at') ||
    message.includes('terms_version') ||
    message.includes('privacy_version')
  )
}

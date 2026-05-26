export type ProfileCompletionStatus = {
  username: string | null
  birth_date: string | null
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
  return !profile?.username?.trim() || !profile.birth_date
}

export function blocksMinorAccess(profile: MinorAccessStatus | null) {
  return Boolean(profile?.is_minor && profile.parental_consent_status !== 'approved')
}

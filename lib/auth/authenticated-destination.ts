import type { MinimalProfile } from './ensure-profile'

export type AuthenticatedDestination = '/account-pending' | '/complete-profile' | '/feed'

export function getAuthenticatedDestination(profile: MinimalProfile | null): AuthenticatedDestination {
  if (!profile) return '/complete-profile'

  if (profile.is_minor && profile.parental_consent_status !== 'approved') {
    return '/account-pending'
  }

  if (!profile.username?.trim() || !profile.birth_date) {
    return '/complete-profile'
  }

  return '/feed'
}

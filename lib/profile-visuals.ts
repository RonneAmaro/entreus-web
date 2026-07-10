import {
  getEffectiveProfileTheme,
  type ProfileTheme,
} from '@/lib/profile-themes'
import type { UserTier } from '@/lib/user-tiers'

export type ProfileVisualRole = 'standard' | 'creator' | 'founding_creator'
export type ProfileVisualStatus = UserTier | Exclude<ProfileVisualRole, 'standard'>

export type ProfileVisualInput = {
  tier?: UserTier | null
  themeKey?: string | null
  isCreator?: boolean
  isFoundingCreator?: boolean
}

export type ProfileVisuals = {
  status: ProfileVisualStatus
  label: string
  theme: ProfileTheme
  avatarClassName: string
  postClassName: string
  profileClassName: string
}

const STATUS_LABELS: Record<ProfileVisualStatus, string> = {
  elder: 'Anciao',
  vip_premium: 'VIP Premium',
  vip: 'VIP',
  founding_creator: 'Criador fundador',
  creator: 'Criador',
  standard: 'Usuario',
}

const STATUS_CLASSES: Record<ProfileVisualStatus, {
  avatar: string
  post: string
  profile: string
}> = {
  elder: {
    avatar: '!ring-amber-300/90 shadow-amber-500/25 dark:!ring-amber-600/80',
    post: '!border-amber-300/90 !ring-amber-200/80 !shadow-md shadow-amber-500/10 dark:!border-amber-500/60 dark:!ring-amber-900/80',
    profile: '!border-amber-300/90 !ring-amber-200/80 shadow-amber-500/10 dark:!border-amber-500/60 dark:!ring-amber-900/80',
  },
  vip_premium: {
    avatar: '!ring-fuchsia-300/85 shadow-fuchsia-500/20 dark:!ring-fuchsia-700/75',
    post: '!border-fuchsia-300/90 !ring-fuchsia-200/80 !shadow-md shadow-fuchsia-500/10 dark:!border-fuchsia-500/60 dark:!ring-fuchsia-900/80',
    profile: '!border-fuchsia-300/90 !ring-fuchsia-200/80 shadow-fuchsia-500/10 dark:!border-fuchsia-500/60 dark:!ring-fuchsia-900/80',
  },
  vip: {
    avatar: '!ring-sky-300/80 shadow-sky-500/20 dark:!ring-sky-700/70',
    post: '!border-sky-300/90 !ring-sky-200/80 !shadow-md shadow-sky-500/10 dark:!border-sky-500/60 dark:!ring-sky-900/80',
    profile: '!border-sky-300/90 !ring-sky-200/80 shadow-sky-500/10 dark:!border-sky-500/60 dark:!ring-sky-900/80',
  },
  founding_creator: {
    avatar: '!ring-violet-300/80 shadow-violet-500/15 dark:!ring-violet-700/70',
    post: '!border-violet-200/80 dark:!border-violet-800/70',
    profile: '!border-violet-200/80 dark:!border-violet-800/70',
  },
  creator: {
    avatar: '!ring-emerald-300/80 shadow-emerald-500/15 dark:!ring-emerald-700/70',
    post: '!border-emerald-200/80 dark:!border-emerald-800/70',
    profile: '!border-emerald-200/80 dark:!border-emerald-800/70',
  },
  standard: { avatar: '', post: '', profile: '' },
}

export function resolveProfileVisualStatus({
  tier = 'standard',
  isCreator = false,
  isFoundingCreator = false,
}: ProfileVisualInput = {}): ProfileVisualStatus {
  if (tier === 'elder') return 'elder'
  if (tier === 'vip_premium') return 'vip_premium'
  if (tier === 'vip') return 'vip'
  if (isFoundingCreator) return 'founding_creator'
  if (isCreator) return 'creator'
  return 'standard'
}

export function getProfileVisuals(input: ProfileVisualInput = {}): ProfileVisuals {
  const tier = input.tier || 'standard'
  const status = resolveProfileVisualStatus(input)
  const classes = STATUS_CLASSES[status]

  return {
    status,
    label: STATUS_LABELS[status],
    theme: getEffectiveProfileTheme(input.themeKey, tier),
    avatarClassName: classes.avatar,
    postClassName: classes.post,
    profileClassName: classes.profile,
  }
}

export function getProfileVisualSurfaceClassName(
  input: ProfileVisualInput,
  surface: 'post' | 'profile' = 'post',
) {
  const visuals = getProfileVisuals(input)
  return surface === 'profile' ? visuals.profileClassName : visuals.postClassName
}

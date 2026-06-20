'use client'

import Link from 'next/link'
import { Check, Lock, Sparkles } from 'lucide-react'
import {
  PROFILE_THEMES,
  canUseProfileTheme,
  getProfileTheme,
  getProfileThemeAccessLabel,
  type ProfileThemeKey,
} from '@/lib/profile-themes'
import { getUserTierLabel, type UserTier } from '@/lib/user-tiers'

type ProfileThemeSelectorProps = {
  tier: UserTier
  selectedTheme: ProfileThemeKey
  savedTheme: ProfileThemeKey
  saving?: boolean
  onChange: (theme: ProfileThemeKey) => void
  onSave: () => void
}

function getLockedLabel(minimumTier: UserTier) {
  if (minimumTier === 'elder') return 'Exclusivo Anciao'
  if (minimumTier === 'vip_premium') return 'Disponivel para VIP Premium'
  if (minimumTier === 'vip') return 'Disponivel para VIP'
  return ''
}

export default function ProfileThemeSelector({
  tier,
  selectedTheme,
  savedTheme,
  saving = false,
  onChange,
  onSave,
}: ProfileThemeSelectorProps) {
  const selectedThemeConfig = getProfileTheme(selectedTheme)
  const hasChanges = selectedTheme !== savedTheme

  return (
    <section className="mt-6 border-t border-zinc-200/70 pt-5 dark:border-zinc-800/70">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-black uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            <Sparkles className="h-3.5 w-3.5" />
            Tema do perfil
          </div>

          <h3 className="mt-3 text-lg font-black text-zinc-950 dark:text-white">
            Personalizacao visual
          </h3>

          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Escolha um template visual predefinido para destacar seu perfil sem perder legibilidade.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          Nivel atual: {getUserTierLabel(tier)}
        </div>
      </div>

      {tier === 'standard' && (
        <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100">
          <p className="font-bold">Personalizacao de perfil e uma vantagem VIP.</p>
          <Link
            href="/vip-plus"
            className="mt-2 inline-flex h-9 items-center justify-center rounded-full bg-sky-600 px-4 text-xs font-black text-white transition hover:bg-sky-700"
          >
            Conhecer VIP Plus
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PROFILE_THEMES.map((theme) => {
          const allowed = canUseProfileTheme(tier, theme.key)
          const selected = selectedTheme === theme.key
          const saved = savedTheme === theme.key

          return (
            <button
              key={theme.key}
              type="button"
              onClick={() => allowed && onChange(theme.key)}
              disabled={!allowed || saving}
              className={`min-h-36 rounded-2xl border p-3 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed ${
                selected
                  ? 'border-zinc-950 bg-white ring-2 ring-zinc-950/10 dark:border-white dark:bg-zinc-950 dark:ring-white/10'
                  : 'border-zinc-200 bg-white/80 hover:border-zinc-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:border-zinc-700'
              } ${!allowed ? 'opacity-70' : ''}`}
            >
              <div
                className={`relative mb-3 h-16 overflow-hidden rounded-xl bg-gradient-to-br ${theme.previewClassName}`}
              >
                <span className={`absolute bottom-3 left-3 h-3 w-16 rounded-full ${theme.accentClassName}`} />
                <span className="absolute right-3 top-3 h-8 w-8 rounded-full border-2 border-white/80 bg-white/70 shadow-sm dark:border-black/60 dark:bg-black/40" />
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-zinc-950 dark:text-white">
                    {theme.name}
                  </p>

                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {theme.description}
                  </p>
                </div>

                {selected ? (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-white dark:bg-white dark:text-black">
                    <Check className="h-4 w-4" />
                  </span>
                ) : !allowed ? (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-zinc-400 dark:border-zinc-800">
                    <Lock className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-bold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                  {allowed ? getProfileThemeAccessLabel(theme) : getLockedLabel(theme.minimumTier)}
                </span>

                {saved && (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                    Atual
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-zinc-950 dark:text-white">
              Previa selecionada: {selectedThemeConfig.name}
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              O perfil publico usa fallback para o padrao se o beneficio expirar.
            </p>
          </div>

          <button
            type="button"
            onClick={onSave}
            disabled={!hasChanges || saving}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-black text-white transition hover:scale-[1.02] hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {saving ? 'Salvando...' : 'Salvar tema'}
          </button>
        </div>
      </div>
    </section>
  )
}

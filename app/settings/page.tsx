'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  LogOut,
  Palette,
  Save,
  Shield,
  User,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  getSafeProfileContentMode,
  PROFILE_CONTENT_MODE_ADULT_NOTICE,
  PROFILE_CONTENT_MODE_NO_AUTO_ADULT_NOTICE,
  PROFILE_CONTENT_MODE_OPTIONS,
  profileContentModeRequiresConfirmation,
  type ProfileContentMode,
} from '@/lib/profile-content-mode'

type Profile = {
  username: string | null
  display_name: string | null
  avatar_url: string | null
  profile_content_mode?: string | null
}

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileContentMode, setProfileContentMode] = useState<ProfileContentMode>('general')
  const [savedProfileContentMode, setSavedProfileContentMode] = useState<ProfileContentMode>('general')
  const [profileContentModeConfirmed, setProfileContentModeConfirmed] = useState(false)
  const [savingProfileContentMode, setSavingProfileContentMode] = useState(false)
  const [message, setMessage] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')

  useEffect(() => {
    let active = true

    async function loadSettings() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return

      if (!user) {
        router.replace('/login')
        return
      }

      setEmail(user.email || '')

      const profileResult = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, profile_content_mode')
        .eq('id', user.id)
        .maybeSingle()

      if (!active) return

      let data = profileResult.data as Profile | null
      if (profileResult.error && /profile_content_mode/i.test(profileResult.error.message)) {
        const fallbackResult = await supabase
          .from('profiles')
          .select('username, display_name, avatar_url')
          .eq('id', user.id)
          .maybeSingle()

        if (!active) return
        data = (fallbackResult.data as Profile | null) || null
      }

      const nextMode = getSafeProfileContentMode(data?.profile_content_mode)
      setProfile(data || null)
      setProfileContentMode(nextMode)
      setSavedProfileContentMode(nextMode)
      setProfileContentModeConfirmed(false)
      setLoading(false)
    }

    loadSettings()

    return () => {
      active = false
    }
  }, [router])

  const displayName = useMemo(() => {
    return profile?.display_name || profile?.username || email.split('@')[0] || 'Minha conta'
  }, [email, profile])

  const profileContentModeDirty = profileContentMode !== savedProfileContentMode
  const profileContentModeNeedsConfirmation = profileContentModeRequiresConfirmation(profileContentMode)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  async function handleSaveProfileContentMode() {
    if (profileContentModeNeedsConfirmation && !profileContentModeConfirmed) {
      setMessage('Confirme que voce entendeu os limites publicos antes de salvar este modo.')
      return
    }

    setSavingProfileContentMode(true)
    setMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setSavingProfileContentMode(false)
      setMessage('Entre na sua conta para alterar esta configuracao.')
      return
    }

    const response = await fetch('/api/profile/content-mode', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({ profileContentMode }),
    })
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean
      error?: string
      profileContentMode?: string
    } | null

    setSavingProfileContentMode(false)

    if (!response.ok || !payload?.ok) {
      setMessage(payload?.error || 'Nao foi possivel salvar o modo do perfil.')
      return
    }

    const savedMode = getSafeProfileContentMode(payload.profileContentMode)
    setProfileContentMode(savedMode)
    setSavedProfileContentMode(savedMode)
    setProfileContentModeConfirmed(false)
    setMessage('Tipo de conteudo do perfil atualizado.')
  }

  function handleDeletionRequest() {
    if (deleteConfirm.trim().toUpperCase() !== 'EXCLUIR') {
      setMessage('Digite EXCLUIR para confirmar que voce entendeu o aviso.')
      return
    }

    setMessage('A exclusao definitiva da conta sera implementada com seguranca em breve. Por enquanto, fale com o suporte para orientar a solicitacao.')
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <p className="text-sm font-bold text-zinc-400">Carregando configuracoes...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-5xl">
        <header className="rounded-[2rem] border border-blue-400/15 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.24),transparent_38%),linear-gradient(135deg,rgba(9,9,11,0.96),rgba(0,0,0,0.98))] p-5 shadow-2xl shadow-blue-950/20 ring-1 ring-white/10 sm:p-7">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-zinc-100 transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao feed
          </Link>

          <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-300">
                EntreUS
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
                Configuracoes da conta
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300 sm:text-base">
                Gerencie informacoes basicas, privacidade, aparencia e opcoes sensiveis da sua conta.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-3">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={displayName}
                  className="h-12 w-12 rounded-full object-cover ring-1 ring-blue-300/30"
                />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/20 text-lg font-black text-blue-100 ring-1 ring-blue-300/25">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{displayName}</p>
                <p className="truncate text-xs text-zinc-400">{email}</p>
              </div>
            </div>
          </div>
        </header>

        {message && (
          <p className="mt-5 flex items-start gap-2 rounded-2xl border border-blue-300/20 bg-blue-500/10 px-4 py-3 text-sm font-semibold leading-6 text-blue-100">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            {message}
          </p>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <article className="rounded-[1.75rem] border border-white/10 bg-zinc-950 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200">
                <User className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-black">Conta</h2>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              <div>
                <dt className="text-zinc-500">Nome</dt>
                <dd className="mt-1 font-bold text-zinc-100">{displayName}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">E-mail</dt>
                <dd className="mt-1 break-all font-bold text-zinc-100">{email}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Username</dt>
                <dd className="mt-1 font-bold text-zinc-100">
                  {profile?.username ? `@${profile.username}` : 'Nao definido'}
                </dd>
              </div>
            </dl>
            <Link
              href="/profile"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-black text-black transition hover:bg-blue-50"
            >
              Editar perfil
            </Link>
          </article>

          <article className="rounded-[1.75rem] border border-white/10 bg-zinc-950 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200">
                <Shield className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-black">Privacidade e seguranca</h2>
            </div>
            <div className="mt-5 grid gap-2">
              {[
                { href: '/privacy', label: 'Politica de Privacidade' },
                { href: '/terms', label: 'Termos de Uso' },
                { href: '/safety', label: 'Seguranca e Denuncias' },
                { href: '/blocked', label: 'Usuarios bloqueados' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-zinc-200 transition hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </article>

          <article className="rounded-[1.75rem] border border-white/10 bg-zinc-950 p-5 shadow-xl shadow-black/20 lg:col-span-2">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200">
                    <Shield className="h-5 w-5" />
                  </span>
                  <h2 className="text-xl font-black">Tipo de conteudo do perfil</h2>
                </div>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-400">
                  Escolha como voce pretende usar seu perfil. Essa opcao ajuda o EntreUS a organizar sua experiencia, mas cada publicacao continua tendo sua propria classificacao.
                </p>
                <p className="mt-2 text-sm font-black text-blue-100">
                  Uma unica identidade. Conteudos organizados com limites claros.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveProfileContentMode}
                disabled={savingProfileContentMode || !profileContentModeDirty}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Save className="h-4 w-4" />
                {savingProfileContentMode ? 'Salvando...' : 'Salvar modo'}
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {PROFILE_CONTENT_MODE_OPTIONS.map((option) => {
                const selected = profileContentMode === option.value

                return (
                  <label
                    key={option.value}
                    className={`flex min-h-40 cursor-pointer flex-col rounded-2xl border p-4 transition ${
                      selected
                        ? 'border-blue-200 bg-blue-500/15 text-white ring-1 ring-blue-200/30'
                        : 'border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="profile_content_mode"
                      value={option.value}
                      checked={selected}
                      onChange={() => {
                        setProfileContentMode(option.value)
                        setProfileContentModeConfirmed(false)
                        setMessage('')
                      }}
                      className="sr-only"
                    />
                    <span className="text-sm font-black">{option.label}</span>
                    <span className="mt-3 text-sm leading-6 text-zinc-400">{option.description}</span>
                  </label>
                )
              })}
            </div>

            {profileContentModeNeedsConfirmation && (
              <div className="mt-5 rounded-2xl border border-yellow-200/25 bg-yellow-500/10 p-4 text-sm leading-6 text-yellow-50">
                <p>{PROFILE_CONTENT_MODE_ADULT_NOTICE}</p>
                <p className="mt-2">{PROFILE_CONTENT_MODE_NO_AUTO_ADULT_NOTICE}</p>
                <label className="mt-4 flex cursor-pointer items-start gap-3 font-bold">
                  <input
                    type="checkbox"
                    checked={profileContentModeConfirmed}
                    onChange={(event) => setProfileContentModeConfirmed(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-blue-500"
                  />
                  <span>Entendi que minha identidade publica deve continuar segura e que cada post precisa ser classificado individualmente.</span>
                </label>
              </div>
            )}
          </article>

          <article className="rounded-[1.75rem] border border-white/10 bg-zinc-950 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200">
                <Bell className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-black">Notificacoes</h2>
            </div>
            <p className="mt-5 text-sm leading-6 text-zinc-400">
              Preferencias avancadas de notificacoes chegam em um pacote futuro. Por enquanto, acompanhe alertas pela pagina de notificacoes.
            </p>
            <Link
              href="/notifications"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-blue-300/25 bg-blue-500/10 px-5 text-sm font-black text-blue-100 transition hover:bg-blue-500/20"
            >
              Abrir notificacoes
            </Link>
          </article>

          <article className="rounded-[1.75rem] border border-white/10 bg-zinc-950 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200">
                <Palette className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-black">Aparencia</h2>
            </div>
            <p className="mt-5 text-sm leading-6 text-zinc-400">
              O tema claro/escuro continua disponivel no menu Mais. Esta area vai concentrar preferencias visuais em uma proxima evolucao.
            </p>
          </article>
        </div>

        <article className="mt-5 rounded-[1.75rem] border border-red-400/20 bg-red-950/20 p-5 shadow-xl shadow-black/20">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/15 text-red-200">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-black">Zona de risco</h2>
              <p className="mt-1 text-sm text-red-100/75">
                Acoes sensiveis exigem confirmacao e fluxo seguro.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <label className="block text-sm font-bold text-red-50">
                Solicitar exclusao da conta
              </label>
              <p className="mt-2 text-sm leading-6 text-red-100/75">
                Como sua conta pode ter posts, mensagens, compras, presentes, verificacoes e moderacao, a exclusao definitiva nao sera feita diretamente neste pacote. Digite EXCLUIR para registrar a solicitacao visual.
              </p>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(event) => setDeleteConfirm(event.target.value)}
                placeholder="Digite EXCLUIR"
                className="mt-4 w-full rounded-2xl border border-red-300/20 bg-black px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-red-100/35 focus:border-red-200"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <button
                type="button"
                onClick={handleDeletionRequest}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-red-300/30 bg-red-500/10 px-5 text-sm font-black text-red-100 transition hover:bg-red-500/20"
              >
                Solicitar exclusao
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-black text-black transition hover:bg-blue-50"
              >
                <LogOut className="h-4 w-4" />
                Sair da conta
              </button>
            </div>
          </div>
        </article>
      </section>
    </main>
  )
}

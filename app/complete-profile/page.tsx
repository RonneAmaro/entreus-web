'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AtSign, CalendarDays, CheckCircle2, Mail, ShieldCheck, UserRound, UsersRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  blocksMinorAccess,
  calculateAge,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  isMissingProfileAcceptanceColumnError,
  isProfileIncomplete,
  sanitizeUsername,
} from '@/lib/profile-completion'

type Profile = {
  id: string
  username: string | null
  display_name: string | null
  birth_date: string | null
  is_minor: boolean | null
  parental_consent_status: string | null
  wants_18_plus: boolean | null
  age_verification_status: string | null
  terms_accepted_at?: string | null
  privacy_accepted_at?: string | null
  terms_version?: string | null
  privacy_version?: string | null
}

type ParentalConsentRequest = {
  guardian_email: string | null
  guardian_name?: string | null
  relationship?: string | null
}

export default function CompleteProfilePage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [guardianName, setGuardianName] = useState('')
  const [guardianEmail, setGuardianEmail] = useState('')
  const [relationship, setRelationship] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return

      if (!user) {
        router.replace('/login')
        return
      }

      const profileResult = await supabase
        .from('profiles')
        .select(
          'id, username, display_name, birth_date, is_minor, parental_consent_status, wants_18_plus, age_verification_status, terms_accepted_at, privacy_accepted_at, terms_version, privacy_version',
        )
        .eq('id', user.id)
        .maybeSingle()
      let data = profileResult.data as Profile | null
      let error = profileResult.error

      if (isMissingProfileAcceptanceColumnError(error)) {
        const fallback = await supabase
          .from('profiles')
          .select(
            'id, username, display_name, birth_date, is_minor, parental_consent_status, wants_18_plus, age_verification_status',
          )
          .eq('id', user.id)
          .maybeSingle()

        data = fallback.data as Profile | null
        error = fallback.error
      }

      if (!active) return

      if (error) {
        setMessage('Nao foi possivel carregar seu perfil. Tente novamente.')
        setLoading(false)
        return
      }

      const loadedProfile = data as Profile | null

      if (loadedProfile && !isProfileIncomplete(loadedProfile) && !blocksMinorAccess(loadedProfile)) {
        router.replace('/feed')
        return
      }

      const metadata = user.user_metadata || {}
      const metadataName =
        typeof metadata.full_name === 'string'
          ? metadata.full_name
          : typeof metadata.name === 'string'
            ? metadata.name
            : ''
      const fallbackName = metadataName.trim() || user.email?.split('@')[0] || ''

      setUserId(user.id)
      setProfile(loadedProfile)
      setDisplayName(loadedProfile?.display_name || fallbackName)
      setUsername(loadedProfile?.username || sanitizeUsername(fallbackName))
      setBirthDate(loadedProfile?.birth_date || '')
      setAcceptedTerms(Boolean(loadedProfile?.terms_accepted_at && loadedProfile.privacy_accepted_at))

      const consentResult = await supabase
        .from('parental_consent_requests')
        .select('guardian_email, guardian_name, relationship')
        .eq('child_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      let consentData = consentResult.data as ParentalConsentRequest | null

      if (isMissingParentalColumnError(consentResult.error)) {
        const fallbackConsent = await supabase
          .from('parental_consent_requests')
          .select('guardian_email')
          .eq('child_user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        consentData = fallbackConsent.data as ParentalConsentRequest | null
      }

      if (consentData) {
        setGuardianName(consentData.guardian_name || '')
        setGuardianEmail(consentData.guardian_email || '')
        setRelationship(consentData.relationship || '')
      }

      setLoading(false)
    }

    loadProfile()

    return () => {
      active = false
    }
  }, [router])

  const normalizedUsername = useMemo(() => sanitizeUsername(username), [username])
  const age = useMemo(() => calculateAge(birthDate), [birthDate])
  const isMinor = age !== null && age < 18
  const hasRegisteredBirthDate = Boolean(profile?.birth_date)

  function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  }

  function isMissingParentalColumnError(error: { message?: string; code?: string } | null) {
    if (!error) return false

    const message = (error.message || '').toLowerCase()

    return (
      error.code === '42703' ||
      message.includes('guardian_name') ||
      message.includes('relationship')
    )
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!userId) return

    setMessage('')

    if (!normalizedUsername || normalizedUsername.length < 3) {
      setMessage('Escolha um username com pelo menos 3 caracteres.')
      return
    }

    if (!birthDate || age === null || age < 0) {
      setMessage('Informe uma data de nascimento valida.')
      return
    }

    if (!acceptedTerms) {
      setMessage('Voce precisa aceitar os Termos de Uso e a Politica de Privacidade para continuar.')
      return
    }

    const normalizedGuardianEmail = guardianEmail.trim().toLowerCase()

    if (isMinor) {
      if (guardianName.trim().length < 3) {
        setMessage('Informe o nome do responsavel.')
        return
      }

      if (!isValidEmail(normalizedGuardianEmail)) {
        setMessage('Informe um e-mail valido do responsavel.')
        return
      }

      if (!relationship) {
        setMessage('Informe a relacao com o responsavel.')
        return
      }
    }

    setSaving(true)

    const { data: existingUsername, error: usernameCheckError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', normalizedUsername)
      .neq('id', userId)
      .maybeSingle()

    if (usernameCheckError) {
      setMessage('Nao foi possivel verificar o username. Tente novamente.')
      setSaving(false)
      return
    }

    if (existingUsername) {
      setMessage('Esse username ja esta em uso.')
      setSaving(false)
      return
    }

    const nextParentalConsentStatus = isMinor
      ? profile?.parental_consent_status === 'approved'
        ? 'approved'
        : 'pending'
      : 'not_required'
    const nextWants18Plus = isMinor ? false : profile?.wants_18_plus || false
    const nextAgeVerificationStatus = profile?.age_verification_status || 'not_started'

    const acceptedAt = new Date().toISOString()
    const baseProfilePayload = {
      id: userId,
      username: normalizedUsername,
      display_name: displayName.trim() || normalizedUsername,
      birth_date: birthDate,
      is_minor: isMinor,
      parental_consent_status: nextParentalConsentStatus,
      wants_18_plus: nextWants18Plus,
      show_sensitive_content: !isMinor && nextWants18Plus && nextAgeVerificationStatus === 'approved',
      age_verification_status: nextAgeVerificationStatus,
      updated_at: acceptedAt,
    }
    const legalProfilePayload = {
      ...baseProfilePayload,
      terms_accepted_at: profile?.terms_accepted_at || acceptedAt,
      privacy_accepted_at: profile?.privacy_accepted_at || acceptedAt,
      terms_version: profile?.terms_version || CURRENT_TERMS_VERSION,
      privacy_version: profile?.privacy_version || CURRENT_PRIVACY_VERSION,
    }
    let { error } = await supabase.from('profiles').upsert(legalProfilePayload)

    if (isMissingProfileAcceptanceColumnError(error)) {
      const fallback = await supabase.from('profiles').upsert(baseProfilePayload)
      error = fallback.error
    }

    if (error) {
      setMessage('Nao foi possivel concluir agora. Tente novamente.')
      setSaving(false)
      return
    }

    if (isMinor && nextParentalConsentStatus !== 'approved') {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        setMessage('Entre novamente para solicitar autorizacao do responsavel.')
        setSaving(false)
        return
      }

      const response = await fetch('/api/parental-consent/send-email', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          guardian_email: normalizedGuardianEmail,
          guardian_name: guardianName.trim(),
          relationship,
        }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        setMessage('Nao foi possivel enviar o pedido ao responsavel. Tente novamente.')
        setSaving(false)
        return
      }
    }

    router.replace(isMinor && nextParentalConsentStatus !== 'approved' ? '/account-pending' : '/feed')
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="w-full max-w-md rounded-3xl border border-blue-500/20 bg-zinc-950 p-6 text-center shadow-2xl shadow-blue-950/30">
          <ShieldCheck className="mx-auto h-8 w-8 text-blue-300" />
          <h1 className="mt-4 text-xl font-black">Carregando perfil</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Estamos preparando suas informacoes iniciais.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white sm:px-6 lg:px-8">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-200">
            <CheckCircle2 className="h-4 w-4" />
            Perfil obrigatorio
          </div>

          <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
            Complete seu perfil para continuar
          </h1>

          <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300">
            Precisamos dessas informacoes para manter a comunidade segura,
            aplicar as regras de idade da EntreUS e deixar seu username publico correto.
          </p>

          <div className="mt-8 rounded-3xl border border-blue-500/20 bg-blue-950/20 p-5 text-sm leading-6 text-blue-100">
            Menores de 18 anos continuam protegidos pelo fluxo de autorizacao
            do responsavel. Conteudo 18+ permanece bloqueado para menores.
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl shadow-blue-950/20 sm:p-6"
        >
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                <UserRound className="h-4 w-4 text-blue-300" />
                Nome de exibicao
              </span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={80}
                className="w-full rounded-2xl border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition focus:border-blue-400"
                placeholder="Seu nome na EntreUS"
              />
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                <AtSign className="h-4 w-4 text-blue-300" />
                Username
              </span>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                onBlur={() => setUsername(normalizedUsername)}
                maxLength={30}
                className="w-full rounded-2xl border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition focus:border-blue-400"
                placeholder="seu_username"
                required
              />
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Use letras minusculas, numeros e underline. Seu link publico sera /u/{normalizedUsername || 'username'}.
              </p>
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                <CalendarDays className="h-4 w-4 text-blue-300" />
                Data de nascimento
              </span>
              <input
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                disabled={hasRegisteredBirthDate}
                className="w-full rounded-2xl border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-70"
                required
              />
              {hasRegisteredBirthDate && (
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  A data ja registrada nao pode ser alterada por aqui.
                </p>
              )}
              {birthDate && isMinor && (
                <p className="mt-2 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs leading-5 text-yellow-100">
                  Contas de menores precisam de autorizacao do responsavel para acessar recursos gerais.
                </p>
              )}
            </label>

            {isMinor && (
              <div className="rounded-3xl border border-blue-400/20 bg-blue-500/10 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200">
                    <UsersRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white">Autorizacao do responsavel</h2>
                    <p className="mt-2 text-sm leading-6 text-blue-100/85">
                      Como voce e menor de idade, precisamos enviar um pedido de autorizacao para seu responsavel. Com a autorizacao, voce podera acessar os recursos normais da EntreUS. Conteudos 18+ continuam bloqueados para menores.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                      <UserRound className="h-4 w-4 text-blue-300" />
                      Nome do responsavel
                    </span>
                    <input
                      type="text"
                      value={guardianName}
                      onChange={(event) => setGuardianName(event.target.value)}
                      maxLength={120}
                      className="w-full rounded-2xl border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition focus:border-blue-400"
                      placeholder="Nome completo do responsavel"
                      required={isMinor}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                      <Mail className="h-4 w-4 text-blue-300" />
                      E-mail do responsavel
                    </span>
                    <input
                      type="email"
                      value={guardianEmail}
                      onChange={(event) => setGuardianEmail(event.target.value)}
                      className="w-full rounded-2xl border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition focus:border-blue-400"
                      placeholder="responsavel@email.com"
                      required={isMinor}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                      <ShieldCheck className="h-4 w-4 text-blue-300" />
                      Relacao com o menor
                    </span>
                    <select
                      value={relationship}
                      onChange={(event) => setRelationship(event.target.value)}
                      className="w-full rounded-2xl border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition focus:border-blue-400"
                      required={isMinor}
                    >
                      <option value="">Selecione</option>
                      <option value="mae">Mae</option>
                      <option value="pai">Pai</option>
                      <option value="responsavel_legal">Responsavel legal</option>
                      <option value="outro">Outro</option>
                    </select>
                  </label>
                </div>
              </div>
            )}

            <label className="flex gap-3 rounded-2xl border border-zinc-800 bg-black p-4 text-sm leading-6 text-zinc-300">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-950 text-blue-500 accent-blue-500"
              />
              <span>
                Li e aceito os{' '}
                <Link href="/terms" className="font-semibold text-blue-300 underline-offset-4 hover:underline">
                  Termos de Uso
                </Link>{' '}
                e a{' '}
                <Link href="/privacy" className="font-semibold text-blue-300 underline-offset-4 hover:underline">
                  Politica de Privacidade
                </Link>{' '}
                da EntreUS.
              </span>
            </label>
          </div>

          {message && (
            <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-blue-500 px-5 text-sm font-black text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Continuar para a EntreUS'}
          </button>
        </form>
      </section>
    </main>
  )
}

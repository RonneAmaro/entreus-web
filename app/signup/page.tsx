'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import GoogleLogo from '../components/GoogleLogo'
import { signInWithSocialProvider, supabase } from '@/lib/supabase'
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  isMissingProfileAcceptanceColumnError,
} from '@/lib/profile-completion'
import { getAuthErrorMessage, isExistingAccountError } from '@/lib/auth/auth-error-messages'
import { ensureProfile } from '@/lib/auth/ensure-profile'
import { getSafeRedirectParam } from '@/lib/auth/safe-redirect'
import { useLanguage } from '../components/LanguageProvider'
import { countryOptions, suggestedLocaleForCountry } from '@/lib/i18n/countries'
import type { Locale } from '@/lib/i18n'

function validatePassword(password: string) {
  if (password.length < 8) {
    return 'auth.signup.passwordLength'
  }

  if (!/[A-Za-zÀ-ÿ]/.test(password)) {
    return 'auth.signup.passwordLetter'
  }

  if (!/\d/.test(password)) {
    return 'auth.signup.passwordNumber'
  }

  return ''
}

function calculateAge(birthDateValue: string) {
  if (!birthDateValue) return 0

  const birthDate = new Date(`${birthDateValue}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }

  return age
}

export default function SignupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { language, languages, setLanguage, t } = useLanguage()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState(false)
  const [existingAccount, setExistingAccount] = useState(false)
  const [countryCode, setCountryCode] = useState('')
  const [checkingSession, setCheckingSession] = useState(true)
  const countries = countryOptions(language)
  const safeReturnTo = useMemo(() => getSafeRedirectParam(searchParams, '/feed'), [searchParams])

  useEffect(() => {
    let active = true

    async function checkSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return

      if (!user) {
        setCheckingSession(false)
        return
      }

      const repaired = await ensureProfile(supabase as never, user.id)
      if (!active) return

      if (!repaired.profile) {
        router.replace('/complete-profile')
        return
      }

      if (repaired.profile.is_minor && repaired.profile.parental_consent_status !== 'approved') {
        router.replace('/account-pending')
        return
      }

      if (!repaired.profile.username || !repaired.profile.birth_date) {
        router.replace('/complete-profile')
        return
      }

      router.replace(safeReturnTo)
    }

    void checkSession()

    return () => {
      active = false
    }
  }, [router, safeReturnTo])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (loading || socialLoading) return
    setMessage('')
    setExistingAccount(false)

    const passwordError = validatePassword(password)

    if (passwordError) {
      setMessage(t(passwordError as never))
      return
    }

    if (password !== confirmPassword) {
      setMessage(t('auth.signup.passwordMismatch'))
      return
    }

    if (!acceptedTerms) {
      setMessage(t('auth.signup.acceptTerms'))
      return
    }

    if (!birthDate) {
      setMessage(t('auth.signup.birthDateRequired'))
      return
    }

    const age = calculateAge(birthDate)
    const isMinor = age < 18
    const acceptedAt = new Date().toISOString()

    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          birth_date: birthDate,
          is_minor: isMinor,
          parental_consent_status: isMinor ? 'pending' : 'not_required',
          wants_18_plus: false,
          age_verification_status: 'not_started',
          accepted_terms: true,
          terms_accepted_at: acceptedAt,
          privacy_accepted_at: acceptedAt,
          terms_version: CURRENT_TERMS_VERSION,
          privacy_version: CURRENT_PRIVACY_VERSION,
          interface_locale: language,
          country_code: countryCode || null,
        },
      },
    })

    if (!error && data.user) {
      const profilePayload = {
        id: data.user.id,
        birth_date: birthDate,
        is_minor: isMinor,
        parental_consent_status: isMinor ? 'pending' : 'not_required',
        wants_18_plus: false,
        show_sensitive_content: false,
        age_verification_status: 'not_started',
        terms_accepted_at: acceptedAt,
        privacy_accepted_at: acceptedAt,
        terms_version: CURRENT_TERMS_VERSION,
        privacy_version: CURRENT_PRIVACY_VERSION,
        interface_locale: language,
        country_code: countryCode || null,
        updated_at: acceptedAt,
      }
      let { error: profileError } = await supabase.from('profiles').upsert(profilePayload)

      if (isMissingProfileAcceptanceColumnError(profileError)) {
        const fallback = await supabase.from('profiles').upsert({
          id: data.user.id,
          birth_date: birthDate,
          is_minor: isMinor,
          parental_consent_status: isMinor ? 'pending' : 'not_required',
          wants_18_plus: false,
          show_sensitive_content: false,
          age_verification_status: 'not_started',
          updated_at: acceptedAt,
        })
        profileError = fallback.error
      }
      if (profileError) {
        setLoading(false)
        setMessage(t('auth.signup.profilePending'))
        return
      }
    }

    setLoading(false)

    if (error) {
      setExistingAccount(isExistingAccountError(error))
      setMessage(getAuthErrorMessage(error))
      return
    }

    if (isMinor) {
      setMessage(t('auth.signup.minorSuccess'))
      router.push('/account-pending')
      return
    }

    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setBirthDate('')
    setAcceptedTerms(false)
    setMessage(t('auth.signup.success'))
  }

  async function handleGoogleSignup() {
    if (loading || socialLoading) return
    setMessage('')

    if (!acceptedTerms) {
      setMessage(t('auth.signup.acceptTermsGoogle'))
      return
    }

    if (!birthDate) {
      setMessage(t('auth.signup.birthDateGoogle'))
      return
    }

    const age = calculateAge(birthDate)
    const isMinor = age < 18
    const acceptedAt = new Date().toISOString()

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        'entreus_oauth_signup_profile',
        JSON.stringify({
          birth_date: birthDate,
          accepted_terms: true,
          terms_accepted_at: acceptedAt,
          privacy_accepted_at: acceptedAt,
          terms_version: CURRENT_TERMS_VERSION,
          privacy_version: CURRENT_PRIVACY_VERSION,
          interface_locale: language,
          country_code: countryCode || null,
          is_minor: isMinor,
          parental_consent_status: isMinor ? 'pending' : 'not_required',
          wants_18_plus: false,
          age_verification_status: 'not_started',
        }),
      )
    }

    setSocialLoading(true)

    const { error } = await signInWithSocialProvider('google')

    if (error) {
      setMessage(t('auth.signup.googleError'))
      setSocialLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 py-10 text-white">
        <p role="status" aria-live="polite">{t('auth.login.checkingSession')}</p>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 py-10 text-white">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl sm:p-8">
        <h1 className="mb-2 text-center text-3xl font-bold">{t('auth.signup.title')}</h1>

        <p className="mb-6 text-center text-zinc-400">
          {t('auth.signup.subtitle')}
        </p>

        <div className="mb-5 space-y-3">
          <button
            type="button"
            onClick={handleGoogleSignup}
            disabled={loading || socialLoading}
            aria-label={t('auth.login.google')}
            className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-zinc-700 bg-white px-4 py-3 font-semibold text-zinc-950 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white">
              <GoogleLogo />
            </span>
            {socialLoading ? t('auth.login.googleLoading') : t('auth.login.google')}
          </button>

          <button
            type="button"
            disabled
            className="flex w-full cursor-not-allowed items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm font-semibold text-zinc-600"
            title={t('auth.facebookPendingTitle')}
          >
            {t('auth.facebookSoon')}
          </button>

          <div className="flex items-center gap-3 py-1 text-xs font-semibold uppercase text-zinc-500">
            <span className="h-px flex-1 bg-zinc-800" />
            <span>{t('auth.emailDivider')}</span>
            <span className="h-px flex-1 bg-zinc-800" />
          </div>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm text-zinc-300">
              {t('auth.email')}
            </label>

            <input
              type="email"
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none transition focus:border-zinc-500"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-300">
              {t('auth.password')}
            </label>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={t('auth.passwordCreate')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 pr-12 outline-none transition focus:border-zinc-500"
                autoComplete="new-password"
                required
              />

              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>

            <p className="mt-2 text-xs text-zinc-500">
              {t('auth.signup.passwordHint')}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-300">
              {t('auth.passwordConfirm')}
            </label>

            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder={t('auth.passwordConfirmPlaceholder')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 pr-12 outline-none transition focus:border-zinc-500"
                autoComplete="new-password"
                required
              />

              <button
                type="button"
                onClick={() => setShowConfirmPassword((current) => !current)}
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
                aria-label={
                  showConfirmPassword ? t('auth.hidePassword') : t('auth.showPassword')
                }
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-zinc-300">
              {t('country.label')}
              <select
                value={countryCode}
                onChange={(event) => {
                  const code = event.target.value
                  setCountryCode(code)
                  const suggested = suggestedLocaleForCountry(code)
                  if (suggested) {
                    void setLanguage(suggested)
                  }
                }}
                className="mt-2 min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 outline-none focus:border-zinc-500"
                required
              >
                <option value="">{t('country.placeholder')}</option>
                {countries.map((country) => <option key={country.code} value={country.code} suppressHydrationWarning>{country.label}</option>)}
              </select>
            </label>
            <label className="text-sm text-zinc-300">
              {t('language.label')}
              <select
                value={language}
                onChange={(event) => {
                  const locale = event.target.value as Locale
                  void setLanguage(locale)
                }}
                className="mt-2 min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 outline-none focus:border-zinc-500"
              >
                {languages.map((option) => <option key={option.code} value={option.code}>{option.nativeName}</option>)}
              </select>
            </label>
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-300">
              {t('auth.birthDate')}
            </label>

            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none transition focus:border-zinc-500"
              autoComplete="bday"
              required
            />

            {birthDate && calculateAge(birthDate) < 18 && (
              <p className="mt-2 rounded-xl border border-yellow-800 bg-yellow-950/30 px-3 py-2 text-xs leading-5 text-yellow-200">
                {t('auth.signup.minorNotice')}
              </p>
            )}
          </div>

          <label className="flex gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm leading-6 text-zinc-300">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-950 text-blue-500 accent-blue-500"
            />

            <span>
              {t('auth.termsPrefix')}{' '}
              <Link href="/terms" className="font-semibold text-blue-300 underline-offset-4 hover:underline">
                {t('auth.terms')}
              </Link>{' '}
              {t('auth.privacyConnector')}{' '}
              <Link href="/privacy" className="font-semibold text-blue-300 underline-offset-4 hover:underline">
                {t('auth.privacy')}
              </Link>{' '}
              {t('auth.termsSuffix')}
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-white py-3 font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? t('auth.signup.submitting') : t('auth.signup.submit')}
          </button>
        </form>

          {message && (
          <p
            role="alert"
            aria-live="polite"
            className={`mt-4 rounded-xl border px-4 py-3 text-center text-sm ${
              message === t('auth.signup.success') || message === t('auth.signup.minorSuccess') || message === t('auth.signup.resendConfirmationSuccess')
                ? 'border-green-800 bg-green-950/40 text-green-300'
                : 'border-red-800 bg-red-950/40 text-red-300'
            }`}
          >
            {message}
          </p>
          )}
          {existingAccount && <div className="mt-3 flex flex-wrap gap-3 text-sm"><Link className="underline" href="/login">{t('auth.signup.existingAccountLogin')}</Link><Link className="underline" href="/forgot-password">{t('auth.signup.existingAccountForgot')}</Link><button type="button" className="underline disabled:cursor-not-allowed disabled:opacity-60" disabled={loading || socialLoading} onClick={async () => { if (loading || socialLoading) return; try { await supabase.auth.resend({ type: 'signup', email: email.trim() }); } finally { setMessage(t('auth.signup.resendConfirmationSuccess')) } }}>{t('auth.signup.resendConfirmation')}</button></div>}

        <p className="mt-6 text-center text-sm text-zinc-400">
          {t('auth.signup.hasAccount')}{' '}
          <Link href="/login" className="font-medium text-white underline-offset-4 hover:underline">
            {t('auth.signup.login')}
          </Link>
        </p>
      </div>
    </main>
  )
}

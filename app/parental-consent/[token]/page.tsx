'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Camera, CheckCircle2, Loader2, ShieldAlert, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type ConsentRequest = {
  id: string
  guardian_email: string
  guardian_name: string | null
  relationship: string | null
  status: string
  child_birth_date: string | null
  consent_text: string | null
  consent_version: string | null
  expires_at: string | null
  created_at: string
}

const SELFIE_MAX_SIZE_BYTES = 5 * 1024 * 1024
const SELFIE_ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function formatDate(value: string | null) {
  if (!value) return 'Nao informado'

  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function statusLabel(status: string) {
  if (status === 'approved') return 'Autorizacao aprovada'
  if (status === 'rejected') return 'Autorizacao recusada'
  if (status === 'expired') return 'Link expirado'
  return 'Aguardando decisao'
}

export default function ParentalConsentPage() {
  const params = useParams()
  const token = typeof params.token === 'string' ? params.token : ''

  const [loading, setLoading] = useState(true)
  const [submittingDecision, setSubmittingDecision] = useState<'approved' | 'rejected' | ''>('')
  const [request, setRequest] = useState<ConsentRequest | null>(null)
  const [message, setMessage] = useState('')
  const [resultStatus, setResultStatus] = useState('')
  const [isResponsible, setIsResponsible] = useState(false)
  const [authorizesNormalUse, setAuthorizesNormalUse] = useState(false)
  const [acceptsTerms, setAcceptsTerms] = useState(false)
  const [signedName, setSignedName] = useState('')
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState('')

  useEffect(() => {
    loadRequest()
  }, [token])

  useEffect(() => {
    return () => {
      if (selfiePreviewUrl) {
        URL.revokeObjectURL(selfiePreviewUrl)
      }
    }
  }, [selfiePreviewUrl])

  const canApprove = useMemo(
    () => isResponsible && authorizesNormalUse && acceptsTerms && signedName.trim().length >= 5 && Boolean(selfieFile),
    [acceptsTerms, authorizesNormalUse, isResponsible, selfieFile, signedName],
  )

  async function loadRequest() {
    if (!token) {
      setMessage('Link invalido.')
      setLoading(false)
      return
    }

    setLoading(true)
    setMessage('')

    const response = await fetch(`/api/parental-consent/respond?token=${encodeURIComponent(token)}`)
    const result = await response.json().catch(() => null)

    if (!response.ok || !result?.request) {
      setMessage(result?.error || 'Link expirado ou invalido.')
      setLoading(false)
      return
    }

    const loadedRequest = result.request as ConsentRequest

    setRequest(loadedRequest)
    setResultStatus(loadedRequest.status)
    setLoading(false)
  }

  async function submitDecision(decision: 'approved' | 'rejected') {
    if (!token) return

    if (decision === 'approved' && !canApprove) {
      setMessage('Confirme os termos, informe o nome completo do responsavel e envie uma selfie para autorizar.')
      return
    }

    setSubmittingDecision(decision)
    setMessage('')

    const formData = new FormData()
    formData.append('token', token)
    formData.append('decision', decision)
    formData.append('signed_name', signedName.trim())

    if (decision === 'approved' && selfieFile) {
      formData.append('guardian_selfie', selfieFile)
    }

    const response = await fetch('/api/parental-consent/respond', {
      method: 'POST',
      body: formData,
    })
    const result = await response.json().catch(() => null)

    setSubmittingDecision('')

    if (!response.ok || !result?.success) {
      setMessage(result?.error || 'Nao foi possivel registrar a decisao. Tente novamente.')
      if (result?.status) {
        setResultStatus(result.status)
        setRequest((current) => current ? { ...current, status: result.status } : current)
      }
      return
    }

    const nextStatus = result.status || decision

    setResultStatus(nextStatus)
    setRequest((current) => current ? { ...current, status: nextStatus } : current)
    setMessage(result.message || (decision === 'approved' ? 'Autorizacao aprovada.' : 'Autorizacao recusada.'))
  }

  function handleSelfieChange(file: File | null) {
    setMessage('')

    if (selfiePreviewUrl) {
      URL.revokeObjectURL(selfiePreviewUrl)
      setSelfiePreviewUrl('')
    }

    setSelfieFile(null)

    if (!file) return

    if (!SELFIE_ACCEPTED_TYPES.has(file.type)) {
      setMessage('A selfie precisa ser uma imagem JPG, PNG ou WEBP.')
      return
    }

    if (file.size > SELFIE_MAX_SIZE_BYTES) {
      setMessage('A selfie deve ter no maximo 5 MB.')
      return
    }

    setSelfieFile(file)
    setSelfiePreviewUrl(URL.createObjectURL(file))
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-4xl items-center">
        <div className="w-full rounded-[2rem] border border-blue-400/20 bg-zinc-950/90 p-5 shadow-2xl shadow-blue-950/20 ring-1 ring-white/10 sm:p-8">
          <div className="flex items-center gap-3">
            <img src="/logo-icon.png" alt="EntreUS" className="h-11 w-11 rounded-full object-contain" />
            <div>
              <p className="text-sm font-black uppercase tracking-[0.24em] text-blue-300">
                EntreUS
              </p>
              <h1 className="text-2xl font-black sm:text-3xl">
                Autorizacao do responsavel
              </h1>
            </div>
          </div>

          {loading ? (
            <div className="mt-8 flex min-h-56 items-center justify-center rounded-3xl border border-white/10 bg-black/40 text-zinc-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Carregando solicitacao...
            </div>
          ) : !request ? (
            <div className="mt-8 rounded-3xl border border-red-300/20 bg-red-500/10 p-5 text-red-100">
              <div className="flex items-center gap-2 font-black">
                <XCircle className="h-5 w-5" />
                Link expirado ou invalido
              </div>
              <p className="mt-2 text-sm">{message || 'Nao encontramos uma solicitacao valida para este link.'}</p>
            </div>
          ) : (
            <>
              <div className="mt-8 rounded-3xl border border-blue-300/20 bg-blue-500/10 p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/20 text-blue-100">
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-blue-100/80">Status</p>
                    <p className="text-xl font-black">{statusLabel(resultStatus)}</p>
                  </div>
                </div>

                <p className="text-sm leading-7 text-zinc-200">
                  Voce esta recebendo esta solicitacao porque um menor informou seu e-mail como responsavel para usar a plataforma EntreUS. Autorizar libera apenas os recursos normais da rede social. Conteudos 18+ continuam bloqueados para menores, mesmo com autorizacao.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Responsavel</p>
                    <p className="mt-1 break-all font-bold">{request.guardian_name || request.guardian_email}</p>
                    {request.relationship && (
                      <p className="mt-1 text-xs text-zinc-400">{request.relationship}</p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Nascimento informado</p>
                    <p className="mt-1 font-bold">{formatDate(request.child_birth_date)}</p>
                  </div>
                </div>
              </div>

              {resultStatus === 'pending' && (
                <div className="mt-6 rounded-3xl border border-white/10 bg-black/40 p-5">
                  <h2 className="text-lg font-black">Termo do responsavel</h2>
                  <p className="mt-3 text-sm leading-7 text-zinc-300">
                    Declaro que sou pai, mae ou responsavel legal pelo menor indicado, que compreendi que a EntreUS e uma rede social, e que autorizo o uso de recursos normais da plataforma. A autorizacao nao libera conteudo adulto, verificacao 18+ ou qualquer recurso restrito a maiores de idade.
                  </p>

                  <div className="mt-5 space-y-3">
                    <label className="flex gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300">
                      <input
                        type="checkbox"
                        checked={isResponsible}
                        onChange={(event) => setIsResponsible(event.target.checked)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-950 text-blue-500 accent-blue-500"
                      />
                      <span>Confirmo que sou pai, mae ou responsavel legal pelo menor.</span>
                    </label>

                    <label className="flex gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300">
                      <input
                        type="checkbox"
                        checked={authorizesNormalUse}
                        onChange={(event) => setAuthorizesNormalUse(event.target.checked)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-950 text-blue-500 accent-blue-500"
                      />
                      <span>Autorizo o menor a usar a EntreUS em recursos normais.</span>
                    </label>

                    <label className="flex gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300">
                      <input
                        type="checkbox"
                        checked={acceptsTerms}
                        onChange={(event) => setAcceptsTerms(event.target.checked)}
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
                        aplicaveis.
                      </span>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-zinc-200">
                        Assinatura digitada do responsavel
                      </span>
                      <input
                        type="text"
                        value={signedName}
                        onChange={(event) => setSignedName(event.target.value)}
                        maxLength={120}
                        className="w-full rounded-2xl border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition focus:border-blue-400"
                        placeholder="Nome completo"
                      />
                    </label>

                    <div className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-100">
                          <Camera className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="font-black text-blue-50">Selfie do responsavel</p>
                          <p className="mt-1 text-sm leading-6 text-blue-100/80">
                            Para proteger menores e evitar autorizacoes indevidas, solicitamos uma selfie simples do responsavel. A imagem sera usada apenas como prova de autorizacao e nao sera exibida publicamente.
                          </p>
                        </div>
                      </div>

                      <label className="mt-4 block">
                        <span className="mb-2 block text-sm font-semibold text-zinc-200">
                          Enviar ou tirar selfie
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/*"
                          capture="user"
                          onChange={(event) => handleSelfieChange(event.target.files?.[0] || null)}
                          className="block w-full rounded-2xl border border-zinc-700 bg-black px-4 py-3 text-sm text-zinc-200 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-black file:text-black"
                        />
                      </label>

                      {selfiePreviewUrl && (
                        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black">
                          <img
                            src={selfiePreviewUrl}
                            alt="Preview da selfie do responsavel"
                            className="max-h-72 w-full object-contain"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {message && (
                <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                  resultStatus === 'approved'
                    ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
                    : resultStatus === 'rejected'
                      ? 'border-red-300/20 bg-red-500/10 text-red-100'
                      : 'border-amber-300/20 bg-amber-500/10 text-amber-100'
                }`}>
                  {message}
                </div>
              )}

              {resultStatus === 'pending' ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => submitDecision('approved')}
                    disabled={submittingDecision !== '' || !canApprove}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submittingDecision === 'approved' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Autorizar acesso
                  </button>

                  <button
                    type="button"
                    onClick={() => submitDecision('rejected')}
                    disabled={submittingDecision !== ''}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-red-300/20 bg-red-500/10 px-5 py-3 text-sm font-black text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submittingDecision === 'rejected' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Recusar autorizacao
                  </button>
                </div>
              ) : (
                <Link
                  href="/"
                  className="mt-6 inline-flex rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10"
                >
                  Voltar para EntreUS
                </Link>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  )
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, Flag, Loader2, ShieldAlert } from 'lucide-react'
import { isAdminRole } from '@/lib/admin'
import { supabase } from '@/lib/supabase'

type AdminProfile = {
  id: string
  email?: string
  role: string | null
}

type ReportRow = {
  id: string
  reporter_id: string | null
  reported_post_id: string | null
  reported_user_id: string | null
  reason: string | null
  status?: string | null
  created_at?: string | null
}

export default function AdminReportsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)
  const [reports, setReports] = useState<ReportRow[]>([])

  useEffect(() => {
    loadPage()
  }, [])

  async function loadPage() {
    setLoading(true)
    setMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      setMessage('Nao foi possivel verificar permissao admin.')
      setLoading(false)
      return
    }

    const loadedProfile = {
      id: user.id,
      email: user.email,
      role: profileData?.role || 'user',
    }
    setAdminProfile(loadedProfile)

    if (!isAdminRole(loadedProfile.role)) {
      setLoading(false)
      return
    }

    let reportsData: ReportRow[] | null = null
    let reportsError: { message: string } | null = null

    const primaryResult = await supabase
      .from('reports')
      .select('id, reporter_id, reported_post_id, reported_user_id, reason, status, created_at')
      .or('status.is.null,status.eq.pending')
      .order('created_at', { ascending: false })
      .limit(50)

    reportsData = (primaryResult.data || null) as ReportRow[] | null
    reportsError = primaryResult.error

    if (reportsError) {
      console.warn('[AdminReports] Status filter unavailable, loading recent reports:', reportsError.message)
      const fallback = await supabase
        .from('reports')
        .select('id, reporter_id, reported_post_id, reported_user_id, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(50)
      reportsData = (fallback.data || null) as ReportRow[] | null
      reportsError = fallback.error
    }

    if (reportsError) {
      console.error('[AdminReports] Load failed:', reportsError.message)
      setMessage('Nao foi possivel carregar denuncias agora.')
      setReports([])
    } else {
      setReports(reportsData || [])
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando denuncias...
      </main>
    )
  }

  if (!adminProfile || !isAdminRole(adminProfile.role)) {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-red-300/20 bg-red-500/10 p-6 text-red-100">
          <ShieldAlert className="h-10 w-10" />
          <h1 className="mt-4 text-2xl font-black">Acesso restrito</h1>
          <p className="mt-2 text-sm leading-6">Esta area e exclusiva para administradores.</p>
          <Link href="/feed" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">
            Voltar
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto w-full max-w-6xl">
        <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" />
          Admin
        </Link>

        <header className="mt-6 rounded-[2rem] border border-red-300/25 bg-red-500/10 p-6 ring-1 ring-red-300/10">
          <Flag className="h-9 w-9 text-red-100" />
          <h1 className="mt-4 text-3xl font-black">Denuncias pendentes</h1>
          <p className="mt-2 text-sm leading-6 text-red-100/80">
            Revisao inicial de denuncias enviadas por usuarios. Abra o post denunciado quando houver ID de post.
          </p>
        </header>

        {message && (
          <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {message}
          </div>
        )}

        <div className="mt-5 grid gap-3">
          {reports.length === 0 ? (
            <div className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-5 text-emerald-100 ring-1 ring-emerald-300/10">
              Nenhuma denuncia pendente no momento.
            </div>
          ) : (
            reports.map((report) => (
              <article key={report.id} className="rounded-3xl border border-white/10 bg-zinc-950/80 p-4 ring-1 ring-white/5 transition hover:-translate-y-0.5 hover:border-blue-300/20">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-red-200">
                      <AlertTriangle className="h-4 w-4" />
                      {report.status || 'pendente'}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-200">{report.reason || 'Sem motivo informado.'}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      Denunciado: {report.reported_user_id || '-'} · Autor: {report.reporter_id || '-'}
                    </p>
                  </div>
                  {report.reported_post_id && (
                    <Link href={`/post/${report.reported_post_id}`} className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-black text-black">
                      Ver post
                    </Link>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  )
}

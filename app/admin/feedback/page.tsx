'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, Bug, Loader2, ShieldAlert } from 'lucide-react'
import { isAdminRole } from '@/lib/admin'
import { supabase } from '@/lib/supabase'

type AdminProfile = {
  id: string
  email?: string
  role: string | null
}

type FeedbackReportRow = {
  id: string
  user_id: string | null
  type: string
  urgency: string
  title: string
  description: string
  page_url: string | null
  status: string
  created_at: string
}

function urgencyClass(urgency: string) {
  if (urgency === 'urgent') return 'bg-red-600 text-white'
  if (urgency === 'high') return 'bg-amber-400 text-amber-950'
  return 'bg-white/10 text-zinc-300'
}

export default function AdminFeedbackPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)
  const [reports, setReports] = useState<FeedbackReportRow[]>([])

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

    const { data, error } = await supabase
      .from('internal_feedback_reports')
      .select('id, user_id, type, urgency, title, description, page_url, status, created_at')
      .in('status', ['open', 'triaged', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[AdminFeedback] Load failed:', error.message)
      setMessage('Nao foi possivel carregar feedbacks agora.')
      setReports([])
    } else {
      setReports((data || []) as FeedbackReportRow[])
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando feedbacks...
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

        <header className="mt-6 rounded-[2rem] border border-blue-300/25 bg-blue-500/10 p-6 ring-1 ring-blue-300/10">
          <Bug className="h-9 w-9 text-blue-100" />
          <h1 className="mt-4 text-3xl font-black">Feedbacks e bugs</h1>
          <p className="mt-2 text-sm leading-6 text-blue-100/80">
            Relatos abertos enviados pela pagina de feedback da EntreUS.
          </p>
        </header>

        {message && (
          <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {message}
          </div>
        )}

        <div className="mt-5 grid gap-3">
          {reports.length === 0 ? (
            <div className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-5 text-emerald-100">
              Nenhum feedback ou bug aberto no momento.
            </div>
          ) : (
            reports.map((report) => (
              <article key={report.id} className="rounded-3xl border border-white/10 bg-zinc-950 p-4 ring-1 ring-white/5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-black text-blue-100">{report.type}</span>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${urgencyClass(report.urgency)}`}>{report.urgency}</span>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-zinc-300">{report.status}</span>
                    </div>
                    <h2 className="mt-3 text-lg font-black">{report.title}</h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-300">{report.description}</p>
                    {report.page_url && <p className="mt-2 truncate text-xs text-zinc-500">Pagina: {report.page_url}</p>}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  )
}

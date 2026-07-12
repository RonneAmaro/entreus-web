'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Item = { id:string; media_type:string; status:string; submitted_at:string; previewUrl:string|null; profile:{ username:string|null; display_name:string|null; profile_content_mode:string }|null }
type AccessState = 'checking' | 'authorized' | 'error'

function SignedPreview({ url }: { url: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- signed R2 previews must bypass optimization and caching
  return <img src={url} alt="Preview temporario para moderacao" referrerPolicy="no-referrer" className="h-64 w-full rounded-xl bg-black object-contain" />
}

export default function ProfileMediaAdminPage() {
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [accessState, setAccessState] = useState<AccessState>('checking')
  const [message, setMessage] = useState('')
  async function authHeaders() {
    const { data } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${data.session?.access_token || ''}`, 'Content-Type': 'application/json' }
  }
  async function load() {
    try {
      const response = await fetch('/api/admin/profile-media-submissions', { headers: await authHeaders(), cache: 'no-store' })
      if (response.status === 401) { router.replace('/login'); return }
      if (response.status === 403) { router.replace('/feed'); return }
      const data = await response.json().catch(() => null)
      if (!response.ok) { setMessage('Nao foi possivel verificar o acesso agora.'); setAccessState('error'); return }
      setItems(data?.submissions || [])
      setAccessState('authorized')
    } catch {
      setMessage('Nao foi possivel verificar o acesso agora.')
      setAccessState('error')
    }
  }
  // The initial request synchronizes this client-only queue with the server.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])
  async function review(item: Item, decision: 'approved'|'rejected'|'change_requested') {
    const reason = decision === 'approved' ? '' : window.prompt(decision === 'rejected' ? 'Motivo da recusa:' : 'Orientacao para a troca:')?.trim()
    if (decision !== 'approved' && !reason) return
    const response = await fetch(`/api/admin/profile-media-submissions/${item.id}/review`, { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ decision, reason, category: decision === 'approved' ? 'safe' : decision === 'rejected' ? 'prohibited' : 'review' }) })
    const data = await response.json().catch(() => null); setMessage(response.ok ? 'Revisao registrada.' : data?.error || 'Falha na revisao.'); await load()
  }

  if (accessState === 'checking') {
    return <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-300"><p>Verificando acesso...</p></main>
  }

  if (accessState === 'error') {
    return <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-300"><p>{message}</p></main>
  }

  return <main className="min-h-screen bg-zinc-950 p-6 text-white"><div className="mx-auto max-w-6xl">
    <Link href="/admin/moderation" className="text-sm text-blue-300">← Moderacao</Link><h1 className="mt-4 text-3xl font-bold">Avatar e capa</h1><p className="mt-2 text-zinc-400">Fila privada, sem cache, para identidade publica de perfis.</p>
    {message && <p className="mt-4 rounded-xl border border-zinc-700 p-3">{message}</p>}
    <div className="mt-6 grid gap-5 md:grid-cols-2">{items.map(item => <article key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      {item.previewUrl ? <SignedPreview url={item.previewUrl} /> : <div className="flex h-64 items-center justify-center rounded-xl bg-black text-zinc-500">Preview indisponivel</div>}
      <div className="mt-3 text-sm"><strong>{item.profile?.display_name || item.profile?.username || 'Usuario'}</strong> · @{item.profile?.username || 'usuario'}<br />{item.profile?.profile_content_mode} · {item.media_type} · {item.status}<br />{new Date(item.submitted_at).toLocaleString('pt-BR')}</div>
      {item.status === 'pending_review' && <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => review(item,'approved')} className="rounded-full bg-emerald-600 px-4 py-2">Aprovar</button><button onClick={() => review(item,'rejected')} className="rounded-full bg-red-600 px-4 py-2">Recusar</button><button onClick={() => review(item,'change_requested')} className="rounded-full bg-amber-600 px-4 py-2">Pedir troca</button></div>}
    </article>)}</div>
  </div></main>
}

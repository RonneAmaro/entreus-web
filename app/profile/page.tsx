'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  username: string
  display_name: string | null
  bio: string | null
  country: string | null
  theme_preference: string | null
  profile_visibility: string | null
}

export default function ProfilePage() {
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [country, setCountry] = useState('')
  const [themePreference, setThemePreference] = useState('dark')
  const [profileVisibility, setProfileVisibility] = useState('public')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, bio, country, theme_preference, profile_visibility')
        .eq('id', user.id)
        .single()

      if (error) {
        setMessage('Erro ao carregar perfil: ' + error.message)
        setLoading(false)
        return
      }

      setProfile(data)
      setUsername(data.username || '')
      setDisplayName(data.display_name || '')
      setBio(data.bio || '')
      setCountry(data.country || '')
      setThemePreference(data.theme_preference || 'dark')
      setProfileVisibility(data.profile_visibility || 'public')
      setLoading(false)
    }

    loadProfile()
  }, [router])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()

    if (!profile) return

    if (!username.trim()) {
      setMessage('O username é obrigatório.')
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        username: username.trim().toLowerCase(),
        display_name: displayName.trim(),
        bio: bio.trim(),
        country: country.trim(),
        theme_preference: themePreference,
        profile_visibility: profileVisibility,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id)

    if (error) {
      setMessage('Erro ao salvar perfil: ' + error.message)
      return
    }

    setMessage('Perfil atualizado com sucesso!')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Carregando perfil...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">EntreUS</h1>
          <p className="text-sm text-zinc-400">Meu perfil</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => router.push('/feed')}
            className="border border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-900"
          >
            Feed
          </button>

          <button
            onClick={handleLogout}
            className="border border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-900"
          >
            Sair
          </button>
        </div>
      </header>

      <section className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
          <h2 className="text-2xl font-bold mb-2">Editar perfil</h2>
          <p className="text-zinc-400 mb-6">
            Atualize suas informações públicas no EntreUS.
          </p>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block mb-2 text-sm text-zinc-300">
                Username
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="seuusuario"
                className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500"
                required
              />
              <p className="text-xs text-zinc-500 mt-1">
                Esse será seu @ na plataforma.
              </p>
            </div>

            <div>
              <label className="block mb-2 text-sm text-zinc-300">
                Nome de exibição
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex: Ronne Amaro"
                className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm text-zinc-300">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Fale um pouco sobre você..."
                className="w-full min-h-28 rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500 resize-none"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm text-zinc-300">
                País
              </label>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Brasil"
                className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm text-zinc-300">
                Tema preferido
              </label>
              <select
                value={themePreference}
                onChange={(e) => setThemePreference(e.target.value)}
                className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 outline-none"
              >
                <option value="dark">Escuro</option>
                <option value="light">Claro</option>
                <option value="auto">Automático</option>
              </select>
            </div>

            <div>
              <label className="block mb-2 text-sm text-zinc-300">
                Visibilidade do perfil
              </label>
              <select
                value={profileVisibility}
                onChange={(e) => setProfileVisibility(e.target.value)}
                className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 outline-none"
              >
                <option value="public">Público</option>
                <option value="private">Privado</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-white text-black rounded-xl py-3 font-medium hover:opacity-90"
            >
              Salvar perfil
            </button>
          </form>

          {message && (
            <p className="mt-4 text-sm text-zinc-300">{message}</p>
          )}
        </div>
      </section>
    </main>
  )
}
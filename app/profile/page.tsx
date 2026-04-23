'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  username: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  birth_date: string | null
  country: string | null
}

export default function ProfilePage() {
  const router = useRouter()

  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [message, setMessage] = useState('')

  const [profile, setProfile] = useState<Profile | null>(null)

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [country, setCountry] = useState('')

  useEffect(() => {
    async function loadProfile() {
      setLoading(true)
      setMessage('')

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setUserId(user.id)
      setEmail(user.email || '')

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, bio, avatar_url, birth_date, country')
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        setMessage('Erro ao carregar perfil: ' + error.message)
        setLoading(false)
        return
      }

      if (!data) {
        setMessage('Perfil não encontrado.')
        setLoading(false)
        return
      }

      setProfile(data)
      setUsername(data.username || '')
      setDisplayName(data.display_name || '')
      setBio(data.bio || '')
      setAvatarUrl(data.avatar_url || '')
      setBirthDate(data.birth_date || '')
      setCountry(data.country || '')
      setLoading(false)
    }

    loadProfile()
  }, [router])

  function normalizeUsername(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9_]/g, '')
  }

  async function handleAvatarUpload(file: File) {
    if (!userId) return

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setMessage('Envie uma imagem JPG, PNG ou WEBP.')
      return
    }

    const maxSizeInBytes = 3 * 1024 * 1024
    if (file.size > maxSizeInBytes) {
      setMessage('A imagem deve ter no máximo 3MB.')
      return
    }

    setUploadingAvatar(true)
    setMessage('')

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filePath = `${userId}/avatar-${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadError) {
      setMessage('Erro ao enviar avatar: ' + uploadError.message)
      setUploadingAvatar(false)
      return
    }

    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)

    const newAvatarUrl = publicUrlData.publicUrl

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: newAvatarUrl })
      .eq('id', userId)

    if (updateError) {
      setMessage('Erro ao salvar avatar no perfil: ' + updateError.message)
      setUploadingAvatar(false)
      return
    }

    setAvatarUrl(newAvatarUrl)
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            avatar_url: newAvatarUrl,
          }
        : prev
    )

    setMessage('Avatar atualizado com sucesso!')
    setUploadingAvatar(false)
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()

    if (!userId) return

    const cleanedUsername = normalizeUsername(username)

    if (!cleanedUsername) {
      setMessage('Escolha um username válido.')
      return
    }

    if (cleanedUsername.length < 3) {
      setMessage('O username deve ter pelo menos 3 caracteres.')
      return
    }

    setSaving(true)
    setMessage('')

    const { data: existingUser, error: usernameError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanedUsername)
      .neq('id', userId)
      .maybeSingle()

    if (usernameError) {
      setMessage('Erro ao verificar username: ' + usernameError.message)
      setSaving(false)
      return
    }

    if (existingUser) {
      setMessage('Esse @username já está em uso. Escolha outro.')
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        username: cleanedUsername,
        display_name: displayName.trim(),
        bio: bio.trim(),
        avatar_url: avatarUrl.trim() || null,
        birth_date: birthDate || null,
        country: country.trim() || null,
      })
      .eq('id', userId)

    if (error) {
      setMessage('Erro ao salvar perfil: ' + error.message)
      setSaving(false)
      return
    }

    setUsername(cleanedUsername)
    setMessage('Perfil atualizado com sucesso!')

    setProfile((prev) =>
      prev
        ? {
            ...prev,
            username: cleanedUsername,
            display_name: displayName.trim(),
            bio: bio.trim(),
            avatar_url: avatarUrl.trim() || null,
            birth_date: birthDate || null,
            country: country.trim() || null,
          }
        : prev
    )

    setSaving(false)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white flex items-center justify-center">
        <p>Carregando perfil...</p>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
        <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">EntreUS</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Só Entre Nós</p>
          </div>

          <Link
            href="/feed"
            className="border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            Voltar ao feed
          </Link>
        </header>

        <section className="max-w-3xl mx-auto px-6 py-8">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800">
            <p className="text-zinc-700 dark:text-zinc-300">
              {message || 'Perfil não encontrado.'}
            </p>
          </div>
        </section>
      </main>
    )
  }

  const publicProfileUrl = `/u/${profile.username}`

  return (
    <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white transition-colors">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">EntreUS</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Só Entre Nós</p>
        </div>

        <div className="flex gap-3">
          <Link
            href={publicProfileUrl}
            className="border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            Ver perfil público
          </Link>

          <Link
            href="/feed"
            className="border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            Voltar ao feed
          </Link>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="w-24 h-24 rounded-full object-cover border border-zinc-300 dark:border-zinc-700"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-3xl font-bold text-zinc-700 dark:text-zinc-300">
                {(displayName || profile.username || 'U').charAt(0).toUpperCase()}
              </div>
            )}

            <div>
              <h2 className="text-2xl font-bold text-black dark:text-white">Meu perfil</h2>
              <p className="text-zinc-500 dark:text-zinc-400 mt-1">@{profile.username}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-2">Conta: {email}</p>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSaveProfile}
          className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800"
        >
          <div className="grid grid-cols-1 gap-5">
            <div>
              <label className="block mb-2 text-sm text-zinc-700 dark:text-zinc-300">
                Username
              </label>
              <div className="flex items-center rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4">
                <span className="text-zinc-500 mr-2">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                  placeholder="seuusername"
                  className="w-full bg-transparent py-3 outline-none"
                />
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                Use apenas letras minúsculas, números e underline (_).
              </p>
            </div>

            <div>
              <label className="block mb-2 text-sm text-zinc-700 dark:text-zinc-300">
                Nome de exibição
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Seu nome na plataforma"
                className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm text-zinc-700 dark:text-zinc-300">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Fale um pouco sobre você..."
                className="w-full min-h-32 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500 resize-none"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm text-zinc-700 dark:text-zinc-300">
                Upload do avatar
              </label>

              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    handleAvatarUpload(file)
                  }
                }}
                className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none"
              />

              <p className="text-xs text-zinc-500 mt-2">
                Formatos aceitos: JPG, PNG e WEBP. Tamanho máximo: 3MB.
              </p>
            </div>

            <div>
              <label className="block mb-2 text-sm text-zinc-700 dark:text-zinc-300">
                URL do avatar
              </label>
              <input
                type="text"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block mb-2 text-sm text-zinc-700 dark:text-zinc-300">
                  Data de nascimento
                </label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm text-zinc-700 dark:text-zinc-300">
                  País
                </label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Brasil"
                  className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500"
                />
              </div>
            </div>
          </div>

          {message && (
            <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{message}</p>
          )}

          <div className="mt-6 flex gap-3 flex-wrap">
            <button
              type="submit"
              disabled={saving || uploadingAvatar}
              className={`px-6 py-3 rounded-xl font-medium ${
                saving || uploadingAvatar
                  ? 'bg-zinc-300 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 cursor-not-allowed'
                  : 'bg-black text-white dark:bg-white dark:text-black hover:opacity-90'
              }`}
            >
              {saving ? 'Salvando...' : uploadingAvatar ? 'Enviando avatar...' : 'Salvar alterações'}
            </button>

            <Link
              href={`/u/${username || profile.username}`}
              className="border border-zinc-300 dark:border-zinc-700 px-6 py-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Ver como ficou
            </Link>
          </div>
        </form>
      </section>
    </main>
  )
}
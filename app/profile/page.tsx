'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  username: string | null
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  country: string | null
  birth_date: string | null
  show_sensitive_content: boolean
}

export default function ProfilePage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [message, setMessage] = useState('')

  const [userId, setUserId] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [country, setCountry] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarPreview, setAvatarPreview] = useState('')
  const [showSensitiveContent, setShowSensitiveContent] = useState(false)

  useEffect(() => {
    async function loadPage() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setUserId(user.id)

      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, username, display_name, bio, avatar_url, country, birth_date, show_sensitive_content'
        )
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        setMessage('Erro ao carregar perfil: ' + error.message)
        setLoading(false)
        return
      }

      const loadedProfile: Profile = data || {
        id: user.id,
        username: '',
        display_name: '',
        bio: '',
        avatar_url: '',
        country: '',
        birth_date: '',
        show_sensitive_content: false,
      }

      setProfile(loadedProfile)
      setUsername(loadedProfile.username || '')
      setDisplayName(loadedProfile.display_name || '')
      setBio(loadedProfile.bio || '')
      setCountry(loadedProfile.country || '')
      setBirthDate(loadedProfile.birth_date || '')
      setAvatarUrl(loadedProfile.avatar_url || '')
      setAvatarPreview(loadedProfile.avatar_url || '')
      setShowSensitiveContent(loadedProfile.show_sensitive_content || false)

      setLoading(false)
    }

    loadPage()
  }, [router])

  function sanitizeUsername(value: string) {
    return value
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 30)
  }

  async function handleAvatarSelect(file: File | null) {
    if (!file || !userId) return

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']

    if (!allowedTypes.includes(file.type)) {
      setMessage('Envie uma imagem JPG, PNG ou WEBP.')
      return
    }

    const maxSizeInBytes = 5 * 1024 * 1024

    if (file.size > maxSizeInBytes) {
      setMessage('O avatar deve ter no máximo 5MB.')
      return
    }

    setUploadingAvatar(true)
    setMessage('')

    const previewUrl = URL.createObjectURL(file)
    setAvatarPreview(previewUrl)

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

    setAvatarUrl(publicUrlData.publicUrl)
    setAvatarPreview(publicUrlData.publicUrl)
    setUploadingAvatar(false)
    setMessage('Avatar atualizado. Agora salve o perfil.')
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()

    if (!userId) return

    const normalizedUsername = sanitizeUsername(username)

    if (!normalizedUsername) {
      setMessage('Escolha um username válido.')
      return
    }

    setSaving(true)
    setMessage('')

    const { data: existingUsername, error: usernameCheckError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', normalizedUsername)
      .neq('id', userId)
      .maybeSingle()

    if (usernameCheckError) {
      setMessage('Erro ao verificar username: ' + usernameCheckError.message)
      setSaving(false)
      return
    }

    if (existingUsername) {
      setMessage('Esse username já está em uso.')
      setSaving(false)
      return
    }

    const payload = {
      id: userId,
      username: normalizedUsername,
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
      avatar_url: avatarUrl || null,
      country: country.trim() || null,
      birth_date: birthDate || null,
      show_sensitive_content: showSensitiveContent,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('profiles').upsert(payload)

    if (error) {
      setMessage('Erro ao salvar perfil: ' + error.message)
      setSaving(false)
      return
    }

    setUsername(normalizedUsername)
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            ...payload,
          }
        : {
            id: userId,
            username: normalizedUsername,
            display_name: displayName.trim() || null,
            bio: bio.trim() || null,
            avatar_url: avatarUrl || null,
            country: country.trim() || null,
            birth_date: birthDate || null,
            show_sensitive_content: showSensitiveContent,
          }
    )

    setMessage('Perfil salvo com sucesso.')
    setSaving(false)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white flex items-center justify-center px-4">
        <p>Carregando perfil...</p>
      </main>
    )
  }

  const publicProfileUrl = username ? `/u/${username}` : '#'
  const profileName = displayName || username || 'Usuário'

  return (
    <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white transition-colors">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 py-4">
        <div className="max-w-4xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">EntreUS</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Meu perfil</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {username && (
              <Link
                href={publicProfileUrl}
                className="w-full sm:w-auto text-center border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                Ver perfil público
              </Link>
            )}

            <Link
              href="/feed"
              className="w-full sm:w-auto text-center border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Voltar ao feed
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {message && (
          <div className="mb-4 bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300">
            {message}
          </div>
        )}

        <form
          onSubmit={handleSaveProfile}
          className="bg-white dark:bg-zinc-900 rounded-2xl p-4 sm:p-6 border border-zinc-200 dark:border-zinc-800"
        >
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
              <div className="flex flex-col items-center sm:items-start gap-3">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt={profileName}
                    className="w-24 h-24 rounded-full object-cover border border-zinc-300 dark:border-zinc-700"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-3xl font-bold text-zinc-700 dark:text-zinc-300">
                    {profileName.charAt(0).toUpperCase()}
                  </div>
                )}

                <label className="w-full sm:w-auto">
                  <span className="sr-only">Escolher avatar</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => handleAvatarSelect(e.target.files?.[0] || null)}
                    className="block w-full text-sm rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-3 py-2"
                  />
                </label>

                {uploadingAvatar && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Enviando avatar...
                  </p>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold text-black dark:text-white break-words">
                  {profileName}
                </h2>

                <p className="text-zinc-500 dark:text-zinc-400 mt-1 break-all">
                  @{username || 'seu_username'}
                </p>

                {bio && (
                  <p className="mt-3 text-sm sm:text-base text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
                    {bio}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm mb-2 text-zinc-700 dark:text-zinc-300">
                  Nome de exibição
                </label>

                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Seu nome visível"
                  className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500 text-sm sm:text-base"
                />
              </div>

              <div>
                <label className="block text-sm mb-2 text-zinc-700 dark:text-zinc-300">
                  Username
                </label>

                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(sanitizeUsername(e.target.value))}
                  placeholder="seu_username"
                  className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500 text-sm sm:text-base"
                />

                <p className="text-xs text-zinc-500 mt-2">
                  Use letras minúsculas, números e underline.
                </p>
              </div>

              <div>
                <label className="block text-sm mb-2 text-zinc-700 dark:text-zinc-300">
                  Bio
                </label>

                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Fale um pouco sobre você..."
                  className="w-full min-h-28 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500 resize-none text-sm sm:text-base"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-2 text-zinc-700 dark:text-zinc-300">
                    País
                  </label>

                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Brasil"
                    className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500 text-sm sm:text-base"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-zinc-700 dark:text-zinc-300">
                    Data de nascimento
                  </label>

                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500 text-sm sm:text-base"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/60 dark:bg-yellow-950/20">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-3">
                    <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
                      <ShieldAlert className="h-5 w-5" />
                    </div>

                    <div>
                      <h3 className="font-semibold text-zinc-900 dark:text-white">
                        Preferência de conteúdo 18+
                      </h3>

                      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                        Quando ativado, publicações adultas ou sensíveis poderão aparecer no seu feed com aviso antes da visualização.
                      </p>

                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                        Quando desativado, o feed poderá ocultar esse tipo de conteúdo.
                      </p>
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-yellow-300 bg-white px-4 py-3 text-sm font-medium text-zinc-900 dark:border-yellow-800 dark:bg-zinc-950 dark:text-white">
                    <input
                      type="checkbox"
                      checked={showSensitiveContent}
                      onChange={(e) => setShowSensitiveContent(e.target.checked)}
                      className="h-5 w-5 accent-yellow-600"
                    />

                    Permitir 18+
                  </label>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                disabled={saving || uploadingAvatar}
                className={`w-full sm:w-auto px-6 py-3 rounded-xl font-medium ${
                  saving || uploadingAvatar
                    ? 'bg-zinc-300 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 cursor-not-allowed'
                    : 'bg-black text-white dark:bg-white dark:text-black hover:opacity-90'
                }`}
              >
                {saving ? 'Salvando...' : 'Salvar perfil'}
              </button>

              {username && (
                <Link
                  href={publicProfileUrl}
                  className="w-full sm:w-auto text-center border border-zinc-300 dark:border-zinc-700 px-6 py-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  Abrir perfil público
                </Link>
              )}
            </div>
          </div>
        </form>
      </section>
    </main>
  )
}
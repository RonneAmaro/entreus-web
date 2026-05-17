'use client'

import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import BrandHeader from '../components/BrandHeader'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Camera, ImageIcon, LinkIcon, MapPin, Maximize2, Search, ShieldAlert, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import PostCard from '../components/PostCard'
import UserBadges from '../components/UserBadges'
import UserBadgesPanel from '../components/UserBadgesPanel'
import { useLanguage } from '../components/LanguageProvider'

type VisibilityType = 'public' | 'followers' | 'private'

type Profile = {
  id: string
  username: string | null
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  banner_url: string | null
  country: string | null
  city: string | null
  state: string | null
  website_url: string | null
  website_title: string | null
  birth_date: string | null
  show_sensitive_content: boolean
  is_minor: boolean
  parental_consent_status: string
  wants_18_plus: boolean
  age_verification_status: string
  age_verified_at: string | null
}

type ProfileSummary = {
  username: string
  display_name: string | null
  avatar_url: string | null
}

type PostMedia = {
  id: string
  post_id: string
  user_id: string
  media_url: string
  media_type: 'image' | 'video'
  position: number
  created_at?: string
}

type Post = {
  id: string
  content: string | null
  category: string | null
  created_at: string
  user_id: string
  image_url: string | null
  video_url: string | null
  visibility: VisibilityType
  is_sensitive: boolean | null
  profiles: ProfileSummary | null
  media?: PostMedia[]
}

type Like = {
  id: string
  post_id: string
  user_id: string
}

type Comment = {
  id: string
  post_id: string
  user_id: string
}

type BookmarkItem = {
  id: string
  post_id: string
  user_id: string
  created_at: string
}

type Repost = {
  id: string
  post_id: string
  user_id: string
  created_at: string
  profiles: ProfileSummary | null
}

type ParentalConsentRequest = {
  id: string
  child_user_id: string
  guardian_email: string
  token: string
  status: string
  child_birth_date: string | null
  expires_at: string | null
  created_at: string
}


function getDateLocale(language: string) {
  const locales: Record<string, string> = {
    pt: 'pt-BR',
    en: 'en-US',
    fr: 'fr-FR',
    id: 'id-ID',
    ja: 'ja-JP',
    zh: 'zh-CN',
  }

  return locales[language] || 'pt-BR'
}

function calculateAge(birthDateValue: string | null) {
  if (!birthDateValue) return null

  const birthDate = new Date(`${birthDateValue}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }

  return age
}

function getAgeVerificationLabel(status: string) {
  if (status === 'pending') return 'Verificacao pendente'
  if (status === 'approved') return 'Verificacao aprovada'
  if (status === 'rejected') return 'Verificacao recusada'
  return 'Verificacao 18+ ainda nao iniciada'
}

function getParentalConsentLabel(status: string, hasRequest: boolean) {
  if (!hasRequest && status !== 'approved' && status !== 'rejected') return 'Nao solicitado'
  if (status === 'approved') return 'Aprovado'
  if (status === 'rejected') return 'Recusado'
  if (status === 'expired') return 'Expirado'
  return 'Pendente'
}

type FeedItem =
  | {
    type: 'post'
    id: string
    created_at: string
    post: Post
  }
  | {
    type: 'repost'
    id: string
    created_at: string
    post: Post
    repost: Repost
  }

export default function ProfilePage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { t, language } = useLanguage()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [message, setMessage] = useState('')

  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [stateName, setStateName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [websiteTitle, setWebsiteTitle] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [isMinor, setIsMinor] = useState(false)
  const [parentalConsentStatus, setParentalConsentStatus] = useState('not_required')
  const [guardianEmail, setGuardianEmail] = useState('')
  const [latestConsentRequest, setLatestConsentRequest] = useState<ParentalConsentRequest | null>(null)
  const [consentRequestLink, setConsentRequestLink] = useState('')
  const [creatingConsentRequest, setCreatingConsentRequest] = useState(false)
  const [wants18Plus, setWants18Plus] = useState(false)
  const [ageVerificationStatus, setAgeVerificationStatus] = useState('not_started')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarPreview, setAvatarPreview] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [bannerPreview, setBannerPreview] = useState('')
  const [showSensitiveContent, setShowSensitiveContent] = useState(false)

  const [posts, setPosts] = useState<Post[]>([])
  const [likes, setLikes] = useState<Like[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [reposts, setReposts] = useState<Repost[]>([])
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null)
  const [reportingPostId, setReportingPostId] = useState<string | null>(null)
  const [reportedPostIds, setReportedPostIds] = useState<string[]>([])
  const [showAvatarModal, setShowAvatarModal] = useState(false)
  const [showBannerModal, setShowBannerModal] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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
      setEmail(user.email || '')

      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, username, display_name, bio, avatar_url, banner_url, country, city, state, website_url, website_title, birth_date, show_sensitive_content, is_minor, parental_consent_status, wants_18_plus, age_verification_status, age_verified_at'
        )
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        setMessage(t('profile.messages.loadProfileError') + error.message)
        setLoading(false)
        return
      }

      const loadedProfile: Profile = data || {
        id: user.id,
        username: '',
        display_name: '',
        bio: '',
        avatar_url: '',
        banner_url: '',
        country: '',
        city: '',
        state: '',
        website_url: '',
        website_title: '',
        birth_date: '',
        show_sensitive_content: false,
        is_minor: false,
        parental_consent_status: 'not_required',
        wants_18_plus: false,
        age_verification_status: 'not_started',
        age_verified_at: null,
      }

      setProfile(loadedProfile)
      setUsername(loadedProfile.username || '')
      setDisplayName(loadedProfile.display_name || '')
      setBio(loadedProfile.bio || '')
      setCountry(loadedProfile.country || '')
      setCity(loadedProfile.city || '')
      setStateName(loadedProfile.state || '')
      setWebsiteUrl(loadedProfile.website_url || '')
      setWebsiteTitle(loadedProfile.website_title || '')
      setBirthDate(loadedProfile.birth_date || '')
      setIsMinor(loadedProfile.is_minor || false)
      setParentalConsentStatus(loadedProfile.parental_consent_status || 'not_required')
      setWants18Plus(loadedProfile.wants_18_plus || false)
      setAgeVerificationStatus(loadedProfile.age_verification_status || 'not_started')
      setAvatarUrl(loadedProfile.avatar_url || '')
      setAvatarPreview(loadedProfile.avatar_url || '')
      setBannerUrl(loadedProfile.banner_url || '')
      setBannerPreview(loadedProfile.banner_url || '')
      setShowSensitiveContent(
        Boolean(loadedProfile.wants_18_plus && loadedProfile.age_verification_status === 'approved')
      )

      if (loadedProfile.is_minor) {
        await loadLatestParentalConsentRequest(user.id)
      }

      await Promise.all([
        loadProfileActivity(user.id, loadedProfile),
        loadLikes(),
        loadComments(),
        loadBookmarks(user.id),
        loadReposts(loadedProfile),
        loadUnreadNotificationsCount(user.id),
      ])

      setLoading(false)
    }

    loadPage()
  }, [router])

  async function loadUnreadNotificationsCount(currentUserId: string) {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', currentUserId)
      .eq('read', false)

    if (error) {
      setMessage(t('profile.messages.loadNotificationsError') + error.message)
      return
    }

    setUnreadNotificationsCount(count || 0)
  }

  async function loadLatestParentalConsentRequest(currentUserId: string) {
    const { data, error } = await supabase
      .from('parental_consent_requests')
      .select('id, child_user_id, guardian_email, token, status, child_birth_date, expires_at, created_at')
      .eq('child_user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Erro ao carregar autorizacao parental:', error.message)
      return
    }

    const request = data as ParentalConsentRequest | null
    setLatestConsentRequest(request)
    setGuardianEmail(request?.guardian_email || '')
    setConsentRequestLink(request?.token ? `/parental-consent/${request.token}` : '')
  }

  async function handleCreateParentalConsentRequest() {
    if (!userId) return

    const normalizedGuardianEmail = guardianEmail.trim().toLowerCase()

    if (!normalizedGuardianEmail || !normalizedGuardianEmail.includes('@')) {
      setMessage('Informe um e-mail valido do responsavel.')
      return
    }

    setCreatingConsentRequest(true)
    setMessage('')

    const consentText =
      'Voce esta autorizando o uso geral da plataforma EntreUS por um menor. Conteudos 18+ permanecem bloqueados para menores.'

    const { data, error } = await supabase
      .from('parental_consent_requests')
      .insert({
        child_user_id: userId,
        guardian_email: normalizedGuardianEmail,
        child_birth_date: birthDate || null,
        consent_text: consentText,
        status: 'pending',
      })
      .select('id, child_user_id, guardian_email, token, status, child_birth_date, expires_at, created_at')
      .single()

    if (error) {
      setCreatingConsentRequest(false)
      setMessage('Nao foi possivel criar solicitacao de autorizacao: ' + error.message)
      return
    }

    const request = data as ParentalConsentRequest

    await supabase
      .from('profiles')
      .update({
        parental_consent_status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    setLatestConsentRequest(request)
    setParentalConsentStatus('pending')
    setConsentRequestLink(`/parental-consent/${request.token}`)
    setCreatingConsentRequest(false)
    setMessage('Solicitacao criada. Envie o link gerado para seu responsavel.')
  }

  function sanitizeUsername(value: string) {
    return value
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 30)
  }

  async function loadLikes() {
    const { data, error } = await supabase
      .from('likes')
      .select('id, post_id, user_id')

    if (error) {
      setMessage(t('profile.messages.loadLikesError') + error.message)
      return
    }

    setLikes(data || [])
  }

  async function loadComments() {
    const { data, error } = await supabase
      .from('comments')
      .select('id, post_id, user_id')

    if (error) {
      setMessage(t('profile.messages.loadCommentsError') + error.message)
      return
    }

    setComments(data || [])
  }

  async function loadBookmarks(currentUserId: string = userId) {
    if (!currentUserId) return

    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, post_id, user_id, created_at')
      .eq('user_id', currentUserId)

    if (error) {
      setMessage(t('profile.messages.loadSavedError') + error.message)
      return
    }

    setBookmarks(data || [])
  }

  async function loadReposts(currentProfileData: Profile | null = profile) {
    const { data, error } = await supabase
      .from('reposts')
      .select('id, post_id, user_id, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(t('profile.messages.loadRepostsError') + error.message)
      return
    }

    const rawReposts = data || []

    const repostUserIds = Array.from(
      new Set(rawReposts.map((repost) => repost.user_id).filter(Boolean))
    )

    let profilesById: Record<string, ProfileSummary> = {}

    if (repostUserIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', repostUserIds)

      if (profilesError) {
        console.error('Erro ao carregar perfis dos reposts:', profilesError.message)
      }

      profilesById = ((profilesData || []) as (ProfileSummary & { id: string })[]).reduce(
        (acc, profileItem) => {
          acc[profileItem.id] = {
            username: profileItem.username,
            display_name: profileItem.display_name,
            avatar_url: profileItem.avatar_url,
          }

          return acc
        },
        {} as Record<string, ProfileSummary>
      )
    }

    const normalizedReposts: Repost[] = rawReposts.map((repost) => {
      const isCurrentUser = repost.user_id === userId

      return {
        ...repost,
        profiles:
          profilesById[repost.user_id] ||
          (isCurrentUser && currentProfileData
            ? {
              username: currentProfileData.username || 'usuario',
              display_name: currentProfileData.display_name,
              avatar_url: currentProfileData.avatar_url,
            }
            : null),
      }
    })

    setReposts(normalizedReposts)
  }

  async function loadProfileActivity(currentUserId: string, currentProfileData: Profile) {
    const { data: myRepostsData, error: myRepostsError } = await supabase
      .from('reposts')
      .select('id, post_id, user_id, created_at')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })

    if (myRepostsError) {
      setMessage(t('profile.messages.loadYourRepostsError') + myRepostsError.message)
      return
    }

    const repostPostIds = (myRepostsData || []).map((repost) => repost.post_id)

    const { data: ownPostsData, error: ownPostsError } = await supabase
      .from('posts')
      .select(`
        id,
        content,
        category,
        created_at,
        user_id,
        image_url,
        video_url,
        visibility,
        is_sensitive,
        profiles (
          username,
          display_name,
          avatar_url
        )
      `)
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })

    if (ownPostsError) {
      setMessage(t('profile.messages.loadYourPostsError') + ownPostsError.message)
      return
    }

    const ownPosts = (ownPostsData || []).map((post: any) => ({
      ...post,
      visibility: (post.visibility || 'public') as VisibilityType,
      is_sensitive: post.is_sensitive || false,
      profiles: Array.isArray(post.profiles)
        ? post.profiles[0] || null
        : post.profiles,
    })) as Post[]

    let repostedPosts: Post[] = []

    if (repostPostIds.length > 0) {
      const { data: repostedPostsData, error: repostedPostsError } = await supabase
        .from('posts')
        .select(`
          id,
          content,
          category,
          created_at,
          user_id,
          image_url,
          video_url,
          visibility,
          is_sensitive,
          profiles (
            username,
            display_name,
            avatar_url
          )
        `)
        .in('id', repostPostIds)

      if (repostedPostsError) {
        setMessage(t('profile.messages.loadRepostedPostsError') + repostedPostsError.message)
        return
      }

      repostedPosts = (repostedPostsData || []).map((post: any) => ({
        ...post,
        visibility: (post.visibility || 'public') as VisibilityType,
        is_sensitive: post.is_sensitive || false,
        profiles: Array.isArray(post.profiles)
          ? post.profiles[0] || null
          : post.profiles,
      })) as Post[]
    }

    const allPostsMap = new Map<string, Post>()

    for (const post of [...ownPosts, ...repostedPosts]) {
      allPostsMap.set(post.id, post)
    }

    const allPosts = Array.from(allPostsMap.values())
    const allPostIds = allPosts.map((post) => post.id)

    let mediaByPost: Record<string, PostMedia[]> = {}

    if (allPostIds.length > 0) {
      const { data: mediaData, error: mediaError } = await supabase
        .from('post_media')
        .select('id, post_id, user_id, media_url, media_type, position, created_at')
        .in('post_id', allPostIds)
        .order('position', { ascending: true })

      if (mediaError) {
        console.error('Erro ao carregar mídias do perfil:', mediaError.message)
      }

      mediaByPost = ((mediaData || []) as PostMedia[]).reduce(
        (acc, mediaItem) => {
          if (!acc[mediaItem.post_id]) acc[mediaItem.post_id] = []
          acc[mediaItem.post_id].push(mediaItem)
          return acc
        },
        {} as Record<string, PostMedia[]>
      )
    }

    const normalizedPosts = allPosts.map((post) => ({
      ...post,
      media: mediaByPost[post.id] || [],
    }))

    setPosts(normalizedPosts)

    const currentUserReposts: Repost[] = (myRepostsData || []).map((repost) => ({
      ...repost,
      profiles: {
        username: currentProfileData.username || 'usuario',
        display_name: currentProfileData.display_name,
        avatar_url: currentProfileData.avatar_url,
      },
    }))

    setReposts((current) => {
      const otherReposts = current.filter((repost) => repost.user_id !== currentUserId)
      return [...otherReposts, ...currentUserReposts]
    })
  }

  async function handleAvatarSelect(file: File | null) {
    if (!file || !userId) return

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']

    if (!allowedTypes.includes(file.type)) {
      setMessage(t('profile.messages.invalidAvatarType'))
      return
    }

    const maxSizeInBytes = 5 * 1024 * 1024

    if (file.size > maxSizeInBytes) {
      setMessage(t('profile.messages.avatarTooLarge'))
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
      setMessage(t('profile.messages.uploadAvatarError') + uploadError.message)
      setUploadingAvatar(false)
      return
    }

    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)

    setAvatarUrl(publicUrlData.publicUrl)
    setAvatarPreview(publicUrlData.publicUrl)
    setUploadingAvatar(false)
    setMessage(t('profile.messages.avatarUpdated'))
  }

  async function handleBannerSelect(file: File | null) {
    if (!file || !userId) return

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']

    if (!allowedTypes.includes(file.type)) {
      setMessage(t('profile.messages.invalidBannerType'))
      return
    }

    const maxSizeInBytes = 10 * 1024 * 1024

    if (file.size > maxSizeInBytes) {
      setMessage(t('profile.messages.bannerTooLarge'))
      return
    }

    setUploadingBanner(true)
    setMessage('')

    const previewUrl = URL.createObjectURL(file)
    setBannerPreview(previewUrl)

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filePath = `${userId}/banner-${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('profile-banners')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadError) {
      setMessage(t('profile.messages.uploadBannerError') + uploadError.message)
      setUploadingBanner(false)
      return
    }

    const { data: publicUrlData } = supabase.storage
      .from('profile-banners')
      .getPublicUrl(filePath)

    setBannerUrl(publicUrlData.publicUrl)
    setBannerPreview(publicUrlData.publicUrl)
    setUploadingBanner(false)
    setMessage(t('profile.messages.bannerUpdated'))
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()

    if (!userId) return

    const normalizedUsername = sanitizeUsername(username)

    if (!normalizedUsername) {
      setMessage(t('profile.messages.invalidUsername'))
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
      setMessage(t('profile.messages.usernameCheckError') + usernameCheckError.message)
      setSaving(false)
      return
    }

    if (existingUsername) {
      setMessage(t('profile.messages.usernameInUse'))
      setSaving(false)
      return
    }

    const calculatedAge = calculateAge(birthDate)
    const nextIsMinor = calculatedAge !== null ? calculatedAge < 18 : false
    const nextWants18Plus = nextIsMinor ? false : wants18Plus
    const nextParentalConsentStatus = nextIsMinor
      ? parentalConsentStatus === 'not_required'
        ? 'pending'
        : parentalConsentStatus
      : 'not_required'
    const nextAgeVerificationStatus =
      nextWants18Plus && ageVerificationStatus === 'not_started'
        ? 'pending'
        : ageVerificationStatus
    const nextShowSensitiveContent =
      nextWants18Plus && nextAgeVerificationStatus === 'approved'

    if (nextIsMinor && wants18Plus) {
      setMessage('Menores de 18 anos nao podem ativar conteudo 18+.')
      setSaving(false)
      return
    }

    const payload = {
      id: userId,
      username: normalizedUsername,
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
      avatar_url: avatarUrl || null,
      banner_url: bannerUrl || null,
      country: country.trim() || null,
      city: city.trim() || null,
      state: stateName.trim() || null,
      website_url: websiteUrl.trim() || null,
      website_title: websiteTitle.trim() || null,
      birth_date: birthDate || null,
      is_minor: nextIsMinor,
      parental_consent_status: nextParentalConsentStatus,
      wants_18_plus: nextWants18Plus,
      age_verification_status: nextAgeVerificationStatus,
      show_sensitive_content: nextShowSensitiveContent,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('profiles').upsert(payload)

    if (error) {
      setMessage(t('profile.messages.saveProfileError') + error.message)
      setSaving(false)
      return
    }

    const updatedProfile: Profile = {
      id: userId,
      username: normalizedUsername,
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
      avatar_url: avatarUrl || null,
      banner_url: bannerUrl || null,
      country: country.trim() || null,
      city: city.trim() || null,
      state: stateName.trim() || null,
      website_url: websiteUrl.trim() || null,
      website_title: websiteTitle.trim() || null,
      birth_date: birthDate || null,
      is_minor: nextIsMinor,
      parental_consent_status: nextParentalConsentStatus,
      wants_18_plus: nextWants18Plus,
      age_verification_status: nextAgeVerificationStatus,
      age_verified_at: profile?.age_verified_at || null,
      show_sensitive_content: nextShowSensitiveContent,
    }

    setUsername(normalizedUsername)
    setIsMinor(nextIsMinor)
    setParentalConsentStatus(nextParentalConsentStatus)
    setWants18Plus(nextWants18Plus)
    setAgeVerificationStatus(nextAgeVerificationStatus)
    setShowSensitiveContent(nextShowSensitiveContent)
    setProfile(updatedProfile)

    setMessage(t('profile.messages.profileSaved'))
    setSaving(false)

    await loadProfileActivity(userId, updatedProfile)
    await loadReposts(updatedProfile)
  }

  async function handleToggleBookmark(postId: string) {
    if (!userId) return

    const existingBookmark = bookmarks.find(
      (bookmark) => bookmark.post_id === postId && bookmark.user_id === userId
    )

    if (existingBookmark) {
      setBookmarks((current) =>
        current.filter((bookmark) => bookmark.id !== existingBookmark.id)
      )

      const { error } = await supabase
        .from('bookmarks')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId)

      if (error) {
        setMessage(t('profile.messages.removeSavedError') + error.message)
        await loadBookmarks(userId)
      }

      return
    }

    const optimisticBookmark: BookmarkItem = {
      id: crypto.randomUUID(),
      post_id: postId,
      user_id: userId,
      created_at: new Date().toISOString(),
    }

    setBookmarks((current) => [...current, optimisticBookmark])

    const { data, error } = await supabase
      .from('bookmarks')
      .insert({
        post_id: postId,
        user_id: userId,
      })
      .select('id, post_id, user_id, created_at')
      .single()

    if (error) {
      setMessage(t('profile.messages.savePostError') + error.message)
      await loadBookmarks(userId)
      return
    }

    if (data) {
      setBookmarks((current) =>
        current.map((bookmark) =>
          bookmark.id === optimisticBookmark.id ? data : bookmark
        )
      )
    }
  }

  async function handleToggleRepost(postId: string) {
    if (!userId || !profile) return

    const repostedPost = posts.find((post) => post.id === postId)

    if (repostedPost?.user_id === userId) {
      setMessage(t('profile.messages.ownRepost'))
      return
    }

    const existingRepost = reposts.find(
      (repost) => repost.post_id === postId && repost.user_id === userId
    )

    if (existingRepost) {
      setReposts((current) =>
        current.filter((repost) => repost.id !== existingRepost.id)
      )

      const { error } = await supabase
        .from('reposts')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId)

      if (error) {
        setMessage(t('profile.messages.removeRepostError') + error.message)
        await loadReposts(profile)
      }

      return
    }

    const optimisticRepost: Repost = {
      id: crypto.randomUUID(),
      post_id: postId,
      user_id: userId,
      created_at: new Date().toISOString(),
      profiles: {
        username: profile.username || 'usuario',
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      },
    }

    setReposts((current) => [optimisticRepost, ...current])

    const { data, error } = await supabase
      .from('reposts')
      .insert({
        post_id: postId,
        user_id: userId,
      })
      .select('id, post_id, user_id, created_at')
      .single()

    if (error) {
      setMessage(t('profile.messages.repostError') + error.message)
      await loadReposts(profile)
      return
    }

    if (data) {
      setReposts((current) =>
        current.map((repost) =>
          repost.id === optimisticRepost.id
            ? {
              ...data,
              profiles: optimisticRepost.profiles,
            }
            : repost
        )
      )
    }
  }

  async function handleToggleLike(postId: string) {
    if (!userId) return

    const existingLike = likes.find(
      (like) => like.post_id === postId && like.user_id === userId
    )

    if (existingLike) {
      setLikes((current) => current.filter((like) => like.id !== existingLike.id))

      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('id', existingLike.id)

      if (error) {
        setMessage(t('profile.messages.removeLikeError') + error.message)
        await loadLikes()
      }

      return
    }

    const optimisticLike: Like = {
      id: crypto.randomUUID(),
      post_id: postId,
      user_id: userId,
    }

    setLikes((current) => [...current, optimisticLike])

    const { data, error } = await supabase
      .from('likes')
      .insert({
        post_id: postId,
        user_id: userId,
      })
      .select('id, post_id, user_id')
      .single()

    if (error) {
      setMessage(t('profile.messages.likeError') + error.message)
      await loadLikes()
      return
    }

    if (data) {
      setLikes((current) =>
        current.map((like) => (like.id === optimisticLike.id ? data : like))
      )
    }
  }

  async function handleCopyPostLink(postId: string) {
    const url = `${window.location.origin}/post/${postId}`

    try {
      await navigator.clipboard.writeText(url)
      setCopiedPostId(postId)

      setTimeout(() => {
        setCopiedPostId((current) => (current === postId ? null : current))
      }, 2000)
    } catch {
      setMessage(t('profile.messages.copyPostError'))
    }
  }

  async function handleDeletePost(postId: string) {
    const confirmDelete = window.confirm(t('profile.messages.confirmDeletePost'))

    if (!confirmDelete) return

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', userId)

    if (error) {
      setMessage(t('profile.messages.deletePostError') + error.message)
      return
    }

    setMessage(t('profile.messages.postDeleted'))

    if (profile) {
      await loadProfileActivity(userId, profile)
      await loadReposts(profile)
    }
  }

  async function handleReportPost(postId: string, postOwnerId: string) {
    if (!userId) return

    if (postOwnerId === userId) {
      setMessage(t('profile.messages.ownReport'))
      return
    }

    const reason = window.prompt(t('profile.messages.reportPrompt'))

    if (!reason || !reason.trim()) return

    setReportingPostId(postId)
    setMessage('')

    const { error } = await supabase.from('reports').insert({
      reporter_id: userId,
      reported_post_id: postId,
      reported_user_id: postOwnerId,
      reason: reason.trim(),
    })

    if (error) {
      setMessage(t('profile.messages.reportPostError') + error.message)
      setReportingPostId(null)
      return
    }

    setReportedPostIds((prev) => [...prev, postId])
    setMessage(t('profile.messages.reportSuccess'))
    setReportingPostId(null)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleToggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  function handlePostClick() {
    router.push('/feed')
  }

  const feedItems = useMemo<FeedItem[]>(() => {
    const postMap = new Map<string, Post>()

    for (const post of posts) {
      postMap.set(post.id, post)
    }

    const ownPostItems: FeedItem[] = posts
      .filter((post) => post.user_id === userId)
      .map((post) => ({
        type: 'post',
        id: `post-${post.id}`,
        created_at: post.created_at,
        post,
      }))

    const myRepostItems = reposts
      .filter((repost) => repost.user_id === userId)
      .map((repost) => {
        const originalPost = postMap.get(repost.post_id)

        if (!originalPost) return null

        return {
          type: 'repost' as const,
          id: `repost-${repost.id}`,
          created_at: repost.created_at,
          post: originalPost,
          repost,
        }
      })
      .filter((item): item is Extract<FeedItem, { type: 'repost' }> => item !== null)

    return [...ownPostItems, ...myRepostItems].sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [posts, reposts, userId])

  const suggestedProfiles = useMemo(() => {
    const suggestions = new Map<string, ProfileSummary>()

    for (const item of feedItems) {
      const itemProfile = item.post.profiles

      if (!itemProfile?.username || itemProfile.username === username) {
        continue
      }

      suggestions.set(itemProfile.username, itemProfile)
    }

    return Array.from(suggestions.values()).slice(0, 3)
  }, [feedItems, username])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 text-black dark:bg-black dark:text-white">
        <p>{t('profile.loading')}</p>
      </main>
    )
  }

  const publicProfileUrl = username ? `/u/${username}` : '#'
  const profileAge = calculateAge(birthDate)
  const canRequest18Plus = profileAge !== null && profileAge >= 18 && !isMinor
  const canView18Plus = wants18Plus && ageVerificationStatus === 'approved'
  const parentalConsentDisplayStatus = latestConsentRequest?.status || parentalConsentStatus
  const parentalConsentLabel = getParentalConsentLabel(
    parentalConsentDisplayStatus,
    Boolean(latestConsentRequest)
  )
  const profileName = displayName || username || 'Usuário'

  return (
    <main className="min-h-screen overflow-x-hidden bg-zinc-50 text-black transition-colors dark:bg-black dark:text-white">
      <AppSidebar
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        displayName={displayName || username || undefined}
        username={username || null}
        email={email}
        avatarUrl={avatarPreview || avatarUrl || null}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
      />

      <MobileNavigation
        email={email}
        displayName={displayName || username || t('nav.myProfile')}
        avatarUrl={avatarPreview || avatarUrl || null}
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
        onPostClick={handlePostClick}
      />

      <section className="w-full overflow-x-hidden px-3 py-16 pb-24 sm:px-6 sm:py-20 lg:mx-auto lg:max-w-[1280px] lg:px-0 lg:py-8 lg:pl-[104px]">
        <div className="mx-auto grid w-full grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,40rem)_20rem]">
            <div className="min-w-0">
        <BrandHeader
          subtitle={t('profile.myProfile')}
          description={t('profile.description')}
          compact
          rightContent={
            <div className="flex flex-wrap items-start gap-2">
              {username && (
                <Link
                  href={publicProfileUrl}
                  className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-zinc-300 bg-white px-4 text-sm font-semibold leading-none text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
                >
                  Ver perfil público
                </Link>
              )}

              <Link
                href="/feed"
                className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-zinc-300 bg-white px-4 text-sm font-semibold leading-none text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
              >
                Voltar ao feed
              </Link>
            </div>
          }
        />

        {message && (
          <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {message}
          </div>
        )}

        <form
          onSubmit={handleSaveProfile}
          className="mt-5 overflow-hidden rounded-[2rem] border border-zinc-200/70 bg-white/95 shadow-sm ring-1 ring-black/5 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-black/80 dark:ring-white/10"
        >
          <div className="flex flex-col">
            <div className="relative">
              <button
                type="button"
                onClick={() => bannerPreview && setShowBannerModal(true)}
                disabled={!bannerPreview}
                className="group relative flex h-44 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-zinc-100 via-zinc-200 to-zinc-300 text-zinc-500 transition hover:opacity-95 disabled:cursor-default dark:from-zinc-900 dark:via-zinc-800 dark:to-black dark:text-zinc-400 sm:h-64"
                title={bannerPreview ? t('profile.banner.viewTitle') : t('profile.banner.fallbackTitle')}
                aria-label={bannerPreview ? t('profile.banner.viewTitle') : t('profile.banner.fallbackTitle')}
              >
                {bannerPreview ? (
                  <img
                    src={bannerPreview}
                    alt={`${t('profile.modal.bannerOf')} ${profileName}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 px-4 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 text-zinc-600 shadow-sm dark:bg-black/40 dark:text-zinc-300">
                      <ImageIcon className="h-7 w-7" />
                    </div>
                    <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                      Adicione uma capa ao seu perfil
                    </span>
                    <span className="max-w-md text-xs text-zinc-500 dark:text-zinc-400">
                      Use uma imagem horizontal para deixar seu perfil mais profissional.
                    </span>
                  </div>
                )}

                <span className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

                {bannerPreview && (
                  <span className="absolute inset-0 hidden items-center justify-center bg-black/35 text-white transition group-hover:flex">
                    <Maximize2 className="h-6 w-6" />
                  </span>
                )}
              </button>

              <label
                htmlFor="profile-banner-upload"
                onClick={(event) => event.stopPropagation()}
                className="absolute right-3 top-3 z-50 inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/20 bg-black/55 px-3 text-xs font-bold text-white shadow-xl backdrop-blur-xl transition hover:scale-[1.02] hover:bg-black/75 sm:right-4 sm:top-4"
                title={t('profile.banner.changeTitle')}
              >
                <ImageIcon className="h-4 w-4" />
                <span className="hidden sm:inline">{bannerPreview ? t('profile.banner.change') : t('profile.banner.add')}</span>

                <input
                  id="profile-banner-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onClick={(event) => event.stopPropagation()}
                  onChange={(e) => handleBannerSelect(e.target.files?.[0] || null)}
                  className="sr-only"
                />
              </label>
            </div>

            <div className="px-4 pb-6 sm:px-6">
              <div className="relative z-10 -mt-16 flex flex-col gap-5 sm:-mt-20 sm:flex-row">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="flex flex-col items-center gap-3 sm:items-start">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => avatarPreview && setShowAvatarModal(true)}
                        disabled={!avatarPreview}
                        className="group relative h-32 w-32 overflow-hidden rounded-full border-4 border-white bg-zinc-100 text-zinc-700 shadow-xl ring-1 ring-black/10 transition hover:opacity-95 disabled:cursor-default dark:border-black dark:bg-zinc-800 dark:text-zinc-300 dark:ring-white/10 sm:h-40 sm:w-40"
                        title={avatarPreview ? t('profile.avatar.viewTitle') : t('profile.avatar.fallbackTitle')}
                        aria-label={avatarPreview ? t('profile.avatar.viewTitle') : t('profile.avatar.fallbackTitle')}
                      >
                        {avatarPreview ? (
                          <img
                            src={avatarPreview}
                            alt={profileName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-5xl font-bold">
                            {profileName.charAt(0).toUpperCase()}
                          </span>
                        )}

                        {avatarPreview && (
                          <span className="absolute inset-0 hidden items-center justify-center bg-black/45 text-white transition group-hover:flex">
                            <Maximize2 className="h-6 w-6" />
                          </span>
                        )}
                      </button>

                      <label
                        className="absolute bottom-1 right-1 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/80 bg-black/70 text-white shadow-xl backdrop-blur-xl transition hover:scale-105 hover:bg-black dark:border-zinc-950"
                        title={t('profile.avatar.changeTitle')}
                        aria-label={t('profile.avatar.changeTitle')}
                      >
                        <Camera className="h-4 w-4" />

                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => handleAvatarSelect(e.target.files?.[0] || null)}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="min-w-0 max-w-full pt-3 text-center sm:pt-16 sm:text-left">
                    <h2 className="flex max-w-full flex-wrap items-center justify-center gap-2 text-2xl font-black leading-tight tracking-tight text-black dark:text-white sm:justify-start sm:text-4xl">
                      <span className="shrink-0">
                        <UserBadges userId={userId} size="md" max={1} />
                      </span>

                      <span className="min-w-0 max-w-full break-words leading-tight [overflow-wrap:anywhere]">
                        {profileName}
                      </span>
                    </h2>

                    <p className="mt-1 break-all text-sm font-medium text-zinc-500 dark:text-zinc-400 sm:text-base">
                      @{username || t('profile.edit.usernamePlaceholder')}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-sm text-zinc-500 dark:text-zinc-400 sm:justify-start">
                      <span className="inline-flex items-baseline gap-1">
                        <span className="font-black text-zinc-950 dark:text-white">
                          {posts.filter((post) => post.user_id === userId).length}
                        </span>
                        <span>Publica&ccedil;&otilde;es</span>
                      </span>

                      <span className="text-zinc-300 dark:text-zinc-700">
                        &middot;
                      </span>

                      <span className="inline-flex items-baseline gap-1">
                        <span className="font-black text-zinc-950 dark:text-white">
                          {reposts.filter((repost) => repost.user_id === userId).length}
                        </span>
                        <span>Reposts</span>
                      </span>

                      <span className="text-zinc-300 dark:text-zinc-700">
                        &middot;
                      </span>

                      <span className="inline-flex items-baseline gap-1">
                        <span className="font-black text-zinc-950 dark:text-white">
                          {feedItems.length}
                        </span>
                        <span>Atividades</span>
                      </span>
                    </div>

                    {bio && (
                      <p className="mt-3 max-w-2xl whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700 dark:text-zinc-300 sm:text-base">
                        {bio}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                      <Link
                        href={publicProfileUrl}
                        className={`inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-zinc-200 bg-white/80 px-4 text-sm font-bold leading-none text-zinc-900 shadow-sm transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/80 dark:text-white dark:hover:bg-zinc-900 ${!username ? 'pointer-events-none opacity-50' : ''}`}
                      >
                        Ver p&uacute;blico
                      </Link>

                      <Link
                        href="/feed"
                        className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-zinc-950 px-4 text-sm font-bold leading-none text-white shadow-sm transition hover:scale-[1.02] hover:bg-black dark:bg-white dark:text-black"
                      >
                        Ir ao feed
                      </Link>
                    </div>
                  </div>
                </div>

              </div>

              {(uploadingAvatar || uploadingBanner) && (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                  {uploadingAvatar && <p>{t('profile.actions.uploadingAvatar')}</p>}
                  {uploadingBanner && <p>{t('profile.actions.uploadingBanner')}</p>}
                </div>
              )}

              <div className="mt-6 border-t border-zinc-200/70 pt-5 dark:border-zinc-800/70">
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-zinc-950 dark:text-white">
                      Editar informações
                    </h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      Essas informações aparecem no seu perfil público.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                      Nome de exibição
                    </label>

                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t('profile.edit.displayNamePlaceholder')}
                      className="w-full rounded-2xl border border-zinc-200/80 bg-zinc-100/70 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:focus:border-blue-500/70 dark:focus:bg-zinc-950 sm:text-base"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                      Username
                    </label>

                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(sanitizeUsername(e.target.value))}
                      placeholder={t('profile.edit.usernamePlaceholder')}
                      className="w-full rounded-2xl border border-zinc-200/80 bg-zinc-100/70 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:focus:border-blue-500/70 dark:focus:bg-zinc-950 sm:text-base"
                    />

                    <p className="mt-2 text-xs text-zinc-500">
                      Use letras minúsculas, números e underline.
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                      Bio
                    </label>

                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder={t('profile.edit.bioPlaceholder')}
                      className="min-h-28 w-full resize-none rounded-2xl border border-zinc-200/80 bg-zinc-100/70 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:focus:border-blue-500/70 dark:focus:bg-zinc-950 sm:text-base"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                        País
                      </label>

                      <input
                        type="text"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder={t('profile.edit.countryPlaceholder')}
                        className="w-full rounded-2xl border border-zinc-200/80 bg-zinc-100/70 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:focus:border-blue-500/70 dark:focus:bg-zinc-950 sm:text-base"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                          <MapPin className="h-4 w-4" />
                          Cidade
                        </label>

                        <input
                          type="text"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="Ex.: Ariquemes"
                          className="w-full rounded-2xl border border-zinc-200/80 bg-zinc-100/70 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:focus:border-blue-500/70 dark:focus:bg-zinc-950 sm:text-base"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                          Estado
                        </label>

                        <input
                          type="text"
                          value={stateName}
                          onChange={(e) => setStateName(e.target.value)}
                          placeholder="Ex.: Rondônia"
                          className="w-full rounded-2xl border border-zinc-200/80 bg-zinc-100/70 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:focus:border-blue-500/70 dark:focus:bg-zinc-950 sm:text-base"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                          <LinkIcon className="h-4 w-4" />
                          Título do link
                        </label>

                        <input
                          type="text"
                          value={websiteTitle}
                          onChange={(e) => setWebsiteTitle(e.target.value)}
                          placeholder="Ex.: Minha loja, Meu portfólio"
                          className="w-full rounded-2xl border border-zinc-200/80 bg-zinc-100/70 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:focus:border-blue-500/70 dark:focus:bg-zinc-950 sm:text-base"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                          Link pessoal ou profissional
                        </label>

                        <input
                          type="url"
                          value={websiteUrl}
                          onChange={(e) => setWebsiteUrl(e.target.value)}
                          placeholder="https://seulink.com"
                          className="w-full rounded-2xl border border-zinc-200/80 bg-zinc-100/70 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:focus:border-blue-500/70 dark:focus:bg-zinc-950 sm:text-base"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                        Data de nascimento
                      </label>

                      <input
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        disabled={Boolean(profile?.birth_date)}
                        max={new Date().toISOString().slice(0, 10)}
                        className="w-full rounded-2xl border border-zinc-200/80 bg-zinc-100/70 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:focus:border-blue-500/70 dark:focus:bg-zinc-950 sm:text-base"
                      />
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                        {profileAge !== null
                          ? `${profileAge} anos. ${isMinor ? 'Perfil marcado como menor de 18.' : 'Perfil maior de 18.'}`
                          : 'Informe sua data de nascimento.'}
                        {profile?.birth_date ? ' A data ja registrada nao pode ser alterada por aqui.' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-blue-200/70 bg-blue-50/70 p-4 ring-1 ring-blue-100/70 dark:border-blue-900/50 dark:bg-blue-950/10 dark:ring-blue-900/20">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex gap-3">
                        <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          <ShieldAlert className="h-5 w-5" />
                        </div>

                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
                            Quero visualizar conteudo 18+
                          </p>
                          <h3 className="font-semibold text-zinc-900 dark:text-white">
                            Preferência de conteúdo 18+
                          </h3>

                          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                            Quando ativado, publicações adultas ou sensíveis poderão aparecer no seu feed.
                          </p>

                          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                            Quando desativado, o feed poderá ocultar esse tipo de conteúdo.
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-blue-300/20 bg-white/60 px-4 py-3 text-sm text-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-300 sm:max-w-xs">
                        <p className="font-bold">{getAgeVerificationLabel(ageVerificationStatus)}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {wants18Plus && !canView18Plus
                            ? 'Preferencia registrada. A liberacao depende de verificacao futura.'
                            : isMinor
                              ? `Consentimento parental: ${parentalConsentStatus}.`
                              : 'Apenas perfis com verificacao aprovada visualizam 18+.'}
                        </p>
                      </div>

                      {isMinor ? (
                        <span className="rounded-full border border-zinc-200/70 bg-zinc-100/80 px-4 py-3 text-sm font-bold text-zinc-500 dark:border-zinc-800/70 dark:bg-zinc-900/80 dark:text-zinc-500">
                          18+ bloqueado
                        </span>
                      ) : ageVerificationStatus === 'approved' ? (
                        <span className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                          Verificacao aprovada
                        </span>
                      ) : ageVerificationStatus === 'pending' ? (
                        <span className="rounded-full border border-blue-300/30 bg-blue-500/10 px-4 py-3 text-sm font-bold text-blue-700 dark:text-blue-300">
                          Em analise
                        </span>
                      ) : (
                        <Link
                          href="/age-verification"
                          className="rounded-full border border-blue-300/70 bg-white/80 px-4 py-3 text-sm font-bold text-zinc-900 shadow-sm transition hover:bg-white dark:border-blue-800/70 dark:bg-zinc-950/80 dark:text-white dark:hover:bg-zinc-950"
                        >
                          Solicitar verificacao 18+
                        </Link>
                      )}
                    </div>
                  </div>

                  {isMinor && (
                    <div className="rounded-3xl border border-cyan-200/70 bg-cyan-50/70 p-4 ring-1 ring-cyan-100/70 dark:border-cyan-900/50 dark:bg-cyan-950/10 dark:ring-cyan-900/20">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex gap-3">
                          <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                            <ShieldAlert className="h-5 w-5" />
                          </div>

                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                              Autorizacao do responsavel
                            </p>
                            <h3 className="mt-1 font-semibold text-zinc-900 dark:text-white">
                              Status: {parentalConsentLabel}
                            </h3>

                            {parentalConsentDisplayStatus === 'approved' ? (
                              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                                Autorizacao do responsavel aprovada.
                              </p>
                            ) : parentalConsentDisplayStatus === 'rejected' ? (
                              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                                Autorizacao recusada pelo responsavel.
                              </p>
                            ) : (
                              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                                Informe o e-mail do responsavel para gerar um link de autorizacao de teste.
                              </p>
                            )}

                            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                              Consentimento parental nao libera conteudo 18+. Esse conteudo continua bloqueado para menores.
                            </p>
                          </div>
                        </div>

                        {parentalConsentDisplayStatus !== 'approved' && (
                          <div className="w-full space-y-3 lg:max-w-sm">
                            <label className="block">
                              <span className="mb-2 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                E-mail do responsavel
                              </span>
                              <input
                                type="email"
                                value={guardianEmail}
                                onChange={(e) => setGuardianEmail(e.target.value)}
                                placeholder="responsavel@email.com"
                                className="w-full rounded-2xl border border-zinc-200/80 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800/80 dark:bg-zinc-950/80 dark:focus:border-blue-500/70"
                              />
                            </label>

                            <button
                              type="button"
                              onClick={handleCreateParentalConsentRequest}
                              disabled={creatingConsentRequest}
                              className="w-full rounded-full bg-cyan-600 px-5 py-3 text-sm font-black text-white shadow-sm shadow-cyan-600/20 transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {creatingConsentRequest ? 'Gerando...' : 'Solicitar autorizacao'}
                            </button>
                          </div>
                        )}
                      </div>

                      {consentRequestLink && parentalConsentDisplayStatus !== 'approved' && (
                        <div className="mt-4 rounded-2xl border border-cyan-300/30 bg-white/70 p-4 text-sm text-zinc-700 dark:bg-zinc-950/70 dark:text-zinc-300">
                          <p className="font-bold">
                            Envie este link para seu responsavel aprovar sua autorizacao.
                          </p>
                          <Link
                            href={consentRequestLink}
                            className="mt-2 block break-all font-semibold text-cyan-700 underline-offset-4 hover:underline dark:text-cyan-300"
                          >
                            {consentRequestLink}
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="submit"
                    disabled={saving || uploadingAvatar || uploadingBanner}
                    className={`w-full rounded-full px-6 py-3 font-bold shadow-sm transition sm:w-auto ${saving || uploadingAvatar || uploadingBanner
                      ? 'cursor-not-allowed bg-zinc-300 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'
                      : 'bg-zinc-950 text-white hover:scale-[1.02] hover:bg-black dark:bg-white dark:text-black'
                      }`}
                  >
                    {saving ? t('profile.actions.saving') : t('profile.actions.save')}
                  </button>

                  {username && (
                    <Link
                      href={publicProfileUrl}
                      className="w-full rounded-full border border-zinc-200 bg-white/70 px-6 py-3 text-center font-bold text-zinc-900 transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-white dark:hover:bg-zinc-900 sm:w-auto"
                    >
                      Abrir perfil público
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </form>

        {userId && (
          <div className="mt-8">
            <UserBadgesPanel
              userId={userId}
              title={t('profile.badges.title')}
              emptyMessage={t('profile.badges.empty')}
            />
          </div>
        )}

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-zinc-950 dark:text-white">
                Minhas atividades
              </h2>

              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Suas publicações e reposts aparecem aqui.
              </p>
            </div>

            <Link
              href="/feed"
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:hover:bg-zinc-900"
            >
              Ir ao feed
            </Link>
          </div>

          <div className="space-y-4 sm:space-y-5">
            {feedItems.length === 0 && (
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <p className="font-medium text-zinc-800 dark:text-zinc-200">
                  Nenhuma atividade ainda.
                </p>

                <p className="mt-1 text-sm">
                  Quando você publicar ou repostar algo, aparecerá aqui.
                </p>
              </div>
            )}

            {feedItems.map((item) => {
              const post = item.post

              const postComments = comments.filter((comment) => comment.post_id === post.id)
              const postLikes = likes.filter((like) => like.post_id === post.id)
              const postReposts = reposts.filter((repost) => repost.post_id === post.id)

              const userLiked = likes.some(
                (like) => like.post_id === post.id && like.user_id === userId
              )

              const postSaved = bookmarks.some(
                (bookmark) => bookmark.post_id === post.id && bookmark.user_id === userId
              )

              const postReposted = reposts.some(
                (repost) => repost.post_id === post.id && repost.user_id === userId
              )

              return (
                <PostCard
                  key={item.id}
                  post={post}
                  currentUserId={userId}
                  commentsCount={postComments.length}
                  likesCount={postLikes.length}
                  repostsCount={postReposts.length}
                  liked={userLiked}
                  saved={postSaved}
                  reposted={postReposted}
                  copied={copiedPostId === post.id}
                  reported={reportedPostIds.includes(post.id)}
                  reporting={reportingPostId === post.id}
                  showSensitiveContent={canView18Plus}
                  repostInfo={item.type === 'repost' ? item.repost : null}
                  footerLabel={
                    item.type === 'post'
                      ? `${t('profile.activity.footerPublishedAt')} ${new Date(post.created_at).toLocaleString(getDateLocale(language))}`
                      : undefined
                  }
                  onLike={() => handleToggleLike(post.id)}
                  onCommentClick={() => router.push(`/post/${post.id}`)}
                  onRepost={() => handleToggleRepost(post.id)}
                  onSave={() => handleToggleBookmark(post.id)}
                  onShare={() => handleCopyPostLink(post.id)}
                  onCopy={() => handleCopyPostLink(post.id)}
                  onEdit={() => router.push(`/post/${post.id}`)}
                  onDelete={() => handleDeletePost(post.id)}
                  onReport={() => handleReportPost(post.id, post.user_id)}
                />
              )
            })}
          </div>
        </section>
            </div>

            <aside className="hidden xl:block">
              <div className="sticky top-8 space-y-4">
                <div className="rounded-[2rem] border border-zinc-200/70 bg-white/95 p-4 shadow-sm ring-1 ring-black/5 dark:border-zinc-800/70 dark:bg-black/80 dark:ring-white/10">
                  <label className="flex items-center gap-2 rounded-full bg-zinc-100 px-4 py-3 text-sm text-zinc-500 ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-800/70">
                    <Search className="h-4 w-4" />
                    <input
                      type="search"
                      placeholder="Buscar no EntreUS"
                      onFocus={() => router.push('/search')}
                      className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-500"
                    />
                  </label>
                </div>

                <div className="rounded-[2rem] border border-zinc-200/70 bg-white/95 p-4 shadow-sm ring-1 ring-black/5 dark:border-zinc-800/70 dark:bg-black/80 dark:ring-white/10">
                  <h3 className="text-base font-black text-zinc-950 dark:text-white">
                    Talvez você curta
                  </h3>

                  <div className="mt-4 space-y-3">
                    {suggestedProfiles.length === 0 ? (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Explore o feed para descobrir mais perfis do EntreUS.
                      </p>
                    ) : (
                      suggestedProfiles.map((suggestedProfile) => {
                        const suggestedName =
                          suggestedProfile.display_name ||
                          suggestedProfile.username

                        return (
                          <Link
                            key={suggestedProfile.username}
                            href={`/u/${suggestedProfile.username}`}
                            className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-zinc-50 dark:hover:bg-zinc-950"
                          >
                            {suggestedProfile.avatar_url ? (
                              <span
                                className="h-10 w-10 shrink-0 rounded-full bg-cover bg-center ring-1 ring-zinc-200 dark:ring-zinc-800"
                                style={{ backgroundImage: `url(${suggestedProfile.avatar_url})` }}
                                aria-label={suggestedName}
                              />
                            ) : (
                              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-sm font-black text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                                {suggestedName.charAt(0).toUpperCase()}
                              </span>
                            )}

                            <span className="min-w-0">
                              <span className="block truncate text-sm font-bold text-zinc-950 dark:text-white">
                                {suggestedName}
                              </span>
                              <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                                @{suggestedProfile.username}
                              </span>
                            </span>
                          </Link>
                        )
                      })
                    )}
                  </div>
                </div>

                <div className="rounded-[2rem] border border-zinc-200/70 bg-white/95 p-4 shadow-sm ring-1 ring-black/5 dark:border-zinc-800/70 dark:bg-black/80 dark:ring-white/10">
                  <h3 className="text-base font-black text-zinc-950 dark:text-white">
                    Mural EntreUS
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    Conecte-se com pessoas reais, acompanhe publicações e
                    descubra conversas que combinam com o seu momento.
                  </p>
                  <Link
                    href="/feed"
                    className="mt-4 inline-flex rounded-full bg-zinc-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-black dark:bg-white dark:text-black"
                  >
                    Ir ao feed
                  </Link>
                </div>

                <nav className="flex flex-wrap gap-x-3 gap-y-2 px-2 text-xs text-zinc-500 dark:text-zinc-500">
                  <Link href="/terms" className="hover:text-zinc-900 dark:hover:text-white">
                    Termos de Uso
                  </Link>
                  <Link href="/privacy" className="hover:text-zinc-900 dark:hover:text-white">
                    Política de Privacidade
                  </Link>
                  <Link href="/cookies" className="hover:text-zinc-900 dark:hover:text-white">
                    Cookies
                  </Link>
                  <Link href="/accessibility" className="hover:text-zinc-900 dark:hover:text-white">
                    Acessibilidade
                  </Link>
                  <Link href="/more" className="hover:text-zinc-900 dark:hover:text-white">
                    Mais
                  </Link>
                  <span>© 2026 EntreUS</span>
                </nav>
              </div>
            </aside>
          </div>
      </section>

      {showBannerModal && bannerPreview && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setShowBannerModal(false)}
            className="absolute inset-0 cursor-default"
            aria-label={t('profile.modal.closeBanner')}
          />

          <div className="relative z-[91] w-full max-w-5xl rounded-3xl border border-white/10 bg-zinc-950 p-4 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowBannerModal(false)}
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
              aria-label={t('profile.modal.close')}
              title={t('profile.modal.close')}
            >
              <X className="h-5 w-5" />
            </button>

            <img
              src={bannerPreview}
              alt={`${t('profile.modal.bannerOf')} ${profileName}`}
              className="mx-auto max-h-[78vh] w-full rounded-3xl object-contain"
            />

            <p className="mt-3 text-center text-sm font-semibold text-white">
              {t('profile.modal.bannerOf')} {profileName}
            </p>
          </div>
        </div>
      )}

      {showAvatarModal && avatarPreview && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setShowAvatarModal(false)}
            className="absolute inset-0 cursor-default"
            aria-label={t('profile.modal.closeAvatar')}
          />

          <div className="relative z-[91] w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950 p-4 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowAvatarModal(false)}
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
              aria-label={t('profile.modal.close')}
              title={t('profile.modal.close')}
            >
              <X className="h-5 w-5" />
            </button>

            <img
              src={avatarPreview}
              alt={profileName}
              className="mx-auto aspect-square w-full max-w-sm rounded-3xl object-cover"
            />

            <p className="mt-3 text-center text-sm font-semibold text-white">
              {profileName}
            </p>
          </div>
        </div>
      )}
    </main>
  )
}

import type { NavigationItem } from '@/lib/navigation/navigation-types'
import type { Locale } from './config'

type LocalizedNavigation = Record<string, { title: string; description: string; keywords: string[] }>

const en: LocalizedNavigation = {
  lab: { title: 'EntreUS Lab', description: 'Tools and experiences from EntreUS.', keywords: ['lab', 'experiments', 'tools'] },
  meet: { title: 'EntreUS Meet', description: 'Rooms, calls, and live meetings.', keywords: ['meeting', 'video', 'call', 'room'] },
  messages: { title: 'Messages', description: 'Private conversations and chats.', keywords: ['chat', 'conversations', 'inbox'] },
  notifications: { title: 'Notifications', description: 'Account activity and updates.', keywords: ['alerts', 'updates', 'activity'] },
  feed: { title: 'Home', description: 'Home page and recent posts.', keywords: ['feed', 'home', 'posts'] },
  post: { title: 'Post', description: 'Create a new Feed post.', keywords: ['publish', 'create', 'post'] },
  search: { title: 'Search', description: 'Find people and available posts.', keywords: ['people', 'posts', 'find'] },
  saved: { title: 'Saved', description: 'Posts saved for later.', keywords: ['favorites', 'save'] },
  challenges: { title: 'Challenges', description: 'Community challenges and activities.', keywords: ['communities', 'campaigns'] },
  'creator-studio': { title: 'Creator Studio', description: 'Creator content, metrics, and monetization.', keywords: ['creator', 'dashboard', 'metrics'] },
  wallet: { title: 'Wallet', description: 'Balance, ItaCash, and transactions.', keywords: ['itacash', 'balance', 'money'] },
  gifts: { title: 'Gifts', description: 'Digital gifts from EntreUS.', keywords: ['support', 'tip'] },
  vip: { title: 'VIP Plus', description: 'VIP benefits and customization.', keywords: ['subscription', 'premium', 'benefits'] },
  profile: { title: 'My profile', description: 'Profile, identity, and personal preferences.', keywords: ['account', 'avatar', 'bio'] },
  settings: { title: 'Settings', description: 'Preferences, privacy, and security.', keywords: ['security', 'privacy', 'account'] },
  help: { title: 'Help', description: 'Help and support center.', keywords: ['support', 'questions', 'contact'] },
  editor: { title: 'Editor', description: 'Create and edit content to publish.', keywords: ['video', 'media', 'publish'] },
  admin: { title: 'Administration', description: 'Administrative dashboards and queues.', keywords: ['admin', 'moderation', 'security'] },
}

const es: LocalizedNavigation = {
  lab: { title: 'EntreUS Lab', description: 'Herramientas y experiencias de EntreUS.', keywords: ['laboratorio', 'experimentos', 'herramientas'] },
  meet: { title: 'EntreUS Meet', description: 'Salas, llamadas y encuentros en vivo.', keywords: ['reunión', 'video', 'llamada', 'sala'] },
  messages: { title: 'Mensajes', description: 'Conversaciones y chats privados.', keywords: ['chat', 'conversaciones', 'bandeja'] },
  notifications: { title: 'Notificaciones', description: 'Actividad y novedades de tu cuenta.', keywords: ['alertas', 'avisos', 'actividad'] },
  feed: { title: 'Inicio', description: 'Página inicial y publicaciones recientes.', keywords: ['feed', 'inicio', 'publicaciones'] },
  post: { title: 'Publicar', description: 'Crea una nueva publicación en el Feed.', keywords: ['publicar', 'crear', 'post'] },
  search: { title: 'Buscar', description: 'Encuentra personas y publicaciones disponibles.', keywords: ['personas', 'publicaciones'] },
  saved: { title: 'Guardados', description: 'Publicaciones guardadas para después.', keywords: ['favoritos', 'guardar'] },
  challenges: { title: 'Desafíos', description: 'Desafíos y actividades de la comunidad.', keywords: ['comunidades', 'campañas'] },
  'creator-studio': { title: 'Creator Studio', description: 'Contenido, métricas y monetización del creador.', keywords: ['creador', 'panel', 'métricas'] },
  wallet: { title: 'Cartera', description: 'Saldo, ItaCash y movimientos.', keywords: ['itacash', 'saldo', 'dinero'] },
  gifts: { title: 'Regalos', description: 'Regalos digitales de EntreUS.', keywords: ['apoyo', 'propina'] },
  vip: { title: 'VIP Plus', description: 'Beneficios y personalización VIP.', keywords: ['suscripción', 'premium'] },
  profile: { title: 'Mi perfil', description: 'Perfil, identidad y preferencias personales.', keywords: ['cuenta', 'avatar', 'bio'] },
  settings: { title: 'Configuración', description: 'Preferencias, privacidad y seguridad.', keywords: ['seguridad', 'privacidad', 'cuenta'] },
  help: { title: 'Ayuda', description: 'Centro de ayuda y soporte.', keywords: ['soporte', 'dudas', 'contacto'] },
  editor: { title: 'Editor', description: 'Crea y edita contenido para publicar.', keywords: ['video', 'contenido', 'publicar'] },
  admin: { title: 'Administración', description: 'Paneles y colas administrativas.', keywords: ['admin', 'moderación', 'seguridad'] },
}

const extendedTitles: Partial<Record<Locale, Record<string, string>>> = {
  fr: {
    lab: 'EntreUS Lab', meet: 'EntreUS Meet', messages: 'Messages', notifications: 'Notifications',
    feed: 'Accueil', post: 'Publier', search: 'Rechercher', saved: 'Enregistrés', challenges: 'Défis',
    'creator-studio': 'Studio créateur', wallet: 'Portefeuille', gifts: 'Cadeaux', vip: 'VIP Plus',
    profile: 'Mon profil', settings: 'Paramètres', help: 'Aide', editor: 'Éditeur', admin: 'Administration',
  },
  id: {
    lab: 'EntreUS Lab', meet: 'EntreUS Meet', messages: 'Pesan', notifications: 'Notifikasi',
    feed: 'Beranda', post: 'Posting', search: 'Cari', saved: 'Tersimpan', challenges: 'Tantangan',
    'creator-studio': 'Studio Kreator', wallet: 'Dompet', gifts: 'Hadiah', vip: 'VIP Plus',
    profile: 'Profil saya', settings: 'Pengaturan', help: 'Bantuan', editor: 'Editor', admin: 'Administrasi',
  },
  ko: {
    lab: 'EntreUS Lab', meet: 'EntreUS Meet', messages: '메시지', notifications: '알림',
    feed: '홈', post: '게시', search: '검색', saved: '저장됨', challenges: '챌린지',
    'creator-studio': '크리에이터 스튜디오', wallet: '지갑', gifts: '선물', vip: 'VIP Plus',
    profile: '내 프로필', settings: '설정', help: '도움말', editor: '편집기', admin: '관리',
  },
  ja: {
    lab: 'EntreUS Lab', meet: 'EntreUS Meet', messages: 'メッセージ', notifications: '通知',
    feed: 'ホーム', post: '投稿', search: '検索', saved: '保存済み', challenges: 'チャレンジ',
    'creator-studio': 'クリエイタースタジオ', wallet: 'ウォレット', gifts: 'ギフト', vip: 'VIP Plus',
    profile: '自分のプロフィール', settings: '設定', help: 'ヘルプ', editor: 'エディター', admin: '管理',
  },
  'zh-CN': {
    lab: 'EntreUS Lab', meet: 'EntreUS Meet', messages: '消息', notifications: '通知',
    feed: '首页', post: '发布', search: '搜索', saved: '已保存', challenges: '挑战',
    'creator-studio': '创作者工作室', wallet: '钱包', gifts: '礼物', vip: 'VIP Plus',
    profile: '我的个人资料', settings: '设置', help: '帮助', editor: '编辑器', admin: '管理',
  },
}

const extendedDescriptions: Partial<Record<Locale, string>> = {
  fr: 'Accédez à cette fonctionnalité EntreUS.',
  id: 'Buka fitur EntreUS ini.',
  ko: '이 EntreUS 기능을 이용하세요.',
  ja: 'このEntreUS機能を利用します。',
  'zh-CN': '使用此EntreUS功能。',
}

export function localizeNavigationItems(items: readonly NavigationItem[], locale: Locale): NavigationItem[] {
  const catalog = locale === 'en' ? en : locale === 'es' ? es : null
  const titles = extendedTitles[locale]
  if (!catalog && !titles) return [...items]
  return items.map((item) => {
    const localized = catalog?.[item.id] ??
      (titles?.[item.id] && en[item.id]
        ? {
            ...en[item.id],
            title: titles[item.id],
            description: extendedDescriptions[locale] ?? en[item.id].description,
          }
        : null)
    return localized ? { ...item, ...localized } as NavigationItem : item
  })
}

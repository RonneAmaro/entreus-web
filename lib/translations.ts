export type LanguageCode = 'pt' | 'en' | 'fr' | 'id' | 'ja' | 'zh'

export type LanguageOption = {
  code: LanguageCode
  nativeName: string
  htmlLang: string
}

export const languageOptions: LanguageOption[] = [
  { code: 'pt', nativeName: 'Português', htmlLang: 'pt-BR' },
  { code: 'en', nativeName: 'English', htmlLang: 'en' },
  { code: 'fr', nativeName: 'Français', htmlLang: 'fr' },
  { code: 'id', nativeName: 'Bahasa Indonesia', htmlLang: 'id' },
  { code: 'ja', nativeName: '日本語', htmlLang: 'ja' },
  { code: 'zh', nativeName: '中文', htmlLang: 'zh-CN' },
]

export const translations = {
  pt: {
    brand: { tagline: 'Só Entre Nós' },
    nav: { home: 'Página inicial', explore: 'Explorar', notifications: 'Notificações', messages: 'Mensagens', saved: 'Salvos', profile: 'Perfil', myProfile: 'Meu perfil', more: 'Mais', post: 'Postar' },
    more: { title: 'Mais opções', open: 'Abrir mais opções', close: 'Fechar mais opções', closeMenu: 'Fechar menu' },
    lab: { name: 'EntreUS Lab', subtitle: 'Ferramentas criativas' },
    settings: { privacy: 'Privacidade', blocked: 'Bloqueados', settings: 'Configurações' },
    language: { label: 'Idioma', helper: 'Idioma da interface' },
    theme: { light: 'Tema claro', dark: 'Tema escuro' },
    auth: { logout: 'Sair' },
    mobile: { openProfileMenu: 'Abrir menu do perfil', goHome: 'Ir para a página inicial', publish: 'Publicar', photos: 'Fotos', videos: 'Vídeos', openPostOptions: 'Abrir opções de publicação', closePostOptions: 'Fechar opções de publicação' },
  },
  en: {
    brand: { tagline: 'Just Between Us' },
    nav: { home: 'Home', explore: 'Explore', notifications: 'Notifications', messages: 'Messages', saved: 'Saved', profile: 'Profile', myProfile: 'My profile', more: 'More', post: 'Post' },
    more: { title: 'More options', open: 'Open more options', close: 'Close more options', closeMenu: 'Close menu' },
    lab: { name: 'EntreUS Lab', subtitle: 'Creative tools' },
    settings: { privacy: 'Privacy', blocked: 'Blocked', settings: 'Settings' },
    language: { label: 'Language', helper: 'Interface language' },
    theme: { light: 'Light theme', dark: 'Dark theme' },
    auth: { logout: 'Log out' },
    mobile: { openProfileMenu: 'Open profile menu', goHome: 'Go to home', publish: 'Post', photos: 'Photos', videos: 'Videos', openPostOptions: 'Open post options', closePostOptions: 'Close post options' },
  },
  fr: {
    brand: { tagline: 'Seulement entre nous' },
    nav: { home: 'Accueil', explore: 'Explorer', notifications: 'Notifications', messages: 'Messages', saved: 'Enregistrés', profile: 'Profil', myProfile: 'Mon profil', more: 'Plus', post: 'Publier' },
    more: { title: 'Plus d’options', open: 'Ouvrir plus d’options', close: 'Fermer plus d’options', closeMenu: 'Fermer le menu' },
    lab: { name: 'EntreUS Lab', subtitle: 'Outils créatifs' },
    settings: { privacy: 'Confidentialité', blocked: 'Bloqués', settings: 'Paramètres' },
    language: { label: 'Langue', helper: 'Langue de l’interface' },
    theme: { light: 'Thème clair', dark: 'Thème sombre' },
    auth: { logout: 'Se déconnecter' },
    mobile: { openProfileMenu: 'Ouvrir le menu du profil', goHome: 'Aller à l’accueil', publish: 'Publier', photos: 'Photos', videos: 'Vidéos', openPostOptions: 'Ouvrir les options de publication', closePostOptions: 'Fermer les options de publication' },
  },
  id: {
    brand: { tagline: 'Hanya di Antara Kita' },
    nav: { home: 'Beranda', explore: 'Jelajahi', notifications: 'Notifikasi', messages: 'Pesan', saved: 'Tersimpan', profile: 'Profil', myProfile: 'Profil saya', more: 'Lainnya', post: 'Posting' },
    more: { title: 'Opsi lainnya', open: 'Buka opsi lainnya', close: 'Tutup opsi lainnya', closeMenu: 'Tutup menu' },
    lab: { name: 'EntreUS Lab', subtitle: 'Alat kreatif' },
    settings: { privacy: 'Privasi', blocked: 'Diblokir', settings: 'Pengaturan' },
    language: { label: 'Bahasa', helper: 'Bahasa antarmuka' },
    theme: { light: 'Tema terang', dark: 'Tema gelap' },
    auth: { logout: 'Keluar' },
    mobile: { openProfileMenu: 'Buka menu profil', goHome: 'Pergi ke beranda', publish: 'Posting', photos: 'Foto', videos: 'Video', openPostOptions: 'Buka opsi posting', closePostOptions: 'Tutup opsi posting' },
  },
  ja: {
    brand: { tagline: '私たちだけで' },
    nav: { home: 'ホーム', explore: '探す', notifications: '通知', messages: 'メッセージ', saved: '保存済み', profile: 'プロフィール', myProfile: 'マイプロフィール', more: 'その他', post: '投稿' },
    more: { title: 'その他のオプション', open: 'その他のオプションを開く', close: 'その他のオプションを閉じる', closeMenu: 'メニューを閉じる' },
    lab: { name: 'EntreUS Lab', subtitle: 'クリエイティブツール' },
    settings: { privacy: 'プライバシー', blocked: 'ブロック済み', settings: '設定' },
    language: { label: '言語', helper: 'インターフェースの言語' },
    theme: { light: 'ライトテーマ', dark: 'ダークテーマ' },
    auth: { logout: 'ログアウト' },
    mobile: { openProfileMenu: 'プロフィールメニューを開く', goHome: 'ホームへ移動', publish: '投稿', photos: '写真', videos: '動画', openPostOptions: '投稿オプションを開く', closePostOptions: '投稿オプションを閉じる' },
  },
  zh: {
    brand: { tagline: '只在我们之间' },
    nav: { home: '首页', explore: '探索', notifications: '通知', messages: '消息', saved: '已保存', profile: '个人资料', myProfile: '我的资料', more: '更多', post: '发布' },
    more: { title: '更多选项', open: '打开更多选项', close: '关闭更多选项', closeMenu: '关闭菜单' },
    lab: { name: 'EntreUS Lab', subtitle: '创意工具' },
    settings: { privacy: '隐私', blocked: '已屏蔽', settings: '设置' },
    language: { label: '语言', helper: '界面语言' },
    theme: { light: '浅色主题', dark: '深色主题' },
    auth: { logout: '退出' },
    mobile: { openProfileMenu: '打开个人菜单', goHome: '返回首页', publish: '发布', photos: '照片', videos: '视频', openPostOptions: '打开发布选项', closePostOptions: '关闭发布选项' },
  },
} as const

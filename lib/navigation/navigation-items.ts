import type { NavigationAccent, NavigationItem } from './navigation-types'

export const PRIMARY_NAVIGATION = [
  { id: 'home', title: 'Casa', kind: 'link', href: '/feed', icon: 'feed' },
  { id: 'messages', title: 'Mensagens', kind: 'link', href: '/messages', icon: 'messages' },
  { id: 'entreus', title: 'EntreUS', kind: 'hub', icon: 'hub' },
  { id: 'profile', title: 'Perfil', kind: 'link', href: '/profile', icon: 'profile' },
  { id: 'post', title: 'Postar', kind: 'action', icon: 'post' },
] as const

export const HUB_ITEMS: readonly NavigationItem[] = [
  { id: 'lab', title: 'EntreUS Lab', description: 'Ferramentas e experiências do EntreUS.', href: '/lab', icon: 'lab', category: 'highlights', keywords: ['laboratorio', 'experimentos', 'ferramentas'], audience: 'authenticated', highlighted: true, accent: 'cyan' },
  { id: 'meet', title: 'EntreUS Meet', description: 'Salas, chamadas e encontros ao vivo.', href: '/meet', icon: 'meet', category: 'highlights', keywords: ['reuniao', 'video', 'chamada', 'sala'], audience: 'authenticated', highlighted: true, accent: 'emerald' },
  { id: 'messages', title: 'Mensagens', description: 'Conversas e chats privados.', href: '/messages', icon: 'messages', category: 'communication', keywords: ['chat', 'conversas', 'inbox'], audience: 'authenticated', accent: 'fuchsia' },
  { id: 'notifications', title: 'Notificações', description: 'Atividades e novidades da sua conta.', href: '/notifications', icon: 'bell', category: 'communication', keywords: ['alertas', 'avisos', 'atividade'], audience: 'authenticated', accent: 'red' },
  { id: 'feed', title: 'Feed', description: 'Página inicial e publicações recentes.', href: '/feed', icon: 'feed', category: 'content', keywords: ['casa', 'inicio', 'posts', 'publicacoes'], audience: 'authenticated', accent: 'blue' },
  { id: 'search', title: 'Buscar', description: 'Encontre pessoas e publicações disponíveis.', href: '/search', icon: 'search', category: 'content', keywords: ['pessoas', 'publicacoes', 'procurar'], audience: 'authenticated', accent: 'indigo' },
  { id: 'saved', title: 'Salvos', description: 'Publicações guardadas para depois.', href: '/saved', icon: 'bookmark', category: 'content', keywords: ['favoritos', 'guardar'], audience: 'authenticated', accent: 'violet' },
  { id: 'challenges', title: 'Desafios', description: 'Desafios e atividades da comunidade.', href: '/challenges', icon: 'challenge', category: 'content', keywords: ['comunidades', 'campanhas'], audience: 'authenticated', accent: 'amber' },
  { id: 'creator-studio', title: 'Creator Studio', description: 'Conteúdo, métricas e monetização do criador.', href: '/creator-dashboard', icon: 'creator', category: 'creator', keywords: ['criador', 'dashboard', 'metricas', 'monetizacao'], audience: 'authenticated', accent: 'violet' },
  { id: 'wallet', title: 'Carteira', description: 'Saldo, ItaCash e movimentações.', href: '/wallet', icon: 'wallet', category: 'creator', keywords: ['itacash', 'saldo', 'dinheiro'], audience: 'authenticated', accent: 'amber' },
  { id: 'gifts', title: 'Presentes', description: 'Presentes digitais do EntreUS.', href: '/gifts', icon: 'gift', category: 'creator', keywords: ['apoio', 'gorjeta'], audience: 'authenticated', accent: 'fuchsia' },
  { id: 'vip', title: 'VIP Plus', description: 'Benefícios e personalização VIP.', href: '/vip-plus', icon: 'vip', category: 'creator', keywords: ['assinatura', 'premium', 'beneficios'], audience: 'authenticated', accent: 'amber' },
  { id: 'profile', title: 'Meu perfil', description: 'Perfil, identidade e preferências pessoais.', href: '/profile', icon: 'profile', category: 'account', keywords: ['conta', 'avatar', 'bio'], audience: 'authenticated', accent: 'indigo' },
  { id: 'settings', title: 'Configurações', description: 'Preferências, privacidade e segurança.', href: '/settings', icon: 'settings', category: 'account', keywords: ['seguranca', 'privacidade', 'conta'], audience: 'authenticated', accent: 'violet' },
  { id: 'help', title: 'Ajuda', description: 'Central de ajuda e suporte.', href: '/help', icon: 'help', category: 'account', keywords: ['suporte', 'duvidas', 'contato'], audience: 'authenticated', accent: 'cyan' },
  { id: 'editor', title: 'Editor', description: 'Crie e edite conteúdo para publicar.', href: '/editor', icon: 'editor', category: 'tools', keywords: ['video', 'midia', 'publicar'], audience: 'authenticated', accent: 'emerald' },
  { id: 'admin', title: 'Administração', description: 'Painéis e filas administrativas.', href: '/admin', icon: 'admin', category: 'administration', keywords: ['admin', 'moderacao', 'seguranca'], audience: 'admin', accent: 'emerald' },
] as const

export function navigationAccentFor(item: Pick<NavigationItem, 'accent'>): NavigationAccent {
  return item.accent ?? 'blue'
}

export const NAVIGATION_CATEGORY_LABELS = {
  highlights: 'Destaques',
  communication: 'Comunicação',
  content: 'Conteúdo e comunidades',
  creator: 'Criador e monetização',
  account: 'Conta e segurança',
  tools: 'Ferramentas',
  administration: 'Administração',
} as const

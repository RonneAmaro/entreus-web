export const BETA_CHECKLIST_STORAGE_KEY = 'entreus:beta-checklist:v1'

export const betaChecklistStatuses = ['pending', 'passed', 'bug', 'review'] as const

export type BetaChecklistStatus = (typeof betaChecklistStatuses)[number]
export type BetaChecklistFilter = BetaChecklistStatus | 'all'

export type BetaChecklistItem = {
  id: string
  category: string
  title: string
  description: string
  route: string
}

export type BetaChecklistProgressEntry = {
  status?: BetaChecklistStatus
  note?: string
}

export type BetaChecklistProgress = Record<string, BetaChecklistProgressEntry | undefined>

export type BetaChecklistSummary = {
  total: number
  pending: number
  passed: number
  bug: number
  review: number
  completed: number
  completionPercent: number
}

export const betaChecklistStatusLabels: Record<BetaChecklistStatus, string> = {
  pending: 'Pendente',
  passed: 'Passou',
  bug: 'Bug',
  review: 'Revisar',
}

export const BETA_CHECKLIST_ITEMS: BetaChecklistItem[] = [
  {
    id: 'login-signup',
    category: 'Login e cadastro',
    title: 'Cadastro, login e recuperacao',
    description: 'Criar conta ficticia, entrar, sair e validar mensagens de erro basicas.',
    route: '/signup, /login, /forgot-password',
  },
  {
    id: 'profile-complete',
    category: 'Perfil',
    title: 'Perfil completo',
    description: 'Completar username, avatar, banner, bio e abrir perfil publico em outra conta.',
    route: '/complete-profile, /profile, /u/[username]',
  },
  {
    id: 'feed-text-post',
    category: 'Feed e postagem',
    title: 'Post de texto e link',
    description: 'Publicar texto/link, confirmar preview quando existir e ver o post no feed.',
    route: '/feed',
  },
  {
    id: 'feed-media-upload',
    category: 'Upload de mídia',
    title: 'Upload de foto e video',
    description: 'Publicar imagem e video curtos, validar previews, limites e mensagens de erro.',
    route: '/feed?compose=photo, /feed?compose=video',
  },
  {
    id: 'feed-compose-shortcuts',
    category: 'Feed e postagem',
    title: 'Atalhos Postar, Publicar, Foto e Video',
    description: 'Testar botao desktop Postar e menu mobile + com intencoes de texto, foto e video.',
    route: '/feed?compose=1, /feed?compose=photo, /feed?compose=video',
  },
  {
    id: 'post-interactions',
    category: 'Feed e postagem',
    title: 'Interacoes em posts',
    description: 'Curtir, comentar, repostar, salvar, abrir post individual e copiar link.',
    route: '/feed, /post/[id], /saved',
  },
  {
    id: 'admin-home',
    category: 'Admin',
    title: 'Painel admin e busca',
    description: 'Abrir painel admin, buscar areas importantes e confirmar bloqueio para usuario comum.',
    route: '/admin',
  },
  {
    id: 'admin-feedback',
    category: 'Admin',
    title: 'Feedbacks e bugs',
    description: 'Abrir fila de feedback e validar empty/loading/error states sem expor dados sensiveis.',
    route: '/admin/feedback',
  },
  {
    id: 'finance-dashboard',
    category: 'Financeiro',
    title: 'Dashboard financeiro visual',
    description: 'Conferir telas e mensagens usando dados controlados, sem alterar regras financeiras.',
    route: '/admin/finance',
  },
  {
    id: 'itacash-purchase',
    category: 'ItaCash',
    title: 'Compra e carteira ItaCash',
    description: 'Testar fluxo manual em ambiente controlado e conferir saldo/movimentacoes.',
    route: '/buy-itacash, /wallet, /admin/itacash-purchases',
  },
  {
    id: 'creator-withdrawals',
    category: 'ItaCash',
    title: 'Saques e repasses',
    description: 'Revisar a tela operacional de saques/repasses sem aplicar pagamento real.',
    route: '/admin/creator-withdrawals',
  },
  {
    id: 'adult-access',
    category: '18+',
    title: 'Acesso 18+',
    description: 'Validar que conta menor/nao verificada nao ve adulto e conta autorizada respeita opt-in.',
    route: '/feed, /age-verification',
  },
  {
    id: 'adult-admin',
    category: '18+',
    title: 'Verificacao de idade admin',
    description: 'Testar solicitacao ficticia e revisao admin sem documentos reais.',
    route: '/age-verification, /admin/age-verifications',
  },
  {
    id: 'moderation-reports',
    category: 'Moderação',
    title: 'Denuncias e moderacao',
    description: 'Denunciar post, revisar fila, ocultar/restaurar conteudo e conferir impacto publico.',
    route: '/admin/reports, /admin/moderation',
  },
  {
    id: 'creator-dashboard',
    category: 'Creator Dashboard',
    title: 'Metricas do criador',
    description: 'Abrir dashboard, conferir posts, interacoes, apoios, empty states e erros seguros.',
    route: '/creator-dashboard',
  },
  {
    id: 'lab-tools',
    category: 'Lab',
    title: 'Ferramentas do Lab',
    description: 'Validar geradores, editor e mensagens de erro sem travar a interface.',
    route: '/lab, /lab/poster, /lab/video-editor',
  },
  {
    id: 'lab-screen-recorder',
    category: 'Lab',
    title: 'Screen Recorder',
    description: 'Gravar tela/microfone/camera, baixar arquivo e validar cancelamento de permissao.',
    route: '/lab/screen-recorder',
  },
  {
    id: 'meet-room',
    category: 'Meet',
    title: 'Sala Meet',
    description: 'Criar sala, entrar com duas contas, testar pedido de acesso, chat e controles.',
    route: '/meet, /meet/[roomName]',
  },
  {
    id: 'mobile-pwa',
    category: 'Mobile/PWA',
    title: 'Mobile e instalacao PWA',
    description: 'Abrir no celular/responsivo, instalar PWA e conferir navegacao principal.',
    route: '/instalar, /feed',
  },
  {
    id: 'mobile-compose',
    category: 'Mobile/PWA',
    title: 'Composer no mobile',
    description: 'Testar menu +, Publicar, Foto, Video, upload e textos sem quebrar layout.',
    route: '/feed',
  },
  {
    id: 'security-access',
    category: 'Segurança',
    title: 'Acesso restrito e dados sensiveis',
    description: 'Confirmar bloqueio admin para usuario comum e ausencia de secrets em telas.',
    route: '/admin, /admin/security-check',
  },
  {
    id: 'policies-pages',
    category: 'Políticas',
    title: 'Paginas institucionais e politicas',
    description: 'Abrir termos, privacidade, seguranca, contato e ajuda procurando links quebrados.',
    route: '/terms, /privacy, /safety, /contact, /help',
  },
]

export function normalizeBetaChecklistText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export function getBetaChecklistItemStatus(
  progress: BetaChecklistProgress,
  itemId: string,
): BetaChecklistStatus {
  const status = progress[itemId]?.status

  return status && betaChecklistStatuses.includes(status) ? status : 'pending'
}

export function calculateBetaChecklistSummary(
  items: readonly BetaChecklistItem[],
  progress: BetaChecklistProgress,
): BetaChecklistSummary {
  const summary: BetaChecklistSummary = {
    total: items.length,
    pending: 0,
    passed: 0,
    bug: 0,
    review: 0,
    completed: 0,
    completionPercent: 0,
  }

  for (const item of items) {
    const status = getBetaChecklistItemStatus(progress, item.id)

    if (status === 'pending') summary.pending += 1
    if (status === 'passed') summary.passed += 1
    if (status === 'bug') summary.bug += 1
    if (status === 'review') summary.review += 1
  }

  summary.completed = summary.passed + summary.bug + summary.review
  summary.completionPercent =
    summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0

  return summary
}

export function filterBetaChecklistItems(
  items: readonly BetaChecklistItem[],
  progress: BetaChecklistProgress,
  options: {
    status?: BetaChecklistFilter
    query?: string
  } = {},
) {
  const statusFilter = options.status || 'all'
  const normalizedQuery = normalizeBetaChecklistText(options.query || '')
  const terms = normalizedQuery.split(' ').filter(Boolean)

  return items.filter((item) => {
    const status = getBetaChecklistItemStatus(progress, item.id)

    if (statusFilter !== 'all' && status !== statusFilter) return false
    if (terms.length === 0) return true

    const haystack = normalizeBetaChecklistText([
      item.title,
      item.description,
      item.category,
      item.route,
    ].join(' '))

    return terms.every((term) => haystack.includes(term))
  })
}

export function buildBetaChecklistReport(
  items: readonly BetaChecklistItem[],
  progress: BetaChecklistProgress,
  generatedAt: Date = new Date(),
) {
  const summary = calculateBetaChecklistSummary(items, progress)
  const bugs = items.filter((item) => getBetaChecklistItemStatus(progress, item.id) === 'bug')
  const review = items.filter((item) => getBetaChecklistItemStatus(progress, item.id) === 'review')
  const notes = items
    .map((item) => ({
      item,
      note: (progress[item.id]?.note || '').trim(),
    }))
    .filter((entry) => entry.note.length > 0)

  const formatItem = (item: BetaChecklistItem) => `- [${item.category}] ${item.title} (${item.route})`
  const lines = [
    'Relatório Beta Fechado - EntreUS',
    `Data: ${generatedAt.toLocaleString('pt-BR')}`,
    '',
    'Resumo:',
    `- Total: ${summary.total}`,
    `- Passou: ${summary.passed}`,
    `- Bug: ${summary.bug}`,
    `- Revisar: ${summary.review}`,
    `- Pendente: ${summary.pending}`,
    `- Concluído: ${summary.completionPercent}%`,
    '',
    'Bugs encontrados:',
    ...(bugs.length > 0 ? bugs.map(formatItem) : ['- Nenhum bug marcado.']),
    '',
    'Itens para revisar:',
    ...(review.length > 0 ? review.map(formatItem) : ['- Nenhum item para revisar.']),
    '',
    'Observações preenchidas:',
    ...(notes.length > 0
      ? notes.map(({ item, note }) => `- [${item.category}] ${item.title}: ${note}`)
      : ['- Nenhuma observação preenchida.']),
  ]

  return lines.join('\n')
}

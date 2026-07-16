export type ExpressionKind = 'emoji' | 'gif' | 'sticker'
export type ExpressionContext = 'post' | 'comment' | 'reply' | 'message' | 'meet'

export type ExpressionAsset = {
  kind: ExpressionKind
  provider: 'unicode' | 'tenor'
  providerId: string
  title: string
  altText: string
  previewUrl?: string
  mediaUrl?: string
  staticUrl?: string
  width?: number
  height?: number
  attributionUrl?: string
  contentRating?: 'g'
}

export type ExpressionSearchResult = {
  items: ExpressionAsset[]
  nextCursor: string | null
  attribution: string | null
}

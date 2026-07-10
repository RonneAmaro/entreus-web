import { describe, expect, it } from 'vitest'

import {
  detectExternalEmbed,
  getFacebookEmbedUrl,
  getTikTokEmbedUrl,
  getTikTokVideoId,
  getYouTubeEmbedUrl,
  getYouTubeVideoId,
} from '../../lib/external-embeds'

describe('external embeds', () => {
  it('detects regular YouTube links with a privacy-enhanced embed URL', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

    expect(getYouTubeVideoId(url)).toBe('dQw4w9WgXcQ')
    expect(getYouTubeEmbedUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    )
    expect(detectExternalEmbed(url)).toMatchObject({
      provider: 'youtube',
      videoId: 'dQw4w9WgXcQ',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    })
  })

  it('detects YouTube short URLs and Shorts URLs', () => {
    expect(getYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(getYouTubeVideoId('https://www.youtube.com/shorts/abcDEF_1234')).toBe('abcDEF_1234')
  })

  it('detects Instagram posts and reels', () => {
    expect(detectExternalEmbed('https://www.instagram.com/p/C0abcDEF123/')).toMatchObject({
      provider: 'instagram',
      contentType: 'post',
      postId: 'C0abcDEF123',
      originalUrl: 'https://www.instagram.com/p/C0abcDEF123/',
    })
    expect(detectExternalEmbed('https://www.instagram.com/reel/C0abcDEF456/')).toMatchObject({
      provider: 'instagram',
      contentType: 'reel',
      postId: 'C0abcDEF456',
      originalUrl: 'https://www.instagram.com/reel/C0abcDEF456/',
    })
  })

  it('uses the official TikTok player for canonical video URLs', () => {
    const id = '7660005977781030164'
    const url = `https://www.tiktok.com/@analise/video/${id}?is_from_webapp=1&sender_device=pc`

    expect(getTikTokVideoId(url)).toBe(id)
    expect(getTikTokEmbedUrl(id)).toContain(`https://www.tiktok.com/player/v1/${id}?`)
    expect(getTikTokEmbedUrl(id)).toContain('autoplay=0')
    expect(detectExternalEmbed(url)).toMatchObject({
      provider: 'tiktok', renderMode: 'player', videoId: id,
    })
  })

  it('falls back for TikTok links without a safe video id or from lookalike domains', () => {
    expect(detectExternalEmbed('https://www.tiktok.com/t/ZShortLink/')).toMatchObject({
      provider: 'tiktok', renderMode: 'fallback',
    })
    expect(detectExternalEmbed('https://tiktok.com.example.com/@user/video/7660005977781030164')).toBeNull()
  })

  it('detects Facebook videos and builds official plugin embed URLs', () => {
    const url = 'https://www.facebook.com/watch/?v=123456789012345'
    const embed = detectExternalEmbed(url)

    expect(embed).toMatchObject({
      provider: 'facebook',
      contentType: 'watch',
      postId: '123456789012345',
    })
    expect(embed && 'embedUrl' in embed ? embed.embedUrl : '').toBe(
      getFacebookEmbedUrl('watch', url),
    )
  })

  it('uses a safe external fallback for Facebook share links', () => {
    expect(detectExternalEmbed('https://www.facebook.com/share/abc123/')).toMatchObject({
      provider: 'facebook', renderMode: 'fallback', contentType: 'unknown',
    })
    expect(detectExternalEmbed('https://www.facebook.com/share/r/abc123/')).toMatchObject({
      provider: 'facebook', renderMode: 'fallback', contentType: 'unknown',
    })
  })

  it('rejects unsafe or unsupported URLs', () => {
    expect(detectExternalEmbed('javascript:alert(1)')).toBeNull()
    expect(detectExternalEmbed('ftp://youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(detectExternalEmbed('https://example.com/post/123')).toBeNull()
  })
})

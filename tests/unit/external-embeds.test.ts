import { describe, expect, it } from 'vitest'

import {
  detectExternalEmbed,
  getFacebookEmbedUrl,
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

  it('rejects unsafe or unsupported URLs', () => {
    expect(detectExternalEmbed('javascript:alert(1)')).toBeNull()
    expect(detectExternalEmbed('ftp://youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(detectExternalEmbed('https://example.com/post/123')).toBeNull()
  })
})

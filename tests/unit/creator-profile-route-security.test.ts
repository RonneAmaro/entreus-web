import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseBearerAuthorization,
  PRIVATE_NO_STORE_HEADERS,
  sanitizeCreatorProfilePayloadForResponse,
} from '../../lib/creator-profile-route-security'

describe('creator profile route security', () => {
  it('uses private no-store headers that vary by authorization and cookie', () => {
    expect(PRIVATE_NO_STORE_HEADERS['Cache-Control']).toContain('private')
    expect(PRIVATE_NO_STORE_HEADERS['Cache-Control']).toContain('no-store')
    expect(PRIVATE_NO_STORE_HEADERS.Pragma).toBe('no-cache')
    expect(PRIVATE_NO_STORE_HEADERS.Expires).toBe('0')
    expect(PRIVATE_NO_STORE_HEADERS.Vary).toBe('Authorization, Cookie')
  })

  it('accepts only strict bearer authorization values', () => {
    expect(parseBearerAuthorization(null)).toEqual({ ok: true, authorization: '' })
    expect(parseBearerAuthorization('Bearer abc.def-ghi_123')).toEqual({ ok: true, authorization: 'Bearer abc.def-ghi_123' })
    expect(parseBearerAuthorization('Basic abc.def')).toEqual({ ok: false, authorization: '' })
    expect(parseBearerAuthorization('Bearer')).toEqual({ ok: false, authorization: '' })
    expect(parseBearerAuthorization('Bearer token\r\nx-leak: yes')).toEqual({ ok: false, authorization: '' })
  })

  it('sanitizes tokens and private R2 fields from responses', () => {
    const payload = sanitizeCreatorProfilePayloadForResponse({
      access_token: 'SECRET_TOKEN',
      posts: [
        {
          id: 'post-1',
          content: null,
          image_url: null,
          video_url: null,
          storage_key: 'private/path/file.jpg',
          media: [
            {
              id: 'media-1',
              media_url: 'https://private.invalid/file.jpg',
              access_level: 'protected',
              storage_bucket: 'private',
              storage_provider: 'r2',
              storage_key: 'r2/private/file.jpg',
            },
            {
              id: 'media-2',
              media_url: 'https://public.invalid/file.jpg',
              access_level: 'public',
            },
          ],
        },
      ],
    })
    const serialized = JSON.stringify(payload)

    expect(serialized).not.toContain('SECRET_TOKEN')
    expect(serialized).not.toContain('private/path')
    expect(serialized).not.toContain('storage_key')
    expect(serialized).not.toContain('storage_bucket')
    expect(serialized).not.toContain('https://private.invalid')
    expect(serialized).toContain('https://public.invalid')
  })

  it('keeps locked paid posts free of content and media after final sanitization', () => {
    const payload = sanitizeCreatorProfilePayloadForResponse({
      posts: [
        {
          id: 'paid-post',
          content: null,
          image_url: null,
          video_url: null,
          media: [],
          price_itacash: 20,
        },
      ],
    })

    expect(payload.posts[0]).toMatchObject({
      content: null,
      image_url: null,
      video_url: null,
      media: [],
      price_itacash: 20,
    })
  })

  it('keeps the client fetch uncached', () => {
    const page = fs.readFileSync(path.join(process.cwd(), 'app/u/[username]/page.tsx'), 'utf8')
    expect(page).toContain('cache: "no-store"')
  })

  it('limits paid unlock lookup to the authenticated user id', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'app/api/creator-profile/[username]/posts/route.ts'), 'utf8')
    expect(route).toContain(".eq('buyer_id', user.id)")
    expect(route).not.toContain('buyerId')
    expect(route).not.toContain('paidUnlocked')
  })

  it('declares route-level no-cache behavior', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'app/api/creator-profile/[username]/posts/route.ts'), 'utf8')
    expect(route).toContain("export const dynamic = 'force-dynamic'")
    expect(route).toContain('export const revalidate = 0')
    expect(route).toContain("export const fetchCache = 'force-no-store'")
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('@aws-sdk/client-s3', () => {
  class Command { constructor(readonly input: Record<string, unknown>) {} }
  return {
    S3Client: class { send = sdk.send },
    HeadObjectCommand: class HeadObjectCommand extends Command {},
    CopyObjectCommand: class CopyObjectCommand extends Command {},
  }
})

import { copyProfileMediaToApprovedPublicKey, headPrivateProfileMediaObject, ProfileMediaCopyError } from '../../lib/profile-media-r2'

describe('profile media R2 integration boundary', () => {
  beforeEach(() => {
    sdk.send.mockReset()
    process.env.R2_ACCOUNT_ID = 'configured-account'
    process.env.R2_ACCESS_KEY_ID = 'configured-access-key'
    process.env.R2_SECRET_ACCESS_KEY = 'configured-secret'
    process.env.R2_BUCKET_NAME = 'configured-bucket'
  })

  it('HEAD-validates a private JPEG before submission', async () => {
    sdk.send.mockResolvedValueOnce({ ContentType: 'image/jpeg', ContentLength: 1024 })
    await expect(headPrivateProfileMediaObject({ userId: 'user-a', sourceKey: 'protected/profile-media/user-a/source', mediaType: 'avatar' }))
      .resolves.toEqual({ contentType: 'image/jpeg', contentLength: 1024 })
    expect(sdk.send).toHaveBeenCalledTimes(1)
  })

  it('copies to a MIME-derived public key and confirms MIME and size with destination HEAD', async () => {
    sdk.send
      .mockResolvedValueOnce({ ContentType: 'image/webp', ContentLength: 2048 })
      .mockResolvedValueOnce({ CopyObjectResult: { ETag: 'opaque' } })
      .mockResolvedValueOnce({ ContentType: 'image/webp', ContentLength: 2048 })
    const result = await copyProfileMediaToApprovedPublicKey({ userId: 'user-a', sourceKey: 'protected/profile-media/user-a/source.untrusted', mediaType: 'banner' })
    expect(result.approvedKey).toMatch(/^profile-media\/public\/user-a\/[0-9a-f-]+\.webp$/)
    expect(sdk.send).toHaveBeenCalledTimes(3)
  })

  it('rejects a missing source before copy', async () => {
    sdk.send.mockRejectedValueOnce(new Error('not found'))
    await expect(copyProfileMediaToApprovedPublicKey({ userId: 'user-a', sourceKey: 'protected/profile-media/user-a/missing', mediaType: 'avatar' })).rejects.toThrow('not found')
    expect(sdk.send).toHaveBeenCalledTimes(1)
  })

  it('marks a destination confirmation failure as a possible orphan', async () => {
    sdk.send
      .mockResolvedValueOnce({ ContentType: 'image/png', ContentLength: 4096 })
      .mockResolvedValueOnce({ CopyObjectResult: {} })
      .mockResolvedValueOnce({ ContentType: 'image/png', ContentLength: 0 })
    const error = await copyProfileMediaToApprovedPublicKey({ userId: 'user-a', sourceKey: 'protected/profile-media/user-a/source', mediaType: 'avatar' }).catch((value) => value)
    expect(error).toBeInstanceOf(ProfileMediaCopyError)
    expect(error.copyMayExist).toBe(true)
    expect(error.approvedKey).toMatch(/^profile-media\/public\/user-a\//)
  })
})

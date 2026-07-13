import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('@aws-sdk/client-s3', () => {
  class Command { constructor(readonly input: Record<string, unknown>) {} }
  return {
    S3Client: class { send = sdk.send },
    HeadObjectCommand: class HeadObjectCommand extends Command {},
    CopyObjectCommand: class CopyObjectCommand extends Command {},
    DeleteObjectCommand: class DeleteObjectCommand extends Command {},
  }
})

import { copyProfileMediaToApprovedPublicKey, deleteApprovedProfileMediaObject, headPrivateProfileMediaObject, ProfileMediaCopyError } from '../../lib/profile-media-r2'

describe('profile media R2 integration boundary', () => {
  const userId = '11111111-1111-4111-8111-111111111111'
  const approvedKey = 'profile-media/public/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg'
  const approvedPngKey = 'profile-media/public/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png'
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
    const result = await copyProfileMediaToApprovedPublicKey({ userId, sourceKey: `protected/profile-media/${userId}/source.untrusted`, mediaType: 'banner' })
    expect(result.approvedKey).toMatch(new RegExp(`^profile-media/public/${userId}/[0-9a-f-]+\\.webp$`))
    expect(sdk.send).toHaveBeenCalledTimes(3)
  })

  it('rejects a missing source before copy', async () => {
    sdk.send.mockRejectedValueOnce(new Error('not found'))
    await expect(copyProfileMediaToApprovedPublicKey({ userId, sourceKey: `protected/profile-media/${userId}/missing`, mediaType: 'avatar' })).rejects.toThrow('not found')
    expect(sdk.send).toHaveBeenCalledTimes(1)
  })

  it('marks a destination confirmation failure as a possible orphan', async () => {
    sdk.send
      .mockResolvedValueOnce({ ContentType: 'image/png', ContentLength: 4096 })
      .mockResolvedValueOnce({ CopyObjectResult: {} })
      .mockResolvedValueOnce({ ContentType: 'image/png', ContentLength: 0 })
    const error = await copyProfileMediaToApprovedPublicKey({ userId, sourceKey: `protected/profile-media/${userId}/source`, mediaType: 'avatar' }).catch((value) => value)
    expect(error).toBeInstanceOf(ProfileMediaCopyError)
    expect(error.copyMayExist).toBe(true)
    expect(error.approvedKey).toContain(`profile-media/public/${userId}/`)
  })

  it('deletes an approved public orphan and confirms absence after the executor safety checks', async () => {
    sdk.send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } }))
    await expect(deleteApprovedProfileMediaObject(approvedKey)).resolves.toBe('deleted')
    expect(sdk.send).toHaveBeenCalledTimes(2)
  })

  it('does not reinterpret a DeleteObject failure as an absent object', async () => {
    sdk.send.mockRejectedValueOnce(Object.assign(new Error('missing'), { name: 'NoSuchKey' }))
    await expect(deleteApprovedProfileMediaObject(approvedKey)).rejects.toMatchObject({ name: 'NoSuchKey' })
    expect(sdk.send).toHaveBeenCalledTimes(1)
  })

  it('fails when DeleteObject fails or destination confirmation still finds the object', async () => {
    sdk.send
      .mockRejectedValueOnce(new Error('delete failed'))
    await expect(deleteApprovedProfileMediaObject(approvedPngKey)).rejects.toThrow('delete failed')
    expect(sdk.send).toHaveBeenCalledTimes(1)
    sdk.send.mockReset()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ ContentType: 'image/png', ContentLength: 100 })
    await expect(deleteApprovedProfileMediaObject(approvedPngKey)).rejects.toThrow('could not be confirmed')
  })
})

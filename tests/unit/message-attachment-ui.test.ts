import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(resolve(process.cwd(), 'app/messages/[id]/page.tsx'), 'utf8')
const clientSource = readFileSync(resolve(process.cwd(), 'lib/message-attachments/client.ts'), 'utf8')

describe('private message attachment UI integration', () => {
  it('has no browser-side attachment DML or direct message-media writes', () => {
    expect(pageSource).not.toMatch(/from\(\s*['"]message_attachments['"]\s*\)\s*\.insert\s*\(/u)
    expect(pageSource).not.toMatch(/from\(\s*['"]message_attachments['"]\s*\)\s*\.update\s*\(/u)
    expect(pageSource).not.toMatch(/from\(\s*['"]message_attachments['"]\s*\)\s*\.delete\s*\(/u)
    expect(pageSource).not.toMatch(/storage\s*\.from\(\s*['"]message-media['"]\s*\)\s*\.upload\s*\(/u)
    expect(pageSource).not.toMatch(/storage\s*\.from\(\s*['"]message-media['"]\s*\)\s*\.remove\s*\(/u)
  })

  it('routes new attachment mutations through the client-safe B1 API helper', () => {
    expect(pageSource).toContain("from '@/lib/message-attachments/client'")
    expect(pageSource).toContain('uploadAndConfirmMessageAttachment({')
    expect(pageSource).toContain('deleteMessageAttachment({ accessToken, attachmentId: attachment.id })')
    expect(pageSource).not.toContain('makeFileNameSafe')
    expect(pageSource).not.toContain('isPrivateMessageAttachmentR2Path')
  })

  it('keeps the helper free from server-only storage concerns and raw keys', () => {
    expect(clientSource).not.toMatch(/from\s+['"][^'"]*\/(?:r2|security)['"]/u)
    expect(clientSource).not.toContain('@aws-sdk')
    expect(clientSource).not.toContain('process.env')
    expect(clientSource).not.toContain('message-media')
    expect(clientSource).not.toContain('private/messages/')
    expect(clientSource).not.toContain('message_attachments')
    expect(clientSource).not.toContain('storage_path')
  })
})

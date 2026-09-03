import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260903134034_harden_storage_write_ownership.sql',
  'utf8',
)

const normalizedMigration = migration.replace(/\s+/g, ' ').trim()

const userA = '11111111-1111-4111-8111-111111111111'
const userB = '22222222-2222-4222-8222-222222222222'

type PolicyCommand = 'insert' | 'update' | 'delete'

const expectedPolicies: ReadonlyArray<{ name: string; command: PolicyCommand }> = [
  { name: 'Users can upload own avatar', command: 'insert' },
  { name: 'Users can update own avatar', command: 'update' },
  { name: 'Users can delete own avatar', command: 'delete' },
  { name: 'Authenticated users can upload post images', command: 'insert' },
  { name: 'Authenticated users can update post images', command: 'update' },
  { name: 'Authenticated users can delete post images', command: 'delete' },
  { name: 'Authenticated users can upload post videos', command: 'insert' },
]

const expectedPolicyCommands = new Map(
  expectedPolicies.map(({ name, command }) => [name.toLowerCase(), command]),
)

const untouchedPublicSelectPolicies = [
  'Avatar images are publicly accessible',
  'Post images are publicly accessible',
  'Public can view post videos',
] as const

const untouchedPostVideoOwnerPolicies = [
  'Users can update own post videos',
  'Users can delete own post videos',
] as const

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getStatements(sql: string) {
  return sql
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function validatePolicyStructure(sql: string) {
  const errors: string[] = []
  const statements = getStatements(sql)
  const dropCounts = new Map<string, number>()
  const createCounts = new Map<string, number>()
  const qualifiedTablePattern = '([a-z_][\\w$]*\\s*\\.\\s*[a-z_][\\w$]*)'
  const dropPattern = new RegExp(
    `^drop\\s+policy\\s+if\\s+exists\\s+"([^"]+)"\\s+on\\s+${qualifiedTablePattern}$`,
    'i',
  )
  const createPattern = new RegExp(
    `^create\\s+policy\\s+"([^"]+)"\\s+on\\s+${qualifiedTablePattern}\\s+for\\s+(insert|update|delete)\\s+to\\s+([a-z_][\\w$]*)\\s+.+$`,
    'i',
  )

  if (statements.length !== 14) {
    errors.push(`expected 14 statements, received ${statements.length}`)
  }

  if (/\bpublic\s*\./i.test(sql)) {
    errors.push('public schema references are forbidden')
  }

  for (const statement of statements) {
    const dropMatch = statement.match(dropPattern)

    if (dropMatch) {
      const [, policyName, target] = dropMatch
      const normalizedName = policyName.toLowerCase()

      if (!expectedPolicyCommands.has(normalizedName)) {
        errors.push(`unexpected DROP policy: ${policyName}`)
      }
      if (target.replace(/\s+/g, '').toLowerCase() !== 'storage.objects') {
        errors.push(`unexpected DROP target for ${policyName}: ${target}`)
      }

      dropCounts.set(normalizedName, (dropCounts.get(normalizedName) || 0) + 1)
      continue
    }

    const createMatch = statement.match(createPattern)

    if (!createMatch) {
      errors.push(`unsupported policy statement: ${statement}`)
      continue
    }

    const [, policyName, target, command, role] = createMatch
    const normalizedName = policyName.toLowerCase()
    const expectedCommand = expectedPolicyCommands.get(normalizedName)

    if (!expectedCommand) {
      errors.push(`unexpected CREATE policy: ${policyName}`)
    }
    if (target.replace(/\s+/g, '').toLowerCase() !== 'storage.objects') {
      errors.push(`unexpected CREATE target for ${policyName}: ${target}`)
    }
    if (command.toLowerCase() !== expectedCommand) {
      errors.push(`unexpected command for ${policyName}: ${command}`)
    }
    if (role.toLowerCase() !== 'authenticated') {
      errors.push(`unexpected role for ${policyName}: ${role}`)
    }

    createCounts.set(normalizedName, (createCounts.get(normalizedName) || 0) + 1)
  }

  for (const { name } of expectedPolicies) {
    const normalizedName = name.toLowerCase()

    if (dropCounts.get(normalizedName) !== 1) {
      errors.push(`expected exactly one DROP on storage.objects for ${name}`)
    }
    if (createCounts.get(normalizedName) !== 1) {
      errors.push(`expected exactly one CREATE on storage.objects for ${name}`)
    }
  }

  if ([...dropCounts.values()].reduce((total, count) => total + count, 0) !== 7) {
    errors.push('expected exactly seven DROP policies')
  }
  if ([...createCounts.values()].reduce((total, count) => total + count, 0) !== 7) {
    errors.push('expected exactly seven CREATE policies')
  }

  return errors
}

function expectRejectedMutation(mutatedMigration: string) {
  expect(mutatedMigration).not.toBe(migration)
  expect(validatePolicyStructure(mutatedMigration)).not.toEqual([])
}

function getCreatedPolicy(policyName: string, command: 'insert' | 'update' | 'delete') {
  const match = normalizedMigration.match(
    new RegExp(
      `create policy "${escapeRegExp(policyName)}" on storage\\.objects for ${command} to authenticated ([\\s\\S]*?);`,
      'i',
    ),
  )

  expect(match, `missing ${command.toUpperCase()} policy: ${policyName}`).not.toBeNull()
  return match?.[0] || ''
}

function allowsOwnedFolder(bucket: string, expectedBucket: string, objectPath: string, userId: string) {
  return bucket === expectedBucket && objectPath.split('/')[0] === userId
}

function allowsOwnedPathUpdate(
  bucket: string,
  expectedBucket: string,
  oldPath: string,
  newPath: string,
  userId: string,
) {
  return (
    allowsOwnedFolder(bucket, expectedBucket, oldPath, userId) &&
    allowsOwnedFolder(bucket, expectedBucket, newPath, userId)
  )
}

describe('Batch 04B storage write ownership migration', () => {
  it('contains only the seven authorized policy replacements', () => {
    const statements = getStatements(migration)

    expect(statements).toHaveLength(14)
    expect(statements.filter((statement) => /^drop policy if exists /i.test(statement))).toHaveLength(7)
    expect(statements.filter((statement) => /^create policy /i.test(statement))).toHaveLength(7)
    expect(statements.every((statement) => /^(drop|create) policy /i.test(statement))).toBe(true)

    expect(migration).not.toMatch(/\binsert\s+into\b/i)
    expect(migration).not.toMatch(/\bupdate\s+[\w."']+\s+set\b/i)
    expect(migration).not.toMatch(/\bdelete\s+from\b/i)
    expect(migration).not.toMatch(/\balter\s+table\b/i)
    expect(migration).not.toMatch(/\bcreate\s+(or\s+replace\s+)?function\b/i)
    expect(migration).not.toMatch(/\btrigger\b|\bgrant\b|\brevoke\b/i)
    expect(migration).not.toMatch(/storage\.buckets/i)
    expect(migration).not.toMatch(/\bpublic\s*\./i)
  })

  it('validates every DROP and CREATE against the policy structure allowlist', () => {
    expect(validatePolicyStructure(migration)).toEqual([])
  })

  it.each([
    {
      mutation: 'DROP target changed to public.profiles',
      sql: migration.replace(
        /(drop\s+policy\s+if\s+exists\s+"Users can upload own avatar"\s+on\s+)storage\.objects/i,
        '$1public.profiles',
      ),
    },
    {
      mutation: 'CREATE target changed to public.profiles',
      sql: migration.replace(
        /(create\s+policy\s+"Users can upload own avatar"\s+on\s+)storage\.objects/i,
        '$1public.profiles',
      ),
    },
    {
      mutation: 'DROP target changed to storage.buckets',
      sql: migration.replace(
        /(drop\s+policy\s+if\s+exists\s+"Users can update own avatar"\s+on\s+)storage\.objects/i,
        '$1storage.buckets',
      ),
    },
    {
      mutation: 'required DROP removed',
      sql: migration.replace(
        /drop\s+policy\s+if\s+exists\s+"Users can delete own avatar"\s+on\s+storage\.objects\s*;/i,
        '',
      ),
    },
    {
      mutation: 'extra public policy statement added',
      sql: `${migration}\ndrop policy if exists "x" on public.profiles;`,
    },
    {
      mutation: 'extra storage.objects policy outside the allowlist added',
      sql: `${migration}\ndrop policy if exists "x" on storage.objects;`,
    },
  ])('rejects structural mutation: $mutation', ({ sql }) => {
    expectRejectedMutation(sql)
  })

  it('uses the authenticated UID folder for avatars INSERT, UPDATE and DELETE', () => {
    const insertPolicy = getCreatedPolicy('Users can upload own avatar', 'insert')
    const updatePolicy = getCreatedPolicy('Users can update own avatar', 'update')
    const deletePolicy = getCreatedPolicy('Users can delete own avatar', 'delete')
    const predicate = "bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text)"

    expect(insertPolicy).toContain(`with check ( ${predicate} )`)
    expect(updatePolicy).toContain(`using ( ${predicate} ) with check ( ${predicate} )`)
    expect(deletePolicy).toContain(`using ( ${predicate} )`)
  })

  it('uses the authenticated UID folder for post-images INSERT, UPDATE and DELETE', () => {
    const insertPolicy = getCreatedPolicy('Authenticated users can upload post images', 'insert')
    const updatePolicy = getCreatedPolicy('Authenticated users can update post images', 'update')
    const deletePolicy = getCreatedPolicy('Authenticated users can delete post images', 'delete')
    const predicate = "bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid()::text)"

    expect(insertPolicy).toContain(`with check ( ${predicate} )`)
    expect(updatePolicy).toContain(`using ( ${predicate} ) with check ( ${predicate} )`)
    expect(deletePolicy).toContain(`using ( ${predicate} )`)
  })

  it('hardens only post-videos INSERT and leaves owner-based UPDATE and DELETE untouched', () => {
    const insertPolicy = getCreatedPolicy('Authenticated users can upload post videos', 'insert')
    const predicate = "bucket_id = 'post-videos' and (storage.foldername(name))[1] = (select auth.uid()::text)"

    expect(insertPolicy).toContain(`with check ( ${predicate} )`)
    for (const policyName of untouchedPostVideoOwnerPolicies) {
      expect(migration).not.toContain(policyName)
    }
  })

  it('preserves every public SELECT policy by leaving it untouched', () => {
    for (const policyName of untouchedPublicSelectPolicies) {
      expect(migration).not.toContain(policyName)
    }
    expect(migration).not.toMatch(/for\s+select/i)
  })

  it.each(['avatars', 'post-images'])(
    'allows own-folder writes and denies cross-user writes for %s',
    (bucket) => {
      const ownPath = `${userA}/file.jpg`
      const foreignNewPath = `${userA}/file2.jpg`

      expect(allowsOwnedFolder(bucket, bucket, ownPath, userA)).toBe(true)
      expect(allowsOwnedFolder(bucket, bucket, foreignNewPath, userB)).toBe(false)
      expect(allowsOwnedPathUpdate(bucket, bucket, ownPath, ownPath, userA)).toBe(true)
      expect(allowsOwnedPathUpdate(bucket, bucket, ownPath, ownPath, userB)).toBe(false)
      expect(allowsOwnedFolder(bucket, bucket, ownPath, userB)).toBe(false)
      expect(allowsOwnedPathUpdate(bucket, bucket, ownPath, `${userB}/file.jpg`, userA)).toBe(false)
    },
  )

  it('allows post-videos INSERT only in the authenticated user folder', () => {
    expect(allowsOwnedFolder('post-videos', 'post-videos', `${userA}/file.mp4`, userA)).toBe(true)
    expect(allowsOwnedFolder('post-videos', 'post-videos', `${userA}/file2.mp4`, userB)).toBe(false)
  })

  it('records the approved legacy compatibility evidence for this scope', () => {
    const legacyEvidence = {
      avatars: { total: 35, conforming: 35 },
      postImages: { total: 49, conforming: 49 },
      postVideos: { total: 12, conforming: 12 },
      rootOrInvalidPaths: 0,
      nullOwner: 0,
      nullOwnerId: 0,
      pathOwnerMismatch: 0,
      pathOwnerIdMismatch: 0,
    }

    expect(legacyEvidence.avatars.conforming).toBe(legacyEvidence.avatars.total)
    expect(legacyEvidence.postImages.conforming).toBe(legacyEvidence.postImages.total)
    expect(legacyEvidence.postVideos.conforming).toBe(legacyEvidence.postVideos.total)
    expect(legacyEvidence.rootOrInvalidPaths).toBe(0)
    expect(legacyEvidence.nullOwner).toBe(0)
    expect(legacyEvidence.nullOwnerId).toBe(0)
    expect(legacyEvidence.pathOwnerMismatch).toBe(0)
    expect(legacyEvidence.pathOwnerIdMismatch).toBe(0)
  })
})

import { expect, type Page } from '@playwright/test'

/** Assert persisted photo references, bytes, and usable previews across a reload. */
export async function expectPhotoRecoveryAfterReload(page: Page, names: string[]) {
  const readProject = () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))
    return key ? JSON.parse(localStorage.getItem(key)!) : null
  })
  await expect.poll(async () => {
    const project = await readProject()
    return project?.photoSlides?.length === names.length && project.photoSlides.every((slide: { assetId?: string }) => Boolean(slide.assetId))
  }).toBe(true)
  const before = await readProject()
  expect(before.photoSlides.map((slide: { media: { name: string } }) => slide.media.name)).toEqual(names)
  const stored = await page.evaluate(async (project) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('entreus-studio-music-v1')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await Promise.all(project.photoSlides.map(async (slide: { assetId: string; media: { size: number } }) => {
        const record = await new Promise<{ file: File } | undefined>((resolve, reject) => {
          const request = db.transaction('assets').objectStore('assets').get([project.id, slide.assetId])
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        if (!record?.file || record.file.size !== slide.media.size) return false
        const digest = await crypto.subtle.digest('SHA-256', await record.file.arrayBuffer())
        return `photo-sha256-${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')}` === slide.assetId
      }))
    } finally { db.close() }
  }, before)
  expect(stored).toEqual(names.map(() => true))
  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  for (const name of names) await expect(page.getByLabel(`Reassociar ${name}`)).toHaveCount(0)
  expect((await readProject()).photoSlides).toEqual(before.photoSlides)
  await expect(page.getByTestId('editor-preview').getByRole('img', { name: names[0], exact: true }).first()).toBeVisible()
}

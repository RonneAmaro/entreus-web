export const SCREEN_RECORDER_DRAFT_SOURCE = 'screen-recorder'
export const LOCAL_VIDEO_DRAFT_DB_NAME = 'entreus-lab-video-drafts'
export const LOCAL_VIDEO_DRAFT_STORE_NAME = 'drafts'
export const LOCAL_VIDEO_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

export type LocalVideoDraftSource = typeof SCREEN_RECORDER_DRAFT_SOURCE

export type LocalVideoDraftMetadata = {
  source: LocalVideoDraftSource
  name: string
  type: string
  size: number
  updatedAt: number
}

type LocalVideoDraftRecord = LocalVideoDraftMetadata & {
  id: string
  blob: Blob
}

type LocalVideoDraftStorageEnvironment = {
  indexedDB?: IDBFactory | null
}

export function isSupportedLocalVideoDraftSource(source: string | null | undefined): source is LocalVideoDraftSource {
  return source === SCREEN_RECORDER_DRAFT_SOURCE
}

export function getLocalVideoDraftId(source: LocalVideoDraftSource = SCREEN_RECORDER_DRAFT_SOURCE) {
  return `lab-video-draft:${source}`
}

export function getLocalVideoDraftTargetUrl(source: LocalVideoDraftSource = SCREEN_RECORDER_DRAFT_SOURCE) {
  return `/lab/video-editor?source=${encodeURIComponent(source)}`
}

export function isLocalVideoDraftStorageAvailable(
  environment: LocalVideoDraftStorageEnvironment = globalThis as LocalVideoDraftStorageEnvironment,
) {
  return Boolean(environment.indexedDB)
}

export function isLocalVideoDraftMetadataFresh(
  updatedAt: number,
  now = Date.now(),
  maxAgeMs = LOCAL_VIDEO_DRAFT_MAX_AGE_MS,
) {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return false
  if (!Number.isFinite(now) || now <= 0) return false
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return false

  return updatedAt <= now + 60_000 && now - updatedAt <= maxAgeMs
}

export function isUsableLocalVideoDraftRecord(record: unknown, now = Date.now()): record is LocalVideoDraftRecord {
  if (!record || typeof record !== 'object') return false

  const draft = record as Partial<LocalVideoDraftRecord>

  return (
    isSupportedLocalVideoDraftSource(draft.source) &&
    typeof draft.id === 'string' &&
    draft.id === getLocalVideoDraftId(draft.source) &&
    typeof draft.name === 'string' &&
    draft.name.trim().length > 0 &&
    typeof draft.type === 'string' &&
    typeof draft.size === 'number' &&
    draft.size > 0 &&
    isLocalVideoDraftMetadataFresh(Number(draft.updatedAt), now) &&
    draft.blob instanceof Blob &&
    draft.blob.size > 0
  )
}

function getIndexedDB() {
  if (!isLocalVideoDraftStorageAvailable()) {
    throw new Error('IndexedDB não está disponível neste navegador.')
  }

  return (globalThis as LocalVideoDraftStorageEnvironment).indexedDB as IDBFactory
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Falha ao acessar o armazenamento local.'))
  })
}

function transactionToPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error || new Error('Operação local cancelada.'))
    transaction.onerror = () => reject(transaction.error || new Error('Falha na operação local.'))
  })
}

function openLocalVideoDraftDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = getIndexedDB().open(LOCAL_VIDEO_DRAFT_DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(LOCAL_VIDEO_DRAFT_STORE_NAME)) {
        db.createObjectStore(LOCAL_VIDEO_DRAFT_STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o armazenamento local.'))
  })
}

export async function saveLocalVideoDraft({
  source = SCREEN_RECORDER_DRAFT_SOURCE,
  blob,
  name,
}: {
  source?: LocalVideoDraftSource
  blob: Blob
  name: string
}) {
  if (!isSupportedLocalVideoDraftSource(source)) {
    throw new Error('Origem de vídeo local inválida.')
  }

  if (!blob || blob.size <= 0) {
    throw new Error('A gravação local está vazia.')
  }

  const cleanName = name.trim() || 'entreus-gravacao-tela.webm'
  const now = Date.now()
  const record: LocalVideoDraftRecord = {
    id: getLocalVideoDraftId(source),
    source,
    name: cleanName,
    type: blob.type || 'video/webm',
    size: blob.size,
    updatedAt: now,
    blob,
  }
  const db = await openLocalVideoDraftDatabase()

  try {
    const transaction = db.transaction(LOCAL_VIDEO_DRAFT_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(LOCAL_VIDEO_DRAFT_STORE_NAME)
    const completed = transactionToPromise(transaction)

    await requestToPromise(store.put(record))
    await completed

    return {
      source,
      name: record.name,
      type: record.type,
      size: record.size,
      updatedAt: record.updatedAt,
    } satisfies LocalVideoDraftMetadata
  } finally {
    db.close()
  }
}

export async function loadLocalVideoDraft(source: LocalVideoDraftSource = SCREEN_RECORDER_DRAFT_SOURCE) {
  const db = await openLocalVideoDraftDatabase()

  try {
    const transaction = db.transaction(LOCAL_VIDEO_DRAFT_STORE_NAME, 'readonly')
    const store = transaction.objectStore(LOCAL_VIDEO_DRAFT_STORE_NAME)
    const completed = transactionToPromise(transaction)
    const record = await requestToPromise(store.get(getLocalVideoDraftId(source)))

    await completed

    if (!isUsableLocalVideoDraftRecord(record)) {
      await clearLocalVideoDraft(source)
      return null
    }

    return new File([record.blob], record.name, {
      type: record.type || record.blob.type || 'video/webm',
      lastModified: record.updatedAt,
    })
  } finally {
    db.close()
  }
}

export async function clearLocalVideoDraft(source: LocalVideoDraftSource = SCREEN_RECORDER_DRAFT_SOURCE) {
  const db = await openLocalVideoDraftDatabase()

  try {
    const transaction = db.transaction(LOCAL_VIDEO_DRAFT_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(LOCAL_VIDEO_DRAFT_STORE_NAME)
    const completed = transactionToPromise(transaction)

    await requestToPromise(store.delete(getLocalVideoDraftId(source)))
    await completed
  } finally {
    db.close()
  }
}

export async function clearOldLocalVideoDrafts(now = Date.now()) {
  const db = await openLocalVideoDraftDatabase()

  try {
    const transaction = db.transaction(LOCAL_VIDEO_DRAFT_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(LOCAL_VIDEO_DRAFT_STORE_NAME)
    const completed = transactionToPromise(transaction)
    const records = await requestToPromise(store.getAll())

    for (const record of records) {
      if (!isUsableLocalVideoDraftRecord(record, now)) {
        const id = typeof record === 'object' && record && 'id' in record ? (record as { id?: unknown }).id : null

        if (typeof id === 'string') {
          await requestToPromise(store.delete(id))
        }
      }
    }

    await completed
  } finally {
    db.close()
  }
}

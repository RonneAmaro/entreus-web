export const STICKER_DB_NAME = 'entreus-studio-stickers-v1'
const STORE = 'assets'
export const MAX_STICKER_BYTES = 5 * 1024 * 1024
export const MAX_STICKER_DIMENSION = 4096

export function stickerFileKind(bytes: Uint8Array): 'png' | 'webp' | null {
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length))
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v) && ascii(12, 4) === 'IHDR') {
    // Reject APNG, including a late animation control chunk.
    for (let i = 8; i + 12 <= bytes.length;) {
      const n = new DataView(bytes.buffer, bytes.byteOffset + i, 4).getUint32(0)
      if (n > bytes.length - i - 12) return null
      if (ascii(i + 4, 4) === 'acTL') return null
      if (ascii(i + 4, 4) === 'IEND') return 'png'
      i += n + 12
    }
    return null
  }
  if (bytes.length >= 20 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (view.getUint32(4, true) + 8 !== bytes.length) return null
    for (let i = 12; i + 8 <= bytes.length;) {
      const kind = ascii(i, 4), n = view.getUint32(i + 4, true)
      if (n > bytes.length - i - 8) return null
      if (kind === 'ANIM' || kind === 'ANMF' || (kind === 'VP8X' && n > 0 && (bytes[i + 8] & 2))) return null
      i += 8 + n + (n & 1)
    }
    return 'webp'
  }
  return null
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false
    const request = indexedDB.open(STICKER_DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: ['projectId', 'assetId'] })
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result) }
    request.onerror = () => reject(request.error || new Error('Falha ao abrir armazenamento de stickers.'))
    request.onblocked = () => { blocked = true; reject(new Error('Armazenamento de stickers bloqueado.')) }
  })
}

async function operation<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = action(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onabort = () => reject(tx.error || request.error || new Error('Falha ao salvar sticker.'))
      tx.onerror = () => reject(tx.error || request.error || new Error('Falha ao acessar sticker.'))
    })
  } finally { db.close() }
}
export async function saveStickerAsset(projectId: string, assetId: string, blob: Blob): Promise<void> {
  if (!projectId || !assetId || !blob.size) throw new Error('Sticker inválido.')
  await operation('readwrite', (store) => store.put({ projectId, assetId, blob }))
}
export async function loadStickerAsset(projectId: string, assetId: string): Promise<Blob | null> {
  const record = await operation('readonly', (store) => store.get([projectId, assetId]))
  return record?.blob instanceof Blob && record.blob.size > 0 ? record.blob : null
}

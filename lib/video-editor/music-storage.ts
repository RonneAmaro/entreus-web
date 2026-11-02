const DB = 'entreus-studio-music-v1'
const STORE = 'assets'
export const MAX_MUSIC_BYTES = 25 * 1024 * 1024
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: ['projectId', 'assetId'] })
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result) }
    request.onerror = () => reject(request.error || new Error('Falha ao abrir armazenamento de música.'))
    request.onblocked = () => { blocked = true; reject(new Error('Armazenamento de música bloqueado.')) }
  })
}
async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try { return await new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode), request = action(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(request.result)
    tx.onabort = () => reject(tx.error || request.error || new Error('Falha ao salvar música.'))
    tx.onerror = () => reject(tx.error || request.error || new Error('Falha ao acessar música.'))
  }) } finally { db.close() }
}
export async function saveMusicAsset(projectId: string, assetId: string, file: File): Promise<void> {
  if (!projectId || !assetId || !file.size || file.size > MAX_MUSIC_BYTES) throw new Error('Arquivo de música inválido.')
  await run('readwrite', (store) => store.put({ projectId, assetId, file }))
}
export async function loadMusicAsset(projectId: string, assetId: string): Promise<File | null> {
  const result = await run('readonly', (store) => store.get([projectId, assetId]))
  return result?.file instanceof File && result.file.size > 0 ? result.file : null
}

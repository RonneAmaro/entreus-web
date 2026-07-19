import { createServer } from 'node:http'
import next from 'next'

export default async function productionServerSetup() {
  const hostname = 'localhost'
  const port = 3000
  const app = next({ dev: false, hostname, port })
  const handle = app.getRequestHandler()

  await app.prepare()
  const server = createServer((request, response) => handle(request, response))
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, hostname, resolve)
  })

  return async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

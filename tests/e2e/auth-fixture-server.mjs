// Local HTTP fixture only. Never imported by the application or deployed.
// Exercises the real SDK/cookie lifecycle; does not represent a real Supabase service.
import { createServer } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'

export const fixtureUrl = 'http://localhost:54329'

export async function startAuthFixture() {
  const sessions = new Map()
  const refreshes = new Map()
  const profile = (user) => ({ id: user.id, username: 'session-test', display_name: 'Session Test',
    birth_date: '1990-01-01', is_minor: false, parental_consent_status: 'not_required', role: 'user',
    terms_accepted_at: '2026-01-01', privacy_accepted_at: '2026-01-01', profile_content_mode: 'general' })
  function issue(user, previous, expiresIn = 3600) {
    const exp = Math.floor(Date.now() / 1000) + expiresIn
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const access = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp })}.${randomBytes(24).toString('base64url')}`
    const session = { access_token: access, refresh_token: randomBytes(24).toString('base64url'),
      expires_in: expiresIn, expires_at: exp, token_type: 'bearer', user }
    const entry = { session, profile: previous?.profile ?? profile(user), refreshCount: previous?.refreshCount ?? 0 }
    sessions.set(access, entry)
    refreshes.set(session.refresh_token, entry)
    return entry
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, fixtureUrl)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, accept-profile, content-profile, range')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    const send = (body, status = 200) => { res.statusCode = status; res.end(JSON.stringify(body)) }
    if (req.method === 'OPTIONS') return send({})
    let body = {}
    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      if (chunks.length) body = JSON.parse(Buffer.concat(chunks).toString())
    } catch { return send({ error: 'invalid_json' }, 400) }
    const bearer = (req.headers.authorization || '').replace(/^Bearer /, '')
    const entry = sessions.get(bearer)
    if (url.pathname === '/__fixture/register') {
      const registered = { session: body.session, profile: body.profile ?? profile(body.session.user), refreshCount: 0 }
      sessions.set(body.session.access_token, registered)
      refreshes.set(body.session.refresh_token, registered)
      return send({ ok: true })
    }
    if (url.pathname === '/__fixture/expire' && entry) {
      const expired = issue(entry.session.user, entry, -1)
      return send(expired.session)
    }
    if (url.pathname === '/__fixture/state' && entry) return send({ refreshCount: entry.refreshCount })
    if (url.pathname === '/__fixture/profile' && entry) { entry.profile = { ...entry.profile, ...body }; return send({ ok: true }) }
    if (url.pathname === '/__fixture/unavailable' && entry) { entry.unavailable = Boolean(body.unavailable); return send({ ok: true }) }
    if (url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'password') {
        if (!body.email?.endsWith('@example.test') || body.password !== 'fixture-only-password') return send({ code: 'invalid_credentials' }, 400)
        const user = { id: randomUUID(), email: body.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
        return send(issue(user).session)
      }
      const previous = refreshes.get(body.refresh_token)
      if (!previous) return send({ code: 'refresh_token_not_found', message: 'Fixture session revoked' }, 400)
      // Rotation reuse window models concurrent requests without issuing competing successors.
      if (previous.successor) return send(previous.successor.session)
      const next = issue(previous.session.user, previous)
      next.refreshCount += 1
      previous.successor = next
      return send(next.session)
    }
    if (url.pathname === '/auth/v1/user') {
      if (entry?.unavailable) return send({ code: 'unexpected_failure' }, 503)
      return entry ? send(entry.session.user) : send({ code: 'bad_jwt', message: 'Unregistered fixture session' }, 401)
    }
    if (url.pathname === '/auth/v1/logout') {
      if (entry) {
        for (const [key, value] of sessions) if (value === entry) sessions.delete(key)
        for (const [key, value] of refreshes) if (value === entry || value.successor === entry) refreshes.delete(key)
      }
      res.statusCode = 204
      return res.end()
    }
    if (url.pathname === '/rest/v1/profiles' && entry) {
      const accept = req.headers.accept || ''
      return send(accept.includes('object') ? entry.profile : [entry.profile])
    }
    res.setHeader('Content-Range', '0-0/0')
    if (req.headers.accept?.includes('object')) return send(null)
    return send([])
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(54329, 'localhost', resolve) })
  return () => new Promise((resolve) => server.close(resolve))
}

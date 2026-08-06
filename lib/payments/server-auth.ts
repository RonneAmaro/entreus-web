export function getBearerAuthorization(request: Request) {
  const authorization = request.headers.get('authorization')?.trim() || ''
  return /^Bearer\s+\S+$/i.test(authorization) ? authorization : null
}

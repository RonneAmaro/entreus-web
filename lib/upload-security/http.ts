import { PRIVATE_NO_STORE_HEADERS } from '@/lib/creator-profile-route-security'

export const PRIVATE_UPLOAD_RESPONSE_HEADERS = Object.freeze({
  ...PRIVATE_NO_STORE_HEADERS,
  Pragma: 'no-cache',
})

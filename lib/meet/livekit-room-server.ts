import { RoomServiceClient, TwirpError } from 'livekit-server-sdk'

export const MEET_ROOM_EMPTY_TIMEOUT_SECONDS = 120
export const MEET_ROOM_DEPARTURE_TIMEOUT_SECONDS = 120

export type LiveKitRoomSummary = {
  name: string
  numParticipants?: number
}

export type LiveKitParticipantSummary = {
  identity: string
  name?: string
  kind?: number
  attributes?: Record<string, string>
  tracks?: Array<{
    sid: string
    type: number
    source: number
    muted?: boolean
  }>
}

export type LiveKitRoomService = {
  listRooms(names?: string[]): Promise<LiveKitRoomSummary[]>
  createRoom(options: {
    name: string
    emptyTimeout: number
    departureTimeout: number
  }): Promise<LiveKitRoomSummary>
  deleteRoom(roomName: string): Promise<void>
  listParticipants?(roomName: string): Promise<LiveKitParticipantSummary[]>
}

type LiveKitServerConfig = {
  url: string
  apiKey: string
  apiSecret: string
}

function readRequiredEnv(name: string) {
  const value = process.env[name]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function toHttpLiveKitUrl(value: string) {
  const url = new URL(value)
  if (url.protocol === 'wss:') url.protocol = 'https:'
  if (url.protocol === 'ws:') url.protocol = 'http:'
  return url.toString().replace(/\/$/, '')
}

export function getLiveKitServerConfig(): LiveKitServerConfig | null {
  const url = readRequiredEnv('LIVEKIT_URL')
  const apiKey = readRequiredEnv('LIVEKIT_API_KEY')
  const apiSecret = readRequiredEnv('LIVEKIT_API_SECRET')

  return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null
}

export function createLiveKitRoomService(config = getLiveKitServerConfig()) {
  if (!config) throw new Error('LIVEKIT_SERVER_CONFIG_MISSING')
  return new RoomServiceClient(toHttpLiveKitUrl(config.url), config.apiKey, config.apiSecret)
}

function isTwirpErrorWith(error: unknown, status: number, codes: string[]) {
  if (!(error instanceof TwirpError)) return false
  return error.status === status || Boolean(error.code && codes.includes(error.code.toLowerCase()))
}

export function isLiveKitAlreadyExistsError(error: unknown) {
  return isTwirpErrorWith(error, 409, ['already_exists', 'alreadyexists'])
}

export function isLiveKitNotFoundError(error: unknown) {
  return isTwirpErrorWith(error, 404, ['not_found', 'notfound'])
}

export async function ensureLiveKitMeetRoom(
  roomName: string,
  service: LiveKitRoomService = createLiveKitRoomService(),
) {
  const existing = await service.listRooms([roomName])
  const existingRoom = existing.find((room) => room.name === roomName)
  if (existingRoom) return { room: existingRoom, created: false as const }

  try {
    const room = await service.createRoom({
      name: roomName,
      emptyTimeout: MEET_ROOM_EMPTY_TIMEOUT_SECONDS,
      departureTimeout: MEET_ROOM_DEPARTURE_TIMEOUT_SECONDS,
    })
    return { room, created: true as const }
  } catch (error) {
    if (!isLiveKitAlreadyExistsError(error)) throw error

    const racedRoom = (await service.listRooms([roomName])).find((room) => room.name === roomName)
    if (!racedRoom) throw error
    return { room: racedRoom, created: false as const }
  }
}

export async function getLiveKitMeetRoom(
  roomName: string,
  service: LiveKitRoomService = createLiveKitRoomService(),
) {
  const rooms = await service.listRooms([roomName])
  return rooms.find((room) => room.name === roomName) ?? null
}

export async function listLiveKitMeetParticipants(
  roomName: string,
  service: LiveKitRoomService = createLiveKitRoomService(),
) {
  if (!service.listParticipants) {
    throw new Error('LIVEKIT_PARTICIPANT_LOOKUP_UNAVAILABLE')
  }
  return service.listParticipants(roomName)
}

export async function deleteLiveKitMeetRoom(
  roomName: string,
  service: LiveKitRoomService = createLiveKitRoomService(),
) {
  try {
    await service.deleteRoom(roomName)
    return { deleted: true as const }
  } catch (error) {
    if (isLiveKitNotFoundError(error)) return { deleted: false as const }
    throw error
  }
}

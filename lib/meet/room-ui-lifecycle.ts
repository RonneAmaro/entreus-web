import type { MeetRoom } from '@/lib/meet-server'

type MeetRoomStatus = MeetRoom['status']

export function getMeetLeaveAction(isOwner: boolean) {
  return isOwner
    ? {
        label: 'Encerrar reunião',
        title: 'Encerrar reunião para todos',
        requiresConfirmation: true,
      }
    : {
        label: 'Sair da reunião',
        title: 'Sair da reunião',
        requiresConfirmation: false,
      }
}

export function shouldRunMeetCountdown(status: MeetRoomStatus) {
  return status === 'active'
}

export function isMeetRoomFinal(status: MeetRoomStatus) {
  return status === 'ended' || status === 'expired'
}

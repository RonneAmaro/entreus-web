export type CaptionPublisherParticipant = {
  identity: string
  isAgent: boolean
}

export function isTrustedCaptionPublisher(input: {
  actualPublisherIdentity: string
  trustedPublisherIdentity: string | null
  participants: CaptionPublisherParticipant[]
}) {
  if (
    !input.trustedPublisherIdentity
    || input.actualPublisherIdentity !== input.trustedPublisherIdentity
  ) return false

  const publisher = input.participants.find(
    (participant) => participant.identity === input.actualPublisherIdentity,
  )
  return publisher?.isAgent === true
}

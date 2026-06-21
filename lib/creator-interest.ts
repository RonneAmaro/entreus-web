export type CreatorInterestInput = { name?: unknown; email?: unknown; creatorName?: unknown; category?: unknown; socialLink?: unknown; audienceSize?: unknown; message?: unknown; adultInterest?: unknown; acknowledged?: unknown }
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
export function validateCreatorInterest(input: CreatorInterestInput) {
  if (typeof input.message === 'string' && input.message.trim().length > 1200) return { ok: false as const, error: 'A mensagem é muito longa.' }
  const name = text(input.name, 120), email = text(input.email, 254), category = text(input.category, 80), message = text(input.message, 1200), socialLink = text(input.socialLink, 300)
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || !category || !message || input.acknowledged !== true) return { ok: false as const, error: 'Confira os campos obrigatórios e o aceite.' }
  if (socialLink) try { new URL(socialLink) } catch { return { ok: false as const, error: 'Informe um link válido ou deixe o campo vazio.' } }
  return { ok: true as const, value: { name, email, creator_name: text(input.creatorName,120)||null, category, social_link:socialLink||null, audience_size:text(input.audienceSize,80)||null, message, has_adult_content_interest: input.adultInterest === true } }
}

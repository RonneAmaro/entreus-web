export type MinimalProfile = { id: string; username?: string | null; birth_date?: string | null; is_minor?: boolean | null; parental_consent_status?: string | null }
type ProfileClient = { from: (table: string) => { select: (columns: string) => { eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: MinimalProfile | null; error: unknown }> } }; upsert: (value: { id: string }, options: { onConflict: string; ignoreDuplicates: boolean }) => Promise<{ error: unknown }> } }

export async function ensureProfile(client: ProfileClient, userId: string) {
  const profiles = client.from('profiles')
  const existing = await profiles.select('id, username, birth_date, is_minor, parental_consent_status').eq('id', userId).maybeSingle()
  if (existing.data) return { profile: existing.data, created: false, error: null }
  const created = await profiles.upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })
  if (created.error) return { profile: null, created: false, error: created.error }
  const recovered = await profiles.select('id, username, birth_date, is_minor, parental_consent_status').eq('id', userId).maybeSingle()
  return { profile: recovered.data, created: true, error: recovered.error }
}

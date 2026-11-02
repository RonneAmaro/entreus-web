import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveEntryDestination } from '@/lib/auth/session-routing'
import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const destination = await resolveEntryDestination(await createClient())
  if (destination) redirect(destination)
  return <LoginForm />
}

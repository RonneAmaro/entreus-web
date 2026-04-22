import { supabase } from '@/lib/supabase'

type PageProps = {
  params: Promise<{
    username: string
  }>
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { username } = await params

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, country, created_at')
    .eq('username', username)
    .single()

  if (profileError || !profile) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-bold mb-3">Perfil não encontrado</h1>
          <p className="text-zinc-400">
            Não encontramos nenhum usuário com esse endereço.
          </p>
        </div>
      </main>
    )
  }

  const { data: posts } = await supabase
    .from('posts')
    .select('id, content, category, created_at')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-2xl font-bold">EntreUS</h1>
        <p className="text-sm text-zinc-400">Perfil público</p>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 mb-6">
          <h2 className="text-3xl font-bold">
            {profile.display_name || 'Usuário'}
          </h2>

          <p className="text-zinc-400 mt-1">@{profile.username}</p>

          {profile.bio && (
            <p className="text-zinc-200 mt-5 whitespace-pre-wrap">
              {profile.bio}
            </p>
          )}

          {profile.country && (
            <p className="text-zinc-500 mt-4">País: {profile.country}</p>
          )}
        </div>

        <h3 className="text-xl font-semibold mb-4">Publicações</h3>

        <div className="space-y-4">
          {posts?.length === 0 && (
            <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 text-zinc-400">
              Este usuário ainda não publicou nada.
            </div>
          )}

          {posts?.map((post) => (
            <article
              key={post.id}
              className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800"
            >
              <p className="text-sm text-zinc-500 mb-3">{post.category}</p>
              <p className="text-zinc-200 whitespace-pre-wrap">{post.content}</p>
              <p className="text-xs text-zinc-600 mt-4">
                {new Date(post.created_at).toLocaleString('pt-BR')}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
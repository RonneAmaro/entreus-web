import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold mb-4">EntreUS</h1>
        <p className="text-xl text-zinc-300 mb-3">Só Entre Nós</p>
        <p className="text-zinc-400 mb-8">
          Uma rede social privada para adultos, focada em conexão, lifestyle,
          liberdade, privacidade e interações reais em um ambiente discreto e moderno.
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            href="/signup"
            className="bg-white text-black px-6 py-3 rounded-xl font-medium hover:opacity-90"
          >
            Criar conta
          </Link>

          <Link
            href="/login"
            className="border border-zinc-700 px-6 py-3 rounded-xl font-medium hover:bg-zinc-900"
          >
            Entrar
          </Link>
        </div>
      </div>
    </main>
  )
}
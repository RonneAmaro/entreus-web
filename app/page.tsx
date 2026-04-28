import Image from 'next/image'
import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white flex items-center justify-center px-6 transition-colors">
      <section className="w-full max-w-3xl text-center">
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl px-6 py-12 sm:px-10 sm:py-16 shadow-sm">
          
          {/* LOGO */}
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.png"
              alt="EntreUS"
              width={280}
              height={100}
              priority
              className="h-auto w-auto max-w-[260px] sm:max-w-[320px]"
            />
          </div>

          {/* SLOGAN */}
          <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 mb-4">
            Só Entre Nós
          </p>

          {/* DESCRIÇÃO */}
          <p className="text-sm sm:text-base text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto mb-8 leading-relaxed">
            Uma rede social privada para adultos, focada em conexão, lifestyle,
            liberdade, privacidade e interações reais em um ambiente discreto e moderno.
          </p>

          {/* BOTÕES */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-black text-white dark:bg-white dark:text-black font-medium hover:opacity-90 transition"
            >
              Criar conta
            </Link>

            <Link
              href="/login"
              className="w-full sm:w-auto px-6 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
            >
              Entrar
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
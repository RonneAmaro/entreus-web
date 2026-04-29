import Image from 'next/image'
import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-4 sm:px-6 py-8">
      <section className="w-full max-w-6xl">
        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl px-4 py-8 sm:px-8 sm:py-12 shadow-xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            
            {/* PRIMEIRO: VÍDEO */}
            <div className="flex justify-center">
              <div className="w-full max-w-2xl rounded-3xl overflow-hidden border border-zinc-800 bg-black shadow-2xl">
                <video
                  className="w-full h-auto object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  poster="/logo.png"
                >
                  <source src="/intro.mp4" type="video/mp4" />
                  Seu navegador não suporta vídeo em HTML5.
                </video>
              </div>
            </div>

            {/* SEGUNDO: LOGO, TEXTO E BOTÕES */}
            <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
              <div className="mb-6">
                <Image
                  src="/logo.png"
                  alt="EntreUS"
                  width={420}
                  height={180}
                  priority
                  className="h-auto w-auto max-w-[260px] sm:max-w-[340px] lg:max-w-[420px]"
                />
              </div>

              <p className="text-base sm:text-lg text-zinc-300 mb-3">
                Só Entre Nós
              </p>

              <p className="text-sm sm:text-base text-zinc-400 max-w-xl leading-relaxed mb-8">
                Uma rede social privada para adultos, focada em conexão, lifestyle,
                liberdade, privacidade e interações reais em um ambiente discreto e moderno.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <Link
                  href="/signup"
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white text-black font-medium hover:opacity-90 transition text-center"
                >
                  Criar conta
                </Link>

                <Link
                  href="/login"
                  className="w-full sm:w-auto px-6 py-3 rounded-xl border border-zinc-700 hover:bg-zinc-900 transition text-center"
                >
                  Entrar
                </Link>
              </div>
            </div>

          </div>
        </div>
      </section>
    </main>
  )
}
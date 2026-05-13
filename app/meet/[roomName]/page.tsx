import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import MeetRoomClient from './MeetRoomClient'

type MeetPageProps = {
  params: Promise<{
    roomName: string
  }>
}

function EntreUSWordmark({ suffix }: { suffix?: string }) {
  return (
    <span className="inline-flex items-baseline tracking-normal">
      <span className="text-white">Entre</span>
      <span className="text-blue-400">US</span>
      {suffix ? <span className="ml-2 text-blue-100">{suffix}</span> : null}
    </span>
  )
}

export default async function MeetRoomPage({ params }: MeetPageProps) {
  const { roomName } = await params
  const decodedRoomName = decodeURIComponent(roomName)

  return (
    <main className="min-h-screen bg-[linear-gradient(145deg,#020617_0%,#07111f_46%,#020617_100%)] text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/feed"
              className="inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-full border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-bold text-blue-100 shadow-lg shadow-blue-500/10 transition hover:border-blue-400 hover:bg-blue-500/20 hover:shadow-blue-500/20"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao <EntreUSWordmark />
            </Link>

            <Image
              src="/logo.png"
              alt="EntreUS"
              width={128}
              height={56}
              priority
              className="h-auto w-28 object-contain"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">
                Chamada ao vivo
              </p>
              <h1 className="text-3xl font-black tracking-normal sm:text-4xl">
                <EntreUSWordmark suffix="Meet" />
              </h1>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Converse por vídeo e áudio em tempo real.
              </p>
            </div>

            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-blue-500/20 bg-blue-950/20 px-4 py-2 text-sm text-zinc-300">
              <span className="shrink-0 text-blue-200/70">Sala:</span>
              <strong className="truncate font-semibold text-white">
                {decodedRoomName}
              </strong>
            </div>
          </div>
        </header>

        <MeetRoomClient roomName={decodedRoomName} />
      </section>
    </main>
  )
}

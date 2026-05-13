import MeetRoomClient from './MeetRoomClient'

type MeetPageProps = {
  params: Promise<{
    roomName: string
  }>
}

export default async function MeetRoomPage({ params }: MeetPageProps) {
  const { roomName } = await params
  const decodedRoomName = decodeURIComponent(roomName)

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-4 flex flex-col gap-3 rounded-[1.5rem] border border-zinc-800 bg-zinc-950/90 px-4 py-4 shadow-xl ring-1 ring-white/5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">
              Chamada ao vivo
            </p>
            <h1 className="text-2xl font-black tracking-normal sm:text-3xl">
              EntreUS Meet
            </h1>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              Converse por vídeo e áudio em tempo real.
            </p>
          </div>

          <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-800 bg-black px-4 py-2 text-sm text-zinc-300">
            <span className="shrink-0 text-zinc-500">Sala:</span>
            <strong className="truncate font-semibold text-white">
              {decodedRoomName}
            </strong>
          </div>
        </header>

        <MeetRoomClient roomName={decodedRoomName} />
      </section>
    </main>
  )
}

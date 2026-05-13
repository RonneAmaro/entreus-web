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
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-4 border-b border-zinc-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.24em] text-zinc-500">
              Sala de chamada
            </p>
            <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
              EntreUS Meet
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
              Converse por video e audio em tempo real.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300 shadow-xl">
            <span className="block text-xs uppercase tracking-[0.18em] text-zinc-500">
              Voce esta em
            </span>
            <strong className="mt-1 block break-all font-medium text-white">
              {decodedRoomName}
            </strong>
          </div>
        </header>

        <MeetRoomClient roomName={decodedRoomName} />
      </section>
    </main>
  )
}

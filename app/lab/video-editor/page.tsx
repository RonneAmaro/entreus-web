import VideoEditor from '@/app/components/VideoEditor'

export default function LabVideoEditorPage() {
  return (
    <main className="h-dvh min-h-0 overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(49,78,184,0.22),transparent_45%),#080911] p-1 text-white sm:p-2">
      <section className="h-full min-h-0 w-full">
        <VideoEditor mode="download" />
      </section>
    </main>
  )
}

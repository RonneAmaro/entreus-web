'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Download,
  Palette,
  Printer,
  RefreshCw,
  Sparkles,
} from 'lucide-react'

type PosterTemplate = {
  id: string
  name: string
  description: string
  background: string
  primary: string
  accent: string
  lightText: boolean
  label: string
}

const POSTER_WIDTH = 1080
const POSTER_HEIGHT = 1350

const templates: PosterTemplate[] = [
  {
    id: 'school',
    name: 'Aviso escolar',
    description: 'Comunicados para escola, reuniões e recados.',
    background: '#0f172a',
    primary: '#2563eb',
    accent: '#facc15',
    lightText: true,
    label: 'AVISO ESCOLAR',
  },
  {
    id: 'event',
    name: 'Evento',
    description: 'Cartaz para eventos, palestras e encontros.',
    background: '#111827',
    primary: '#7c3aed',
    accent: '#22c55e',
    lightText: true,
    label: 'EVENTO',
  },
  {
    id: 'campaign',
    name: 'Campanha',
    description: 'Divulgação de campanhas e ações sociais.',
    background: '#f8fafc',
    primary: '#dc2626',
    accent: '#2563eb',
    lightText: false,
    label: 'CAMPANHA',
  },
  {
    id: 'project',
    name: 'Projeto cultural',
    description: 'Ideal para projetos, oficinas e apresentações.',
    background: '#020617',
    primary: '#0891b2',
    accent: '#f97316',
    lightText: true,
    label: 'PROJETO',
  },
  {
    id: 'simple',
    name: 'Minimalista',
    description: 'Visual limpo para avisos rápidos.',
    background: '#ffffff',
    primary: '#18181b',
    accent: '#2563eb',
    lightText: false,
    label: 'COMUNICADO',
  },
]

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(' ')
  let line = ''
  const lines: string[] = []

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word
    const metrics = ctx.measureText(testLine)

    if (metrics.width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = testLine
    }
  }

  if (line) lines.push(line)

  lines.forEach((currentLine, index) => {
    ctx.fillText(currentLine, x, y + index * lineHeight)
  })

  return lines.length * lineHeight
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

export default function QuickPostersPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const [templateId, setTemplateId] = useState('school')
  const [title, setTitle] = useState('Reunião de Pais e Responsáveis')
  const [subtitle, setSubtitle] = useState(
    'Participe deste momento importante para acompanhar o desenvolvimento dos estudantes.',
  )
  const [date, setDate] = useState('Sexta-feira, 19h')
  const [place, setPlace] = useState('Auditório da escola')
  const [footer, setFooter] = useState('EntreUS Lab • Ferramentas criativas')
  const [showDecoration, setShowDecoration] = useState(true)

  const selectedTemplate = useMemo(() => {
    return templates.find((item) => item.id === templateId) || templates[0]
  }, [templateId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = POSTER_WIDTH
    canvas.height = POSTER_HEIGHT

    const textColor = selectedTemplate.lightText ? '#ffffff' : '#0f172a'
    const mutedColor = selectedTemplate.lightText ? '#cbd5e1' : '#475569'
    const cardColor = selectedTemplate.lightText
      ? 'rgba(255,255,255,0.10)'
      : 'rgba(15,23,42,0.06)'
    const borderColor = selectedTemplate.lightText
      ? 'rgba(255,255,255,0.20)'
      : 'rgba(15,23,42,0.12)'

    ctx.clearRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

    const gradient = ctx.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT)
    gradient.addColorStop(0, selectedTemplate.background)
    gradient.addColorStop(1, selectedTemplate.primary)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

    if (showDecoration) {
      ctx.save()
      ctx.globalAlpha = 0.16
      ctx.fillStyle = selectedTemplate.accent
      ctx.beginPath()
      ctx.arc(930, 160, 250, 0, Math.PI * 2)
      ctx.fill()

      ctx.globalAlpha = 0.13
      ctx.fillStyle = selectedTemplate.primary
      ctx.beginPath()
      ctx.arc(80, 1220, 300, 0, Math.PI * 2)
      ctx.fill()

      ctx.globalAlpha = 0.08
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 4
      for (let i = 0; i < 8; i++) {
        ctx.beginPath()
        ctx.arc(POSTER_WIDTH - 140, 190, 60 + i * 36, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.restore()
    }

    ctx.save()
    ctx.fillStyle = cardColor
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 2
    drawRoundedRect(ctx, 70, 70, 940, 1210, 52)
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.fillStyle = selectedTemplate.accent
    drawRoundedRect(ctx, 110, 120, 300, 58, 29)
    ctx.fill()

    ctx.fillStyle = selectedTemplate.lightText ? '#0f172a' : '#ffffff'
    ctx.font = 'bold 25px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(selectedTemplate.label, 260, 150)
    ctx.restore()

    ctx.save()
    ctx.fillStyle = textColor
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = '900 78px Arial'
    const titleHeight = wrapText(ctx, title || 'Título do cartaz', 110, 250, 850, 88)

    ctx.fillStyle = mutedColor
    ctx.font = '36px Arial'
    wrapText(ctx, subtitle || 'Escreva aqui uma breve descrição.', 110, 280 + titleHeight, 820, 48)
    ctx.restore()

    ctx.save()
    ctx.fillStyle = selectedTemplate.lightText
      ? 'rgba(0,0,0,0.22)'
      : 'rgba(255,255,255,0.72)'
    drawRoundedRect(ctx, 110, 840, 860, 250, 42)
    ctx.fill()

    ctx.fillStyle = textColor
    ctx.font = 'bold 38px Arial'
    ctx.fillText('📅 Data e horário', 150, 890)
    ctx.font = '34px Arial'
    ctx.fillStyle = mutedColor
    wrapText(ctx, date || 'Informe a data e horário', 150, 940, 760, 42)

    ctx.fillStyle = textColor
    ctx.font = 'bold 38px Arial'
    ctx.fillText('📍 Local', 150, 1015)
    ctx.font = '34px Arial'
    ctx.fillStyle = mutedColor
    wrapText(ctx, place || 'Informe o local', 150, 1065, 760, 42)
    ctx.restore()

    ctx.save()
    ctx.fillStyle = selectedTemplate.accent
    drawRoundedRect(ctx, 110, 1140, 360, 68, 34)
    ctx.fill()

    ctx.fillStyle = selectedTemplate.lightText ? '#0f172a' : '#ffffff'
    ctx.font = 'bold 28px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Criado no EntreUS Lab', 290, 1174)
    ctx.restore()

    ctx.save()
    ctx.fillStyle = mutedColor
    ctx.font = '24px Arial'
    ctx.textAlign = 'right'
    ctx.fillText(footer || 'EntreUS Lab', 970, 1212)
    ctx.restore()
  }, [selectedTemplate, title, subtitle, date, place, footer, showDecoration])

  function handleDownloadPng() {
    const canvas = canvasRef.current
    if (!canvas) return

    const link = document.createElement('a')
    link.download = `cartaz-entreus-lab-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  function handlePrintPoster() {
    const canvas = canvasRef.current
    if (!canvas) return

    const imageUrl = canvas.toDataURL('image/png')
    const printWindow = window.open('', '_blank')

    if (!printWindow) return

    printWindow.document.write(`
      <html>
        <head>
          <title>Cartaz EntreUS Lab</title>
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              background: #111;
            }
            img {
              max-width: 100%;
              max-height: 100vh;
            }
            @media print {
              body {
                background: white;
              }
              img {
                width: 100%;
                height: auto;
              }
            }
          </style>
        </head>
        <body>
          <img src="${imageUrl}" />
          <script>
            window.onload = () => {
              window.focus();
              window.print();
            }
          </script>
        </body>
      </html>
    `)

    printWindow.document.close()
  }

  function handleReset() {
    setTemplateId('school')
    setTitle('Reunião de Pais e Responsáveis')
    setSubtitle('Participe deste momento importante para acompanhar o desenvolvimento dos estudantes.')
    setDate('Sexta-feira, 19h')
    setPlace('Auditório da escola')
    setFooter('EntreUS Lab • Ferramentas criativas')
    setShowDecoration(true)
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 dark:bg-black dark:text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/lab"
            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao Lab
          </Link>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              <RefreshCw className="h-4 w-4" />
              Restaurar
            </button>

            <button
              type="button"
              onClick={handlePrintPoster}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              <Printer className="h-4 w-4" />
              PDF/Imprimir
            </button>

            <button
              type="button"
              onClick={handleDownloadPng}
              className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700"
            >
              <Download className="h-4 w-4" />
              Baixar PNG
            </button>
          </div>
        </div>

        <section className="mb-8 overflow-hidden rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-blue-300">
                <Sparkles className="h-4 w-4" />
                EntreUS Lab
              </p>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
                Cartazes rápidos
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400 sm:text-base">
                Crie avisos, comunicados, eventos e materiais escolares em poucos minutos.
                Edite os campos, escolha um modelo e baixe o cartaz em PNG.
              </p>
            </div>

            <div className="rounded-3xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
              Funciona direto no navegador, sem Supabase.
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-5 flex items-center gap-2">
              <Palette className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-black">Editar cartaz</h2>
            </div>

            <div className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-bold">Modelo</span>
                <select
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 dark:border-zinc-800 dark:bg-black"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-zinc-500">
                  {selectedTemplate.description}
                </p>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold">Título</span>
                <textarea
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 dark:border-zinc-800 dark:bg-black"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold">Subtítulo / descrição</span>
                <textarea
                  value={subtitle}
                  onChange={(event) => setSubtitle(event.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 dark:border-zinc-800 dark:bg-black"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold">Data e horário</span>
                <input
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 dark:border-zinc-800 dark:bg-black"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold">Local</span>
                <input
                  value={place}
                  onChange={(event) => setPlace(event.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 dark:border-zinc-800 dark:bg-black"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold">Rodapé</span>
                <input
                  value={footer}
                  onChange={(event) => setFooter(event.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 dark:border-zinc-800 dark:bg-black"
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-bold dark:border-zinc-800 dark:bg-black">
                <span>Decoração no fundo</span>
                <input
                  type="checkbox"
                  checked={showDecoration}
                  onChange={(event) => setShowDecoration(event.target.checked)}
                  className="h-5 w-5"
                />
              </label>
            </div>
          </section>

          <section className="rounded-[2rem] border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">Prévia do cartaz</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Formato vertical 1080 × 1350, bom para impressão e redes sociais.
                </p>
              </div>
            </div>

            <div className="flex justify-center rounded-[2rem] bg-zinc-100 p-3 dark:bg-black sm:p-6">
              <canvas
                ref={canvasRef}
                className="h-auto w-full max-w-[520px] rounded-[1.5rem] bg-white shadow-2xl"
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

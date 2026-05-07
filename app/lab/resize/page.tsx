'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  CreditCard,
  Download,
  Heart,
  ImageIcon,
  Landmark,
  Loader2,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Upload,
} from 'lucide-react'

type OutputFormat = 'image/png' | 'image/jpeg' | 'image/webp'

type SourceInfo = {
  fileName: string
  fileType: string
  width: number
  height: number
  size: number
}

const PIX_NUBANK_URL =
  'https://nubank.com.br/cobrar/u2kum/69fca421-184d-459c-a125-f760fc56c264'

const MERCADO_PAGO_URL = 'https://link.mercadopago.com.br/entreuslab'

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, index)

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`
}

function fileToImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível carregar a imagem.'))
    }

    image.src = url
  })
}

function getExtension(format: OutputFormat) {
  if (format === 'image/jpeg') return 'jpg'
  if (format === 'image/webp') return 'webp'
  return 'png'
}

function getSafeFileName(fileName: string, format: OutputFormat) {
  const baseName =
    fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-z0-9_-]/gi, '-')
      .toLowerCase() || 'imagem'

  return `entreus-lab-${baseName}-redimensionada.${getExtension(format)}`
}

export default function ResizeImageLabPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null)
  const [sourceInfo, setSourceInfo] = useState<SourceInfo | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [outputUrl, setOutputUrl] = useState('')
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null)

  const [width, setWidth] = useState(1080)
  const [height, setHeight] = useState(1080)
  const [scale, setScale] = useState(100)
  const [keepRatio, setKeepRatio] = useState(true)
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('image/png')
  const [quality, setQuality] = useState(0.9)
  const [backgroundColor, setBackgroundColor] = useState('#ffffff')

  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState('')

  const originalRatio = useMemo(() => {
    if (!sourceInfo?.width || !sourceInfo?.height) return 1
    return sourceInfo.width / sourceInfo.height
  }, [sourceInfo])

  const outputSizeLabel = outputBlob ? formatBytes(outputBlob.size) : '—'

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      if (outputUrl) URL.revokeObjectURL(outputUrl)
    }
  }, [previewUrl, outputUrl])

  function resetTool() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    if (outputUrl) URL.revokeObjectURL(outputUrl)

    setSourceImage(null)
    setSourceInfo(null)
    setPreviewUrl('')
    setOutputUrl('')
    setOutputBlob(null)
    setWidth(1080)
    setHeight(1080)
    setScale(100)
    setKeepRatio(true)
    setOutputFormat('image/png')
    setQuality(0.9)
    setBackgroundColor('#ffffff')
    setMessage('')
  }

  async function handleFile(file: File | null) {
    if (!file) return

    setLoading(true)
    setMessage('')
    setOutputUrl('')
    setOutputBlob(null)

    try {
      const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']

      if (!allowedTypes.includes(file.type)) {
        throw new Error('Envie uma imagem PNG, JPG ou WEBP.')
      }

      if (file.size > 25 * 1024 * 1024) {
        throw new Error('A imagem é muito grande. Envie uma imagem de até 25 MB.')
      }

      const image = await fileToImage(file)

      if (previewUrl) URL.revokeObjectURL(previewUrl)

      const nextPreviewUrl = URL.createObjectURL(file)

      setSourceImage(image)
      setSourceInfo({
        fileName: file.name,
        fileType: file.type,
        width: image.naturalWidth,
        height: image.naturalHeight,
        size: file.size,
      })
      setPreviewUrl(nextPreviewUrl)
      setWidth(image.naturalWidth)
      setHeight(image.naturalHeight)
      setScale(100)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Erro ao carregar imagem.'
      )
    } finally {
      setLoading(false)
    }
  }

  function handleWidthChange(nextWidth: number) {
    const safeWidth = Math.max(1, Math.round(nextWidth || 1))
    setWidth(safeWidth)

    if (keepRatio) {
      setHeight(Math.max(1, Math.round(safeWidth / originalRatio)))
    }
  }

  function handleHeightChange(nextHeight: number) {
    const safeHeight = Math.max(1, Math.round(nextHeight || 1))
    setHeight(safeHeight)

    if (keepRatio) {
      setWidth(Math.max(1, Math.round(safeHeight * originalRatio)))
    }
  }

  function handleScaleChange(nextScale: number) {
    const safeScale = Math.max(1, Math.min(500, Math.round(nextScale || 1)))

    setScale(safeScale)

    if (sourceInfo) {
      setWidth(Math.max(1, Math.round(sourceInfo.width * (safeScale / 100))))
      setHeight(Math.max(1, Math.round(sourceInfo.height * (safeScale / 100))))
    }
  }

  function restoreOriginalSize() {
    if (!sourceInfo) return

    setWidth(sourceInfo.width)
    setHeight(sourceInfo.height)
    setScale(100)
  }

  function applyPreset(nextWidth: number, nextHeight: number) {
    setWidth(nextWidth)
    setHeight(nextHeight)
    setScale(100)
  }

  async function resizeImage() {
    if (!sourceImage || !sourceInfo) {
      setMessage('Envie uma imagem primeiro.')
      return
    }

    setProcessing(true)
    setMessage('')

    try {
      const safeWidth = Math.max(1, Math.round(width))
      const safeHeight = Math.max(1, Math.round(height))

      if (safeWidth > 8000 || safeHeight > 8000) {
        throw new Error('O tamanho máximo permitido é 8000 x 8000 pixels.')
      }

      const canvas = canvasRef.current || document.createElement('canvas')
      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error('Não foi possível preparar a imagem.')
      }

      canvas.width = safeWidth
      canvas.height = safeHeight

      context.clearRect(0, 0, safeWidth, safeHeight)
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'

      if (outputFormat === 'image/jpeg') {
        context.fillStyle = backgroundColor
        context.fillRect(0, 0, safeWidth, safeHeight)
      }

      context.drawImage(sourceImage, 0, 0, safeWidth, safeHeight)

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(
          (result) => resolve(result),
          outputFormat,
          outputFormat === 'image/png' ? undefined : quality
        )
      })

      if (!blob) {
        throw new Error('Não foi possível gerar a imagem final.')
      }

      if (outputUrl) URL.revokeObjectURL(outputUrl)

      const nextOutputUrl = URL.createObjectURL(blob)

      setOutputBlob(blob)
      setOutputUrl(nextOutputUrl)
      setMessage('Imagem redimensionada com sucesso.')
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Erro ao redimensionar imagem.'
      )
    } finally {
      setProcessing(false)
    }
  }

  function downloadImage() {
    if (!outputBlob || !outputUrl || !sourceInfo) return

    const link = document.createElement('a')
    link.href = outputUrl
    link.download = getSafeFileName(sourceInfo.fileName, outputFormat)
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 dark:bg-black dark:text-white sm:px-6">
      <canvas ref={canvasRef} className="hidden" />

      <section className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/lab"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Lab
            </Link>

            <Link
              href="/feed"
              className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Voltar para o feed
            </Link>
          </div>

          <a
            href="#doacao"
            className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-black"
          >
            Apoie o EntreUS Lab
          </a>
        </div>

        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="relative p-5 sm:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.12),transparent_30%)]" />

            <div className="relative flex flex-col gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg">
                <Maximize2 className="h-7 w-7" />
              </div>

              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
                  EntreUS Lab
                </p>

                <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
                  Redimensionar imagem
                </h1>

                <p className="mt-4 max-w-4xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
                  Ajuste tamanho, proporção, formato e qualidade de imagens para
                  posts, cartazes, atividades escolares, redes sociais, sites e
                  materiais digitais.
                </p>
              </div>
            </div>
          </div>
        </div>

        {message && (
          <div className="mt-5 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900/60 dark:bg-yellow-950/30 dark:text-yellow-200">
            {message}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[420px_1fr]">
          <div className="space-y-5">
            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-lg font-black">Imagem original</h2>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => handleFile(event.target.files?.[0] || null)}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 flex w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                <Upload className="h-6 w-6" />
                <span className="font-semibold">Enviar imagem</span>
              </button>

              {loading && (
                <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando imagem...
                </div>
              )}

              {sourceInfo && (
                <div className="mt-4 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  <div className="flex items-center gap-2 font-semibold text-zinc-950 dark:text-white">
                    <ImageIcon className="h-4 w-4" />
                    {sourceInfo.fileName}
                  </div>

                  <p className="mt-2">
                    Tamanho original: {sourceInfo.width} x {sourceInfo.height}px
                  </p>

                  <p className="mt-1">
                    Peso original: {formatBytes(sourceInfo.size)}
                  </p>
                </div>
              )}

              {previewUrl && (
                <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                  <img
                    src={previewUrl}
                    alt="Prévia original"
                    className="h-auto max-h-[320px] w-full object-contain"
                  />
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-lg font-black">Configurações</h2>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Largura
                  </label>

                  <input
                    type="number"
                    min={1}
                    value={width}
                    onChange={(event) =>
                      handleWidthChange(Number(event.target.value))
                    }
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Altura
                  </label>

                  <input
                    type="number"
                    min={1}
                    value={height}
                    onChange={(event) =>
                      handleHeightChange(Number(event.target.value))
                    }
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                  />
                </div>
              </div>

              <label className="mt-4 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium dark:border-zinc-800 dark:bg-zinc-900">
                <input
                  type="checkbox"
                  checked={keepRatio}
                  onChange={(event) => setKeepRatio(event.target.checked)}
                />
                Manter proporção
              </label>

              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Redimensionar por porcentagem
                </label>

                <input
                  type="number"
                  min={1}
                  max={500}
                  value={scale}
                  onChange={(event) =>
                    handleScaleChange(Number(event.target.value))
                  }
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => applyPreset(1080, 1080)}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-bold transition hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  Post 1080x1080
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset(1080, 1920)}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-bold transition hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  Story 1080x1920
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset(1920, 1080)}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-bold transition hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  16:9 1920x1080
                </button>

                <button
                  type="button"
                  onClick={restoreOriginalSize}
                  disabled={!sourceInfo}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-bold transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  Original
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Formato
                  </label>

                  <select
                    value={outputFormat}
                    onChange={(event) =>
                      setOutputFormat(event.target.value as OutputFormat)
                    }
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                  >
                    <option value="image/png">PNG</option>
                    <option value="image/jpeg">JPG</option>
                    <option value="image/webp">WEBP</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Qualidade
                  </label>

                  <select
                    value={quality}
                    onChange={(event) => setQuality(Number(event.target.value))}
                    disabled={outputFormat === 'image/png'}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none disabled:opacity-50 dark:border-zinc-700 dark:bg-black"
                  >
                    <option value={0.7}>70%</option>
                    <option value={0.8}>80%</option>
                    <option value={0.9}>90%</option>
                    <option value={1}>100%</option>
                  </select>
                </div>
              </div>

              {outputFormat === 'image/jpeg' && (
                <div className="mt-4">
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Fundo para JPG
                  </label>

                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(event) => setBackgroundColor(event.target.value)}
                    className="h-11 w-full cursor-pointer rounded-xl border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-black"
                  />
                </div>
              )}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={resizeImage}
                  disabled={!sourceImage || processing}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {processing ? 'Processando...' : 'Redimensionar'}
                </button>

                <button
                  type="button"
                  onClick={resetTool}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-5 py-3 text-sm font-bold text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
                >
                  <RotateCcw className="h-4 w-4" />
                  Limpar
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 lg:sticky lg:top-8">
              <h2 className="text-lg font-black">Resultado</h2>

              <div className="mt-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-center dark:border-zinc-800 dark:bg-zinc-900">
                {outputUrl ? (
                  <img
                    src={outputUrl}
                    alt="Imagem redimensionada"
                    className="mx-auto h-auto max-h-[520px] w-full object-contain"
                  />
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-black">
                    <div className="text-center">
                      <ImageIcon className="mx-auto h-14 w-14" />
                      <p className="mt-3 text-sm">
                        A prévia aparecerá aqui depois de redimensionar.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-zinc-50 p-4 text-center dark:bg-zinc-900">
                  <p className="text-lg font-black">
                    {width} x {height}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                    pixels
                  </p>
                </div>

                <div className="rounded-2xl bg-zinc-50 p-4 text-center dark:bg-zinc-900">
                  <p className="text-lg font-black">
                    {getExtension(outputFormat).toUpperCase()}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                    formato
                  </p>
                </div>

                <div className="rounded-2xl bg-zinc-50 p-4 text-center dark:bg-zinc-900">
                  <p className="text-lg font-black">{outputSizeLabel}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                    peso final
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={downloadImage}
                disabled={!outputUrl}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Baixar imagem
              </button>
            </div>
          </div>
        </div>

        <div
          id="doacao"
          className="mt-5 rounded-3xl border border-green-200 bg-green-50 p-5 shadow-sm dark:border-green-900/60 dark:bg-green-950/20"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <Heart className="h-5 w-5" />
                <p className="text-sm font-semibold">
                  Apoie o EntreUS Lab
                </p>
              </div>

              <p className="mt-4 max-w-3xl text-sm leading-6 text-green-900/80 dark:text-green-100/80">
                Esta ferramenta pode ajudar escolas, professores e criadores.
                Se puder, prefira o Pix Nubank: ele ajuda mais porque não
                desconta taxa do projeto. O Mercado Pago continua como
                alternativa, mas pode cobrar taxa.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href={PIX_NUBANK_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-700"
              >
                <Landmark className="h-4 w-4" />
                Pix Nubank — sem taxa
              </a>

              <a
                href={MERCADO_PAGO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-green-300 bg-white px-5 py-3 text-sm font-bold text-green-700 transition hover:bg-green-100 dark:border-green-800 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900"
              >
                <CreditCard className="h-4 w-4" />
                Mercado Pago — pode ter taxa
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
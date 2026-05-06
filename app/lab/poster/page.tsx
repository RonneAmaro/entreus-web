'use client'

import NextImage from 'next/image'
import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, FileText, ImageIcon, Loader2, Upload } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { useLanguage } from '../../components/LanguageProvider'

const DONATION_URL = 'https://link.mercadopago.com.br/entreuslab'

type PaperKey = 'a4' | 'a3' | 'letter'
type Orientation = 'portrait' | 'landscape'
type FitMode = 'contain' | 'cover'

type SourceInfo = {
  fileName: string
  fileType: 'image' | 'pdf'
  width: number
  height: number
  pageCount?: number
}

const PAPER_SIZES_MM: Record<PaperKey, { label: string; width: number; height: number }> = {
  a4: {
    label: 'A4',
    width: 210,
    height: 297,
  },
  a3: {
    label: 'A3',
    width: 297,
    height: 420,
  },
  letter: {
    label: 'Letter',
    width: 215.9,
    height: 279.4,
  },
}

const DPI_OPTIONS = [
  { labelKey: 'labPoster.config.fast', value: 100 },
  { labelKey: 'labPoster.config.good', value: 130 },
  { labelKey: 'labPoster.config.high', value: 160 },
]

function getPaperSize(paper: PaperKey, orientation: Orientation) {
  const base = PAPER_SIZES_MM[paper]

  if (orientation === 'landscape') {
    return {
      width: base.height,
      height: base.width,
    }
  }

  return {
    width: base.width,
    height: base.height,
  }
}

function fileToImage(file: File, errorMessage: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(errorMessage))
    }

    image.src = url
  })
}

async function renderPdfPageToCanvas(file: File, pageNumber: number, errorMessage: string, scale = 2) {
  const pdfjsLib = await import('pdfjs-dist')

  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const safePageNumber = Math.min(Math.max(pageNumber, 1), pdf.numPages)
  const page = await pdf.getPage(safePageNumber)
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error(errorMessage)
  }

  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
  }).promise

  return {
    canvas,
    pageCount: pdf.numPages,
  }
}

export default function PosterLabPage() {
  const { t } = useLanguage()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null)
  const [sourceInfo, setSourceInfo] = useState<SourceInfo | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [message, setMessage] = useState('')
  const [loadingFile, setLoadingFile] = useState(false)
  const [generating, setGenerating] = useState(false)

  const [paper, setPaper] = useState<PaperKey>('a4')
  const [orientation, setOrientation] = useState<Orientation>('portrait')
  const [columns, setColumns] = useState(3)
  const [rows, setRows] = useState(2)
  const [marginMm, setMarginMm] = useState(8)
  const [overlapMm, setOverlapMm] = useState(0)
  const [fitMode, setFitMode] = useState<FitMode>('contain')
  const [pdfPageNumber, setPdfPageNumber] = useState(1)
  const [dpi, setDpi] = useState(130)

  const paperSize = useMemo(() => getPaperSize(paper, orientation), [paper, orientation])
  const printableWidth = Math.max(20, paperSize.width - marginMm * 2)
  const printableHeight = Math.max(20, paperSize.height - marginMm * 2)
  const posterWidth = printableWidth * columns
  const posterHeight = printableHeight * rows
  const totalPages = columns * rows

  async function handleFile(fileToLoad: File | null) {
    if (!fileToLoad) return

    setLoadingFile(true)
    setMessage('')
    setFile(fileToLoad)
    setSourceCanvas(null)
    setSourceInfo(null)

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl('')
    }

    try {
      const isImage = fileToLoad.type.startsWith('image/')
      const isPdf = fileToLoad.type === 'application/pdf' || fileToLoad.name.toLowerCase().endsWith('.pdf')

      if (!isImage && !isPdf) {
        throw new Error(t('labPoster.messages.unsupportedFile'))
      }

      if (fileToLoad.size > 35 * 1024 * 1024) {
        throw new Error(t('labPoster.messages.fileTooLarge'))
      }

      if (isImage) {
        const image = await fileToImage(fileToLoad, t('labPoster.messages.imageLoadError'))
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')

        if (!context) throw new Error(t('labPoster.messages.imagePrepareError'))

        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        context.drawImage(image, 0, 0)

        setSourceCanvas(canvas)
        setSourceInfo({
          fileName: fileToLoad.name,
          fileType: 'image',
          width: canvas.width,
          height: canvas.height,
        })
        setPreviewUrl(canvas.toDataURL('image/jpeg', 0.9))
      }

      if (isPdf) {
        const { canvas, pageCount } = await renderPdfPageToCanvas(fileToLoad, pdfPageNumber, t('labPoster.messages.pdfPrepareError'), 2)
        setSourceCanvas(canvas)
        setSourceInfo({
          fileName: fileToLoad.name,
          fileType: 'pdf',
          width: canvas.width,
          height: canvas.height,
          pageCount,
        })
        setPreviewUrl(canvas.toDataURL('image/jpeg', 0.9))
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('labPoster.messages.loadFileError'))
    } finally {
      setLoadingFile(false)
    }
  }

  async function handleReloadPdfPage(nextPageNumber: number) {
    setPdfPageNumber(nextPageNumber)

    if (!file) return
    if (!(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) return

    setLoadingFile(true)
    setMessage('')

    try {
      const { canvas, pageCount } = await renderPdfPageToCanvas(file, nextPageNumber, t('labPoster.messages.pdfPrepareError'), 2)

      setSourceCanvas(canvas)
      setSourceInfo({
        fileName: file.name,
        fileType: 'pdf',
        width: canvas.width,
        height: canvas.height,
        pageCount,
      })

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }

      setPreviewUrl(canvas.toDataURL('image/jpeg', 0.9))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('labPoster.messages.reloadPdfError'))
    } finally {
      setLoadingFile(false)
    }
  }

  async function generatePosterPdf() {
    if (!sourceCanvas || !sourceInfo) {
      setMessage(t('labPoster.messages.sendFileFirst'))
      return
    }

    setGenerating(true)
    setMessage('')

    try {
      const pxPerMm = dpi / 25.4
      const posterCanvas = document.createElement('canvas')
      const posterContext = posterCanvas.getContext('2d')

      if (!posterContext) {
        throw new Error(t('labPoster.messages.posterPrepareError'))
      }

      const posterPixelWidth = Math.round(posterWidth * pxPerMm)
      const posterPixelHeight = Math.round(posterHeight * pxPerMm)

      const maxDimension = 9000

      if (posterPixelWidth > maxDimension || posterPixelHeight > maxDimension) {
        throw new Error(t('labPoster.messages.browserTooHeavy'))
      }

      posterCanvas.width = posterPixelWidth
      posterCanvas.height = posterPixelHeight

      posterContext.fillStyle = '#ffffff'
      posterContext.fillRect(0, 0, posterCanvas.width, posterCanvas.height)

      const sourceRatio = sourceCanvas.width / sourceCanvas.height
      const posterRatio = posterCanvas.width / posterCanvas.height

      let drawWidth = posterCanvas.width
      let drawHeight = posterCanvas.height
      let drawX = 0
      let drawY = 0

      if (fitMode === 'contain') {
        if (sourceRatio > posterRatio) {
          drawWidth = posterCanvas.width
          drawHeight = posterCanvas.width / sourceRatio
          drawY = (posterCanvas.height - drawHeight) / 2
        } else {
          drawHeight = posterCanvas.height
          drawWidth = posterCanvas.height * sourceRatio
          drawX = (posterCanvas.width - drawWidth) / 2
        }
      }

      if (fitMode === 'cover') {
        if (sourceRatio > posterRatio) {
          drawHeight = posterCanvas.height
          drawWidth = posterCanvas.height * sourceRatio
          drawX = (posterCanvas.width - drawWidth) / 2
        } else {
          drawWidth = posterCanvas.width
          drawHeight = posterCanvas.width / sourceRatio
          drawY = (posterCanvas.height - drawHeight) / 2
        }
      }

      posterContext.imageSmoothingEnabled = true
      posterContext.imageSmoothingQuality = 'high'
      posterContext.drawImage(sourceCanvas, drawX, drawY, drawWidth, drawHeight)

      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: paper,
        compress: true,
      })

      const pagePixelWidth = Math.round(printableWidth * pxPerMm)
      const pagePixelHeight = Math.round(printableHeight * pxPerMm)
      const overlapPixels = Math.round(overlapMm * pxPerMm)

      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          if (row > 0 || column > 0) {
            pdf.addPage(paper, orientation)
          }

          const cropX = column * pagePixelWidth
          const cropY = row * pagePixelHeight

          const extraLeft = column > 0 ? overlapPixels : 0
          const extraTop = row > 0 ? overlapPixels : 0
          const extraRight = column < columns - 1 ? overlapPixels : 0
          const extraBottom = row < rows - 1 ? overlapPixels : 0

          const sourceX = Math.max(0, cropX - extraLeft)
          const sourceY = Math.max(0, cropY - extraTop)
          const sourceW = Math.min(
            posterCanvas.width - sourceX,
            pagePixelWidth + extraLeft + extraRight
          )
          const sourceH = Math.min(
            posterCanvas.height - sourceY,
            pagePixelHeight + extraTop + extraBottom
          )

          const pageCanvas = document.createElement('canvas')
          const pageContext = pageCanvas.getContext('2d')

          if (!pageContext) {
            throw new Error(t('labPoster.messages.pageGenerateError'))
          }

          pageCanvas.width = sourceW
          pageCanvas.height = sourceH

          pageContext.fillStyle = '#ffffff'
          pageContext.fillRect(0, 0, sourceW, sourceH)
          pageContext.drawImage(
            posterCanvas,
            sourceX,
            sourceY,
            sourceW,
            sourceH,
            0,
            0,
            sourceW,
            sourceH
          )

          const pageImage = pageCanvas.toDataURL('image/jpeg', 0.92)

          pdf.addImage(
            pageImage,
            'JPEG',
            marginMm,
            marginMm,
            printableWidth,
            printableHeight,
            undefined,
            'FAST'
          )

          pdf.setFontSize(7)
          pdf.setTextColor(120)
          pdf.text(
            `${t('lab.name')} • ${t('labPoster.config.pages')} ${row + 1}-${column + 1}`,
            marginMm,
            paperSize.height - Math.max(3, marginMm / 2)
          )
        }
      }

      const safeName = sourceInfo.fileName
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-z0-9_-]/gi, '-')
        .toLowerCase()

      pdf.save(`entreus-lab-poster-${safeName || 'arquivo'}.pdf`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('labPoster.messages.pdfGenerateError'))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 dark:bg-black dark:text-white sm:px-6">
      <section className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/lab"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('labPoster.backToLab')}
            </Link>

            <Link
              href="/feed"
              className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              {t('labPoster.backToFeed')}
            </Link>
          </div>

          <a
            href="#doacao"
            className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-black"
          >
            {t('labPoster.supportTool')}
          </a>
        </div>

        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="relative p-5 sm:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.12),transparent_30%)]" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center">
              <Link href="/lab" className="inline-flex shrink-0" aria-label={t('labPoster.logoAria')}>
                <NextImage
                  src="/logo.png"
                  alt={t('labPoster.logoAlt')}
                  width={170}
                  height={100}
                  className="h-auto w-36 object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)] sm:w-40"
                  priority
                />
              </Link>

              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
                  {t('labPoster.kicker')}
                </p>

                <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
                  {t('labPoster.title')}
                </h1>

                <p className="mt-4 max-w-4xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
                  {t('labPoster.description')}
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
              <h2 className="text-lg font-black">
                {t('labPoster.file.title')}
              </h2>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="hidden"
                onChange={(event) => handleFile(event.target.files?.[0] || null)}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 flex w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                <Upload className="h-6 w-6" />
                <span className="font-semibold">
                  {t('labPoster.file.upload')}
                </span>
              </button>

              {loadingFile && (
                <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('labPoster.file.loading')}
                </div>
              )}

              {sourceInfo && (
                <div className="mt-4 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  <div className="flex items-center gap-2 font-semibold text-zinc-950 dark:text-white">
                    {sourceInfo.fileType === 'pdf' ? (
                      <FileText className="h-4 w-4" />
                    ) : (
                      <ImageIcon className="h-4 w-4" />
                    )}
                    {sourceInfo.fileName}
                  </div>

                  <p className="mt-2">
                    {t('labPoster.file.renderedSize')} {sourceInfo.width} x {sourceInfo.height}px
                  </p>

                  {sourceInfo.fileType === 'pdf' && (
                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        {t('labPoster.file.pdfPage')}
                      </label>

                      <input
                        type="number"
                        min={1}
                        max={sourceInfo.pageCount || 1}
                        value={pdfPageNumber}
                        onChange={(event) => handleReloadPdfPage(Number(event.target.value))}
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                      />

                      <p className="mt-1 text-xs text-zinc-500">
                        {t('labPoster.file.totalPages')} {sourceInfo.pageCount || 1}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-lg font-black">
                {t('labPoster.config.title')}
              </h2>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {t('labPoster.config.paper')}
                  </label>
                  <select
                    value={paper}
                    onChange={(event) => setPaper(event.target.value as PaperKey)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                  >
                    <option value="a4">A4</option>
                    <option value="a3">A3</option>
                    <option value="letter">{t('labPoster.config.letter')}</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {t('labPoster.config.orientation')}
                  </label>
                  <select
                    value={orientation}
                    onChange={(event) => setOrientation(event.target.value as Orientation)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                  >
                    <option value="portrait">{t('labPoster.config.portrait')}</option>
                    <option value="landscape">{t('labPoster.config.landscape')}</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {t('labPoster.config.columns')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={columns}
                    onChange={(event) => setColumns(Number(event.target.value))}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {t('labPoster.config.rows')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={rows}
                    onChange={(event) => setRows(Number(event.target.value))}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {t('labPoster.config.margin')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={marginMm}
                    onChange={(event) => setMarginMm(Number(event.target.value))}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {t('labPoster.config.overlap')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={overlapMm}
                    onChange={(event) => setOverlapMm(Number(event.target.value))}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {t('labPoster.config.fit')}
                  </label>
                  <select
                    value={fitMode}
                    onChange={(event) => setFitMode(event.target.value as FitMode)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                  >
                    <option value="contain">{t('labPoster.config.contain')}</option>
                    <option value="cover">{t('labPoster.config.cover')}</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {t('labPoster.config.quality')}
                  </label>
                  <select
                    value={dpi}
                    onChange={(event) => setDpi(Number(event.target.value))}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                  >
                    {DPI_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                <p>
                  {t('labPoster.config.pages')} <strong>{totalPages}</strong>
                </p>
                <p>
                  {t('labPoster.config.posterApprox')} <strong>{posterWidth.toFixed(1)} x {posterHeight.toFixed(1)} mm</strong>
                </p>
                <p>
                  {t('labPoster.config.printableArea')} <strong>{printableWidth.toFixed(1)} x {printableHeight.toFixed(1)} mm</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={generatePosterPdf}
                disabled={!sourceCanvas || generating || loadingFile}
                className={`mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 font-bold transition ${
                  !sourceCanvas || generating || loadingFile
                    ? 'cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500'
                    : 'bg-black text-white hover:opacity-90 dark:bg-white dark:text-black'
                }`}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {t('labPoster.config.generating')}
                  </>
                ) : (
                  <>
                    <Download className="h-5 w-5" />
                    {t('labPoster.config.generate')}
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-black">
              {t('labPoster.preview.title')}
            </h2>

            <div className="mt-4 flex min-h-[520px] items-center justify-center rounded-3xl bg-zinc-100 p-4 dark:bg-black">
              {previewUrl ? (
                <div className="w-full max-w-3xl">
                  <img
                    src={previewUrl}
                    alt={t('labPoster.preview.alt')}
                    className="mx-auto max-h-[620px] rounded-2xl object-contain shadow-lg"
                  />

                  <div
                    className="mx-auto mt-4 grid max-w-md gap-1 rounded-2xl border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950"
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(columns, 8)}, minmax(0, 1fr))`,
                    }}
                  >
                    {Array.from({ length: Math.min(totalPages, 80) }).map((_, index) => (
                      <div
                        key={index}
                        className="aspect-[3/4] rounded border border-blue-300 bg-blue-50 text-center text-[10px] font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200"
                      >
                        {index + 1}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center text-zinc-500">
                  <Upload className="mx-auto h-10 w-10" />
                  <p className="mt-3 text-sm">
                    {t('labPoster.preview.empty')}
                  </p>
                </div>
              )}
            </div>

            <div id="doacao" className="mt-5 rounded-3xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900/60 dark:bg-blue-950/20">
              <h3 className="font-black text-zinc-950 dark:text-white">
                {t('labPoster.donation.title')}
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {t('labPoster.donation.description')}
              </p>

              <a
                href={DONATION_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex rounded-full bg-blue-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
              >
                {t('labPoster.donation.action')}
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

'use client'

import NextImage from 'next/image'
import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, CreditCard, Download, FileText, Heart, ImageIcon, Landmark, Loader2, Upload } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { useLanguage } from '../../components/LanguageProvider'
import {
  calculateAutomaticPosterGrid,
  calculatePosterLayout,
  getPaperSize,
  getUnitInputStep,
  mmToUnit,
  type Orientation,
  type PaperKey,
  type UnitKey,
  unitToMm,
} from '@/lib/poster-layout'

const PIX_DONATION_URL = 'https://nubank.com.br/cobrar/u2kum/69fca421-184d-459c-a125-f760fc56c264'
const MERCADO_PAGO_DONATION_URL = 'https://link.mercadopago.com.br/entreuslab'

type FitMode = 'contain' | 'cover'
type CalculationMode = 'manual' | 'automatic'
type TargetUnit = 'cm' | 'm'

type SourceInfo = {
  fileName: string
  fileType: 'image' | 'pdf'
  width: number
  height: number
  pageCount?: number
}

const DPI_OPTIONS = [
  { labelKey: 'labPoster.config.fast', value: 100 },
  { labelKey: 'labPoster.config.good', value: 130 },
  { labelKey: 'labPoster.config.high', value: 160 },
]

function formatUnitNumber(valueMm: number, unit: UnitKey) {
  const value = mmToUnit(valueMm, unit)

  if (unit === 'm') {
    return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  }

  if (unit === 'cm') {
    return value.toFixed(1).replace(/\.0$/, '')
  }

  return value.toFixed(1).replace(/\.0$/, '')
}

function formatDimension(widthMm: number, heightMm: number, unit: UnitKey) {
  return `${formatUnitNumber(widthMm, unit)} x ${formatUnitNumber(heightMm, unit)} ${unit}`
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
  const [calculationMode, setCalculationMode] = useState<CalculationMode>('manual')
  const [targetWidth, setTargetWidth] = useState(100)
  const [targetHeight, setTargetHeight] = useState(50)
  const [targetUnit, setTargetUnit] = useState<TargetUnit>('cm')
  const [marginMm, setMarginMm] = useState(8)
  const [overlapMm, setOverlapMm] = useState(0)
  const [fitMode, setFitMode] = useState<FitMode>('contain')
  const [measurementUnit, setMeasurementUnit] = useState<UnitKey>('cm')
  const [pdfPageNumber, setPdfPageNumber] = useState(1)
  const [dpi, setDpi] = useState(130)

  const paperSize = useMemo(() => getPaperSize(paper, orientation), [paper, orientation])
  const sourceAspectRatio = sourceInfo && sourceInfo.height > 0 ? sourceInfo.width / sourceInfo.height : undefined
  const automaticGrid = useMemo(
    () => calculateAutomaticPosterGrid({
      paperWidthMm: paperSize.width,
      paperHeightMm: paperSize.height,
      marginMm,
      overlapMm,
      targetWidthMm: unitToMm(targetWidth, targetUnit),
      targetHeightMm: unitToMm(targetHeight, targetUnit),
      sourceAspectRatio,
    }),
    [marginMm, overlapMm, paperSize.height, paperSize.width, sourceAspectRatio, targetHeight, targetUnit, targetWidth],
  )
  const effectiveColumns = calculationMode === 'automatic' && automaticGrid.ok ? automaticGrid.columns : columns
  const effectiveRows = calculationMode === 'automatic' && automaticGrid.ok ? automaticGrid.rows : rows
  const posterLayout = calculatePosterLayout({
    paperWidthMm: paperSize.width,
    paperHeightMm: paperSize.height,
    marginMm,
    overlapMm,
    columns: effectiveColumns,
    rows: effectiveRows,
  })
  const printableWidth = posterLayout?.printableWidthMm || 0
  const printableHeight = posterLayout?.printableHeightMm || 0
  const posterWidth = posterLayout?.posterWidthMm || 0
  const posterHeight = posterLayout?.posterHeightMm || 0
  const finalPosterWidth = calculationMode === 'automatic' && automaticGrid.ok
    ? automaticGrid.targetWidthMm
    : posterWidth
  const finalPosterHeight = calculationMode === 'automatic' && automaticGrid.ok
    ? automaticGrid.targetHeightMm
    : posterHeight
  const previewCoverageWidth = calculationMode === 'automatic' && automaticGrid.ok
    ? automaticGrid.layout.posterWidthMm
    : posterWidth
  const previewCoverageHeight = calculationMode === 'automatic' && automaticGrid.ok
    ? automaticGrid.layout.posterHeightMm
    : posterHeight
  const pdfCanvasWidth = calculationMode === 'automatic' && automaticGrid.ok
    ? posterWidth
    : finalPosterWidth
  const pdfCanvasHeight = calculationMode === 'automatic' && automaticGrid.ok
    ? posterHeight
    : finalPosterHeight
  const totalPages = posterLayout?.pageCount || 0
  const marginValue = mmToUnit(marginMm, measurementUnit)
  const overlapValue = mmToUnit(overlapMm, measurementUnit)
  const maxMarginValue = mmToUnit(30, measurementUnit)
  const maxOverlapValue = mmToUnit(20, measurementUnit)
  const unitStep = getUnitInputStep(measurementUnit)
  const automaticFeedback = calculationMode === 'automatic' && !automaticGrid.ok
    ? 'Informe uma largura e uma altura final válidas para calcular a grade.'
    : ''
  const previewInsetX = Math.min(18, (marginMm / paperSize.width) * 100)
  const previewInsetY = Math.min(18, (marginMm / paperSize.height) * 100)
  const previewOverlapX = printableWidth > 0 ? Math.min(24, (overlapMm / printableWidth) * 100) : 0
  const previewOverlapY = printableHeight > 0 ? Math.min(24, (overlapMm / printableHeight) * 100) : 0

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

    if (!posterLayout || automaticFeedback) {
      setMessage(automaticFeedback || 'Revise as medidas da página antes de gerar o PDF.')
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

      const posterPixelWidth = Math.round(pdfCanvasWidth * pxPerMm)
      const posterPixelHeight = Math.round(pdfCanvasHeight * pxPerMm)

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

      for (let row = 0; row < effectiveRows; row++) {
        for (let column = 0; column < effectiveColumns; column++) {
          if (row > 0 || column > 0) {
            pdf.addPage(paper, orientation)
          }

          const sourceX = column * (pagePixelWidth - overlapPixels)
          const sourceY = row * (pagePixelHeight - overlapPixels)
          const sourceW = Math.max(0, Math.min(
            posterCanvas.width - sourceX,
            pagePixelWidth,
          ))
          const sourceH = Math.max(0, Math.min(
            posterCanvas.height - sourceY,
            pagePixelHeight,
          ))

          const pageCanvas = document.createElement('canvas')
          const pageContext = pageCanvas.getContext('2d')

          if (!pageContext) {
            throw new Error(t('labPoster.messages.pageGenerateError'))
          }

          pageCanvas.width = pagePixelWidth
          pageCanvas.height = pagePixelHeight

          pageContext.fillStyle = '#ffffff'
          pageContext.fillRect(0, 0, pagePixelWidth, pagePixelHeight)

          if (sourceW > 0 && sourceH > 0) {
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
          }

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

                <div className="col-span-2 rounded-2xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/70 dark:bg-blue-950/20">
                  <label className="mb-2 block text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    Modo de cálculo
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCalculationMode('manual')}
                      className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                        calculationMode === 'manual'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-zinc-700 hover:bg-blue-100 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-900'
                      }`}
                    >
                      Manual
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalculationMode('automatic')}
                      className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                        calculationMode === 'automatic'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-zinc-700 hover:bg-blue-100 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-900'
                      }`}
                    >
                      Automático por tamanho
                    </button>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                    Informe o tamanho final desejado. O sistema calcula a grade usando o papel, margens e sobreposição.
                  </p>
                </div>

                {calculationMode === 'automatic' && (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                        Largura final desejada ({targetUnit})
                      </label>
                      <input
                        type="number"
                        min={targetUnit === 'm' ? 0.01 : 1}
                        step={targetUnit === 'm' ? 0.01 : 0.1}
                        value={targetWidth}
                        onChange={(event) => setTargetWidth(Number(event.target.value))}
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                        Altura final desejada ({targetUnit})
                      </label>
                      <input
                        type="number"
                        min={targetUnit === 'm' ? 0.01 : 1}
                        step={targetUnit === 'm' ? 0.01 : 0.1}
                        value={targetHeight}
                        onChange={(event) => setTargetHeight(Number(event.target.value))}
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                        Unidade do tamanho final
                      </label>
                      <select
                        value={targetUnit}
                        onChange={(event) => setTargetUnit(event.target.value as TargetUnit)}
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                      >
                        <option value="cm">Centímetros</option>
                        <option value="m">Metros</option>
                      </select>
                      {automaticFeedback && (
                        <p role="status" className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                          {automaticFeedback}
                        </p>
                      )}
                    </div>
                  </>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {t('labPoster.config.columns')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={effectiveColumns}
                    onChange={(event) => setColumns(Number(event.target.value))}
                    disabled={calculationMode === 'automatic'}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-black"
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
                    value={effectiveRows}
                    onChange={(event) => setRows(Number(event.target.value))}
                    disabled={calculationMode === 'automatic'}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-black"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {t('labPoster.config.unit')}
                  </label>
                  <select
                    value={measurementUnit}
                    onChange={(event) => setMeasurementUnit(event.target.value as UnitKey)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                  >
                    <option value="mm">{t('labPoster.config.unitMm')}</option>
                    <option value="cm">{t('labPoster.config.unitCm')}</option>
                    <option value="m">{t('labPoster.config.unitM')}</option>
                  </select>
                  <p className="mt-1 text-xs text-zinc-500">
                    {t('labPoster.config.unitHelp')}
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {t('labPoster.config.margin')} ({measurementUnit})
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={maxMarginValue}
                    step={unitStep}
                    value={marginValue}
                    onChange={(event) =>
                      setMarginMm(
                        Math.max(
                          0,
                          Math.min(30, unitToMm(Number(event.target.value), measurementUnit))
                        )
                      )
                    }
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                  />
                  {measurementUnit !== 'mm' && (
                    <p className="mt-1 text-xs text-zinc-500">
                      {marginMm.toFixed(1).replace(/\.0$/, '')} mm
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {t('labPoster.config.overlap')} ({measurementUnit})
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={maxOverlapValue}
                    step={unitStep}
                    value={overlapValue}
                    onChange={(event) =>
                      setOverlapMm(
                        Math.max(
                          0,
                          Math.min(20, unitToMm(Number(event.target.value), measurementUnit))
                        )
                      )
                    }
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none dark:border-zinc-700 dark:bg-black"
                  />
                  {measurementUnit !== 'mm' && (
                    <p className="mt-1 text-xs text-zinc-500">
                      {overlapMm.toFixed(1).replace(/\.0$/, '')} mm
                    </p>
                  )}
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
                {calculationMode === 'automatic' && automaticGrid.ok && (
                  <p className="mb-2 rounded-xl bg-blue-100 px-3 py-2 text-blue-900 dark:bg-blue-950/60 dark:text-blue-100">
                    Grade automática: <strong>{effectiveColumns} colunas × {effectiveRows} linhas</strong>
                  </p>
                )}
                <p>
                  {t('labPoster.config.pages')} <strong>{totalPages}</strong>
                </p>
                {calculationMode === 'automatic' && automaticGrid.ok ? (
                  <>
                    <p>
                      Tamanho final desejado: <strong>{formatDimension(finalPosterWidth, finalPosterHeight, targetUnit)}</strong>
                    </p>
                    <p>
                      Área total coberta pelas folhas: <strong>{formatDimension(posterWidth, posterHeight, measurementUnit)}</strong>
                    </p>
                    <p className="text-xs opacity-80">
                      Sobra para recorte: {formatUnitNumber(automaticGrid.trimWidthMm, measurementUnit)} {measurementUnit} horizontal / {formatUnitNumber(automaticGrid.trimHeightMm, measurementUnit)} {measurementUnit} vertical
                    </p>
                  </>
                ) : (
                  <p>
                    {t('labPoster.config.posterApprox')}{' '}
                    <strong>{formatDimension(posterWidth, posterHeight, measurementUnit)}</strong>
                  </p>
                )}
                {measurementUnit !== 'mm' && calculationMode !== 'automatic' && (
                  <p className="text-xs opacity-75">
                    {posterWidth.toFixed(1)} x {posterHeight.toFixed(1)} mm
                  </p>
                )}
                <p className="mt-1">
                  {t('labPoster.config.printableArea')}{' '}
                  <strong>{formatDimension(printableWidth, printableHeight, measurementUnit)}</strong>
                </p>
                {calculationMode === 'automatic' && automaticGrid.ok && (
                  <p className="mt-1 text-xs opacity-80">
                    Arte preservada dentro de até {formatDimension(automaticGrid.artworkWidthMm, automaticGrid.artworkHeightMm, targetUnit)}.
                  </p>
                )}
                {measurementUnit !== 'mm' && (
                  <p className="text-xs opacity-75">
                    {printableWidth.toFixed(1)} x {printableHeight.toFixed(1)} mm
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={generatePosterPdf}
                disabled={!sourceCanvas || generating || loadingFile || Boolean(automaticFeedback) || !posterLayout}
                className={`mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 font-bold transition ${
                  !sourceCanvas || generating || loadingFile || Boolean(automaticFeedback) || !posterLayout
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
                  <div
                    className="relative mx-auto w-full max-h-[620px] overflow-hidden rounded-2xl bg-white shadow-lg"
                    style={{ aspectRatio: `${previewCoverageWidth} / ${previewCoverageHeight}` }}
                  >
                    <div data-testid="poster-artwork-bleed" className="absolute inset-0 overflow-hidden bg-white">
                      <img
                        src={previewUrl}
                        alt={t('labPoster.preview.alt')}
                        className={`block h-full w-full ${fitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
                      />
                    </div>

                    <div
                      data-testid="poster-grid-overlay"
                      aria-label={`Prévia com ${effectiveColumns} colunas e ${effectiveRows} linhas`}
                      className="pointer-events-none absolute inset-0 grid overflow-hidden rounded-2xl border-2 border-blue-500/90 bg-blue-950/5"
                      style={{
                        gridTemplateColumns: `repeat(${effectiveColumns}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${effectiveRows}, minmax(0, 1fr))`,
                      }}
                    >
                      {Array.from({ length: totalPages }).map((_, index) => {
                        const column = index % effectiveColumns
                        const row = Math.floor(index / effectiveColumns)

                        return (
                          <div
                            key={index}
                            className="relative border border-white/90 bg-blue-500/10 shadow-[inset_0_0_0_1px_rgba(30,64,175,0.65)]"
                            style={{
                              padding: `${previewInsetY}% ${previewInsetX}%`,
                            }}
                          >
                            <div className="h-full w-full border border-dashed border-blue-950/50 bg-white/5" />
                            {overlapMm > 0 && column < effectiveColumns - 1 && (
                              <span
                                aria-hidden="true"
                                className="absolute bottom-0 right-0 top-0 bg-blue-700/20"
                                style={{ width: `${previewOverlapX}%` }}
                              />
                            )}
                            {overlapMm > 0 && row < effectiveRows - 1 && (
                              <span
                                aria-hidden="true"
                                className="absolute bottom-0 left-0 right-0 bg-blue-700/20"
                                style={{ height: `${previewOverlapY}%` }}
                              />
                            )}
                            <span className="absolute left-1/2 top-1/2 inline-flex h-7 min-w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/90 bg-blue-700/85 px-1 text-xs font-black text-white shadow-sm">
                              {index + 1}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {calculationMode === 'automatic' && automaticGrid.ok && (
                      <>
                        <div
                          data-testid="poster-trim-right"
                          aria-label="Área de recorte horizontal"
                          className="pointer-events-none absolute bottom-0 right-0 top-0 border-l border-dashed border-zinc-500/60 bg-zinc-950/35"
                          style={{ width: `${(automaticGrid.trimWidthMm / previewCoverageWidth) * 100}%` }}
                        >
                          {automaticGrid.trimWidthMm > 0 && (
                            <span className="absolute left-1 top-1 rounded bg-zinc-950/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              Área de recorte
                            </span>
                          )}
                        </div>
                        <div
                          data-testid="poster-trim-bottom"
                          aria-label="Área de recorte vertical"
                          className="pointer-events-none absolute bottom-0 left-0 right-0 border-t border-dashed border-zinc-500/60 bg-zinc-950/35"
                          style={{ height: `${(automaticGrid.trimHeightMm / previewCoverageHeight) * 100}%` }}
                        />
                        <div
                          data-testid="poster-final-boundary"
                          aria-label="Borda do tamanho final desejado"
                          className="pointer-events-none absolute left-0 top-0 border-2 border-emerald-400 shadow-[0_0_0_1px_rgba(255,255,255,0.8)]"
                          style={{
                            width: `${(finalPosterWidth / previewCoverageWidth) * 100}%`,
                            height: `${(finalPosterHeight / previewCoverageHeight) * 100}%`,
                          }}
                        />
                      </>
                    )}
                  </div>

                  <p className="mx-auto mt-3 max-w-xl text-center text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    A prévia mostra como as folhas ficarão montadas. A borda verde indica o tamanho final desejado; a arte continua na Área de recorte para permitir o recorte físico depois da montagem.
                  </p>
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

            <div id="doacao" className="mt-5 rounded-3xl border border-green-200 bg-green-50 p-5 dark:border-green-900/60 dark:bg-green-950/20">
              <div className="mb-3 flex items-center gap-2 text-green-700 dark:text-green-300">
                <Heart className="h-5 w-5" />
                <h3 className="font-black text-zinc-950 dark:text-white">
                  {t('labPoster.donation.title')}
                </h3>
              </div>

              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Esta ferramenta pode ajudar escolas, professores e criadores. Se puder, prefira o Pix Nubank: ele ajuda mais porque não desconta taxa do projeto. O Mercado Pago continua como alternativa, mas pode cobrar taxa.
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <a
                  href={PIX_DONATION_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-green-700"
                >
                  <Landmark className="h-4 w-4" />
                  Pix Nubank — sem taxa
                </a>

                <a
                  href={MERCADO_PAGO_DONATION_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-green-300 bg-white px-5 py-2 text-sm font-bold text-green-700 transition hover:bg-green-100 dark:border-green-800 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900"
                >
                  <CreditCard className="h-4 w-4" />
                  Mercado Pago — pode ter taxa
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

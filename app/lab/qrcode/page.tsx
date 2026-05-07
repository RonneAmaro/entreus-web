'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Copy,
  CreditCard,
  Download,
  Eye,
  Heart,
  Landmark,
  LinkIcon,
  Mail,
  MessageCircle,
  Phone,
  Printer,
  QrCode,
  RefreshCw,
  Type,
  Wifi,
} from 'lucide-react'
import QRCode from 'qrcode'

type QrMode = 'text' | 'url' | 'wifi' | 'whatsapp' | 'email' | 'phone'
type WifiSecurity = 'WPA' | 'WEP' | 'nopass'

const PIX_NUBANK_URL =
  'https://nubank.com.br/cobrar/u2kum/69fca421-184d-459c-a125-f760fc56c264'

const MERCADO_PAGO_URL = 'https://link.mercadopago.com.br/entreuslab'

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function escapeWifiValue(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/:/g, '\\:')
}

function normalizeUrl(value: string) {
  const trimmed = value.trim()

  if (!trimmed) return ''

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  return `https://${trimmed}`
}

function buildWhatsAppUrl(phone: string, message: string) {
  const digits = onlyDigits(phone)

  if (!digits) return ''

  const text = message.trim()

  if (!text) {
    return `https://wa.me/${digits}`
  }

  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

function buildEmailUrl(email: string, subject: string, body: string) {
  const trimmedEmail = email.trim()

  if (!trimmedEmail) return ''

  const params = new URLSearchParams()

  if (subject.trim()) {
    params.set('subject', subject.trim())
  }

  if (body.trim()) {
    params.set('body', body.trim())
  }

  const query = params.toString()

  return query ? `mailto:${trimmedEmail}?${query}` : `mailto:${trimmedEmail}`
}

function buildWifiQrValue(
  ssid: string,
  password: string,
  security: WifiSecurity,
  hidden: boolean
) {
  const safeSsid = escapeWifiValue(ssid.trim())
  const safePassword = escapeWifiValue(password.trim())

  if (!safeSsid) return ''

  if (security === 'nopass') {
    return `WIFI:T:nopass;S:${safeSsid};H:${hidden ? 'true' : 'false'};;`
  }

  return `WIFI:T:${security};S:${safeSsid};P:${safePassword};H:${hidden ? 'true' : 'false'};;`
}

export default function QrCodeLabPage() {
  const [mode, setMode] = useState<QrMode>('url')
  const [title, setTitle] = useState('Meu QR Code')
  const [textValue, setTextValue] = useState('')
  const [urlValue, setUrlValue] = useState('https://entreus.vercel.app')
  const [wifiSsid, setWifiSsid] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [wifiSecurity, setWifiSecurity] = useState<WifiSecurity>('WPA')
  const [wifiHidden, setWifiHidden] = useState(false)
  const [whatsappPhone, setWhatsappPhone] = useState('')
  const [whatsappMessage, setWhatsappMessage] = useState('')
  const [emailAddress, setEmailAddress] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [phoneValue, setPhoneValue] = useState('')
  const [qrColor, setQrColor] = useState('#000000')
  const [bgColor, setBgColor] = useState('#ffffff')
  const [size, setSize] = useState(900)
  const [margin, setMargin] = useState(2)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  const qrValue = useMemo(() => {
    if (mode === 'text') return textValue.trim()
    if (mode === 'url') return normalizeUrl(urlValue)
    if (mode === 'wifi')
      return buildWifiQrValue(
        wifiSsid,
        wifiPassword,
        wifiSecurity,
        wifiHidden
      )
    if (mode === 'whatsapp')
      return buildWhatsAppUrl(whatsappPhone, whatsappMessage)
    if (mode === 'email')
      return buildEmailUrl(emailAddress, emailSubject, emailBody)
    if (mode === 'phone') {
      const digits = onlyDigits(phoneValue)
      return digits ? `tel:+${digits}` : ''
    }

    return ''
  }, [
    mode,
    textValue,
    urlValue,
    wifiSsid,
    wifiPassword,
    wifiSecurity,
    wifiHidden,
    whatsappPhone,
    whatsappMessage,
    emailAddress,
    emailSubject,
    emailBody,
    phoneValue,
  ])

  async function generateQrCode() {
    setMessage('')

    if (!qrValue) {
      setQrDataUrl('')
      setMessage('Preencha as informações para gerar o QR Code.')
      return
    }

    try {
      const dataUrl = await QRCode.toDataURL(qrValue, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        width: size,
        margin,
        color: {
          dark: qrColor,
          light: bgColor,
        },
      })

      setQrDataUrl(dataUrl)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Erro ao gerar QR Code.'
      )
    }
  }

  useEffect(() => {
    generateQrCode()
  }, [qrValue, qrColor, bgColor, size, margin])

  async function copyContent() {
    if (!qrValue) return

    try {
      await navigator.clipboard.writeText(qrValue)
      setCopied(true)

      setTimeout(() => setCopied(false), 1800)
    } catch {
      setMessage('Não foi possível copiar o conteúdo.')
    }
  }

  function downloadQrCode() {
    if (!qrDataUrl) return

    const link = document.createElement('a')
    const safeTitle =
      title.trim().replace(/[^a-z0-9_-]/gi, '-').toLowerCase() || 'qrcode'

    link.href = qrDataUrl
    link.download = `entreus-lab-${safeTitle}.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  function printQrCode() {
    if (!qrDataUrl) return

    const printWindow = window.open('', '_blank')

    if (!printWindow) {
      setMessage('Não foi possível abrir a janela de impressão.')
      return
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${title}</title>
          <meta charset="utf-8" />
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: Arial, sans-serif;
              background: #ffffff;
              color: #111111;
            }

            .card {
              width: min(90vw, 720px);
              text-align: center;
              padding: 32px;
              border: 1px solid #ddd;
              border-radius: 24px;
            }

            h1 {
              margin: 0 0 24px;
              font-size: 32px;
            }

            img {
              width: min(80vw, 460px);
              height: auto;
            }

            p {
              margin: 20px auto 0;
              max-width: 560px;
              font-size: 14px;
              color: #555;
              word-break: break-word;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>${title}</h1>
            <img src="${qrDataUrl}" alt="${title}" />
            <p>${qrValue}</p>
          </div>

          <script>
            window.onload = () => {
              window.print()
            }
          </script>
        </body>
      </html>
    `)

    printWindow.document.close()
  }

  function modeButtonClass(currentMode: QrMode) {
    return `flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-bold transition ${
      mode === currentMode
        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
        : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900'
    }`
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
                <QrCode className="h-7 w-7" />
              </div>

              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
                  EntreUS Lab
                </p>

                <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
                  Gerador de QR Code
                </h1>

                <p className="mt-4 max-w-4xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
                  Crie QR Codes para links, textos, Wi-Fi, WhatsApp, e-mail e
                  telefone. Ideal para escolas, murais, atividades, cartazes,
                  eventos, comunicados e pequenos negócios.
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

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-5">
            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-lg font-black">Tipo de QR Code</h2>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setMode('url')}
                  className={modeButtonClass('url')}
                >
                  <LinkIcon className="h-4 w-4" />
                  Link
                </button>

                <button
                  type="button"
                  onClick={() => setMode('text')}
                  className={modeButtonClass('text')}
                >
                  <Type className="h-4 w-4" />
                  Texto
                </button>

                <button
                  type="button"
                  onClick={() => setMode('wifi')}
                  className={modeButtonClass('wifi')}
                >
                  <Wifi className="h-4 w-4" />
                  Wi-Fi
                </button>

                <button
                  type="button"
                  onClick={() => setMode('whatsapp')}
                  className={modeButtonClass('whatsapp')}
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </button>

                <button
                  type="button"
                  onClick={() => setMode('email')}
                  className={modeButtonClass('email')}
                >
                  <Mail className="h-4 w-4" />
                  E-mail
                </button>

                <button
                  type="button"
                  onClick={() => setMode('phone')}
                  className={modeButtonClass('phone')}
                >
                  <Phone className="h-4 w-4" />
                  Telefone
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-lg font-black">Conteúdo</h2>

              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Título do QR Code
                </label>

                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ex: Wi-Fi da escola"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-black"
                />
              </div>

              {mode === 'url' && (
                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Link ou site
                  </label>

                  <input
                    type="text"
                    value={urlValue}
                    onChange={(event) => setUrlValue(event.target.value)}
                    placeholder="https://exemplo.com"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-black"
                  />
                </div>
              )}

              {mode === 'text' && (
                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Texto livre
                  </label>

                  <textarea
                    value={textValue}
                    onChange={(event) => setTextValue(event.target.value)}
                    placeholder="Digite qualquer texto para transformar em QR Code."
                    className="min-h-40 w-full resize-none rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-black"
                  />
                </div>
              )}

              {mode === 'wifi' && (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      Nome da rede Wi-Fi
                    </label>

                    <input
                      type="text"
                      value={wifiSsid}
                      onChange={(event) => setWifiSsid(event.target.value)}
                      placeholder="Ex: Escola_Chapeuzinho"
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-black"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      Senha
                    </label>

                    <input
                      type="text"
                      value={wifiPassword}
                      onChange={(event) => setWifiPassword(event.target.value)}
                      placeholder="Senha do Wi-Fi"
                      disabled={wifiSecurity === 'nopass'}
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-black"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      Segurança
                    </label>

                    <select
                      value={wifiSecurity}
                      onChange={(event) =>
                        setWifiSecurity(event.target.value as WifiSecurity)
                      }
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-black"
                    >
                      <option value="WPA">WPA/WPA2</option>
                      <option value="WEP">WEP</option>
                      <option value="nopass">Sem senha</option>
                    </select>
                  </div>

                  <label className="sm:col-span-2 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium dark:border-zinc-800 dark:bg-zinc-900">
                    <input
                      type="checkbox"
                      checked={wifiHidden}
                      onChange={(event) => setWifiHidden(event.target.checked)}
                    />
                    Rede oculta
                  </label>
                </div>
              )}

              {mode === 'whatsapp' && (
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      Número com DDD e país
                    </label>

                    <input
                      type="text"
                      value={whatsappPhone}
                      onChange={(event) =>
                        setWhatsappPhone(event.target.value)
                      }
                      placeholder="Ex: 5569999999999"
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-black"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      Mensagem inicial opcional
                    </label>

                    <textarea
                      value={whatsappMessage}
                      onChange={(event) =>
                        setWhatsappMessage(event.target.value)
                      }
                      placeholder="Ex: Olá, vim pelo QR Code."
                      className="min-h-28 w-full resize-none rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-black"
                    />
                  </div>
                </div>
              )}

              {mode === 'email' && (
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      E-mail
                    </label>

                    <input
                      type="email"
                      value={emailAddress}
                      onChange={(event) =>
                        setEmailAddress(event.target.value)
                      }
                      placeholder="exemplo@email.com"
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-black"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      Assunto opcional
                    </label>

                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(event) => setEmailSubject(event.target.value)}
                      placeholder="Assunto do e-mail"
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-black"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      Mensagem opcional
                    </label>

                    <textarea
                      value={emailBody}
                      onChange={(event) => setEmailBody(event.target.value)}
                      placeholder="Mensagem do e-mail"
                      className="min-h-28 w-full resize-none rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-black"
                    />
                  </div>
                </div>
              )}

              {mode === 'phone' && (
                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Telefone com DDD e país
                  </label>

                  <input
                    type="text"
                    value={phoneValue}
                    onChange={(event) => setPhoneValue(event.target.value)}
                    placeholder="Ex: 5569999999999"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-black"
                  />
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-lg font-black">Personalização</h2>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Cor do QR Code
                  </label>

                  <input
                    type="color"
                    value={qrColor}
                    onChange={(event) => setQrColor(event.target.value)}
                    className="h-12 w-full cursor-pointer rounded-xl border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-black"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Cor do fundo
                  </label>

                  <input
                    type="color"
                    value={bgColor}
                    onChange={(event) => setBgColor(event.target.value)}
                    className="h-12 w-full cursor-pointer rounded-xl border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-black"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Tamanho PNG
                  </label>

                  <select
                    value={size}
                    onChange={(event) => setSize(Number(event.target.value))}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-black"
                  >
                    <option value={600}>600 px</option>
                    <option value={900}>900 px</option>
                    <option value={1200}>1200 px</option>
                    <option value={1600}>1600 px</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Margem
                  </label>

                  <select
                    value={margin}
                    onChange={(event) => setMargin(Number(event.target.value))}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-black"
                  >
                    <option value={1}>Pequena</option>
                    <option value={2}>Média</option>
                    <option value={4}>Grande</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={generateQrCode}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-bold text-white transition hover:opacity-90 dark:bg-white dark:text-black"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar QR Code
              </button>
            </div>
          </div>

          <div className="space-y-5">
            <div className="sticky top-8 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="mb-4 flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h2 className="text-lg font-black">Prévia</h2>
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5 text-center dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="mb-4 break-words text-xl font-black">
                  {title || 'Meu QR Code'}
                </h3>

                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={title || 'QR Code'}
                    className="mx-auto h-auto w-full max-w-[320px] rounded-2xl bg-white p-3"
                  />
                ) : (
                  <div className="mx-auto flex aspect-square w-full max-w-[320px] items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-black">
                    <QrCode className="h-16 w-16" />
                  </div>
                )}

                <p className="mx-auto mt-4 max-w-sm break-words text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  {qrValue || 'Preencha os dados para gerar o QR Code.'}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <button
                  type="button"
                  onClick={downloadQrCode}
                  disabled={!qrDataUrl}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Baixar PNG
                </button>

                <button
                  type="button"
                  onClick={printQrCode}
                  disabled={!qrDataUrl}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-3 text-sm font-bold text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
                >
                  <Printer className="h-4 w-4" />
                  Imprimir
                </button>

                <button
                  type="button"
                  onClick={copyContent}
                  disabled={!qrValue}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-3 text-sm font-bold text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? 'Copiado!' : 'Copiar conteúdo'}
                </button>
              </div>
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
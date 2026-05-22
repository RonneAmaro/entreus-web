'use client'

import { useEffect, useState } from 'react'
import { Download, Info, Share2 } from 'lucide-react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

type DeviceKind = 'android' | 'ios' | 'desktop'

function detectDevice() {
  if (typeof navigator === 'undefined') return 'desktop'

  const userAgent = navigator.userAgent.toLowerCase()
  const platform = navigator.platform?.toLowerCase() || ''
  const isTouchMac =
    platform.includes('mac') && 'maxTouchPoints' in navigator && navigator.maxTouchPoints > 1

  if (/android/.test(userAgent)) return 'android'
  if (/iphone|ipad|ipod/.test(userAgent) || isTouchMac) return 'ios'

  return 'desktop'
}

function getManualMessage(device: DeviceKind) {
  if (device === 'ios') {
    return 'No Safari, toque em Compartilhar e depois Adicionar à Tela de Início.'
  }

  if (device === 'android') {
    return 'Use o menu do navegador e toque em Instalar app.'
  }

  return 'No navegador, procure a opção Instalar app ou Adicionar à tela inicial.'
}

export default function PWAInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [device, setDevice] = useState<DeviceKind>('desktop')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setDevice(detectDevice())

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setMessage('')
    }

    function handleAppInstalled() {
      setInstallPrompt(null)
      setMessage('EntreUS instalada com sucesso.')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  async function handleInstallClick() {
    if (!installPrompt) {
      setMessage(getManualMessage(device))
      return
    }

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice

    setInstallPrompt(null)
    setMessage(
      choice.outcome === 'accepted'
        ? 'Instalação iniciada. Depois abra pelo ícone da EntreUS.'
        : getManualMessage(device)
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <button
        type="button"
        onClick={handleInstallClick}
        className="inline-flex min-h-14 w-full max-w-xs items-center justify-center gap-3 rounded-full bg-sky-400 px-6 text-base font-black text-slate-950 shadow-2xl shadow-sky-500/25 transition hover:bg-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:ring-offset-2 focus:ring-offset-slate-950"
      >
        <Download className="h-5 w-5" />
        Instalar EntreUS
      </button>

      {message && (
        <div className="flex w-full max-w-xl items-start gap-3 rounded-2xl border border-sky-300/20 bg-sky-950/50 px-4 py-3 text-left text-sm leading-6 text-sky-100">
          {device === 'ios' ? (
            <Share2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
          ) : (
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
          )}
          <span>{message}</span>
        </div>
      )}
    </div>
  )
}

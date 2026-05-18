'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Coins, Loader2, Send, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type TipRecipient = {
  id: string
  name: string
  username?: string | null
  avatarUrl?: string | null
}

type TipModalProps = {
  open: boolean
  recipient: TipRecipient | null
  currentUserId?: string | null
  onClose: () => void
  onSent?: () => void
}

const QUICK_AMOUNTS = [5, 10, 25, 50, 100]

function getInitial(text: string) {
  return (text || 'U').slice(0, 1).toUpperCase()
}

export default function TipModal({
  open,
  recipient,
  currentUserId,
  onClose,
  onSent,
}: TipModalProps) {
  const [amount, setAmount] = useState(10)
  const [customAmount, setCustomAmount] = useState('')
  const [tipMessage, setTipMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    if (!open) return

    setAmount(10)
    setCustomAmount('')
    setTipMessage('')
    setMessage('')
    setSuccessMessage('')
  }, [open])

  async function sendTip() {
    if (!recipient) return

    const finalAmount = Number(customAmount || amount)

    if (!currentUserId) {
      setMessage('Usuario nao logado.')
      return
    }

    if (currentUserId === recipient.id) {
      setMessage('Voce nao pode apoiar a si mesmo.')
      return
    }

    if (!Number.isInteger(finalAmount) || finalAmount <= 0) {
      setMessage('Informe um valor valido em ItaCash.')
      return
    }

    setSubmitting(true)
    setMessage('')
    setSuccessMessage('')

    const { error } = await supabase.rpc('send_itacash_tip', {
      p_receiver_id: recipient.id,
      p_amount: finalAmount,
      p_message: tipMessage.trim() || null,
    })

    setSubmitting(false)

    if (error) {
      const lowerMessage = error.message.toLowerCase()
      setMessage(
        lowerMessage.includes('saldo') || lowerMessage.includes('insufficient')
          ? 'Saldo ItaCash insuficiente.'
          : 'Nao foi possivel enviar apoio.',
      )
      return
    }

    setSuccessMessage('Apoio enviado com sucesso.')
    onSent?.()

    window.setTimeout(() => {
      onClose()
    }, 900)
  }

  if (!open || !recipient) return null

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 px-4 py-6 text-white backdrop-blur-sm">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Fechar modal" />

      <div className="relative z-10 max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-white/10 bg-zinc-950 p-5 shadow-2xl shadow-black/50 ring-1 ring-white/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-300">Apoiar</p>
            <h2 className="mt-2 text-2xl font-black">Enviar ItaCash</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Apoiar transfere ItaCash diretamente para a carteira do criador.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 transition hover:bg-white/10"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4">
          {recipient.avatarUrl ? (
            <img src={recipient.avatarUrl} alt={recipient.name} className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/20 font-black text-blue-100">
              {getInitial(recipient.name)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-black">{recipient.name}</p>
            {recipient.username && <p className="truncate text-sm text-blue-100/70">@{recipient.username}</p>}
          </div>
        </div>

        {(message || successMessage) && (
          <div className={`mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            successMessage
              ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
              : 'border-amber-300/20 bg-amber-500/10 text-amber-100'
          }`}>
            {successMessage ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Coins className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{successMessage || message}</span>
          </div>
        )}

        <div className="mt-5">
          <p className="text-sm font-black">Valor rapido</p>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {QUICK_AMOUNTS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setAmount(item)
                  setCustomAmount('')
                }}
                className={`rounded-2xl border px-2 py-3 text-sm font-black transition ${
                  !customAmount && amount === item
                    ? 'border-blue-300/50 bg-blue-500/20 text-blue-100'
                    : 'border-white/10 bg-black/35 text-zinc-300 hover:bg-blue-500/10'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-5 block">
          <span className="text-sm font-black">Valor personalizado</span>
          <input
            type="number"
            min={1}
            step={1}
            value={customAmount}
            onChange={(event) => setCustomAmount(event.target.value)}
            placeholder="Ex: 30"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-300"
          />
        </label>

        <label className="mt-5 block">
          <span className="text-sm font-black">Mensagem opcional</span>
          <textarea
            value={tipMessage}
            onChange={(event) => setTipMessage(event.target.value)}
            rows={3}
            placeholder="Escreva uma mensagem curta..."
            className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-300"
          />
        </label>

        <button
          type="button"
          onClick={sendTip}
          disabled={submitting}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Confirmar apoio
        </button>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import {
  Copy,
  Edit3,
  MoreHorizontal,
  ShieldAlert,
  Trash2,
} from 'lucide-react'

type PostMoreMenuProps = {
  isOwnPost: boolean
  copied?: boolean
  reported?: boolean
  reporting?: boolean
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
  onReport: () => void
}

export default function PostMoreMenu({
  isOwnPost,
  copied = false,
  reported = false,
  reporting = false,
  onCopy,
  onEdit,
  onDelete,
  onReport,
}: PostMoreMenuProps) {
  const [open, setOpen] = useState(false)

  function handleAction(action: () => void) {
    action()
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
        aria-label="Mais opções"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {open && (
        <>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Fechar menu"
          />

          <div className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <button
              type="button"
              onClick={() => handleAction(onCopy)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-zinc-800 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              <Copy className="h-4 w-4" />
              {copied ? 'Link copiado' : 'Copiar link'}
            </button>

            {isOwnPost && (
              <>
                <button
                  type="button"
                  onClick={() => handleAction(onEdit)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-zinc-800 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
                >
                  <Edit3 className="h-4 w-4" />
                  Editar publicação
                </button>

                <button
                  type="button"
                  onClick={() => handleAction(onDelete)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir publicação
                </button>
              </>
            )}

            {!isOwnPost && (
              <button
                type="button"
                onClick={() => handleAction(onReport)}
                disabled={reporting || reported}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition ${
                  reported
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950/30'
                } ${reporting ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <ShieldAlert className="h-4 w-4" />
                {reporting ? 'Enviando...' : reported ? 'Denunciado' : 'Denunciar'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  Copy,
  Edit3,
  MoreHorizontal,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import { useLanguage } from './LanguageProvider'

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

const POST_MORE_MENU_OPEN_EVENT = 'entreus:post-more-menu-open'

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
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const closeFromAnotherMenu = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== menuId) setOpen(false)
    }
    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener(POST_MORE_MENU_OPEN_EVENT, closeFromAnotherMenu)
    document.addEventListener('pointerdown', closeFromOutside)
    document.addEventListener('keydown', closeFromKeyboard)
    return () => {
      document.removeEventListener(POST_MORE_MENU_OPEN_EVENT, closeFromAnotherMenu)
      document.removeEventListener('pointerdown', closeFromOutside)
      document.removeEventListener('keydown', closeFromKeyboard)
    }
  }, [menuId, open])

  function toggleMenu() {
    if (!open) {
      document.dispatchEvent(new CustomEvent(POST_MORE_MENU_OPEN_EVENT, { detail: menuId }))
    }
    setOpen((current) => !current)
  }

  function handleAction(action: () => void) {
    action()
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleMenu}
        className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:hover:text-white"
        aria-label={t('post.menu.more')}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {open && (
          <div
            id={menuId}
            role="menu"
            aria-label={t('post.menu.label')}
            className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-2xl border border-border bg-surface text-foreground shadow-xl"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => handleAction(onCopy)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
            >
              <Copy className="h-4 w-4" />
              {copied ? t('post.actions.linkCopied') : t('post.menu.copy')}
            </button>

            {isOwnPost && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleAction(onEdit)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
                >
                  <Edit3 className="h-4 w-4" />
                  {t('post.menu.edit')}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleAction(onDelete)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-danger transition hover:bg-danger/10 focus-visible:bg-danger/10 focus-visible:outline-none"
                >
                  <Trash2 className="h-4 w-4" />
                  {t('post.menu.delete')}
                </button>
              </>
            )}

            {!isOwnPost && (
              <button
                type="button"
                role="menuitem"
                onClick={() => handleAction(onReport)}
                disabled={reporting || reported}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition ${
                  reported
                    ? 'text-success'
                    : 'text-warning hover:bg-warning/10 focus-visible:bg-warning/10 focus-visible:outline-none'
                } ${reporting ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <ShieldAlert className="h-4 w-4" />
                {reporting ? t('post.menu.sending') : reported ? t('post.comments.reported') : t('post.menu.report')}
              </button>
            )}
          </div>
      )}
    </div>
  )
}

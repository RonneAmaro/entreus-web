'use client'
import { useEffect, useState } from 'react'
import type { ExpressionAsset } from '@/lib/expressions/expression-types'
import { validateExpressionAsset } from '@/lib/expressions/expression-validation'

export default function ExpressionAttachment({ expression, compact = false }: { expression: ExpressionAsset; compact?: boolean }) {
  const validated = validateExpressionAsset(expression)
  const [failed, setFailed] = useState(!validated.ok)
  const [reduced, setReduced] = useState(false)
  useEffect(() => { const media = matchMedia('(prefers-reduced-motion: reduce)'); const sync = () => setReduced(media.matches); sync(); media.addEventListener('change', sync); return () => media.removeEventListener('change', sync) }, [])
  if (!validated.ok || failed) return <p role="status" className="rounded-xl border border-zinc-300 p-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">Esta expressão não está disponível no momento.</p>
  const asset = validated.asset
  if (asset.kind === 'emoji') return <span role="img" aria-label={asset.altText}>{asset.providerId}</span>
  const source = reduced && asset.staticUrl ? asset.staticUrl : asset.mediaUrl
  return <figure className={compact ? 'max-w-44' : 'max-w-72'}>
    {/* Provider URLs are validated against the explicit Tenor allowlist before rendering. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={source} alt={asset.altText} width={asset.width || 320} height={asset.height || 240} loading="lazy" decoding="async" onError={() => setFailed(true)} className="max-h-64 w-auto max-w-full rounded-xl object-contain" />
    {asset.attributionUrl && <figcaption className="mt-1 text-[10px] text-zinc-500"><a href={asset.attributionUrl} target="_blank" rel="noreferrer">Conteúdo por Tenor</a></figcaption>}
  </figure>
}

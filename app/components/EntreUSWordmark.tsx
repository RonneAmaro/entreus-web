import type { HTMLAttributes } from 'react'

type EntreUSWordmarkProps = HTMLAttributes<HTMLSpanElement>

export default function EntreUSWordmark({ className = '', ...props }: EntreUSWordmarkProps) {
  return (
    <span {...props} aria-label="EntreUS" className={`whitespace-nowrap ${className}`}>
      <span aria-hidden="true">Entre<span className="text-blue-600 dark:text-blue-400">US</span></span>
    </span>
  )
}

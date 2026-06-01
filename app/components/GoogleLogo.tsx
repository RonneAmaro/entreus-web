type GoogleLogoProps = {
  className?: string
}

export default function GoogleLogo({ className = 'h-5 w-5' }: GoogleLogoProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.82-.07-1.61-.21-2.37H12v4.49h6.44a5.5 5.5 0 0 1-2.39 3.61v2.95h3.87c2.26-2.08 3.57-5.15 3.57-8.68Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.92l-3.87-2.95c-1.08.72-2.45 1.15-4.08 1.15-3.14 0-5.8-2.12-6.75-4.96H1.27v3.05A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.25 14.32a7.2 7.2 0 0 1 0-4.64V6.63H1.27a12 12 0 0 0 0 10.74l3.98-3.05Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.72c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.94 1.14 15.23 0 12 0A12 12 0 0 0 1.27 6.63l3.98 3.05C6.2 6.84 8.86 4.72 12 4.72Z"
      />
    </svg>
  )
}

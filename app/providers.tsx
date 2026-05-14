'use client'

import { ThemeProvider } from 'next-themes'
import GlobalCallProvider from './components/GlobalCallProvider'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <GlobalCallProvider>{children}</GlobalCallProvider>
    </ThemeProvider>
  )
}

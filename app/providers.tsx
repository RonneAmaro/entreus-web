'use client'

import { ThemeProvider } from 'next-themes'
import GlobalCallProvider from './components/GlobalCallProvider'
import ParentalAccessGuard from './components/ParentalAccessGuard'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <ParentalAccessGuard>
        <GlobalCallProvider>{children}</GlobalCallProvider>
      </ParentalAccessGuard>
    </ThemeProvider>
  )
}

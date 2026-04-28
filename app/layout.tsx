import type { Metadata } from 'next'
import { Roboto } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import { AprimoProvider } from '@/context/aprimo-context'
import { AprimoConfigDialog } from '@/components/aprimo-config-dialog'
import { AprimoSettingsBar } from '@/components/aprimo-settings-bar'
import './globals.css'

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: '--font-sans',
})


export const metadata: Metadata = {
  title: 'Aprimo Editor Tools',
  description: 'Connect and manage your Aprimo DAM environment',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={roboto.variable}>
      <body className="font-sans antialiased bg-background">
        <AprimoProvider>
          <AprimoConfigDialog />
          <AprimoSettingsBar />
          {children}
        </AprimoProvider>
        <Toaster position="top-right" richColors />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}

import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'AI Talking Girl',
  description:
    'An interactive 3D AI character that listens, thinks and speaks with you.',
  applicationName: 'AI Talking Girl',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#05060f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950 font-sans text-white antialiased">
        {children}
      </body>
    </html>
  );
}
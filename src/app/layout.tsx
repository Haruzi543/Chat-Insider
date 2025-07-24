import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { FontProvider } from './FontProvider';

export const metadata: Metadata = {
  title: 'Chat Insider',
  description: 'A real-time chat app with the Insider mini-game.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>
        <FontProvider>
          {children}
          <Toaster />
        </FontProvider>
      </body>
    </html>
  );
}

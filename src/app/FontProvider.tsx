"use client";

import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export function FontProvider({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} font-body antialiased`}>
      {children}
    </div>
  );
}

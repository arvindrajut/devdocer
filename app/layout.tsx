import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const sans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  title: 'DevDocer · Agentic document Q&A with citations',
  description:
    'Ask questions about a PDF and get answers that cite the page. Agentic RAG with hybrid BM25 + vector search, built with Next.js and the Vercel AI SDK.',
  openGraph: {
    title: 'DevDocer · Agentic document Q&A with citations',
    description: 'Agentic RAG: multi-step tool use, hybrid search, cited and self-checked answers, and an MCP server.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

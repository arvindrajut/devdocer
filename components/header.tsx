import { FilePlus2, FileSearch } from 'lucide-react';
import Link from 'next/link';
import { GitHubIcon } from './icons';

export const REPO_URL = 'https://github.com/arvindrajut/devdocer';

export function Header({ documentName, onReset }: { documentName?: string; onReset?: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white/80 px-4 backdrop-blur sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/80">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
        <span className="grid size-7 place-items-center rounded-lg bg-brand-600 text-white">
          <FileSearch className="size-4" aria-hidden />
        </span>
        DevDocer
      </Link>
      {documentName && (
        <span className="hidden max-w-[40ch] truncate text-sm text-zinc-500 sm:block dark:text-zinc-400">
          / {documentName}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-brand-500 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <FilePlus2 className="size-4" aria-hidden />
            New PDF
          </button>
        )}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          <GitHubIcon className="size-4" />
          <span className="hidden sm:inline">Source</span>
        </a>
      </div>
    </header>
  );
}

import type { ReactNode } from 'react';

/** The centered card the pages outside the app shell (sign-in, mailed links) share. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-[15px] bg-surface p-6">
        <h1 className="text-xl font-medium">{title}</h1>
        {children}
      </div>
    </main>
  );
}

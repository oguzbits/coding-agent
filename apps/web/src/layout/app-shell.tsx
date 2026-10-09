import { Outlet } from 'react-router';
import { EmailBanner } from './email-banner';
import { Sidebar } from './sidebar';

export function AppShell() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <EmailBanner />
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

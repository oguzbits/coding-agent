import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { EmailBanner } from './email-banner';
import { Sidebar } from './sidebar';

export function AppShell() {
  const { pathname } = useLocation();
  // The menu is open for the page it was opened on, so following a link closes it again.
  const [openedAt, setOpenedAt] = useState<string>();
  const menuOpen = openedAt === pathname;

  return (
    <div className="flex h-full max-md:flex-col">
      <div className="flex h-10 shrink-0 items-center border-b border-line-subtle px-2 md:hidden">
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={menuOpen}
          className="flex size-8 items-center justify-center rounded-field hover:bg-hover"
          onClick={() => setOpenedAt(menuOpen ? undefined : pathname)}
        >
          <Menu size={18} />
        </button>
      </div>
      <Sidebar open={menuOpen} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <EmailBanner />
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

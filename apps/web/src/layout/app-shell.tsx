import { Menu, PanelLeftOpen } from 'lucide-react';
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { EmailBanner } from './email-banner';
import { Sidebar } from './sidebar';

const STORAGE_KEY = 'sidebar-collapsed';

/** Remembers the folded sidebar; storage can be unavailable (private windows), then it just resets. */
function useCollapsed(): [boolean, (value: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  return [
    collapsed,
    (value) => {
      setCollapsed(value);
      try {
        localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
      } catch {
        // Not remembering is fine.
      }
    },
  ];
}

export function AppShell() {
  const { pathname } = useLocation();
  // The menu is open for the page it was opened on, so following a link closes it again.
  const [openedAt, setOpenedAt] = useState<string>();
  const menuOpen = openedAt === pathname;
  const [collapsed, setCollapsed] = useCollapsed();

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
      <Sidebar open={menuOpen} collapsed={collapsed} onCollapse={() => setCollapsed(true)} />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {collapsed ? (
          <button
            type="button"
            aria-label="Expand sidebar"
            className="absolute top-1 left-2 z-10 flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-hover max-md:hidden"
            onClick={() => setCollapsed(false)}
          >
            <PanelLeftOpen size={16} />
          </button>
        ) : null}
        <EmailBanner />
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

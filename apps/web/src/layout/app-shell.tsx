import { Outlet } from 'react-router';
import { Sidebar } from './sidebar';

export function AppShell() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}

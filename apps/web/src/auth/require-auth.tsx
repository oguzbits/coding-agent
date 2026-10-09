import { Navigate, Outlet } from 'react-router';
import { useMe } from '../api/queries';

/** Shows the nested routes to signed-in users and sends everybody else to the sign-in page. */
export function RequireAuth() {
  const me = useMe();
  if (me.isPending) return <div className="p-6 text-muted">Loading…</div>;
  if (me.isError) return <div className="p-6 text-danger">The server cannot be reached.</div>;
  if (!me.data) return <Navigate to="/login" replace />;
  return <Outlet />;
}

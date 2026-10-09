import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '../api/queries';

/** Shows the nested routes to signed-in users and sends everybody else to the sign-in page. */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <div className="p-6 text-muted">Loading…</div>;
  if (me.isError) return <div className="p-6 text-danger">The server cannot be reached.</div>;
  if (!me.data) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return <Outlet />;
}

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * Reads the one-time token of a mailed link and takes it out of the address bar, so it does not stay in the
 * browser history or reach a screenshot or a shared URL.
 */
export function useLinkToken(): string {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => new URLSearchParams(search).get('token') ?? '');

  useEffect(() => {
    if (search) void navigate(pathname, { replace: true });
  }, [navigate, pathname, search]);

  return token;
}

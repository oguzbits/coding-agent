import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useConfirmEmail } from '../api/queries';
import { AuthCard } from '../ui/auth-card';
import { ErrorText } from '../ui/controls';

/** Opened from the link in the confirmation mail. The token works once, so the call must not run twice. */
export function ConfirmEmailPage() {
  const [params] = useSearchParams();
  const confirm = useConfirmEmail();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    confirm.mutate(params.get('token') ?? '');
  }, [confirm, params]);

  return (
    <AuthCard title="Confirm your email">
      {confirm.isPending ? <p className="text-sm text-muted">Checking the link…</p> : null}
      {confirm.isSuccess ? <p className="text-sm text-success">Your email address is confirmed.</p> : null}
      <ErrorText error={confirm.error} />
      <Link to="/" className="text-sm text-muted underline">
        Continue
      </Link>
    </AuthCard>
  );
}

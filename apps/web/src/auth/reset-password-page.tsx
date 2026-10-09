import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useResetPassword } from '../api/queries';
import { AuthCard } from '../ui/auth-card';
import { Button, ErrorText, Field } from '../ui/controls';
import { useLinkToken } from './use-link-token';

export function ResetPasswordPage() {
  const token = useLinkToken();
  const reset = useResetPassword();
  const [newPassword, setNewPassword] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    reset.mutate({ token, newPassword });
  };
  if (reset.isSuccess) {
    return (
      <AuthCard title="Choose a new password">
        <p className="text-sm text-success">Your password was changed. All devices were signed out.</p>
        <Link to="/login" className="text-sm underline">
          Sign in
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          hint="At least 12 characters."
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <ErrorText error={reset.error} />
        <Button type="submit" variant="primary" disabled={reset.isPending}>
          Set password
        </Button>
      </form>
    </AuthCard>
  );
}

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useForgotPassword } from '../api/queries';
import { AuthCard } from '../ui/auth-card';
import { Button, ErrorText, Field } from '../ui/controls';

export function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    forgot.mutate(email);
  };
  return (
    <AuthCard title="Reset your password">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <ErrorText error={forgot.error} />
        {forgot.isSuccess ? (
          <p className="text-sm text-success">
            If an account exists for this address, a mail with a link is on its way.
          </p>
        ) : null}
        <Button type="submit" variant="primary" disabled={forgot.isPending}>
          Send reset link
        </Button>
      </form>
      <Link to="/login" className="text-sm text-muted underline">
        Back to sign in
      </Link>
    </AuthCard>
  );
}

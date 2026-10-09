import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useLogin, useMe, useRegister } from '../api/queries';
import { Button, ErrorText, Field } from '../ui/controls';

const TEXT = {
  login: { title: 'Sign in', submit: 'Sign in', other: '/register', switchTo: 'No account yet? Create one' },
  register: {
    title: 'Create an account',
    submit: 'Create account',
    other: '/login',
    switchTo: 'Already have an account? Sign in',
  },
} as const;

/** Sign-in at /login, account creation at /register. After creating an account the user lands on /login with a note. */
export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const me = useMe();
  const navigate = useNavigate();
  const login = useLogin();
  const register = useRegister();
  const created = (useLocation().state as { created?: boolean } | null)?.created === true;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (me.data) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'register') {
      await register.mutateAsync({ email, password });
      await navigate('/login', { state: { created: true } });
      return;
    }
    await login.mutateAsync({ email, password });
    await navigate('/');
  };
  const failure = mode === 'login' ? login.error : register.error;
  const text = TEXT[mode];

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <form
        onSubmit={(event) => void submit(event).catch(() => undefined)}
        className="flex w-full max-w-sm flex-col gap-4 rounded-[15px] bg-surface p-6"
      >
        <h1 className="text-xl font-medium">{text.title}</h1>
        {created ? (
          <p className="text-sm text-success">
            Account created. Confirm your email with the link we sent, then sign in.
          </p>
        ) : null}
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorText error={failure} />
        <Button type="submit" variant="primary" disabled={login.isPending || register.isPending}>
          {text.submit}
        </Button>
        {mode === 'login' ? (
          <Link to="/forgot-password" className="text-sm text-muted underline">
            Forgot your password?
          </Link>
        ) : null}
        <Link to={text.other} className="text-sm text-muted underline">
          {text.switchTo}
        </Link>
      </form>
    </main>
  );
}

import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useLogin, useMe, useRegister } from '../api/queries';
import { Button, ErrorText, Field } from '../ui/controls';

export function AuthPage() {
  const me = useMe();
  const navigate = useNavigate();
  const login = useLogin();
  const register = useRegister();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState(false);

  if (me.data) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'register') {
      await register.mutateAsync({ email, password });
      setCreated(true);
      setMode('login');
      return;
    }
    await login.mutateAsync({ email, password });
    await navigate('/');
  };
  const failure = mode === 'login' ? login.error : register.error;

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <form
        onSubmit={(event) => void submit(event).catch(() => undefined)}
        className="flex w-full max-w-sm flex-col gap-4 rounded-[15px] bg-surface p-6"
      >
        <h1 className="text-xl font-medium">{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>
        {created ? <p className="text-sm text-success">Account created. You can sign in now.</p> : null}
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
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
        <button
          type="button"
          className="text-sm text-muted underline"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setCreated(false);
          }}
        >
          {mode === 'login' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
        </button>
      </form>
    </main>
  );
}

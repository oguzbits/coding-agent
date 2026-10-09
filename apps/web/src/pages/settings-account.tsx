import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useDeleteAccount, useEndOtherSessions, useEndSession, useMe, useSessions } from '../api/queries';
import { Button, ConfirmButton, ErrorText, Field, HiddenUsername, Section } from '../ui/controls';

const formatTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'unknown time');

export function SessionsSection() {
  const sessions = useSessions();
  const end = useEndSession();
  const endOthers = useEndOtherSessions();
  const hasOthers = sessions.data?.some((login) => !login.current) ?? false;
  return (
    <Section title="Logins">
      <ul className="flex flex-col gap-1">
        {sessions.data?.map((login) => (
          <li
            key={login.id}
            className="flex min-h-9 items-center justify-between gap-3 rounded-field bg-surface px-3 text-sm"
          >
            <span className="min-w-0 truncate">
              <span>{login.userAgent ?? 'Unknown device'}</span>
              <span className="ml-2 text-muted">{formatTime(login.createdAt)}</span>
            </span>
            {login.current ? (
              <span className="text-muted">This device</span>
            ) : (
              <Button variant="ghost" disabled={end.isPending} onClick={() => end.mutate(login.id)}>
                End
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div>
        <Button disabled={!hasOthers || endOthers.isPending} onClick={() => endOthers.mutate()}>
          End all other logins
        </Button>
      </div>
      <ErrorText error={end.error ?? endOthers.error} />
    </Section>
  );
}

export function DeleteAccountSection() {
  const remove = useDeleteAccount();
  const me = useMe();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');

  return (
    <Section title="Delete account">
      <p className="text-sm text-muted">Removes your account, all projects with their files and every conversation.</p>
      <form onSubmit={(event: FormEvent) => event.preventDefault()} className="flex flex-col gap-3 sm:max-w-sm">
        <HiddenUsername email={me.data?.email} />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div>
          <ConfirmButton
            variant="danger"
            disabled={!password || remove.isPending}
            question="This cannot be undone."
            confirmLabel="Delete everything"
            onConfirm={() => remove.mutate(password, { onSuccess: () => void navigate('/login') })}
          >
            Delete account
          </ConfirmButton>
        </div>
      </form>
      <ErrorText error={remove.error} />
    </Section>
  );
}

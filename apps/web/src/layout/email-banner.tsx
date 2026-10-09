import { useMe, useResendConfirmation } from '../api/queries';
import { Button, ErrorText } from '../ui/controls';

/** Reminds unconfirmed accounts that running the agent needs a confirmed address. */
export function EmailBanner() {
  const me = useMe();
  const resend = useResendConfirmation();
  if (!me.data || me.data.emailConfirmed || !me.data.confirmationRequired) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2 text-sm">
      <span>Confirm your email address to start runs. The link was sent to {me.data.email}.</span>
      {resend.isSuccess ? (
        <span className="text-success">A new link is on its way.</span>
      ) : (
        <Button disabled={resend.isPending} onClick={() => resend.mutate()}>
          Send link again
        </Button>
      )}
      <ErrorText error={resend.error} />
    </div>
  );
}

import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-contrast text-on-contrast hover:opacity-90',
  secondary: 'border border-line bg-surface hover:bg-hover',
  danger: 'bg-danger text-white hover:opacity-90',
  ghost: 'hover:bg-hover',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-field px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

interface ConfirmButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  variant?: Variant;
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/** A button that asks "are you sure?" in place before it does something that cannot be undone. */
export function ConfirmButton({ question, confirmLabel, onConfirm, ...props }: ConfirmButtonProps) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <Button {...props} onClick={() => setAsking(true)} />;
  return (
    <span role="group" aria-label={question} className="flex items-center gap-1">
      <span className="text-xs text-muted">{question}</span>
      <Button
        variant="danger"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </span>
  );
}

const inputStyle =
  'h-9 w-full rounded-field border border-line bg-base px-3 text-sm placeholder:text-muted disabled:opacity-50';

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-muted">
        {label}
      </label>
      <input id={id} className={inputStyle} {...props} />
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {error instanceof Error ? error.message : 'Something went wrong.'}
    </p>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-line-subtle py-6">
      <h2 className="text-[15px] font-medium">{title}</h2>
      {children}
    </section>
  );
}

/** Tells password managers which account a password form belongs to; the field itself is not shown. */
export function HiddenUsername({ email }: { email: string | undefined }) {
  return (
    <input
      type="text"
      name="username"
      autoComplete="username"
      value={email ?? ''}
      readOnly
      tabIndex={-1}
      aria-hidden
      className="sr-only"
    />
  );
}

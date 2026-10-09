import type { Schemas } from '../api/client';

type Mode = NonNullable<Schemas['UpdateConversationDto']['mode']>;

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: 'ask', label: 'Ask', hint: 'Ask before every change or command' },
  { value: 'auto_edit', label: 'Auto-edit', hint: 'Apply file changes, ask before commands' },
  { value: 'plan', label: 'Plan', hint: 'Read only, no changes' },
];

export function ModeSelect({ mode, onChange }: { mode: string; onChange: (mode: Mode) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <span className="sr-only">Mode</span>
      <select
        value={mode}
        title={MODES.find((entry) => entry.value === mode)?.hint}
        onChange={(event) => onChange(event.target.value as Mode)}
        className={`h-[30px] rounded-full border bg-surface px-[10px] text-sm text-foreground ${mode === 'plan' ? 'border-plan-line' : 'border-line'}`}
      >
        {MODES.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </select>
    </label>
  );
}

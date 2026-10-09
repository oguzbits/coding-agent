import { Trash2 } from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { Schemas } from '../api/client';
import {
  useChangePassword,
  useClearGeminiKey,
  useDeleteProject,
  useProjects,
  useSetGeminiKey,
  useSetModel,
  useSettings,
  useUsage,
} from '../api/queries';
import { Button, ErrorText, Field, Section } from '../ui/controls';

function GeminiKeySection() {
  const settings = useSettings();
  const save = useSetGeminiKey();
  const clear = useClearGeminiKey();
  const [value, setValue] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(value, { onSuccess: () => setValue('') });
  };
  return (
    <Section title="Gemini API key">
      <p className="text-sm text-muted">
        {settings.data?.hasGeminiKey
          ? `A key ending in ${settings.data.geminiKeyLast4 ?? '????'} is saved. It is stored encrypted and never shown again.`
          : 'No key saved yet. Create one for free in Google AI Studio.'}
      </p>
      <form onSubmit={submit} className="flex items-end gap-2">
        <div className="flex-1">
          <Field
            label="New key"
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button type="submit" variant="primary" disabled={value.trim() === '' || save.isPending}>
          Save key
        </Button>
        {settings.data?.hasGeminiKey ? (
          <Button disabled={clear.isPending} onClick={() => clear.mutate()}>
            Remove
          </Button>
        ) : null}
      </form>
      <ErrorText error={save.error ?? clear.error} />
    </Section>
  );
}

function numberOrNull(text: string): number | null {
  return text.trim() === '' ? null : Number(text);
}

type ModelDraft = Record<'model' | 'perMinute' | 'tokens' | 'perDay', string>;

function savedValues(settings: Schemas['SettingsDto'] | undefined): ModelDraft {
  return {
    model: settings?.modelName ?? '',
    perMinute: String(settings?.limits.requestsPerMinute ?? ''),
    tokens: String(settings?.limits.tokensPerMinute ?? ''),
    perDay: String(settings?.limits.requestsPerDay ?? ''),
  };
}

function ModelSection() {
  const settings = useSettings();
  const save = useSetModel();
  const usage = useUsage();
  const [draft, setDraft] = useState<Partial<ModelDraft>>({});
  const values = { ...savedValues(settings.data), ...draft };
  const bind = (name: keyof ModelDraft) => ({
    value: values[name],
    onChange: (event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [name]: event.target.value }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({
      modelName: values.model.trim() || null,
      requestsPerMinute: numberOrNull(values.perMinute),
      tokensPerMinute: numberOrNull(values.tokens),
      requestsPerDay: numberOrNull(values.perDay),
    });
  };
  return (
    <Section title="Model and limits">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Model" placeholder="default" {...bind('model')} />
        <Field label="Requests per minute" type="number" min={1} {...bind('perMinute')} />
        <Field label="Tokens per minute" type="number" min={1} {...bind('tokens')} />
        <Field label="Requests per day" type="number" min={1} {...bind('perDay')} />
        <div>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            Save
          </Button>
        </div>
      </form>
      <ErrorText error={save.error} />
      {usage.data ? (
        <p className="text-sm text-muted">
          Today ({usage.data.model}): {usage.data.requests} of {usage.data.limits.requestsPerDay} requests,{' '}
          {usage.data.tokens} tokens.
        </p>
      ) : null}
    </Section>
  );
}

function PasswordSection() {
  const change = useChangePassword();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrent('');
          setNew('');
        },
      },
    );
  };
  return (
    <Section title="Password">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
        />
        <div>
          <Button type="submit" variant="primary" disabled={change.isPending || !currentPassword || !newPassword}>
            Change password
          </Button>
        </div>
      </form>
      {change.isSuccess ? <p className="text-sm text-success">Password changed.</p> : null}
      <ErrorText error={change.error} />
    </Section>
  );
}

function ProjectsSection() {
  const projects = useProjects();
  const remove = useDeleteProject();
  return (
    <Section title="Projects">
      {projects.data?.length === 0 ? <p className="text-sm text-muted">No projects yet.</p> : null}
      <ul className="flex flex-col gap-1">
        {projects.data?.map((project) => (
          <li key={project.id} className="flex h-9 items-center justify-between rounded-field bg-surface px-3 text-sm">
            <span className="truncate">{project.name}</span>
            <Button
              variant="ghost"
              aria-label={`Delete ${project.name}`}
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Delete "${project.name}" with all its files and conversations?`))
                  remove.mutate(project.id);
              }}
            >
              <Trash2 size={14} />
            </Button>
          </li>
        ))}
      </ul>
      <ErrorText error={remove.error} />
    </Section>
  );
}

export function SettingsPage() {
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[800px] p-6">
        <h1 className="text-2xl font-medium">Settings</h1>
        <GeminiKeySection />
        <ModelSection />
        <ProjectsSection />
        <PasswordSection />
      </div>
    </div>
  );
}

import { FolderGit2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useCreateConversation, useCreateProject, useProjects, useSendMessage } from '../api/queries';
import { Composer } from '../chat/composer';
import { useComposerGate } from '../chat/use-composer-gate';
import { ErrorText, Field } from '../ui/controls';

const NEW_PROJECT = 'new';

function titleOf(text: string): string {
  const line = text.split('\n')[0] ?? text;
  return line.length > 60 ? `${line.slice(0, 57)}…` : line;
}

function ProjectPicker({
  projects,
  value,
  onChange,
}: {
  projects: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex h-[30px] items-center gap-2 rounded-full border border-line bg-surface px-[10px] text-sm">
      <FolderGit2 size={14} aria-hidden />
      <span className="sr-only">Project</span>
      <select
        className="max-w-60 truncate bg-transparent focus-visible:outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id} className="bg-surface">
            {project.name}
          </option>
        ))}
        <option value={NEW_PROJECT} className="bg-surface">
          New project…
        </option>
      </select>
    </label>
  );
}

export function StartPage() {
  const projects = useProjects();
  const createProject = useCreateProject();
  const createConversation = useCreateConversation();
  const send = useSendMessage();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string>();
  const [name, setName] = useState('');
  const [cloneUrl, setCloneUrl] = useState('');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);

  const list = projects.data ?? [];
  const choice = selected ?? list[0]?.id ?? NEW_PROJECT;
  const creating = choice === NEW_PROJECT;
  const gate = useComposerGate(busy || (creating && name.trim() === ''));

  /** Resolves to false when something failed, so the composer keeps the text. */
  const start = async (text: string): Promise<boolean> => {
    setBusy(true);
    setError(undefined);
    try {
      const projectId = creating
        ? (
            await createProject.mutateAsync({
              name: name.trim(),
              ...(cloneUrl.trim() ? { cloneUrl: cloneUrl.trim() } : {}),
            })
          ).id
        : choice;
      const conversation = await createConversation.mutateAsync({ projectId, title: titleOf(text) });
      await send.mutateAsync({ id: conversation.id, text });
      await navigate(`/c/${conversation.id}`);
      return true;
    } catch (caught) {
      setError(caught);
      setBusy(false);
      return false;
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[800px] flex-col justify-center gap-4 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-[32px] font-medium leading-[48px] text-contrast">What do you want to work on?</h1>
        <p className="text-base text-foreground/90">
          Investigate, implement, debug, test, review, or automate work across your codebase.
        </p>
      </div>
      <Composer onSubmit={start} placeholder="Describe an engineering task…" {...gate} />
      <div className="flex flex-wrap items-center gap-2">
        <ProjectPicker projects={list} value={choice} onChange={setSelected} />
      </div>
      {creating ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Project name" value={name} onChange={(event) => setName(event.target.value)} />
          <Field
            label="Clone from (optional)"
            placeholder="https://github.com/user/repo"
            value={cloneUrl}
            onChange={(event) => setCloneUrl(event.target.value)}
          />
        </div>
      ) : null}
      <ErrorText error={error} />
      {busy ? <p className="text-sm text-muted">Starting…</p> : null}
    </div>
  );
}

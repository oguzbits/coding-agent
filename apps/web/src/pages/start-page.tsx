import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useCreateConversation, useCreateProject, useProjects, useSendMessage } from '../api/queries';
import { Composer } from '../chat/composer';
import { useComposerGate } from '../chat/use-composer-gate';
import { ErrorText, Field, inputStyle } from '../ui/controls';

const NEW_PROJECT = 'new';

function titleOf(text: string): string {
  const line = text.split('\n')[0] ?? text;
  return line.length > 60 ? `${line.slice(0, 57)}…` : line;
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
    <div className="mx-auto flex h-full w-full max-w-[800px] flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-medium">What should we build?</h1>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Project
          <select className={inputStyle} value={choice} onChange={(event) => setSelected(event.target.value)}>
            {list.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
            <option value={NEW_PROJECT}>New project…</option>
          </select>
        </label>
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
      </div>
      <Composer onSubmit={start} {...gate} />
      <ErrorText error={error} />
      {busy ? <p className="text-sm text-muted">Starting…</p> : null}
    </div>
  );
}

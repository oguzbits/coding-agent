import { FolderTree } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  keys,
  useAbort,
  useAnswerApproval,
  useConversation,
  useSendMessage,
  useUpdateConversation,
} from '../api/queries';
import { Composer } from '../chat/composer';
import { MessageList } from '../chat/message-list';
import { ModeSelect } from '../chat/mode-select';
import { useRunStream } from '../chat/use-run-stream';
import { FilesPanel } from '../files/files-panel';
import { Button, ErrorText } from '../ui/controls';

export function ChatPage() {
  const { id = '' } = useParams();
  const conversation = useConversation(id);
  const chat = useRunStream(id);
  const send = useSendMessage();
  const abort = useAbort(id);
  const answer = useAnswerApproval(id);
  const update = useUpdateConversation(id);
  const client = useQueryClient();
  const [showFiles, setShowFiles] = useState(false);

  useEffect(() => {
    if (!chat.running) void client.invalidateQueries({ queryKey: keys.usage });
  }, [chat.running, client]);

  if (conversation.isError) return <p className="p-6 text-danger">{conversation.error.message}</p>;
  if (!conversation.data) return <p className="p-6 text-muted">Loading…</p>;

  const failure = send.error ?? answer.error ?? abort.error ?? update.error;
  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line-subtle px-4">
          <h1 className="truncate text-sm font-medium">{conversation.data.title}</h1>
          <div className="flex items-center gap-3">
            <ModeSelect mode={conversation.data.mode} onChange={(mode) => update.mutate({ mode })} />
            <Button
              variant="ghost"
              aria-pressed={showFiles}
              aria-label="Files"
              onClick={() => setShowFiles(!showFiles)}
            >
              <FolderTree size={16} />
            </Button>
          </div>
        </header>
        <MessageList
          items={chat.items}
          answering={answer.isPending}
          onAnswer={(callId, approved) => answer.mutate({ callId, approved })}
        />
        <div className="mx-auto flex w-full max-w-[800px] flex-col gap-2 px-6 pb-6">
          <ErrorText error={failure} />
          <Composer
            running={chat.running}
            disabled={send.isPending}
            onStop={() => abort.mutate()}
            onSubmit={(text) => send.mutate({ id, text })}
          />
        </div>
      </div>
      {showFiles ? <FilesPanel projectId={conversation.data.projectId} /> : null}
    </div>
  );
}

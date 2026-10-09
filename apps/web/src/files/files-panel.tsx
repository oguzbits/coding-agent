import { Download, File, Folder } from 'lucide-react';
import { useState } from 'react';
import { useProjectFile, useProjectFiles } from '../api/queries';

const ROW = 'h-8 w-full rounded-field px-2 text-left text-sm hover:bg-hover';

interface ListingProps {
  projectId: string;
  folder: string;
  onFolder: (path: string) => void;
  onFile: (path: string) => void;
}

function parentOf(path: string): string {
  return path.split('/').slice(0, -1).join('/');
}

function Listing({ projectId, folder, onFolder, onFile }: ListingProps) {
  const listing = useProjectFiles(projectId, folder);
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
      {folder ? (
        <button type="button" className={ROW} onClick={() => onFolder(parentOf(folder))}>
          ..
        </button>
      ) : null}
      {listing.data?.entries.map((entry) => (
        <button
          key={entry.path}
          type="button"
          className={`${ROW} flex items-center gap-2`}
          onClick={() => (entry.type === 'directory' ? onFolder(entry.path) : onFile(entry.path))}
        >
          {entry.type === 'directory' ? <Folder size={14} /> : <File size={14} />}
          <span className="truncate">{entry.name}</span>
        </button>
      ))}
      {listing.data?.truncated ? (
        <p className="px-2 py-1 text-xs text-muted">More entries exist than are shown.</p>
      ) : null}
      {listing.isError ? <p className="px-2 py-1 text-sm text-danger">{listing.error.message}</p> : null}
    </div>
  );
}

function Viewer({ projectId, file }: { projectId: string; file: string }) {
  const content = useProjectFile(projectId, file);
  return (
    <div className="flex max-h-[50%] flex-col border-t border-line-subtle">
      <p className="truncate px-3 py-1 font-mono text-xs text-muted">{file}</p>
      <pre className="scroll-thin overflow-auto bg-deep p-3 font-mono text-xs">
        {content.isError ? content.error.message : (content.data?.content ?? 'Loading…')}
      </pre>
      {content.data?.truncated ? <p className="px-3 py-1 text-xs text-muted">The file is shown in part.</p> : null}
    </div>
  );
}

export function FilesPanel({ projectId }: { projectId: string }) {
  const [folder, setFolder] = useState('');
  const [file, setFile] = useState<string>();
  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-line-subtle" aria-label="Files">
      <div className="flex h-10 items-center justify-between border-b border-line-subtle px-3">
        <span className="truncate font-mono text-xs">/{folder}</span>
        <a
          href={`/api/projects/${projectId}/download`}
          aria-label="Download as ZIP"
          className="text-muted hover:text-foreground"
        >
          <Download size={16} />
        </a>
      </div>
      <Listing projectId={projectId} folder={folder} onFolder={setFolder} onFile={setFile} />
      {file ? <Viewer projectId={projectId} file={file} /> : null}
    </aside>
  );
}

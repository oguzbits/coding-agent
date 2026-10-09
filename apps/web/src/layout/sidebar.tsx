import { MessageSquarePlus, Settings, Trash2, LogOut } from 'lucide-react';
import { NavLink, useNavigate, useParams } from 'react-router';
import { useConversations, useDeleteConversation, useLogout, useMe, useProjects } from '../api/queries';
import type { Schemas } from '../api/client';

const ROW = 'flex h-9 items-center gap-2 rounded-field px-2 text-sm hover:bg-hover';

function groupByProject(conversations: Schemas['ConversationDto'][]) {
  const groups = new Map<string, Schemas['ConversationDto'][]>();
  for (const conversation of conversations) {
    groups.set(conversation.projectId, [...(groups.get(conversation.projectId) ?? []), conversation]);
  }
  return groups;
}

function ConversationList() {
  const conversations = useConversations();
  const projects = useProjects();
  const remove = useDeleteConversation();
  const navigate = useNavigate();
  const { id: openId } = useParams();
  const names = new Map((projects.data ?? []).map((project) => [project.id, project.name]));

  return (
    <div className="scroll-thin flex-1 overflow-y-auto">
      {[...groupByProject(conversations.data ?? [])].map(([projectId, items]) => (
        <div key={projectId} className="mb-3">
          <p className="truncate px-2 py-1 text-xs uppercase tracking-wide text-muted">
            {names.get(projectId) ?? 'Project'}
          </p>
          {items.map((conversation) => (
            <div key={conversation.id} className="group flex items-center">
              <NavLink
                to={`/c/${conversation.id}`}
                className={({ isActive }) => `${ROW} min-w-0 flex-1 ${isActive ? 'bg-active' : ''}`}
              >
                <span className="truncate">{conversation.title}</span>
              </NavLink>
              <button
                type="button"
                aria-label={`Delete ${conversation.title}`}
                className="hidden size-8 items-center justify-center rounded-field text-muted hover:bg-hover group-hover:flex"
                onClick={() => {
                  remove.mutate(conversation.id, { onSuccess: () => openId === conversation.id && void navigate('/') });
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** `open` only matters on narrow screens, where the sidebar is hidden until the menu button opens it. */
export function Sidebar({ open = false }: { open?: boolean }) {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <nav
      className={`flex h-full w-[300px] shrink-0 flex-col gap-2 border-r border-line-subtle bg-surface p-3 ${
        open ? 'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:shadow-xl' : 'max-md:hidden'
      }`}
      aria-label="Sidebar"
    >
      <NavLink to="/" end className={`${ROW} bg-contrast text-on-contrast hover:bg-contrast hover:opacity-90`}>
        <MessageSquarePlus size={16} /> New chat
      </NavLink>
      <ConversationList />
      <div className="flex flex-col gap-1 border-t border-line-subtle pt-2">
        <p className="truncate px-2 text-xs text-muted">{me.data?.email}</p>
        <NavLink to="/settings" className={ROW}>
          <Settings size={16} /> Settings
        </NavLink>
        <button
          type="button"
          className={ROW}
          onClick={() => {
            logout.mutate(undefined, { onSettled: () => void navigate('/login') });
          }}
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </nav>
  );
}

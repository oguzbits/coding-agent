import { LogOut, PanelLeftClose, Plus, Settings, Trash2 } from 'lucide-react';
import { NavLink, useNavigate, useParams } from 'react-router';
import { useConversations, useDeleteConversation, useLogout, useMe, useProjects } from '../api/queries';
import type { Schemas } from '../api/client';
import { ConfirmButton } from '../ui/controls';

const ROW = 'flex h-9 items-center gap-2 rounded-[6px] px-[10px] text-sm hover:bg-hover';

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
  const groups = [...groupByProject(conversations.data ?? [])];

  return (
    <div className="scroll-thin flex-1 overflow-y-auto pr-2">
      {groups.length === 0 ? <p className="py-6 text-center text-xs text-muted">No conversations found</p> : null}
      {groups.map(([projectId, items]) => (
        <div key={projectId} className="mb-3">
          <p className="truncate px-[10px] py-1 text-xs text-muted">{names.get(projectId) ?? 'Project'}</p>
          {items.map((conversation) => (
            <div key={conversation.id} className="group flex items-center">
              <NavLink
                to={`/c/${conversation.id}`}
                className={({ isActive }) => `${ROW} min-w-0 flex-1 ${isActive ? 'bg-active' : ''}`}
              >
                <span className="truncate">{conversation.title}</span>
              </NavLink>
              <ConfirmButton
                variant="ghost"
                aria-label={`Delete ${conversation.title}`}
                question="Delete?"
                confirmLabel="Delete"
                className="size-8 shrink-0 px-0 text-muted opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                onConfirm={() => {
                  remove.mutate(conversation.id, { onSuccess: () => openId === conversation.id && void navigate('/') });
                }}
              >
                <Trash2 size={14} />
              </ConfirmButton>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

interface SidebarProps {
  /** Only matters on narrow screens, where the sidebar is hidden until the menu button opens it. */
  open?: boolean;
  /** On wide screens the sidebar can be folded away. */
  collapsed?: boolean;
  onCollapse?: () => void;
}

export function Sidebar({ open = false, collapsed = false, onCollapse }: SidebarProps) {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <nav
      className={`flex h-full w-[300px] shrink-0 flex-col gap-1 border-r border-line-subtle bg-base pb-3 pl-[10px] ${
        open ? 'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:shadow-xl' : 'max-md:hidden'
      } ${collapsed ? 'md:hidden' : ''}`}
      aria-label="Sidebar"
    >
      <div className="flex h-10 shrink-0 items-center justify-between pr-2 pl-[6px]">
        <span className="text-sm font-medium">Coding Agent</span>
        <button
          type="button"
          aria-label="Collapse sidebar"
          className="flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-hover max-md:hidden"
          onClick={onCollapse}
        >
          <PanelLeftClose size={16} />
        </button>
      </div>
      <div className="pr-2">
        <NavLink to="/" end className={ROW}>
          <Plus size={16} className="text-muted" /> New chat
        </NavLink>
      </div>
      <p className="px-[6px] pt-4 pb-1 text-sm font-medium text-muted">Conversations</p>
      <ConversationList />
      <div className="flex flex-col gap-1 border-t border-line-subtle pt-2 pr-2">
        <p className="truncate px-[10px] text-xs text-muted">{me.data?.email}</p>
        <NavLink to="/settings" className={ROW}>
          <Settings size={16} className="text-muted" /> Settings
        </NavLink>
        <button
          type="button"
          className={ROW}
          onClick={() => {
            logout.mutate(undefined, { onSettled: () => void navigate('/login') });
          }}
        >
          <LogOut size={16} className="text-muted" /> Sign out
        </button>
      </div>
    </nav>
  );
}

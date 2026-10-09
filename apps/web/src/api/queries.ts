import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, unwrap, type Schemas } from './client';

export const keys = {
  me: ['me'] as const,
  projects: ['projects'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  settings: ['settings'] as const,
  usage: ['usage'] as const,
  sessions: ['sessions'] as const,
  files: (projectId: string, path: string) => ['files', projectId, path] as const,
  file: (projectId: string, path: string) => ['file', projectId, path] as const,
};

/** The signed-in account, or null when nobody is signed in. */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    retry: false,
    queryFn: async () => {
      try {
        return await unwrap(api.GET('/api/auth/me'));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
  });
}

/** True while the server would refuse runs because the account's email address is not confirmed yet. */
export function useRunBlockedByEmail(): boolean {
  const me = useMe().data;
  return Boolean(me && me.confirmationRequired && !me.emailConfirmed);
}

export const BLOCKED_PLACEHOLDER = 'Confirm your email address to start runs.';

export const useProjects = () => useQuery({ queryKey: keys.projects, queryFn: () => unwrap(api.GET('/api/projects')) });

export const useConversations = () =>
  useQuery({
    queryKey: keys.conversations,
    queryFn: () => unwrap(api.GET('/api/conversations', { params: { query: {} } })),
  });

export const useConversation = (id: string) =>
  useQuery({
    queryKey: keys.conversation(id),
    queryFn: () => unwrap(api.GET('/api/conversations/{id}', { params: { path: { id } } })),
  });

export const useSettings = () =>
  useQuery({ queryKey: keys.settings, queryFn: () => unwrap(api.GET('/api/users/me/settings')) });

export const useUsage = () =>
  useQuery({ queryKey: keys.usage, queryFn: () => unwrap(api.GET('/api/usage')), refetchInterval: 30_000 });

export const useProjectFiles = (projectId: string, path: string) =>
  useQuery({
    queryKey: keys.files(projectId, path),
    queryFn: () =>
      unwrap(
        api.GET('/api/projects/{id}/files', {
          params: { path: { id: projectId }, query: { path: path || undefined } },
        }),
      ),
  });

export const useProjectFile = (projectId: string, path: string | undefined) =>
  useQuery({
    queryKey: keys.file(projectId, path ?? ''),
    enabled: path !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/api/projects/{id}/files/content', {
          params: { path: { id: projectId }, query: { path: path ?? '' } },
        }),
      ),
  });

/** A mutation that refreshes the listed queries when it succeeds. */
function useAction<Input, Output>(run: (input: Input) => Promise<Output>, invalidate: readonly (readonly unknown[])[]) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await Promise.all(invalidate.map((queryKey) => client.invalidateQueries({ queryKey })));
    },
  });
}

export const useLogin = () =>
  useAction((body: Schemas['LoginDto']) => unwrap(api.POST('/api/auth/login', { body })), [keys.me]);

export const useRegister = () =>
  useAction((body: Schemas['RegisterDto']) => unwrap(api.POST('/api/auth/register', { body })), []);

export const useLogout = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/logout')),
    onSuccess: () => {
      client.clear();
    },
  });
};

export const useConfirmEmail = () =>
  useAction((token: string) => unwrap(api.POST('/api/auth/confirm-email', { body: { token } })), [keys.me]);

export const useResendConfirmation = () => useAction(() => unwrap(api.POST('/api/auth/resend-confirmation')), []);

export const useForgotPassword = () =>
  useAction((email: string) => unwrap(api.POST('/api/auth/forgot-password', { body: { email } })), []);

export const useResetPassword = () =>
  useAction((body: Schemas['ResetPasswordDto']) => unwrap(api.POST('/api/auth/reset-password', { body })), []);

export const useSessions = () =>
  useQuery({ queryKey: keys.sessions, queryFn: () => unwrap(api.GET('/api/auth/sessions')) });

export const useEndSession = () =>
  useAction(
    (id: string) => unwrap(api.DELETE('/api/auth/sessions/{id}', { params: { path: { id } } })),
    [keys.sessions],
  );

export const useEndOtherSessions = () => useAction(() => unwrap(api.DELETE('/api/auth/sessions')), [keys.sessions]);

export const useDeleteAccount = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => unwrap(api.DELETE('/api/auth/account', { body: { password } })),
    onSuccess: () => {
      client.clear();
    },
  });
};

export const useChangePassword = () =>
  useAction((body: Schemas['ChangePasswordDto']) => unwrap(api.POST('/api/auth/change-password', { body })), []);

export const useCreateProject = () =>
  useAction((body: Schemas['CreateProjectDto']) => unwrap(api.POST('/api/projects', { body })), [keys.projects]);

export const useDeleteProject = () =>
  useAction(
    (id: string) => unwrap(api.DELETE('/api/projects/{id}', { params: { path: { id } } })),
    [keys.projects, keys.conversations],
  );

export const useCreateConversation = () =>
  useAction(
    (body: Schemas['CreateConversationDto']) => unwrap(api.POST('/api/conversations', { body })),
    [keys.conversations],
  );

export const useUpdateConversation = (id: string) =>
  useAction(
    (body: Schemas['UpdateConversationDto']) =>
      unwrap(api.PATCH('/api/conversations/{id}', { params: { path: { id } }, body })),
    [keys.conversations, keys.conversation(id)],
  );

export const useDeleteConversation = () =>
  useAction(
    (id: string) => unwrap(api.DELETE('/api/conversations/{id}', { params: { path: { id } } })),
    [keys.conversations],
  );

export const useSendMessage = () =>
  useAction(
    ({ id, text }: { id: string; text: string }) =>
      unwrap(api.POST('/api/conversations/{id}/messages', { params: { path: { id } }, body: { text } })),
    [keys.conversations, keys.usage],
  );

export const useAnswerApproval = (id: string) =>
  useAction(
    (body: Schemas['ApprovalDto']) =>
      unwrap(api.POST('/api/conversations/{id}/approvals', { params: { path: { id } }, body })),
    [],
  );

export const useAbort = (id: string) =>
  useAction(() => unwrap(api.POST('/api/conversations/{id}/abort', { params: { path: { id } } })), []);

export const useSetGeminiKey = () =>
  useAction((apiKey: string) => unwrap(api.PUT('/api/users/me/gemini-key', { body: { apiKey } })), [keys.settings]);

export const useClearGeminiKey = () => useAction(() => unwrap(api.DELETE('/api/users/me/gemini-key')), [keys.settings]);

export const useSetModel = () =>
  useAction(
    (body: Schemas['SetModelSettingsDto']) => unwrap(api.PUT('/api/users/me/model', { body })),
    [keys.settings, keys.usage],
  );

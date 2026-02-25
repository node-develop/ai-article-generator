import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetcher';
import type {
  GenerationRunResponse,
  ArticleResponse,
  PromptResponse,
  UserStatsResponse,
  PaginatedResponse,
  SettingResponse,
  UserResponse,
  ContentType,
} from '@articleforge/shared/types';

// ---------------------------------------------------------------------------
// Generations
// ---------------------------------------------------------------------------

export const useGenerations = (page = 1, perPage = 10) =>
  useQuery({
    queryKey: ['generations', page, perPage],
    queryFn: () =>
      apiFetch<PaginatedResponse<GenerationRunResponse>>(
        `/api/generations?page=${page}&per_page=${perPage}`,
      ),
  });

export const useGeneration = (id: string | undefined) =>
  useQuery({
    queryKey: ['generation', id],
    queryFn: () => apiFetch<GenerationRunResponse>(`/api/generations/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return false;
      if (status === 'completed' || status === 'failed') return false;
      return 3000;
    },
  });

export const useCreateGeneration = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      topic: string;
      contentType?: string;
      inputUrls?: string[];
      companyLinks?: string[];
      targetKeywords?: string[];
      enableOutlineReview?: boolean;
      enableEditReview?: boolean;
    }) =>
      apiFetch<GenerationRunResponse>('/api/generations', {
        method: 'POST',
        body: JSON.stringify({
          topic: body.topic,
          content_type: body.contentType,
          input_urls: body.inputUrls,
          company_links: body.companyLinks,
          target_keywords: body.targetKeywords,
          enable_outline_review: body.enableOutlineReview,
          enable_edit_review: body.enableEditReview,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['generations'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useDeleteGeneration = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/generations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['generations'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

interface ArticleFilters {
  contentType?: ContentType;
  isReference?: boolean;
}

export const useArticles = (page = 1, perPage = 10, filters?: ArticleFilters) =>
  useQuery({
    queryKey: ['articles', page, perPage, filters],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
      });
      if (filters?.contentType) params.set('content_type', filters.contentType);
      if (filters?.isReference !== undefined)
        params.set('is_reference', String(filters.isReference));
      return apiFetch<PaginatedResponse<ArticleResponse>>(
        `/api/articles?${params.toString()}`,
      );
    },
  });

export const useArticle = (id: string | undefined) =>
  useQuery({
    queryKey: ['article', id],
    queryFn: () => apiFetch<ArticleResponse & { chunks_count?: number }>(`/api/articles/${id}`),
    enabled: !!id,
  });

export const useSaveToLibrary = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (articleId: string) =>
      apiFetch<ArticleResponse>(`/api/articles/${articleId}/library`, { method: 'PATCH' }),
    onSuccess: (_data, articleId) => {
      queryClient.invalidateQueries({ queryKey: ['article', articleId] });
      queryClient.invalidateQueries({ queryKey: ['articles'] });
    },
  });
};

export const useDeleteArticle = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/api/articles/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['articles'] });
      qc.invalidateQueries({ queryKey: ['generations'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export const usePrompts = () =>
  useQuery({
    queryKey: ['prompts'],
    queryFn: () =>
      apiFetch<{ data: PromptResponse[] }>('/api/prompts').then((r) => r.data),
  });

export const usePromptHistory = (stage: string | undefined) =>
  useQuery({
    queryKey: ['prompts', 'history', stage],
    queryFn: () =>
      apiFetch<{ data: PromptResponse[] }>(`/api/prompts/${stage}/history`).then((r) => r.data),
    enabled: !!stage,
  });

export const useUpdatePrompt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, template, name }: { id: string; template: string; name: string }) =>
      apiFetch<PromptResponse>(`/api/prompts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ template, name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prompts'] });
    },
  });
};

export const useCreatePrompt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { stage: string; content_type?: string; name: string; template: string }) =>
      apiFetch<PromptResponse>('/api/prompts', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prompts'] });
    },
  });
};

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export const useMyStats = () =>
  useQuery({
    queryKey: ['stats', 'me'],
    queryFn: () => apiFetch<UserStatsResponse>('/api/stats/me'),
  });

export const useAdminStats = () =>
  useQuery({
    queryKey: ['stats', 'admin'],
    queryFn: () => apiFetch<UserStatsResponse>('/api/stats/all'),
  });

export const useAdminUserStats = () =>
  useQuery({
    queryKey: ['stats', 'admin', 'users'],
    queryFn: () =>
      apiFetch<{ data: (UserStatsResponse & { user_id: string; user_name: string })[] }>(
        '/api/stats/users',
      ).then((r) => r.data),
  });

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const useSettings = () =>
  useQuery({
    queryKey: ['settings'],
    queryFn: () =>
      apiFetch<{ data: SettingResponse[] }>('/api/settings').then((r) => r.data),
  });

export const useUpdateSetting = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      apiFetch<SettingResponse>(`/api/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
};

// ---------------------------------------------------------------------------
// Users (admin)
// ---------------------------------------------------------------------------

export const useUsers = () =>
  useQuery({
    queryKey: ['users'],
    queryFn: () =>
      apiFetch<{ data: UserResponse[] }>('/api/users').then((r) => r.data),
  });

export const useUpdateUserRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      apiFetch<UserResponse>(`/api/users/${id}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
};

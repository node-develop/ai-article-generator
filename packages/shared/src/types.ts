// User roles
export type UserRole = 'admin' | 'editor' | 'viewer';

// Article content types
export type ContentType = 'review' | 'tutorial' | 'longread' | 'news' | 'digest';

// Generation run statuses
export type GenerationStatus =
  | 'pending'
  | 'research'
  | 'rag_context'
  | 'build_style_guide'
  | 'outline'
  | 'outline_review'
  | 'writing'
  | 'editing'
  | 'edit_review'
  | 'images'
  | 'assembling'
  | 'completed'
  | 'failed';

// Generation stages for the pipeline
export type GenerationStage =
  | 'research'
  | 'rag_context'
  | 'build_style_guide'
  | 'outline'
  | 'write_sections'
  | 'edit_polish'
  | 'image_generate'
  | 'assemble';

// Stage log entry
export interface StageLogEntry {
  stage: GenerationStage;
  status: 'started' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
  tokens_used?: number;
  cost_usd?: number;
}

// API request/response types
export interface CreateGenerationRequest {
  topic: string;
  content_type: ContentType;
  input_urls?: string[];
  company_links?: string[];
  target_keywords?: string[];
  enable_outline_review?: boolean;
  enable_edit_review?: boolean;
}

export interface GenerationRunResponse {
  id: string;
  user_id: string;
  topic: string;
  content_type: ContentType;
  input_urls: string[];
  company_links: string[];
  target_keywords: string[];
  enable_review: boolean;
  status: GenerationStatus;
  current_stage: string | null;
  result_article_id: string | null;
  langsmith_trace_url: string | null;
  stages_log: StageLogEntry[];
  error_message: string | null;
  total_tokens: number;
  total_cost_usd: string;
  created_at: string;
  completed_at: string | null;
}

export interface ArticleResponse {
  id: string;
  source_url: string | null;
  title: string;
  published_at: string | null;
  hubs: string[];
  clean_text: string;
  content_type: ContentType;
  is_reference: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ArticleDetailResponse extends ArticleResponse {
  raw_text: string;
  metadata: Record<string, unknown>;
}

export interface PromptResponse {
  id: string;
  stage: string;
  content_type: string | null;
  name: string;
  template: string;
  version: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface UserStatsResponse {
  total_generations: number;
  completed_generations: number;
  failed_generations: number;
  total_articles: number;
  total_tokens_used: number;
  total_cost_usd: string;
  last_generation_at: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface SettingResponse {
  id: string;
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

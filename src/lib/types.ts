export type UserRole = 'admin' | 'agent';

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  avatar_url?: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export type LeadStatus =
  | 'nuevo'
  | 'contactado'
  | 'cita_agendada'
  | 'negociacion'
  | 'ganado'
  | 'perdido';

export type LeadSegment = 'A' | 'B' | 'C' | 'D';

export interface Lead {
  id: string;
  full_name: string;
  phone: string;
  email?: string | null;
  status: LeadStatus;
  segment: LeadSegment;
  assigned_to?: string | null;
  assigned_name?: string | null;
  tags: string[];
  metadata: Record<string, any>;
  notes_summary?: string | null;
  last_contacted_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type ActivityActionType =
  | 'note'
  | 'status_change'
  | 'segment_change'
  | 'assignment'
  | 'whatsapp_sent'
  | 'ai_generated'
  | 'creation'
  | 'update';

export interface ActivityLog {
  id: string;
  lead_id: string;
  user_id?: string | null;
  user_name?: string | null;
  action_type: ActivityActionType;
  details: string;
  created_at: string;
}

export interface MessageTemplate {
  id: string;
  title: string;
  category: string;
  content: string;
  created_by?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  user_name?: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  details?: string | null;
  created_at: string;
}

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  STORAGE: R2Bucket;
  AI?: any;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  ADMIN_SECRET?: string;
}

export interface SessionData {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
}

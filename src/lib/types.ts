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

export type LeadSegment = 'A' | 'B' | 'C';

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
  last_inbound_at?: string | null;
  ai_enabled: number;
  handoff_at?: string | null;
  handoff_reason?: 'cliente' | 'modelo' | 'error' | 'manual' | null;
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
  | 'whatsapp_received'
  | 'ai_generated'
  | 'ai_action'
  | 'creation'
  | 'update';

export interface ActivityLog {
  id: string;
  lead_id: string;
  lead_name?: string | null;
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

export type MessageSender = 'agent' | 'lead' | 'system';
export type MessageType = 'text' | 'image' | 'document' | 'audio';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface WhatsAppMessage {
  id: string;
  lead_id: string;
  user_id?: string | null;
  user_name?: string | null;
  sender: MessageSender;
  message_type: MessageType;
  content: string;
  media_url?: string | null;
  status: MessageStatus;
  whatsapp_message_id?: string | null;
  ai_generated: number;
  raw_payload?: string | null;
  created_at: string;
}

export interface WhatsAppSettings {
  id: string;
  waba_id?: string | null;
  phone_number_id?: string | null;
  display_phone_number?: string | null;
  verified_name?: string | null;
  access_token_cipher?: string | null;
  access_token_iv?: string | null;
  access_token_tag?: string | null;
  access_token_last4?: string | null;
  verify_token?: string | null;
  app_secret?: string | null;
  status: 'connected' | 'disconnected' | 'reconnect_required';
  ai_enabled: number;
  ai_model: string;
  ai_tone?: string | null;
  ai_instructions?: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBaseEntry {
  id: string;
  category: 'plan_precio' | 'horario_sede' | 'politica' | 'objecion_frecuente' | 'entrenadores';
  title: string;
  content: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationSummary {
  leadId: string;
  leadName: string;
  leadPhone: string;
  leadStatus: LeadStatus;
  leadSegment: LeadSegment;
  assignedTo?: string | null;
  assignedName?: string | null;
  lastMessageText: string;
  lastMessageTime: string;
  lastMessageSender: MessageSender;
  lastMessageStatus: MessageStatus;
  unreadCount: number;
  aiEnabled: boolean;
  isHandoff: boolean;
  handoffReason?: string | null;
}

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  STORAGE: R2Bucket;
  AI?: any;
  ASSETS?: Fetcher;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  ADMIN_SECRET?: string;
  // Meta WhatsApp Cloud API credentials
  META_GRAPH_API_VERSION?: string;
  META_GRAPH_BASE_URL?: string;
  META_WA_PHONE_NUMBER_ID?: string;
  META_WA_ACCESS_TOKEN?: string;
  META_WA_WABA_ID?: string;
  META_WA_VERIFY_TOKEN?: string;
  META_APP_SECRET?: string;
  ENCRYPTION_KEY?: string; // 32 bytes base64
}

export interface SessionData {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
}

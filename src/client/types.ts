export type UserRole = 'admin' | 'agent';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
  is_active: number;
}

export type LeadStatus =
  | 'nuevo'
  | 'contactado'
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
  /** Segmento comercial DERIVADO (A/B/C) — null si no califica para ninguno */
  segment?: LeadSegment | null;
  assigned_to?: string | null;
  assigned_name?: string | null;
  tags: string[];
  metadata: {
    presupuesto?: number;
    objetivo?: string;
    horario_preferido?: string;
    ciudad?: string;
    producto?: string;
    [key: string]: any;
  };
  notes_summary?: string | null;
  last_contacted_at?: string | null;
  /** Actividades de interés asociadas (catálogo central, relación N:M) */
  interests?: LeadInterest[];
  last_inbound_at?: string | null;
  ai_enabled?: number;
  handoff_at?: string | null;
  handoff_reason?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  lead_id: string;
  lead_name?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  action_type:
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

export interface SessionData {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
}

export interface DashboardData {
  totalLeads: number;
  segmentsCount: { A: number; B: number; C: number };
  statusCount: Record<string, number>;
  recentActivities: ActivityLog[];
  leadsNeedingAttention: Lead[];
}

export type MessageSender = 'agent' | 'lead' | 'system';

/** Actividad del catálogo central (fuente de verdad de nombres) */
export interface Activity {
  id: string;
  name: string;
  name_norm?: string;
  is_active: number;
  created_at?: string;
  updated_at?: string;
  prospect_count?: number;
}

/** Actividad de interés asociada a un prospecto (relación N:M) */
export interface LeadInterest {
  id: string;
  name: string;
  is_active: number;
  assigned_at?: string;
}

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
  ai_generated?: number;
  created_at: string;
}

export interface WhatsAppSettings {
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string;
  verified_name: string;
  tokenLast4: string;
  status: 'connected' | 'disconnected' | 'reconnect_required';
  verify_token: string;
  ai_enabled: number;
  ai_model: string;
  ai_tone?: string | null;
  ai_instructions?: string | null;
  business_context?: string | null;
}

export interface WebhookInfo {
  url: string;
  verify_token: string;
  graph_version: string;
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

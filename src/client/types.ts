export type UserRole = 'admin' | 'agent';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
  is_active: number;
  created_at: string;
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
  metadata: {
    presupuesto?: number;
    objetivo?: string;
    horario_preferido?: string;
    ciudad?: string;
    sede?: string;
    producto?: string;
    [key: string]: any;
  };
  notes_summary?: string | null;
  last_contacted_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  lead_id: string;
  user_id?: string | null;
  user_name?: string | null;
  lead_name?: string | null;
  action_type:
    | 'note'
    | 'status_change'
    | 'segment_change'
    | 'assignment'
    | 'whatsapp_sent'
    | 'ai_generated'
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
  segmentsCount: { A: number; B: number; C: number; D: number };
  statusCount: Record<string, number>;
  recentActivities: ActivityLog[];
  leadsNeedingAttention: Lead[];
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
  created_at: string;
}

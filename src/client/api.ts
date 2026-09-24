import {
  SessionData,
  DashboardData,
  Lead,
  User,
  ActivityLog,
  MessageTemplate,
  AuditLog,
  WhatsAppMessage,
} from './types';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let errorMsg = `Error ${res.status}`;
    try {
      const data = (await res.json()) as any;
      if (data && data.error) errorMsg = data.error;
    } catch {}
    throw new Error(errorMsg);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  async getMe(): Promise<{ user: SessionData | null }> {
    return fetchJson('/api/auth/me');
  },
  async login(email: string, password: string): Promise<{ success: boolean; user: SessionData }> {
    return fetchJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  async demoLogin(role: 'admin' | 'agent'): Promise<{ success: boolean; user: SessionData }> {
    return fetchJson('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
  },
  async quickSwitch(role: 'admin' | 'agent'): Promise<{ success: boolean; user: SessionData }> {
    return fetchJson('/api/auth/quick-switch', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
  },
  async logout(): Promise<{ success: boolean }> {
    return fetchJson('/api/auth/logout', { method: 'POST' });
  },

  // Dashboard
  async getDashboard(): Promise<DashboardData> {
    return fetchJson('/api/dashboard');
  },

  // Agents
  async getAgents(): Promise<{ agents: User[] }> {
    return fetchJson('/api/agents');
  },

  // Leads
  async getLeads(filters?: {
    search?: string;
    segment?: string;
    status?: string;
    agentId?: string;
    tag?: string;
  }): Promise<{ leads: Lead[] }> {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.segment) params.set('segment', filters.segment);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.agentId) params.set('agentId', filters.agentId);
    if (filters?.tag) params.set('tag', filters.tag);

    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchJson(`/api/leads${query}`);
  },

  async getLead(id: string): Promise<{ lead: Lead; activities: ActivityLog[] }> {
    return fetchJson(`/api/leads/${id}`);
  },

  async createLead(data: {
    full_name: string;
    phone: string;
    email?: string;
    status?: string;
    assigned_to?: string;
    tags?: string[];
    metadata?: Record<string, any>;
    notes?: string;
  }): Promise<{ success: boolean; lead: Lead }> {
    return fetchJson('/api/leads', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateLeadStatus(id: string, status: string): Promise<{ success: boolean; status: string; segment: string }> {
    return fetchJson(`/api/leads/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  async assignLead(id: string, assigned_to: string): Promise<{ success: boolean; assigned_to: string; assigned_name?: string }> {
    return fetchJson(`/api/leads/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigned_to }),
    });
  },

  async addNote(id: string, note: string): Promise<{ success: boolean; note: string }> {
    return fetchJson(`/api/leads/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  },

  async recalculateSegment(id: string): Promise<{ success: boolean; segment: string; reason: string }> {
    return fetchJson(`/api/leads/${id}/recalculate-segment`, { method: 'POST' });
  },

  async generateAiMessage(id: string, tone: string): Promise<{ success: boolean; message: string; deepLink: string }> {
    return fetchJson(`/api/leads/${id}/ai-message`, {
      method: 'POST',
      body: JSON.stringify({ tone }),
    });
  },

  async generateAiBriefing(id: string): Promise<{ success: boolean; briefing: string }> {
    return fetchJson(`/api/leads/${id}/ai-briefing`, { method: 'POST' });
  },

  async suggestAiTags(id: string): Promise<{ success: boolean; suggestedTags: string[] }> {
    return fetchJson(`/api/leads/${id}/ai-suggest-tags`, { method: 'POST' });
  },

  async sendWhatsApp(id: string, message: string): Promise<{ success: boolean; deepLink: string }> {
    return fetchJson(`/api/leads/${id}/send-whatsapp`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },

  async addTag(id: string, tag: string): Promise<{ success: boolean; tags: string[] }> {
    return fetchJson(`/api/leads/${id}/tags/add`, {
      method: 'POST',
      body: JSON.stringify({ tag }),
    });
  },

  async removeTag(id: string, tag: string): Promise<{ success: boolean; tags: string[] }> {
    return fetchJson(`/api/leads/${id}/tags/remove`, {
      method: 'POST',
      body: JSON.stringify({ tag }),
    });
  },

  async updateLead(
    id: string,
    data: {
      full_name?: string;
      phone?: string;
      email?: string | null;
      tags?: string[];
      metadata?: Record<string, any>;
      notes_summary?: string;
    }
  ): Promise<{ success: boolean; lead: Lead }> {
    return fetchJson(`/api/leads/${id}/update`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteLead(id: string): Promise<{ success: boolean; deletedId: string }> {
    return fetchJson(`/api/leads/${id}`, {
      method: 'DELETE',
    });
  },

  // WhatsApp Chat
  async getWhatsAppMessages(id: string): Promise<{
    lead: { id: string; full_name: string; phone: string };
    messages: WhatsAppMessage[];
  }> {
    return fetchJson(`/api/leads/${id}/messages`);
  },

  async sendChatMessage(
    id: string,
    payload: {
      content: string;
      message_type?: 'text' | 'image' | 'document' | 'audio';
      media_url?: string;
      sender?: 'agent' | 'lead' | 'system';
    }
  ): Promise<{ success: boolean; message: WhatsAppMessage; deepLink: string }> {
    return fetchJson(`/api/leads/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async uploadImage(file: File): Promise<{ success: boolean; media_url: string; key: string; file_name: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload/image', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      let err = 'Error al subir imagen';
      try {
        const d = (await res.json()) as any;
        if (d && d.error) err = d.error;
      } catch {}
      throw new Error(err);
    }
    return res.json();
  },

  // Templates
  async getTemplates(): Promise<{ templates: MessageTemplate[] }> {
    return fetchJson('/api/templates');
  },

  async createTemplate(data: { title: string; category: string; content: string }): Promise<{ success: boolean; template: MessageTemplate }> {
    return fetchJson('/api/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteTemplate(id: string): Promise<{ success: boolean }> {
    return fetchJson(`/api/templates/${id}/delete`, { method: 'POST' });
  },

  // Team
  async getTeam(): Promise<{ users: User[]; auditLogs: AuditLog[] }> {
    return fetchJson('/api/team');
  },

  async createTeamMember(data: { name: string; email: string; password: string; role: 'admin' | 'agent' }): Promise<{ success: boolean; user: User }> {
    return fetchJson('/api/team/new', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async toggleUserStatus(id: string): Promise<{ success: boolean; is_active: number }> {
    return fetchJson(`/api/team/${id}/toggle-status`, { method: 'POST' });
  },

  // Import / Export
  async loadSampleCsv(): Promise<{
    success: boolean;
    fileKey: string;
    headers: string[];
    previewRows: Record<string, string>[];
    totalRows: number;
    agents: User[];
  }> {
    return fetchJson('/api/import/load-sample');
  },

  async processImport(payload: {
    file_key: string;
    assigned_to: string;
    col_name?: string;
    col_phone?: string;
    col_email?: string;
    col_budget?: string;
    col_goal?: string;
    col_city?: string;
    col_branch?: string;
    col_product?: string;
    col_tags?: string;
  }): Promise<{
    success: boolean;
    importedCount: number;
    skippedDuplicates: number;
    errorsCount: number;
    totalRows: number;
  }> {
    return fetchJson('/api/import/process', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async triggerR2Backup(): Promise<{ success: boolean; key: string; count: number }> {
    return fetchJson('/api/export/r2-backup', { method: 'POST' });
  },
};

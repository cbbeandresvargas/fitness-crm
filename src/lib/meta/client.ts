import { Env } from '../types';

export const META_DEFAULT_GRAPH_VERSION = 'v25.0';
export const META_DEFAULT_GRAPH_BASE_URL = 'https://graph.facebook.com';

export class MetaApiError extends Error {
  status: number;
  code: number | null;
  type: string | null;
  details: unknown;

  constructor(
    message: string,
    opts: { status: number; code?: number | null; type?: string | null; details?: unknown }
  ) {
    super(message);
    this.name = 'MetaApiError';
    this.status = opts.status;
    this.code = opts.code ?? null;
    this.type = opts.type ?? null;
    this.details = opts.details;
  }

  /**
   * Token expirado, revocado o inválido
   */
  get isAuthError(): boolean {
    return (
      this.status === 401 ||
      this.code === 190 ||
      this.type === 'OAuthException'
    );
  }
}

/**
 * Normaliza el destinatario para envío a Meta WhatsApp Cloud API.
 * Para números móviles de México (+52 1 ...), Meta recibe 521XXXXXXXXXX pero
 * al enviar exige 52XXXXXXXXXX (sin el 1 intermedio), de lo contrario arroja error 131030.
 */
export function normalizeRecipient(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (/^521\d{10}$/.test(digits)) {
    return `52${digits.slice(3)}`;
  }
  return digits;
}

export interface GraphRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  token: string;
  body?: unknown;
  apiVersion?: string;
  baseUrl?: string;
}

/**
 * Cliente universal para Meta WhatsApp Cloud API (Graph API v25.0)
 */
export async function graphRequest<T = any>(
  path: string,
  opts: GraphRequestOptions,
  env?: Partial<Env>
): Promise<T> {
  const version = opts.apiVersion || env?.META_GRAPH_API_VERSION || META_DEFAULT_GRAPH_VERSION;
  const baseUrl = opts.baseUrl || env?.META_GRAPH_BASE_URL || META_DEFAULT_GRAPH_BASE_URL;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const url = `${baseUrl}/${version}/${cleanPath}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${opts.token}`,
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (cause) {
    throw new MetaApiError('No se pudo contactar la API de Meta WhatsApp', {
      status: 0,
      details: cause,
    });
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // raw text
  }

  if (!res.ok) {
    const err = json?.error;
    throw new MetaApiError(err?.message || `Meta Graph API respondió ${res.status}`, {
      status: res.status,
      code: err?.code ?? null,
      type: err?.type ?? null,
      details: json ?? text,
    });
  }

  return json as T;
}

/**
 * Enviar mensaje de texto libre por WhatsApp Cloud API v25.0
 */
export async function sendMetaTextMessage(params: {
  phoneNumberId: string;
  token: string;
  to: string;
  text: string;
  previewUrl?: boolean;
  env?: Partial<Env>;
}): Promise<{ messageId: string }> {
  const to = normalizeRecipient(params.to);
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      preview_url: params.previewUrl ?? false,
      body: params.text,
    },
  };

  const res = await graphRequest<{ messages?: { id: string }[] }>(
    `${params.phoneNumberId}/messages`,
    {
      method: 'POST',
      token: params.token,
      body: payload,
    },
    params.env
  );

  const messageId = res.messages?.[0]?.id;
  if (!messageId) {
    throw new MetaApiError('Meta no devolvió el ID del mensaje enviado', { status: 500, details: res });
  }

  return { messageId };
}

/**
 * Enviar imagen con pie de foto por WhatsApp Cloud API v25.0
 */
export async function sendMetaImageMessage(params: {
  phoneNumberId: string;
  token: string;
  to: string;
  imageUrl: string;
  caption?: string;
  env?: Partial<Env>;
}): Promise<{ messageId: string }> {
  const to = normalizeRecipient(params.to);
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'image',
    image: {
      link: params.imageUrl,
      ...(params.caption ? { caption: params.caption } : {}),
    },
  };

  const res = await graphRequest<{ messages?: { id: string }[] }>(
    `${params.phoneNumberId}/messages`,
    {
      method: 'POST',
      token: params.token,
      body: payload,
    },
    params.env
  );

  const messageId = res.messages?.[0]?.id;
  if (!messageId) {
    throw new MetaApiError('Meta no devolvió el ID del mensaje de imagen', { status: 500, details: res });
  }

  return { messageId };
}

/**
 * Enviar plantilla aprobada (para iniciar conversaciones o reabrir ventana de 24h)
 */
export async function sendMetaTemplateMessage(params: {
  phoneNumberId: string;
  token: string;
  to: string;
  templateName: string;
  languageCode?: string;
  components?: any[];
  env?: Partial<Env>;
}): Promise<{ messageId: string }> {
  const to = normalizeRecipient(params.to);
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: params.templateName,
      language: { code: params.languageCode || 'es' },
      ...(params.components ? { components: params.components } : {}),
    },
  };

  const res = await graphRequest<{ messages?: { id: string }[] }>(
    `${params.phoneNumberId}/messages`,
    {
      method: 'POST',
      token: params.token,
      body: payload,
    },
    params.env
  );

  const messageId = res.messages?.[0]?.id;
  if (!messageId) {
    throw new MetaApiError('Meta no devolvió el ID del mensaje de plantilla', { status: 500, details: res });
  }

  return { messageId };
}

/**
 * Obtener detalles y estado del número de WhatsApp en Meta
 */
export async function getMetaPhoneNumberDetails(params: {
  phoneNumberId: string;
  token: string;
  env?: Partial<Env>;
}): Promise<{
  id: string;
  verified_name?: string;
  display_phone_number?: string;
  quality_rating?: string;
}> {
  return graphRequest<{
    id: string;
    verified_name?: string;
    display_phone_number?: string;
    quality_rating?: string;
  }>(
    `${params.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`,
    {
      method: 'GET',
      token: params.token,
    },
    params.env
  );
}

import { env } from "../config/env.js";
import { SupabaseRestClient } from "../adapters/db/supabase-rest.client.js";
import type { CreateLeadWebhookInput } from "../schemas/leads.schemas.js";
import { HttpError } from "../utils/http-error.js";

type UnitRow = {
  id: string;
  tenant_id?: string | null;
  name?: string | null;
  phone?: string | null;
  code?: number | null;
};

type ContactRow = {
  id: string;
  unit_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  is_lead?: boolean | null;
  lead_status?: string | null;
  lead_score?: number | null;
  lead_source?: string | null;
  custom_fields?: Record<string, unknown> | null;
  lead_converted_at?: string | null;
  updated_at?: string | null;
};

export class LeadsService {
  async upsertLeadFromWebhook(input: CreateLeadWebhookInput) {
    const client = this.getDbClient();
    const unitId = await this.resolveUnitId(client, input);

    const phoneVariants = buildPhoneVariants(input.contact.number);
    if (phoneVariants.length === 0) {
      throw new HttpError(422, "VALIDATION_ERROR", "Numero do contato invalido");
    }

    const existing = await this.findExistingContact(client, unitId, phoneVariants);
    const nowIso = new Date().toISOString();
    const leadSource = this.resolveLeadSource(input);

    const metadataSnapshot = {
      inbound: "webhook_leads",
      ticket: {
        id: input.ticket.id,
        status: input.ticket.status,
        created_at: input.ticket.createdAt ?? null,
        updated_at: input.ticket.updatedAt ?? null,
        unread_messages: input.ticket.unreadMessages ?? 0,
        is_group: input.ticket.isGroup ?? false,
        last_message: input.ticket.lastMessage ?? "",
        flow_on: input.ticket.flowOn ?? false,
        tags: input.ticket.tags ?? [],
        sectors: input.ticket.sectors ?? []
      },
      whatsapp: {
        id: input.whatsapp.id ?? null,
        name: input.whatsapp.name || null,
        number: normalizeDigits(input.whatsapp.number) || null,
        channel: input.whatsapp.channel || null,
        status: input.whatsapp.status || null
      }
    };

    const payload = {
      unit_id: unitId,
      name: input.contact.name.trim(),
      phone: phoneVariants[0],
      email: sanitizeText(input.contact.email),
      avatar_url: sanitizeText(input.contact.profilePicUrl),
      source: "whatsapp",
      is_lead: true,
      lead_status: "novo",
      lead_score: 0,
      lead_source: leadSource,
      lead_last_contact_at: input.ticket.updatedAt ?? input.ticket.createdAt ?? nowIso,
      lead_converted_at: existing?.is_lead ? existing.lead_converted_at ?? nowIso : nowIso,
      custom_fields: {
        ...(existing?.custom_fields || {}),
        lead_webhook: metadataSnapshot
      },
      updated_at: nowIso
    };

    let row: ContactRow | null = null;

    if (existing?.id) {
      const filters = new URLSearchParams();
      filters.set("id", `eq.${existing.id}`);
      const updated = (await client.update("chat_contacts", filters, payload)) as ContactRow[];
      row = updated[0] ?? null;
    } else {
      const inserted = (await client.insert("chat_contacts", {
        ...payload,
        created_at: nowIso
      })) as ContactRow[];
      row = inserted[0] ?? null;
    }

    if (!row) {
      throw new HttpError(502, "lead_upsert_failed", "Falha ao criar/atualizar lead");
    }

    return {
      created: !existing?.id,
      lead: {
        id: row.id,
        unit_id: row.unit_id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        is_lead: true,
        lead_status: row.lead_status ?? "novo",
        lead_source: row.lead_source ?? leadSource
      }
    };
  }

  private async resolveUnitId(client: SupabaseRestClient, input: CreateLeadWebhookInput): Promise<string> {
    if (input.unit_id) return input.unit_id;

    const whatsappDigits = normalizeDigits(input.whatsapp.number);
    const unitByPhone = whatsappDigits
      ? await this.findUnitByPhone(client, whatsappDigits)
      : null;
    if (unitByPhone?.id) return unitByPhone.id;

    if (typeof input.whatsapp.id === "number") {
      const unitByCode = await this.findUnitByCode(client, input.whatsapp.id);
      if (unitByCode?.id) return unitByCode.id;
    }

    throw new HttpError(
      404,
      "unit_not_found",
      "Nao foi possivel identificar a unit. Envie unit_id ou mapeie whatsapp.number/code em units."
    );
  }

  private async findUnitByPhone(client: SupabaseRestClient, rawPhone: string): Promise<UnitRow | null> {
    const variants = buildPhoneVariants(rawPhone);
    if (variants.length === 0) return null;

    const params = new URLSearchParams();
    params.set("select", "id,tenant_id,name,phone,code");
    params.set("limit", "1");
    params.set("or", variants.map((value) => `phone.eq.${value}`).join(","));
    const units = (await client.select("units", params)) as UnitRow[];
    if (units[0]) return units[0];

    const legacy = (await client.select("unit", params)) as UnitRow[];
    return legacy[0] ?? null;
  }

  private async findUnitByCode(client: SupabaseRestClient, code: number): Promise<UnitRow | null> {
    const params = new URLSearchParams();
    params.set("select", "id,tenant_id,name,phone,code");
    params.set("code", `eq.${code}`);
    params.set("limit", "1");

    const units = (await client.select("units", params)) as UnitRow[];
    if (units[0]) return units[0];

    const legacy = (await client.select("unit", params)) as UnitRow[];
    return legacy[0] ?? null;
  }

  private async findExistingContact(
    client: SupabaseRestClient,
    unitId: string,
    phoneVariants: string[]
  ): Promise<ContactRow | null> {
    const params = new URLSearchParams();
    params.set("select", "id,unit_id,name,phone,email,source,is_lead,lead_status,lead_score,lead_source,custom_fields,lead_converted_at,updated_at");
    params.set("unit_id", `eq.${unitId}`);
    params.set("limit", "1");
    params.set("or", phoneVariants.map((value) => `phone.eq.${value}`).join(","));
    const rows = (await client.select("chat_contacts", params)) as ContactRow[];
    return rows[0] ?? null;
  }

  private resolveLeadSource(input: CreateLeadWebhookInput): string {
    const channel = sanitizeText(input.whatsapp.channel) || "whatsapp";
    const name = sanitizeText(input.whatsapp.name) || "inbound";
    return `${channel}:${name}`;
  }

  private getDbClient(): SupabaseRestClient {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new HttpError(
        503,
        "supabase_unavailable",
        "Persistencia indisponivel: configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY"
      );
    }

    return new SupabaseRestClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
}

function normalizeDigits(value: string | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

function sanitizeText(value: string | undefined): string | null {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

function buildPhoneVariants(value: string): string[] {
  const digits = normalizeDigits(value);
  if (!digits) return [];

  const variants = new Set<string>();
  variants.add(digits);

  const withoutCountry = digits.startsWith("55") ? digits.slice(2) : digits;
  const withCountry = withoutCountry.startsWith("55") ? withoutCountry : `55${withoutCountry}`;

  variants.add(withoutCountry);
  variants.add(withCountry);

  if (withoutCountry.length === 11 && withoutCountry[2] === "9") {
    const noNinth = withoutCountry.slice(0, 2) + withoutCountry.slice(3);
    variants.add(noNinth);
    variants.add(`55${noNinth}`);
  } else if (withoutCountry.length === 10) {
    const withNinth = withoutCountry.slice(0, 2) + "9" + withoutCountry.slice(2);
    variants.add(withNinth);
    variants.add(`55${withNinth}`);
  }

  return Array.from(variants).filter((item) => item.length >= 10);
}


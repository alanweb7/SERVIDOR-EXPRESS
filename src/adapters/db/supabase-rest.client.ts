export class SupabaseRestClient {
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;

  constructor(baseUrl: string, serviceRoleKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.serviceRoleKey = serviceRoleKey;
  }

  async select(
    table: string,
    params: URLSearchParams
  ): Promise<unknown[]> {
    const response = await fetch(`${this.baseUrl}/rest/v1/${table}?${params.toString()}`, {
      method: "GET",
      headers: this.headers()
    });

    const body = await this.parseJson(response);
    if (!response.ok) {
      throw new Error(`Supabase select failed: ${response.status} ${JSON.stringify(body)}`);
    }

    return Array.isArray(body) ? body : [];
  }

  async insert(table: string, payload: unknown): Promise<unknown[]> {
    const response = await fetch(`${this.baseUrl}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        ...this.headers(),
        Prefer: "return=representation"
      },
      body: JSON.stringify(payload)
    });

    const body = await this.parseJson(response);
    if (!response.ok) {
      throw new Error(`Supabase insert failed: ${response.status} ${JSON.stringify(body)}`);
    }

    return Array.isArray(body) ? body : [];
  }

  async update(table: string, filters: URLSearchParams, payload: unknown): Promise<unknown[]> {
    const response = await fetch(`${this.baseUrl}/rest/v1/${table}?${filters.toString()}`, {
      method: "PATCH",
      headers: {
        ...this.headers(),
        Prefer: "return=representation"
      },
      body: JSON.stringify(payload)
    });

    const body = await this.parseJson(response);
    if (!response.ok) {
      throw new Error(`Supabase update failed: ${response.status} ${JSON.stringify(body)}`);
    }

    return Array.isArray(body) ? body : [];
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
    };
  }

  private async parseJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}

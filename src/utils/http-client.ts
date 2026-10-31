import { setTimeout as sleep } from 'node:timers/promises';
import { Impit, type HttpMethod } from 'impit';
import * as cheerio from 'cheerio';

export interface HttpClientOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 1;

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-CH-UA': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
  'Sec-CH-UA-Mobile': '?0',
  'Sec-CH-UA-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

class HttpClient {
  private impitClient: Impit;

  constructor() {
    this.impitClient = new Impit({
      browser: 'chrome',
    });
  }

  /**
   * Fetches an HTTP resource with impit, falling back to global fetch if needed,
   * with timeout and automatic retry on 429 or 503.
   */
  async request(url: string, options?: HttpClientOptions & { method?: HttpMethod; body?: string }): Promise<string> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = options?.retries ?? DEFAULT_RETRIES;
    const headers = { ...DEFAULT_HEADERS, ...(options?.headers || {}) };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff wait
        await sleep(500 * attempt);
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        let responseText: string | null = null;
        let statusCode: number | null = null;

        try {
          const res = await this.impitClient.fetch(url, {
            method: options?.method || 'GET',
            headers,
            body: options?.body,
            signal: controller.signal,
          });
          statusCode = res.status;
          responseText = await res.text();
        } catch (impitErr) {
          // Fallback to global fetch if impit fails
          const fallbackRes = await fetch(url, {
            method: options?.method || 'GET',
            headers,
            body: options?.body,
            signal: controller.signal,
          });
          statusCode = fallbackRes.status;
          responseText = await fallbackRes.text();
        } finally {
          clearTimeout(timer);
        }

        if (statusCode === 429 || statusCode === 503) {
          if (attempt < maxRetries) {
            continue;
          }
          throw new Error(`HTTP ${statusCode} when fetching ${url}`);
        }

        if (statusCode >= 400 && statusCode !== 404) {
          throw new Error(`HTTP ${statusCode} when fetching ${url}`);
        }

        return responseText ?? '';
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt >= maxRetries) {
          break;
        }
      }
    }

    throw lastError ?? new Error(`Request failed for ${url}`);
  }

  async fetchHtml(url: string, options?: HttpClientOptions): Promise<string> {
    return this.request(url, options);
  }

  async fetchJson<T = unknown>(url: string, options?: HttpClientOptions): Promise<T> {
    const raw = await this.request(url, {
      ...options,
      headers: {
        Accept: 'application/json, text/plain, */*',
        ...(options?.headers || {}),
      },
    });
    return JSON.parse(raw);
  }

  loadCheerio(html: string): cheerio.CheerioAPI {
    return cheerio.load(html);
  }
}

export const httpClient = new HttpClient();

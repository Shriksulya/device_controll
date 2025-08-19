import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as crypto from 'crypto';
import { URLSearchParams } from 'url';

export type HttpMethod = 'GET' | 'POST';

export function buildQuery(
  params?: Record<string, string | number | boolean | undefined | null>,
): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    usp.append(k, String(v));
  }
  return usp.toString();
}

function buildPrehash({
  timestampMs,
  method,
  requestPath,
  queryString,
  bodyString,
}: {
  timestampMs: string;
  method: HttpMethod;
  requestPath: string;
  queryString?: string;
  bodyString?: string;
}) {
  const q = queryString && queryString.length > 0 ? `?${queryString}` : '';
  const body = bodyString ?? '';
  return `${timestampMs}${method}${requestPath}${q}${body}`;
}

function signHmacBase64(secretKey: string, data: string): string {
  return crypto.createHmac('sha256', secretKey).update(data).digest('base64');
}

export class BitgetV1Client {
  private http: AxiosInstance;

  constructor(
    private readonly baseURL: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly passphrase: string,
  ) {
    this.http = axios.create({ baseURL, timeout: 15000 });
  }

  async call<T = any>({
    method,
    requestPath,
    query,
    body,
    config,
  }: {
    method: HttpMethod;
    requestPath: string;
    query?: Record<string, any>;
    body?: Record<string, any> | string;
    config?: AxiosRequestConfig;
  }): Promise<T> {
    const ts = Date.now().toString();
    const methodUp = method.toUpperCase() as HttpMethod;
    const queryString = buildQuery(query);
    const url = queryString ? `${requestPath}?${queryString}` : requestPath;
    const bodyString =
      typeof body === 'string' ? body : body ? JSON.stringify(body) : '';

    const prehash = buildPrehash({
      timestampMs: ts,
      method: methodUp,
      requestPath,
      queryString,
      bodyString,
    });
    const signature = signHmacBase64(this.apiSecret, prehash);

    const headers = {
      'ACCESS-KEY': this.apiKey,
      'ACCESS-SIGN': signature,
      'ACCESS-PASSPHRASE': this.passphrase,
      'ACCESS-TIMESTAMP': ts,
      locale: 'en-US',
      'Content-Type': 'application/json',
    };

    const req: AxiosRequestConfig = {
      method: methodUp,
      url,
      headers,
      ...config,
    };
    if (methodUp === 'POST') req.data = bodyString;

    try {
      const { data } = await this.http.request<T>(req);
      return data as T;
    } catch (e: any) {
      const status = e?.response?.status;
      const data = e?.response?.data;
      const msg = data?.msg || data?.errmsg || e?.message || 'request failed';
      const err: any = new Error(
        `HTTP ${status}: ${msg} | body=${JSON.stringify(data)}`,
      );
      err.status = status;
      err.data = data;
      throw err;
    }
  }
}

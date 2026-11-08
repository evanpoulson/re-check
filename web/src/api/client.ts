export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** True when the request never reached the server (offline, DNS, connection reset). */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError
}

/** Create once before the first attempt and resend unchanged on every retry. */
export function newSubmissionId(): string {
  return crypto.randomUUID()
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  const data: unknown = text ? JSON.parse(text) : undefined
  if (!res.ok) throw new ApiError(res.status, data)
  return data as T
}

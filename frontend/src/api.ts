export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })
  if (!response.ok) {
    let message = 'Something went wrong'
    try {
      const payload = await response.json()
      message = payload.detail || message
      if (Array.isArray(payload.detail)) {
        message = payload.detail.map((item: { msg: string }) => item.msg).join('. ')
      }
    } catch {
      // Keep the generic fallback for non-JSON errors.
    }
    throw new ApiError(message, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}


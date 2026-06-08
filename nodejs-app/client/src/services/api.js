const DEFAULT_BASE_URL = '/api'

export class ApiError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

function normalizePath(path) {
  return path.startsWith('/') ? path : `/${path}`
}

async function parsePayload(resp) {
  const contentType = resp.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return resp.json()
  return { message: await resp.text() }
}

export function createApiClient({ baseURL = DEFAULT_BASE_URL, fetchImpl = globalThis.fetch } = {}) {
  async function request(method, path, body) {
    const opts = {
      method,
      headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    }

    if (body) {
      opts.body = body instanceof FormData ? body : JSON.stringify(body)
    }

    const resp = await fetchImpl(`${baseURL}${normalizePath(path)}`, opts)
    const payload = await parsePayload(resp)

    if (!resp.ok) {
      const message = payload?.error?.message || payload?.error || payload?.message || `Request failed with status ${resp.status}`
      throw new ApiError(message, { status: resp.status, payload })
    }

    return payload
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    upload: (path, formData) => request('POST', path, formData),
  }
}

export const api = createApiClient()

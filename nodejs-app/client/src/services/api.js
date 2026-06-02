const BASE_URL = '/api'

async function request(method, path, body) {
  const opts = {
    method,
    headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
  }
  if (body) {
    opts.body = body instanceof FormData ? body : JSON.stringify(body)
  }
  const resp = await fetch(`${BASE_URL}${path}`, opts)
  const contentType = resp.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await resp.json()
    : { message: await resp.text() }

  if (!resp.ok) {
    const message = payload?.error?.message || payload?.message || `Request failed with status ${resp.status}`
    const error = new Error(message)
    error.status = resp.status
    error.payload = payload
    throw error
  }

  return payload
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  upload: (path, formData) => request('POST', path, formData),
}

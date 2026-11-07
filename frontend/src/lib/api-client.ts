export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export async function request<T>(path: string, options: { body?: object; csrf?: string } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      credentials: 'same-origin', method: options.body === undefined ? 'GET' : 'POST',
      headers: options.body === undefined ? {} : {
        'Content-Type': 'application/json', ...(options.csrf ? { 'X-CSRF-Token': options.csrf } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch { throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.'); }
  if (response.status === 204) return undefined as T;
  let json: { data?: T; error?: { message?: string } };
  try { json = await response.json(); }
  catch { throw new ApiError(response.status, 'The server returned an unreadable response. Try again.'); }
  if (!response.ok) throw new ApiError(response.status, json.error?.message ?? 'Unable to complete the request.');
  if (!json.data) throw new ApiError(response.status, 'The server returned an incomplete response.');
  return json.data;
}

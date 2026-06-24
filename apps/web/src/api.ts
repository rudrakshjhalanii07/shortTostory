import type {
  CreateJobResponse,
  JobStatusResponse,
} from '@shortstory/shared';

// Same-origin '/api' by default (Vite proxy in dev, reverse-proxy in prod).
// Override with VITE_API_URL to point at a separate backend origin.
const BASE_URL = import.meta.env.VITE_API_URL ?? '';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch (err) {
    throw new Error(
      `Network request failed — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function createJob(url: string): Promise<CreateJobResponse> {
  return apiFetch<CreateJobResponse>('/api/v1/jobs', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  return apiFetch<JobStatusResponse>(`/api/v1/jobs/${jobId}`);
}

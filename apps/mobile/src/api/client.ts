import type {
  CreateJobResponse,
  JobStatusResponse,
} from '@shortstory/shared';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch (err) {
    // Surface the actual target URL so connection failures are diagnosable
    // on-device (e.g. wrong/empty BASE_URL, blocked network).
    throw new Error(
      `Network request failed to ${BASE_URL}${path} — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = await res.json().catch(() => ({}));
    throw new Error(
      (body?.error?.message as string | undefined) ?? `HTTP ${res.status}`,
    );
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

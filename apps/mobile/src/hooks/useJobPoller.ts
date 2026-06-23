import { useEffect, useRef, useState } from 'react';
import type { JobStatusResponse } from '@shortstory/shared';
import { getJobStatus } from '../api/client';

export function useJobPoller(
  jobId: string | null,
  pollIntervalMs: number = 2000,
): { status: JobStatusResponse | null; error: string | null } {
  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const s = await getJobStatus(jobId);
        setStatus(s);
        if (s.state === 'completed' || s.state === 'failed') {
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    void poll();
    intervalRef.current = setInterval(() => void poll(), pollIntervalMs);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [jobId, pollIntervalMs]);

  return { status, error };
}

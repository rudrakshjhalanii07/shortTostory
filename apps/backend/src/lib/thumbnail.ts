import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppError } from '../types/errors.js';

/**
 * Download a thumbnail URL to a temp file and return its local path.
 * The caller is responsible for deleting the file when done.
 */
export async function downloadThumbnail(url: string, jobId: string): Promise<string> {
  const dest = join(tmpdir(), `shortstory-thumb-${jobId}.jpg`);

  let res: Response;
  try {
    res = await fetch(url);
  } catch (cause) {
    throw AppError.internal(`Thumbnail fetch failed: ${String(cause)}`);
  }

  if (!res.ok) {
    throw AppError.internal(`Thumbnail fetch returned ${res.status} for ${url}`);
  }

  const buf = await res.arrayBuffer();
  await writeFile(dest, Buffer.from(buf));
  return dest;
}

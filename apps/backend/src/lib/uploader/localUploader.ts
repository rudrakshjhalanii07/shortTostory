import { copyFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../../config/index.js';
import { AppError } from '../../types/errors.js';
import type { IUploader, UploadResult } from './types.js';

// Served by Express static middleware at /uploads
export const UPLOADS_DIR = join(process.cwd(), 'uploads');

export class LocalUploader implements IUploader {
  async upload(cardPath: string, jobId: string): Promise<UploadResult> {
    try {
      await mkdir(UPLOADS_DIR, { recursive: true });

      const filename = `${jobId}.jpg`;
      const destPath = join(UPLOADS_DIR, filename);

      // Move to uploads dir; fall back to copy+delete across filesystem boundaries.
      try {
        const { rename } = await import('node:fs/promises');
        await rename(cardPath, destPath);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
          await copyFile(cardPath, destPath);
          await unlink(cardPath);
        } else {
          throw err;
        }
      }

      const key = `uploads/${filename}`;
      const base = config.PUBLIC_URL ?? `http://localhost:${config.PORT}`;
      const downloadUrl = `${base}/uploads/${filename}`;
      // Local files don't expire — set a far-future date so the shared type is satisfied.
      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000).toISOString();

      return { key, downloadUrl, expiresAt };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.internal(
        `Local upload failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

export type { IUploader, UploadResult } from './types.js';
export { S3Uploader } from './s3Uploader.js';
export { LocalUploader, UPLOADS_DIR } from './localUploader.js';

import { config } from '../../config/index.js';
import type { IUploader } from './types.js';
import { S3Uploader } from './s3Uploader.js';
import { LocalUploader } from './localUploader.js';

export function createUploader(): IUploader {
  return config.S3_BUCKET ? new S3Uploader() : new LocalUploader();
}

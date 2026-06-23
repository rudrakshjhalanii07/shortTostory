export interface UploadResult {
  key: string;
  downloadUrl: string;
  expiresAt: string;
}

export interface IUploader {
  /** Upload cardPath to storage. Responsible for deleting cardPath on success. */
  upload(cardPath: string, jobId: string): Promise<UploadResult>;
}

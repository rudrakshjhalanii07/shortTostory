import { unlink } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { S3Client, PutObjectCommand, GetObjectCommand, type S3ClientConfig } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';
import { AppError } from '../types/errors.js';

export interface UploadResult {
  key: string;
  downloadUrl: string;
  expiresAt: string;
}

function getS3Client(): S3Client {
  const clientConfig: S3ClientConfig = {
    region: config.S3_REGION ?? 'us-east-1',
  };

  if (config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY) {
    clientConfig.credentials = {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    };
  }

  if (config.S3_ENDPOINT) {
    clientConfig.endpoint = config.S3_ENDPOINT;
    clientConfig.forcePathStyle = true;
  }

  return new S3Client(clientConfig);
}

export async function uploadCard(cardPath: string, jobId: string): Promise<UploadResult> {
  const bucket = config.S3_BUCKET;
  if (!bucket) {
    throw AppError.internal('S3_BUCKET is not configured.');
  }

  const key = `cards/${jobId}.jpg`;
  const client = getS3Client();

  try {
    const body = await readFile(cardPath);

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'image/jpeg',
      }),
    );

    const expiresAt = new Date(
      Date.now() + config.SIGNED_URL_TTL_SECONDS * 1_000,
    ).toISOString();

    const downloadUrl = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: config.SIGNED_URL_TTL_SECONDS },
    );

    await unlink(cardPath);

    return { key, downloadUrl, expiresAt };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.internal(
      `S3 upload failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

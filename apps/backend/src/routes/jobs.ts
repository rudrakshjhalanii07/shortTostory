import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  type CreateJobResponse,
  type JobStatusResponse,
  toJobStatusResponse,
} from '@shortstory/shared';
import type { Job } from '@shortstory/shared';
import { saveJob, getJob } from '../lib/jobStore.js';
import { cardQueue } from '../queues/cardQueue.js';
import { extractVideoId } from '../lib/youtubeUrl.js';
import { AppError } from '../types/errors.js';

const createJobSchema = z.object({
  url: z.string().min(1),
});

export const jobsRouter = Router();

jobsRouter.post('/jobs', async (req, res, next) => {
  try {
    const parsed = createJobSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest('Request body must be JSON with a non-empty "url" string.');
    }

    const { url } = parsed.data;
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw AppError.invalidUrl();
    }

    const jobId = uuidv4();
    const now = new Date().toISOString();
    const job: Job = {
      id: jobId,
      state: 'queued',
      sourceUrl: url,
      createdAt: now,
      updatedAt: now,
    };

    await saveJob(job);
    await cardQueue.add('card', { jobId, sourceUrl: url });

    const body: CreateJobResponse = {
      jobId,
      state: 'queued',
      pollIntervalMs: 2_000,
    };
    res.status(201).json(body);
  } catch (err) {
    next(err);
  }
});

jobsRouter.get('/jobs/:id', async (req, res, next) => {
  try {
    const job = await getJob(req.params['id'] as string);
    if (!job) {
      throw AppError.notFound(`Job ${req.params['id']} not found.`);
    }

    const body: JobStatusResponse = toJobStatusResponse(job);
    res.status(200).json(body);
  } catch (err) {
    next(err);
  }
});

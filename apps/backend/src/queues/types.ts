export interface IJobQueue {
  add(jobId: string, sourceUrl: string): Promise<void>;
  close(): Promise<void>;
}

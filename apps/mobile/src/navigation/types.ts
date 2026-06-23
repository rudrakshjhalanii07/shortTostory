export type RootStackParamList = {
  Home: { incomingUrl?: string } | undefined;
  Processing: { jobId: string; pollIntervalMs: number };
  Result: { downloadUrl: string; attributionLinkUrl: string };
};

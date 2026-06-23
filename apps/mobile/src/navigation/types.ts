export type RootStackParamList = {
  Home: undefined;
  Processing: { jobId: string; pollIntervalMs: number };
  Result: { downloadUrl: string };
};

import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useJobPoller } from '../hooks/useJobPoller';

type Props = NativeStackScreenProps<RootStackParamList, 'Processing'>;

const STAGE_LABELS: Record<string, string> = {
  fetching_metadata: 'Fetching video info',
  downloading_thumbnail: 'Downloading thumbnail',
  rendering_card: 'Rendering card',
  uploading_result: 'Uploading',
};

export default function ProcessingScreen({ navigation, route }: Props) {
  const { jobId, pollIntervalMs } = route.params;
  const { status, error } = useJobPoller(jobId, pollIntervalMs);

  useEffect(() => {
    if (status?.state === 'completed' && status.result?.downloadUrl) {
      navigation.replace('Result', {
        downloadUrl: status.result.downloadUrl,
        attributionLinkUrl: status.result.attributionLinkUrl,
      });
    }
  }, [status, navigation]);

  if (error ?? status?.state === 'failed') {
    const message =
      error ?? status?.error?.message ?? 'Card generation failed.';
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{message}</Text>
      </View>
    );
  }

  const stage = status?.progress?.stage;
  const percent = status?.progress?.percent ?? 0;
  const stageLabel =
    stage !== undefined ? (STAGE_LABELS[stage] ?? stage) : 'Queued…';

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#E1306C" />
      <Text style={styles.stage}>{stageLabel}</Text>
      {percent > 0 && <Text style={styles.percent}>{percent}%</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
    backgroundColor: '#fff',
    padding: 24,
  },
  stage: {
    fontSize: 18,
    fontWeight: '500',
    color: '#111',
  },
  percent: {
    fontSize: 14,
    color: '#888',
  },
  errorText: {
    fontSize: 16,
    color: '#c00',
    textAlign: 'center',
    lineHeight: 24,
  },
});

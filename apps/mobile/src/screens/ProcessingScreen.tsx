import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { createJob } from '../api/client';
import { useJobPoller } from '../hooks/useJobPoller';

type Props = NativeStackScreenProps<RootStackParamList, 'Processing'>;

const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FB_APP_ID = process.env['EXPO_PUBLIC_FB_APP_ID'];

export default function ProcessingScreen({ navigation, route }: Props) {
  const { url } = route.params;
  const [jobId, setJobId] = useState<string | null>(null);
  const [pollIntervalMs, setPollIntervalMs] = useState(2000);
  const sharedRef = useRef(false);

  // Step 1: create the job as soon as this screen mounts.
  useEffect(() => {
    createJob(url)
      .then(({ jobId: id, pollIntervalMs: interval }) => {
        setJobId(id);
        setPollIntervalMs(interval);
      })
      .catch((err: unknown) => {
        Alert.alert(
          'Something went wrong',
          err instanceof Error ? err.message : 'Could not start card generation.',
          [{ text: 'OK', onPress: () => navigation.navigate('Home') }],
        );
      });
  }, [url, navigation]);

  const { status, error } = useJobPoller(jobId, pollIntervalMs);

  // Step 2: share to Instagram automatically once the card is ready.
  const autoShare = useCallback(
    async (downloadUrl: string, attributionLinkUrl: string) => {
      const localPath = `${FileSystem.cacheDirectory}card_${Date.now()}.jpg`;
      try {
        await FileSystem.downloadAsync(downloadUrl, localPath);
        if (Platform.OS === 'ios') {
          const storyUrl =
            `instagram-stories://share` +
            `?backgroundImage=${encodeURIComponent(localPath)}` +
            `&contentURL=${encodeURIComponent(attributionLinkUrl)}`;
          const canOpen = await Linking.canOpenURL(storyUrl);
          if (!canOpen) {
            Alert.alert(
              'Instagram not installed',
              'Install Instagram to share your Story.',
              [{ text: 'OK', onPress: () => navigation.navigate('Home') }],
            );
            return;
          }
          await Linking.openURL(storyUrl);
        } else {
          const contentUri = await FileSystem.getContentUriAsync(localPath);
          await IntentLauncher.startActivityAsync(
            'com.instagram.share.ADD_TO_STORY',
            {
              data: contentUri,
              type: 'image/jpeg',
              flags: FLAG_GRANT_READ_URI_PERMISSION,
              packageName: 'com.instagram.android',
              ...(FB_APP_ID ? { extra: { source_application: FB_APP_ID } } : {}),
            },
          );
        }
        // Reset to Home so returning from Instagram (incl. "Discard") lands on
        // the home screen, not this now-stale spinner.
        navigation.navigate('Home');
      } catch {
        Alert.alert(
          'Share failed',
          'Could not open Instagram. Please try again.',
          [{ text: 'OK', onPress: () => navigation.navigate('Home') }],
        );
      }
    },
    [navigation],
  );

  useEffect(() => {
    if (sharedRef.current) return;
    if (status?.state === 'completed' && status.result) {
      sharedRef.current = true;
      void autoShare(status.result.downloadUrl, status.result.attributionLinkUrl);
    }
    if (status?.state === 'failed' || error) {
      const message = error ?? status?.error?.message ?? 'Card generation failed.';
      Alert.alert('Something went wrong', message, [
        { text: 'OK', onPress: () => navigation.navigate('Home') },
      ]);
    }
  }, [status, error, autoShare, navigation]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#E1306C" />
      <Text style={styles.label}>Preparing your Story…</Text>
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
  },
  label: {
    fontSize: 16,
    color: '#555',
  },
});

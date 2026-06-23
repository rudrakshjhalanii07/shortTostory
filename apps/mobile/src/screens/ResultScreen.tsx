import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

export default function ResultScreen({ route }: Props) {
  const { downloadUrl, attributionLinkUrl } = route.params;
  const [sharing, setSharing] = useState(false);

  const handleShare = useCallback(async () => {
    const canOpen = await Linking.canOpenURL('instagram://app');
    if (!canOpen) {
      Alert.alert(
        'Instagram not installed',
        'Install Instagram to share your Story.',
      );
      return;
    }

    setSharing(true);
    const localPath = `${FileSystem.cacheDirectory}card_${Date.now()}.jpg`;
    try {
      await FileSystem.downloadAsync(downloadUrl, localPath);
      const storyUrl =
        `instagram-stories://share` +
        `?backgroundImage=${encodeURIComponent(localPath)}` +
        `&contentURL=${encodeURIComponent(attributionLinkUrl)}`;
      await Linking.openURL(storyUrl);
    } catch {
      Alert.alert('Share failed', 'Could not open Instagram. Please try again.');
    } finally {
      FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
      setSharing(false);
    }
  }, [downloadUrl, attributionLinkUrl]);

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: downloadUrl }}
        style={styles.card}
        resizeMode="contain"
      />
      <TouchableOpacity
        style={[styles.button, sharing && styles.buttonDisabled]}
        onPress={handleShare}
        disabled={sharing}
        activeOpacity={0.8}
      >
        {sharing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Share to Story</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    padding: 24,
    gap: 24,
    backgroundColor: '#fff',
  },
  card: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  button: {
    backgroundColor: '#E1306C',
    borderRadius: 10,
    paddingHorizontal: 40,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 17,
  },
});

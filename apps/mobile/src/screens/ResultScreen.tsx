import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

// FLAG_GRANT_READ_URI_PERMISSION — lets Instagram read our content:// URI.
const FLAG_GRANT_READ_URI_PERMISSION = 1;
// Optional Meta/Facebook App ID; some Instagram versions require it for ADD_TO_STORY.
const FB_APP_ID = process.env['EXPO_PUBLIC_FB_APP_ID'];

export default function ResultScreen({ route }: Props) {
  const { downloadUrl, attributionLinkUrl } = route.params;
  const [sharing, setSharing] = useState(false);

  const shareIos = useCallback(
    async (localPath: string) => {
      const storyUrl =
        `instagram-stories://share` +
        `?backgroundImage=${encodeURIComponent(localPath)}` +
        `&contentURL=${encodeURIComponent(attributionLinkUrl)}`;
      const canOpen = await Linking.canOpenURL(storyUrl);
      if (!canOpen) {
        Alert.alert(
          'Instagram not installed',
          'Install Instagram to share your Story.',
        );
        return;
      }
      await Linking.openURL(storyUrl);
    },
    [attributionLinkUrl],
  );

  const shareAndroid = useCallback(async (localPath: string) => {
    // Instagram on Android can't be reached via a URL scheme — it needs a
    // native ADD_TO_STORY intent pointed at a content:// URI it can read.
    const contentUri = await FileSystem.getContentUriAsync(localPath);
    try {
      await IntentLauncher.startActivityAsync(
        'com.instagram.share.ADD_TO_STORY',
        {
          data: contentUri,
          type: 'image/jpeg',
          flags: FLAG_GRANT_READ_URI_PERMISSION,
          packageName: 'com.instagram.android',
          ...(FB_APP_ID
            ? { extra: { source_application: FB_APP_ID } }
            : {}),
        },
      );
    } catch {
      // startActivityAsync throws ActivityNotFoundException if IG is absent.
      Alert.alert(
        'Instagram not installed',
        'Install Instagram to share your Story.',
      );
    }
  }, []);

  const handleShare = useCallback(async () => {
    setSharing(true);
    const localPath = `${FileSystem.cacheDirectory}card_${Date.now()}.jpg`;
    try {
      await FileSystem.downloadAsync(downloadUrl, localPath);
      if (Platform.OS === 'ios') {
        await shareIos(localPath);
      } else {
        await shareAndroid(localPath);
      }
    } catch {
      Alert.alert('Share failed', 'Could not open Instagram. Please try again.');
    } finally {
      // Don't delete localPath here: Instagram reads the handed-off file/URI
      // asynchronously after we return. The OS reclaims the cache directory.
      setSharing(false);
    }
  }, [downloadUrl, shareIos, shareAndroid]);

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

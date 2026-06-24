import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { parseShortStoryUrl } from '../lib/parseDeepLink';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation, route }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const incomingUrl = route.params?.incomingUrl;
    if (incomingUrl) {
      setUrl(incomingUrl);
      return;
    }
    Linking.getInitialURL()
      .then((initial) => {
        if (!initial) return;
        const parsed = parseShortStoryUrl(initial);
        if (parsed) setUrl(parsed);
      })
      .catch(() => undefined);
  }, [route.params?.incomingUrl]);

  const handleSubmit = () => {
    const trimmed = url.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    navigation.navigate('Processing', { url: trimmed });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>ShortStory</Text>
      <Text style={styles.label}>Paste a YouTube Shorts URL</Text>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        placeholder="https://www.youtube.com/shorts/..."
        placeholderTextColor="#aaa"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />
      {loading ? (
        <ActivityIndicator size="large" color="#E1306C" />
      ) : (
        <TouchableOpacity
          style={styles.button}
          onPress={handleSubmit}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Generate</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 14,
    backgroundColor: '#fff',
  },
  heading: {
    fontSize: 34,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
    color: '#111',
  },
  label: {
    fontSize: 16,
    color: '#555',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  button: {
    backgroundColor: '#E1306C',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 17,
  },
});

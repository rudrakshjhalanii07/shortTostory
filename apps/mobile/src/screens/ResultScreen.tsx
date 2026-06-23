import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

export default function ResultScreen({ route }: Props) {
  const { downloadUrl } = route.params;

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: downloadUrl }}
        style={styles.card}
        resizeMode="contain"
      />
      <TouchableOpacity style={styles.button} disabled activeOpacity={1}>
        <Text style={styles.buttonText}>Share to Story</Text>
        <Text style={styles.buttonSub}>Coming soon</Text>
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
    opacity: 0.45,
    width: '100%',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 17,
  },
  buttonSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 2,
  },
});

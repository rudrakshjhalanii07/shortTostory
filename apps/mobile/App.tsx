import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import {
  createNavigationContainerRef,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useShareIntent } from 'expo-share-intent';
import type { RootStackParamList } from './src/navigation/types';
import { parseShortStoryUrl } from './src/lib/parseDeepLink';
import { extractSharedUrl } from './src/lib/extractSharedUrl';
import HomeScreen from './src/screens/HomeScreen';
import ProcessingScreen from './src/screens/ProcessingScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function App() {
  const [navReady, setNavReady] = useState(false);

  // Primary path: the OS share sheet (YouTube → Share → ShortStory). The hook
  // surfaces the shared URL on both cold and warm start; we go straight to
  // Processing, which creates the job and fires the Instagram Story intent.
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({
    resetOnBackground: true,
  });

  useEffect(() => {
    if (!hasShareIntent || !navReady || !navigationRef.isReady()) return;
    const url = shareIntent.webUrl ?? extractSharedUrl(shareIntent.text);
    if (url) {
      navigationRef.navigate('Processing', { url });
    }
    resetShareIntent();
  }, [hasShareIntent, shareIntent, navReady, resetShareIntent]);

  useEffect(() => {
    // Warm start via the legacy shortstory:// deep link.
    const sub = Linking.addEventListener('url', ({ url }) => {
      const parsed = parseShortStoryUrl(url);
      if (parsed && navigationRef.isReady()) {
        navigationRef.navigate('Processing', { url: parsed });
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <NavigationContainer ref={navigationRef} onReady={() => setNavReady(true)}>
      <StatusBar style="dark" />
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{ headerBackTitle: 'Back' }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'ShortStory', headerShadowVisible: false }}
        />
        <Stack.Screen
          name="Processing"
          component={ProcessingScreen}
          options={{
            title: '',
            headerBackVisible: false,
            gestureEnabled: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

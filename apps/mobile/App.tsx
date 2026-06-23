import { useEffect } from 'react';
import { Linking } from 'react-native';
import {
  createNavigationContainerRef,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import type { RootStackParamList } from './src/navigation/types';
import { parseShortStoryUrl } from './src/lib/parseDeepLink';
import HomeScreen from './src/screens/HomeScreen';
import ProcessingScreen from './src/screens/ProcessingScreen';
import ResultScreen from './src/screens/ResultScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function App() {
  useEffect(() => {
    // Warm start: app is already running when the share extension fires the URL.
    const sub = Linking.addEventListener('url', ({ url }) => {
      const incoming = parseShortStoryUrl(url);
      if (incoming && navigationRef.isReady()) {
        navigationRef.navigate('Home', { incomingUrl: incoming });
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
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
            title: 'Generating Card',
            headerBackVisible: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="Result"
          component={ResultScreen}
          options={{ title: 'Your Card' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NearbyScreen } from './src/NearbyScreen';
import { TokenScreen } from './src/TokenScreen';
import { loadToken } from './src/token';
import { colors } from './src/theme';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadToken().then((t) => {
      setToken(t || null);
      setLoaded(true);
    });
  }, []);

  let screen;
  if (!loaded) {
    screen = (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  } else if (!token || editing) {
    screen = (
      <TokenScreen
        initial={token ?? ''}
        onDone={(t) => {
          setToken(t);
          setEditing(false);
        }}
      />
    );
  } else {
    screen = <NearbyScreen key={token} token={token} onChangeToken={() => setEditing(true)} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {screen}
    </SafeAreaProvider>
  );
}

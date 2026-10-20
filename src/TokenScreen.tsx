import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkToken, MindatError } from './mindat';
import { saveToken } from './token';
import { colors } from './theme';

export function TokenScreen({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (token: string) => void;
}) {
  const [token, setToken] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const t = token.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      await checkToken(t);
      await saveToken(t);
      onDone(t);
    } catch (e) {
      setError(e instanceof MindatError ? e.message : 'Connessione non riuscita.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}
      >
        <Text style={styles.title}>Mindat Nearby</Text>
        <Text style={styles.body}>
          Per cercare le località serve il tuo token API Mindat. Lo trovi nelle
          impostazioni del tuo account su mindat.org.
        </Text>
        <TextInput
          value={token}
          onChangeText={setToken}
          placeholder="Token API"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          onSubmitEditing={submit}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Salva e continua</Text>
          )}
        </Pressable>
        <Pressable onPress={() => Linking.openURL('https://www.mindat.org/a/how_to_get_my_mindat_api_key')}>
          <Text style={styles.link}>Come ottengo il token?</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 },
  title: { fontSize: 30, fontWeight: '700', color: colors.ink },
  body: { fontSize: 16, lineHeight: 22, color: colors.muted },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: colors.ink,
  },
  error: { color: colors.accent },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  link: { color: colors.accent, textAlign: 'center', padding: 8 },
});

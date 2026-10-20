import * as SecureStore from 'expo-secure-store';

const KEY = 'mindat_token';

// Optional default for personal builds, read from .env.local (never committed).
const DEFAULT_TOKEN = process.env.EXPO_PUBLIC_MINDAT_TOKEN ?? '';

export async function loadToken() {
  return (await SecureStore.getItemAsync(KEY)) ?? DEFAULT_TOKEN;
}

export async function saveToken(token: string) {
  await SecureStore.setItemAsync(KEY, token);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(KEY);
}

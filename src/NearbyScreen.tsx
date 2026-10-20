import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Circle, LongPressEvent, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { findNearby, Locality, localityUrl, MindatError, SearchProgress } from './mindat';
import { colors } from './theme';

const RADII = [5, 10, 25, 50];

type Center = { latitude: number; longitude: number; fromGps: boolean };

function splitName(txt: string) {
  const parts = txt.split(', ');
  return { title: parts[0], place: parts.slice(1, 3).join(', ') };
}

function formatDistance(km: number | null) {
  if (km === null) return '—';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function navigationUrl(l: Locality) {
  const dest = `${l.latitude},${l.longitude}`;
  return Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${dest}`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

export function NearbyScreen({ token, onChangeToken }: { token: string; onChangeToken: () => void }) {
  const mapRef = useRef<MapView>(null);
  const listRef = useRef<FlatList<Locality>>(null);
  const searchId = useRef(0);

  const [radius, setRadius] = useState(10);
  const [center, setCenter] = useState<Center | null>(null);
  const [results, setResults] = useState<Locality[]>([]);
  const [complete, setComplete] = useState(true);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const search = useCallback(
    async (c: Center, r: number) => {
      const id = ++searchId.current;
      setCenter(c);
      setSelected(null);
      setError(null);
      setProgress({ requests: 0, found: 0 });
      mapRef.current?.animateToRegion({
        latitude: c.latitude,
        longitude: c.longitude,
        latitudeDelta: (r * 2.4) / 111,
        longitudeDelta: (r * 2.4) / (111 * Math.cos((c.latitude * Math.PI) / 180)),
      });
      try {
        const res = await findNearby(token, c.latitude, c.longitude, r, (p) => {
          if (id === searchId.current) setProgress(p);
        });
        if (id !== searchId.current) return; // a newer search started
        setResults(res.localities);
        setComplete(res.complete);
      } catch (e) {
        if (id !== searchId.current) return;
        setError(e instanceof MindatError ? e.message : 'Connessione non riuscita.');
      } finally {
        if (id === searchId.current) setProgress(null);
      }
    },
    [token],
  );

  const searchFromGps = useCallback(async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    setError(null);
    if (perm.status !== 'granted') {
      setError('Permesso di localizzazione negato. Puoi tenere premuto sulla mappa per scegliere un punto.');
      return;
    }
    setProgress({ requests: 0, found: 0 });
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      search({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, fromGps: true }, radius);
    } catch {
      setProgress(null);
      setError('Impossibile ottenere la posizione.');
    }
  }, [radius, search]);

  // Search around the user's position on first mount. State is only set after
  // the permission prompt resolves, so the set-state-in-effect rule doesn't apply.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    searchFromGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeRadius(r: number) {
    setRadius(r);
    if (center) search(center, r);
  }

  function onLongPress(e: LongPressEvent) {
    search({ ...e.nativeEvent.coordinate, fromGps: false }, radius);
  }

  function select(l: Locality, fromMap: boolean) {
    setSelected(l.id);
    if (l.latitude !== null && l.longitude !== null && !fromMap) {
      mapRef.current?.animateToRegion({
        latitude: l.latitude,
        longitude: l.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    }
    if (fromMap) {
      const index = results.findIndex((r) => r.id === l.id);
      if (index >= 0) listRef.current?.scrollToIndex({ index, viewPosition: 0 });
    }
  }

  const loading = progress !== null;
  const withCoords = results.filter((l) => l.latitude !== null);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Località vicine</Text>
        <Pressable onPress={onChangeToken} hitSlop={10}>
          <Text style={styles.headerLink}>Token</Text>
        </Pressable>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          showsUserLocation
          onLongPress={onLongPress}
          initialRegion={{ latitude: 45.07, longitude: 7.68, latitudeDelta: 4, longitudeDelta: 4 }}
        >
          {center && (
            <Circle
              center={center}
              radius={radius * 1000}
              strokeColor="rgba(138,59,18,0.6)"
              fillColor="rgba(138,59,18,0.06)"
            />
          )}
          {center && !center.fromGps && (
            <Marker coordinate={center} pinColor={colors.ink} title="Punto di ricerca" />
          )}
          {withCoords.map((l) => (
            <Marker
              key={`${l.id}-${l.id === selected}`}
              coordinate={{ latitude: l.latitude!, longitude: l.longitude! }}
              pinColor={l.id === selected ? colors.pinSelected : colors.pin}
              title={splitName(l.txt).title}
              description={[l.typeName, formatDistance(l.distanceKm)].filter(Boolean).join(' · ')}
              onPress={() => select(l, true)}
              onCalloutPress={() => Linking.openURL(localityUrl(l.id))}
            />
          ))}
        </MapView>
        <Pressable
          style={({ pressed }) => [styles.gpsButton, pressed && { opacity: 0.85 }]}
          onPress={searchFromGps}
          disabled={loading}
        >
          <Text style={styles.gpsButtonText}>◎  Cerca qui vicino</Text>
        </Pressable>
      </View>

      <View style={styles.radii}>
        {RADII.map((r) => (
          <Pressable
            key={r}
            onPress={() => changeRadius(r)}
            style={[styles.chip, r === radius && styles.chipActive]}
            disabled={loading}
          >
            <Text style={[styles.chipText, r === radius && styles.chipTextActive]}>{r} km</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.status}>
        {loading ? (
          <View style={styles.row}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.statusText}>
              {progress.requests === 0
                ? 'Ricerca in corso…'
                : `Ricerca… ${progress.found} trovate (${progress.requests} richieste)`}
            </Text>
          </View>
        ) : error ? (
          <Text style={[styles.statusText, { color: colors.accent }]}>{error}</Text>
        ) : center ? (
          <Text style={styles.statusText}>
            {results.length} località entro {radius} km
            {!complete && ' · risultati parziali, prova un raggio più piccolo'}
          </Text>
        ) : (
          <Text style={styles.statusText}>Tieni premuto sulla mappa per cercare in un altro punto.</Text>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={results}
        keyExtractor={(l) => String(l.id)}
        contentContainerStyle={{ paddingBottom: 40 }}
        onScrollToIndexFailed={() => {}}
        renderItem={({ item }) => (
          <LocalityRow
            item={item}
            selected={item.id === selected}
            onPress={() => select(item, false)}
          />
        )}
        ListEmptyComponent={
          !loading && center && !error ? (
            <Text style={styles.empty}>Nessuna località Mindat in questo raggio. Prova ad allargarlo.</Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function LocalityRow({
  item,
  selected,
  onPress,
}: {
  item: Locality;
  selected: boolean;
  onPress: () => void;
}) {
  const { title, place } = splitName(item.txt);
  return (
    <Pressable onPress={onPress} style={[styles.item, selected && styles.itemSelected]}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitle}>{title}</Text>
          <Text style={styles.itemPlace} numberOfLines={1}>
            {[item.typeName, place].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Text style={styles.distance}>
          {item.distanceKm === null ? 'senza\ncoordinate' : formatDistance(item.distanceKm)}
        </Text>
      </View>

      {item.elements.length > 0 && (
        <Text style={styles.elements} numberOfLines={selected ? undefined : 1}>
          {item.elements.join(' · ')}
        </Text>
      )}

      {selected && (
        <View style={styles.actions}>
          <Pressable style={styles.action} onPress={() => Linking.openURL(localityUrl(item.id))}>
            <Text style={styles.actionText}>Apri su Mindat</Text>
          </Pressable>
          {item.latitude !== null && (
            <Pressable style={styles.action} onPress={() => Linking.openURL(navigationUrl(item))}>
              <Text style={styles.actionText}>Naviga</Text>
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink },
  headerLink: { color: colors.accent, fontSize: 15 },
  mapWrap: { height: '42%', backgroundColor: colors.line },
  gpsButton: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 22,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  gpsButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  radii: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.ink, fontSize: 14 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  status: { paddingHorizontal: 16, paddingVertical: 10, minHeight: 40, justifyContent: 'center' },
  statusText: { color: colors.muted, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  item: {
    backgroundColor: colors.card,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  itemSelected: { borderColor: colors.accent, backgroundColor: '#FFFBF7' },
  itemTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  itemPlace: { fontSize: 13, color: colors.muted, marginTop: 2 },
  distance: { fontSize: 14, fontWeight: '600', color: colors.accent, textAlign: 'right' },
  elements: { fontSize: 12, color: colors.muted, marginTop: 8, letterSpacing: 0.3 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  action: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
  },
  actionText: { color: colors.accent, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.muted, padding: 24 },
});

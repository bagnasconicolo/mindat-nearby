# Mindat Nearby

App Android/iOS (Expo) per trovare le località mineralogiche [Mindat](https://www.mindat.org) vicine alla tua posizione.

- Mappa con le località entro 5/10/25/50 km e lista ordinata per distanza
- Tieni premuto sulla mappa per cercare attorno a un altro punto
- Per ogni località: tipo (miniera, cava, affioramento…), elementi chimici, link alla pagina Mindat, navigazione

## Avvio

```sh
npm install
npx expo start          # telefono e Mac sulla stessa Wi-Fi
npx expo start --tunnel # se non sono sulla stessa rete
```

Installa **Expo Go** sul telefono (App Store / Play Store) e inquadra il QR code.

## Token

Serve un [token API Mindat](https://www.mindat.org/a/how_to_get_my_mindat_api_key).
Si inserisce al primo avvio (salvato nel portachiavi del telefono), oppure come default in `.env.local`:

```
EXPO_PUBLIC_MINDAT_TOKEN=...
```

`.env.local` non viene committato. Non pubblicare sugli store una build con il token incorporato.

## Note sull'API

Gli endpoint geografici di Mindat restituiscono al massimo 10 località per richiesta, e le
pagine di `/localities/` sono limitate a 10 risultati. `src/mindat.ts` divide quindi l'area
di ricerca in quadranti finché ogni quadrante ha meno di 10 risultati, poi scarica i dettagli
a blocchi di 10. Le aree amministrative senza coordinate (comuni ecc.) vengono escluse.

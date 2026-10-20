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

## Sito web (mindat.chicubo.it)

`site/` è la versione web: file statici, nessuna build. Sul server:

- **nginx** (`/etc/nginx/sites-available/mindat`, solo su `127.0.0.1:8650`, raggiunto dal tunnel Cloudflare)
  serve `site/`, inoltra `/api/v1/` ad api.mindat.org aggiungendo il token
  (`/etc/nginx/mindat-token.conf`) con cache di un giorno, e `/data/` al servizio sotto.
- **Cloudflare Access** con login Google protegge tutto il dominio.
- **`server/index.js`** (servizio systemd `mindat-nearby`, unit in `server/mindat-nearby.service`):
  archivio e cassetti di ogni utente in SQLite (`/var/lib/mindat-nearby/mindat.db`),
  utente preso dal JWT firmato di Access. Per provarlo in locale: `DEV_USER=io@example.com node server/index.js`.

Aggiornare: `cd /var/www/mindat-nearby && git pull` (e `sudo systemctl restart mindat-nearby` se cambia `server/`).

Senza il proxy (es. aprendo `site/` altrove) l'app chiede il token Mindat personale e l'archivio non è disponibile.

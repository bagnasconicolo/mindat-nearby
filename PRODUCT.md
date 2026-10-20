# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: static ES modules served by nginx (no build step, like the current `site/`), plus a small dependency-free Node service on the same server for per-user data (saved places, lists), using Node 22's built-in SQLite. Chosen because the deploy is plain nginx + systemd like the other chicubo.it services, and the client is small enough not to need a framework. The Expo app in the repo root is a separate client and is not part of this decision.

## Users

Mineral collectors and enthusiasts around Chicubo (the team, friends, the museum circle). Two equal scenes:
- **Planning at home**, on a computer: studying an area, preparing a trip, building lists of localities, printing or exporting them.
- **In the field**, on a phone, often outdoors or in a car: what is near here, how do I get there, what was on my list.

## Product Purpose

Find Mindat mineral localities around a point (current position or any chosen place), keep the interesting ones, organise them into lists for trips, and take them out of the app (PDF, Google Maps). Success: a trip can be planned at the desk and then followed on the phone without retyping anything.

## Positioning

A field companion built on Mindat's locality database, not a Mindat browser: it answers "what is around this point" exhaustively (the client splits the area into quadrants to get past Mindat's 10-results-per-query cap) and turns the answer into trip material.

## Operating Context

- Access is behind Cloudflare Access with Google login; any Google account may enter. The server knows the user's email from Access (`Cf-Access-Authenticated-User-Email`), which identifies whose saved places and lists are whose.
- Mindat API calls go through the server's proxy, which adds a shared API token; users never handle a token.
- Search center: GPS position, a click/long-press on the map, or (to add) a searched place name or coordinates.
- Radii today: 5, 10, 25, 50 km.
- Exports go to PDF (print-quality list with coordinates, types, elements, links) and Google Maps (single place, directions, or a multi-stop route / list of links).

## Capabilities and Constraints

- Mindat data per locality: id, name (`txt`, comma-separated place hierarchy), coordinates (0,0 means none), locality type, elements. Mindat API: max 10 ids per geo query, pages of 10; the API sometimes times out at its Cloudflare edge.
- Large radii can hit the client's request budget and return partial results; the UI must say so.
- Saved places and lists persist on the server per Google account and sync between phone and computer.
- Undecided: shared/collaborative lists between users; offline use in the field.

## Brand Commitments

Italian-language UI. Belongs to the chicubo.it family of tools, but no binding visual identity has been given for this app.

## Evidence on Hand

Real Mindat data via the API at runtime. No screenshots, testimonials, or usage numbers exist; do not invent them.

## Product Principles

- Exhaustive and honest about the area: say when results are partial or coordinates are missing.
- Desk and field are one workflow: whatever is saved at the desk is one tap away on the phone.
- Getting out of the app is a feature: export and navigation are first-class, not buried.
- Mindat stays the source: every place links back to its Mindat page.

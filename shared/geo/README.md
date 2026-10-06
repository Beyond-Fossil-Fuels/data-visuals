# Country shapes for maps

One file per level of detail, all with the same countries and IDs, so any map can switch between them:

| File | Source | Notes |
|---|---|---|
| `europe-ne-110m.json` | Natural Earth 1:110m | Simplest: smooth coasts, few islands. Malta and other microstates added from 1:50m. |
| `europe-ne-50m.json` | Natural Earth 1:50m | Medium detail. |
| `europe-ne-10m.json` | Natural Earth 1:10m | Most detailed: every island. |

- TopoJSON, one object `countries`. Each feature's `id` is the ISO 3166-1 alpha-2 code (`XK` for Kosovo). Properties: `name`, and `lx`/`ly`, a label point (longitude/latitude) inside the main part of the country, for bubbles or labels.
- Crimea is shown as part of Ukraine, and Cyprus as one island.
- Clipped to a box around Europe (longitude -32 to 64, latitude 24 to 82).

Made with Natural Earth (public domain, naturalearthdata.com) version 5.x, processed with mapshaper.

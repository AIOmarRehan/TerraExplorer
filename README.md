# TerraExplorer

<p align="center">
  <img src="Earth.gif" alt="TerraExplorer" width="280" />
</p>

<p align="center">
  <strong>Explore every country on Earth - powered by AI, maps, and beautiful visuals.</strong>
</p>

<p align="center">
  <img alt="HTML5" src="https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white" />
  <img alt="CSS3" src="https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white" />
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black" />
  <img alt="Gemini" src="https://img.shields.io/badge/Gemini_AI-4285F4?style=flat&logo=google&logoColor=white" />
  <img alt="Leaflet" src="https://img.shields.io/badge/Leaflet.js-199900?style=flat&logo=leaflet&logoColor=white" />
  <img alt="Unsplash" src="https://img.shields.io/badge/Unsplash-000000?style=flat&logo=unsplash&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green" />
</p>

---

TerraExplorer is a zero-build, vanilla web app for discovering countries through AI-generated insights, photo galleries, interactive maps, and flag visualizations. Pick a random country or click one on the world map - get fun facts, a traditional dish, Unsplash photos, and Google Maps - all in a glassmorphic UI with animated day/night backgrounds.

## Features

### Explorer Mode (`index.html`)

- **Random Country Discovery** - spin the wheel and land on any of 250 countries
- **Region Filter** - narrow by Africa, Americas, Asia, Europe, Oceania, or Antarctic
- **AI Insights** - Gemini generates a fun fact and a traditional dish for every country
- **Photo Gallery** - Unsplash-powered image grid with full-screen lightbox and navigation
- **Google Maps** - embedded map centered on the country, forced desktop mode on mobile via CSS transform trick
- **Visited Tracking** - mark countries as visited, persisted in localStorage
- **History** - last 10 countries viewed, clickable to revisit
- **Flag Coverage** - progress bar showing how many countries you've flagged on the world map

### Discover Mode (`map.html`)

- **Interactive World Map** - Leaflet.js + TopoJSON with pan, zoom, and click-to-select
- **SVG Flag Fill** - click a country to paint its borders with its flag
- **Cover All / Clear All** - flag or unflag every country in one click
- **Detail Panel** - slide-in on desktop, bottom sheet on mobile - same rich info as Explorer Mode
- **Persistent Flags** - flagged countries saved in localStorage and synced with Explorer

### Design & UX

- **Animated Splash Screen** - CSS-drawn Earth with orbiting moon, twinkling stars, and progress bar
- **Day / Night Background** - full-screen SVG with animated sun, moon, clouds, and stars (GSAP)
- **Dark & Light Mode** - smooth theme transitions, preference persisted
- **Glassmorphism** - frosted-glass cards, panels, and controls with `backdrop-filter`
- **Responsive** - mobile-first from 375px up; hamburger menu, collapsible panels, bottom sheets
- **Lottie Animations** - spinning earth icon in the sticky header and navigation

### Reliability

- **Multi-Model AI Fallback** - cycles through 4 Gemini models on rate limits (429/503), auto-retries with countdown
- **Offline-Friendly Data** - all country data is bundled in `countries-data.js`, so flags, stats, maps and search work with no live API and no key
- **Graceful Degradation** - works without any API key; AI and photos simply won't appear

## Getting Started

The site is static. API keys never go in the browser: Gemini and Unsplash are called by a small Cloudflare Worker in `worker/`, and the site only knows the Worker's public URL.

1. Serve the site with any HTTP server:
   ```
   python -m http.server 8080
   ```
2. Open `http://localhost:8080`. Country data, flags, maps and visited tracking work without any key.
3. *(Optional, for AI facts and photos)* run the Worker locally:
   ```
   cd worker
   copy .dev.vars.example .dev.vars   # then put your own keys in .dev.vars
   npx wrangler@4 dev --port 8787
   ```
   and set `apiBaseUrl: 'http://localhost:8787'` in `config.public.js` (do not commit that change).

> Never put API keys in `config.public.js`, HTML, or any file served by GitHub Pages. `.dev.vars` and `config.js` are gitignored.

## Tech Stack

| Category | Technology |
|----------|------------|
| Markup | HTML5 (semantic) |
| Styling | CSS3 - custom properties, flexbox, grid, glassmorphism, `backdrop-filter` |
| Logic | Vanilla JavaScript (ES6+, async/await, Fetch API) |
| Country Data | Bundled locally (`countries-data.js`) — from [mledoze/countries](https://github.com/mledoze/countries), flags via [flagcdn](https://flagcdn.com/), population via [World Bank](https://data.worldbank.org/) |
| AI | [Google Gemini API](https://ai.google.dev/) via Cloudflare Worker proxy - multi-model fallback chain |
| Photos | [Unsplash API](https://unsplash.com/developers) via Cloudflare Worker proxy |
| Maps (embed) | Google Maps embedded iframe |
| Maps (interactive) | [Leaflet.js 1.9.4](https://leafletjs.com/) + [TopoJSON](https://github.com/topojson/topojson) |
| Background Animation | [GSAP / TweenMax 2.1.3](https://greensock.com/gsap/) |
| Lottie Animations | [@lottiefiles/lottie-player 2.0.8](https://lottiefiles.com/) |
| Storage | `localStorage` (visited, history, flags, theme) |

## File Structure

```
TerraExplorer/
├── index.html          Explorer Mode (HTML + CSS + JS, single file)
├── map.html            Discover Mode - interactive world map
├── 404.html            GitHub Pages not-found page
├── config.public.js    Public runtime config (Worker URL only, no secrets)
├── countries-data.js   Bundled country dataset (names, flags, stats, coords)
├── earth-anim.json     Lottie animation data (header icon)
├── map-anim.json       Lottie animation data (map nav icon)
├── earth.lottie        Original .lottie source (not deployed)
├── map.lottie          Original .lottie source (not deployed)
├── Earth.gif           README hero image (not deployed)
├── worker/             Cloudflare Worker API proxy (holds the secrets)
├── scripts/
│   ├── build-site.mjs     Builds and validates the deployable dist/ folder
│   ├── security-scan.mjs  Fails the build if credentials are found
│   └── build-data.mjs     Rebuilds countries-data.js
├── .github/
│   └── workflows/
│       ├── deploy.yml       Build + deploy to GitHub Pages
│       └── update-data.yml  Weekly data refresh
├── .gitignore
├── LICENSE
└── README.md
```

## Deployment

**API Worker (once):**

1. `cd worker` and run `npx wrangler@4 login`
2. `npx wrangler@4 secret put GEMINI_API_KEY` and `npx wrangler@4 secret put UNSPLASH_ACCESS_KEY` (paste the keys when prompted)
3. `npx wrangler@4 deploy` and note the `https://terraexplorer-api.<subdomain>.workers.dev` URL
4. If the site is served from another origin, add it to `ALLOWED_ORIGINS` in `worker/wrangler.toml`

**GitHub Pages:**

1. **Settings → Pages → Source:** GitHub Actions
2. **Settings → Secrets and variables → Actions → Variables:** add `PUBLIC_API_BASE_URL` = the Worker URL (a variable, not a secret; it is public)
3. Push to `main`. `deploy.yml` runs `node scripts/build-site.mjs`, which copies only the public files into `dist/`, checks local links, scans for secrets, and then deploys `dist/`.

Build locally with `node scripts/build-site.mjs`; the output in `dist/` can be served by any static host.

## License

MIT License - Made by **Omar Rehan**.

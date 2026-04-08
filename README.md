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
- **Region Fallback** - if `/all` endpoint fails, fetches countries by region in parallel
- **Graceful Degradation** - works without any API key; AI and photos simply won't appear

## Getting Started

1. Get a free **Gemini API key** at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. *(Optional)* Get a free **Unsplash Access Key** at [unsplash.com/developers](https://unsplash.com/developers)
3. Create `config.js` in the project root:
   ```js
   const GEMINI_API_KEY = 'your-gemini-key';
   const UNSPLASH_ACCESS_KEY = 'your-unsplash-key';
   ```
4. Serve with any HTTP server:
   ```
   python -m http.server 8080
   ```
5. Open `http://localhost:8080`

> `config.js` is gitignored - never commit API keys to a public repo.

## Tech Stack

| Category | Technology |
|----------|------------|
| Markup | HTML5 (semantic) |
| Styling | CSS3 - custom properties, flexbox, grid, glassmorphism, `backdrop-filter` |
| Logic | Vanilla JavaScript (ES6+, async/await, Fetch API) |
| Country Data | [RestCountries API v3.1](https://restcountries.com/) |
| AI | [Google Gemini API](https://ai.google.dev/) - multi-model fallback chain |
| Photos | [Unsplash API](https://unsplash.com/developers) |
| Maps (embed) | Google Maps embedded iframe |
| Maps (interactive) | [Leaflet.js 1.9.4](https://leafletjs.com/) + [TopoJSON](https://github.com/topojson/topojson) |
| Background Animation | [GSAP / TweenMax 2.1.3](https://greensock.com/gsap/) |
| Lottie Animations | [@lottiefiles/lottie-player 2.0.8](https://lottiefiles.com/) |
| DOM Helpers | jQuery 3.7.1 |
| Storage | `localStorage` (visited, history, flags, theme) |

## File Structure

```
TerraExplorer/
├── index.html          Explorer Mode (HTML + CSS + JS, single file)
├── map.html            Discover Mode - interactive world map
├── config.js           API keys (gitignored)
├── earth-anim.json     Lottie animation data (header icon)
├── map-anim.json       Lottie animation data (map nav icon)
├── earth.lottie        Original .lottie source
├── map.lottie          Original .lottie source
├── Earth.gif           README hero image
├── .github/
│   └── workflows/
│       └── deploy.yml  GitHub Pages CI/CD
├── .gitignore
├── LICENSE
└── README.md
```

## Deployment

The project ships with a **GitHub Actions workflow** that deploys to GitHub Pages automatically on every push to `main`.

1. Go to your repo → **Settings → Secrets and variables → Actions**
2. Add two secrets: `GEMINI_API_KEY` and `UNSPLASH_ACCESS_KEY`
3. Push to `main` - the workflow injects the keys into `config.js` and deploys

Also works on any static host (Vercel, Netlify, Cloudflare Pages) - just make sure `config.js` is present at runtime.

## License

MIT License - Made by **Omar Rehan**.
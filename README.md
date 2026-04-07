# TerraExplorer

![Earth](Earth.gif)

A single-page web app that picks a random country and displays its key info alongside AI-generated insights. Built with vanilla HTML, CSS, and JavaScript with no build tools required.

## Features

- Random country explorer with flag, capital, population, region, currency, and languages
- AI-generated fun fact and traditional dish for each country (Google Gemini)
- Embedded Google Maps showing the country location
- Region filter (Africa, Americas, Asia, Europe, Oceania, Antarctic)
- Recently viewed history (last 10 countries, clickable to revisit)
- Mark countries as visited (persisted in localStorage)
- Animated day/night SVG background with GSAP
- Animated Lottie earth icon in the sticky header
- Light and dark mode toggle
- Auto-retry with countdown on API rate limits
- Fully responsive (375px+)

## Getting Started

1. Get a free Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Open `config.js` and replace `YOUR_API_KEY_HERE` with your key:
   ```js
   const GEMINI_API_KEY = 'your-key-here';
   ```
3. Serve the project folder with any HTTP server (needed for Lottie to load):
   ```
   python -m http.server 8080
   ```
4. Open `http://localhost:8080` in a browser

The app works without an API key too, you just won't see the AI content.

> The API key lives in `config.js` which is gitignored. Do not commit it to a public repo.

## Tools and Technologies

| Category | Tool |
|----------|------|
| Markup | HTML5 |
| Styling | CSS3 (variables, flexbox, grid, glassmorphism, backdrop-filter) |
| Logic | Vanilla JavaScript (ES6+, async/await, Fetch API) |
| Country Data | RestCountries API v3.1 |
| AI Content | Google Gemini API (gemini-2.5-flash-lite, free tier) |
| Maps | Google Maps (embedded iframe) |
| Background Animation | GSAP (TweenMax 2.1.3) |
| Header Icon | Lottie animation via @lottiefiles/lottie-player |
| DOM Helpers | jQuery 3.7.1 (GSAP blink animations) |
| Storage | localStorage (visited countries, history) |

## File Structure

```
TerraExplorer/
  index.html        Main application (HTML + CSS + JS)
  config.js         Gemini API key (gitignored)
  earth-anim.json   Lottie animation data for header icon
  earth.lottie      Original .lottie source file
  .gitignore        Excludes config.js
  README.md         This file
```

## Deployment

Works on any static host (Vercel, Netlify, GitHub Pages). Just push all files except `config.js`. Set up `config.js` on the server or replace the key reference as needed.

## License

This project is licensed under the MIT License. Made by Omar Rehan.
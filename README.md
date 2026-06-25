# MD Twister 🌀

A tiny **zero-backend** web app that imports Markdown files, renders them, and
lets you twist between a selection of styles (GitHub, Dark, Sepia, Academic,
Solarized, Terminal, Newspaper, Dracula…).

Everything runs in the browser — files are never uploaded anywhere.

## Use it

- **Import** a `.md` file via the button, drag & drop, or paste text directly.
- **Pick a style** from the dropdown in the top bar. Your choice is remembered.
- Click **Load sample** to see a demo document.

## Run locally

It's a static site — just open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy (free, no Firebase needed)

This repo ships a GitHub Actions workflow (`.github/workflows/deploy.yml`) that
publishes to **GitHub Pages** on every push to `main`.

One-time setup: in the repo go to **Settings → Pages → Build and deployment →
Source: GitHub Actions**. After that, merging to `main` puts it online at
`https://<user>.github.io/<repo>/`.

## Tech

Plain HTML/CSS/JS — no build step. Markdown parsing by
[marked](https://marked.js.org/), sanitised with
[DOMPurify](https://github.com/cure53/DOMPurify). Both are vendored under
`vendor/` so the app is fully self-contained (works offline, no CDN).

# MD Twister 🌀

A tiny **zero-backend** web app that imports Markdown files, renders them, and
lets you twist between a selection of styles (GitHub, Dark, Sepia, Academic,
Solarized, Terminal, Newspaper, Dracula…).

Everything runs in the browser — files are never uploaded anywhere.

## Use it

- **Import** a `.md` file via the button, drag & drop, or paste text directly.
- **Drop a PDF** and it's converted to Markdown in your browser (text-based PDFs;
  scanned/image PDFs aren't supported as that needs OCR).
- **Pick a style** from the dropdown in the top bar. Your choice is remembered.
- **Load sample** to see a demo document or a German IDW-style Prüfungsbericht.
- **Export PDF** to download the document in the currently selected style.

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
[DOMPurify](https://github.com/cure53/DOMPurify); PDF export via
[html2pdf.js](https://github.com/eKoopmans/html2pdf.js) and PDF import via
Mozilla [pdf.js](https://mozilla.github.io/pdf.js/). All are vendored under
`vendor/` so the app is fully self-contained (works offline, no CDN).

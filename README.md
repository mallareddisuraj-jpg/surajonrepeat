# Suraj on Repeat

Portfolio of Suraj Mallareddi. Plain HTML, CSS and JS: no build step, no dependencies.

## Preview

    cd ~/suraj-on-repeat && python3 -m http.server 8765

Then open http://127.0.0.1:8765

## Edit

- All copy, captions and links are in `index.html`.
- Colours and layout are in `css/site.css` (colours are at the top, under `:root`).
- Each film has three files that share a name: `assets/film/` (full, with sound), `assets/preview/` (6-second silent loop), `assets/poster/` (still).
- To replace the resume, overwrite `assets/Suraj-Mallareddi-Resume.pdf`.

## Publish

Upload this whole folder to any static host. `index.html` must stay at the top level.
The canonical and share-image links use https://mallareddisuraj-jpg.github.io/surajonrepeat/. If you move to your own domain, search `index.html` for that address and change it.

Films from Behance (UNNATI, Fulfill Your Foodies) open your Behance project, because Adobe hosts those videos. Add the original files to `assets/film/` if you want them to play on the page.

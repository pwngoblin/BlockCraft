# Blockcraft

Block-based notes for Obsidian. Everything is stored as plain Obsidian Markdown, so your notes stay intact if you disable the plugin. Desktop only.

## Features
- **Cards and columns** as portable callouts: `> [!card]`, `> [!card|raised]`, `> [!card|accent]`, `> [!columns]`
- **Block handles:** hover a block for a grip (drag to reorder) and a `···` menu (wrap in card, group into columns, duplicate, move, delete). One `Cmd+Z` undoes any action.
- **Slash menu:** type `/` for headings, tables, code, formulas, cards, columns, dividers, dates and more
- **Panel** in the right sidebar: Insert, Format, Style and Info tabs
- **macOS-style look:** tinted window, rounded page sheet, pill controls, glass menus (all CSS, scoped to the plugin)
- **OLED black mode** (Settings -> Blockcraft)

## Syntax
```md
> [!card] Title
> Card body

> [!columns]
> > [!card] Left
> > left body
>
> > [!card] Right
> > right body
```
Separate sibling cards with a bare `>` line (one level only).

## Install
**With BRAT** (recommended): install the *BRAT* community plugin, then *Add beta plugin* -> `pwngoblin/obsidian-blockcraft`.
**Manually:** download `main.js`, `manifest.json`, `styles.css` from the latest release into `<vault>/.obsidian/plugins/obsidian-blockcraft/`, then enable *Blockcraft* in Settings -> Community plugins.

## Develop
```
npm install
npm run build      # -> main.js
npm test           # parser tests
```

## Notes
Blockcraft is an independent project. It is not affiliated with, endorsed by, or sponsored by any other note-taking product or company. Product names mentioned elsewhere belong to their respective owners.

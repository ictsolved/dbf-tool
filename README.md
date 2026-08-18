# DBF Tool

A free tool to read, edit, and generate `.dbf` (dBase III) files entirely in your browser. No upload, no server: everything runs client-side.

## Features

- **Open** any `.dbf` file (drag-drop or file picker). Schema is read automatically from the file's own header, no configuration needed.
- **Edit** cell values inline, add one or many rows at once, clone or delete selected rows, or clear a file down to just its schema.
- **Reorder rows** by dragging or with move up/down (available whenever no column sort is active), and **reorder columns** the same way in the schema editor.
- **Sort and filter**: click a column header to sort by it. Filters are conditional and per-column (equals/not equals, greater/less/between for numbers and dates, contains/starts with/ends with for text, true/false for logicals, plus is empty/is not empty everywhere), and multiple active filters combine with AND, independent of the underlying row order.
- **Edit columns** on an already-open file: add, rename, or remove fields. Renamed fields keep their existing data (matched by a stable internal id, not by name or position); new fields start blank.
- **Create a new file** from a schema you define (field name, type, length, decimals).
- **Generate rows**: random fill for any schema, with per-field rules: random (with min/max), fixed value, auto-incrementing sequence, or a **formula** (a JS expression that can reference any field declared earlier in the schema, e.g. an `AMOUNT` field as `QTY * PRICE`).
- **Fill column**: regenerate values for a single column on your existing rows without touching the rest of the file, scoped to all rows, only the selected rows, or only the rows matching the grid's active filters. Sequence mode follows the rows' current order, handy for renumbering a serial-number column after reordering.
- **Download** the result as a `.dbf` file (always a fresh download, never overwrites the file you opened).

## Development

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

```bash
npm run deploy
```

Builds the app and pushes `dist/` to the `gh-pages` branch (via the [`gh-pages`](https://www.npmjs.com/package/gh-pages) package). Point your repo's Settings → Pages at "Deploy from branch: `gh-pages`".

## Acknowledgments

The .dbf binary parsing approach (field descriptor layout, record parsing) was inspired by [`dbf-reader`](https://github.com/shubhgupta4u/dbf-reader) by Shubh Gupta (MIT licensed), reimplemented here as a self-contained, dependency-free TypeScript reader/writer.

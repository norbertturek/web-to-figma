# Web to Figma

Web to Figma captures a web page structure and imports it into Figma as layers (`FRAME`, `TEXT`, `SVG`, `IMAGE`).

This repository has two main parts:

- `extension/` - a Chrome extension that captures page data and copies JSON to the clipboard.
- `plugin/` - a Figma plugin that imports JSON into the active document.

## Features

- Capture layout and core visual styles from DOM elements.
- Handle text, SVG, and image nodes.
- Optional full-page scroll to include lazy-loaded content.
- Viewport control in the extension popup.
- Direct JSON import in the Figma plugin.

## Requirements

- Google Chrome (for the extension)
- Figma account (for the plugin)

## Quick Start

### 1) Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` directory.

### 2) Figma plugin

1. In Figma: **Plugins -> Development -> Import plugin from manifest...**
2. Select `plugin/manifest.json`.

## Usage

1. Open any page in Chrome.
2. Run the **Web to Figma** extension.
3. Capture the page (JSON is copied to clipboard).
4. Run **Web to Figma Import** in Figma.
5. Paste JSON and click **Import**.

## Project structure

```text
web-to-figma/
  extension/
  plugin/
```

## License

This project is licensed under MIT. See `LICENSE`.

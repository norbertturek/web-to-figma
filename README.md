# Web to Figma

Narzędzie do przechwytywania struktury strony WWW i importowania jej do Figmy jako warstwy (`FRAME`, `TEXT`, `SVG`, `IMAGE`).

Repo zawiera dwa elementy:

- `extension/` - rozszerzenie Chrome, które zbiera dane o stronie i kopiuje JSON do schowka.
- `plugin/` - plugin Figma importujący JSON do aktywnego dokumentu.

## Funkcje

- Przechwytywanie układu i podstawowych stylow elementow DOM.
- Obsluga tekstu, SVG i obrazow.
- Opcjonalne przewijanie strony pod lazy-loaded content.
- Kontrola viewportu w rozszerzeniu.
- Import przechwyconego JSON bezposrednio w Figma pluginie.

## Wymagania

- Google Chrome (dla rozszerzenia)
- Konto Figma (dla pluginu)

## Szybki start

### 1) Rozszerzenie Chrome

1. Otworz `chrome://extensions`.
2. Wlacz **Developer mode**.
3. Kliknij **Load unpacked** i wskaz katalog `extension/`.

### 2) Plugin Figma

1. W Figma: **Plugins -> Development -> Import plugin from manifest...**
2. Wybierz plik `plugin/manifest.json`.

## Uzycie

1. Otworz strone w Chrome.
2. Uruchom rozszerzenie **Web to Figma**.
3. Kliknij capture (JSON zostanie skopiowany do schowka).
4. W Figma uruchom plugin **Web to Figma Import**.
5. Wklej JSON i kliknij **Importuj**.

## Struktura projektu

```text
web-to-figma/
  extension/
  plugin/
```

## Licencja

Projekt jest udostepniony na licencji MIT. Zobacz `LICENSE`.

# Zip Expander

Windows desktop app built with Electron + Next.js that extracts ZIP files into a destination folder root, flattening nested folders and nested ZIP files.

## Requirements

- Windows 10/11
- Node.js LTS
- 7-Zip installed and available at `C:\Program Files\7-Zip\7z.exe` or on `PATH`

## Development

```powershell
npm install
npm run assets:build
npm run dev
```

## Build

```powershell
npm run build
npm run dist
```

## Useful Scripts

- `npm run fixtures:generate`: regenerate deterministic test ZIP fixtures
- `npm run test`: run Vitest unit tests
- `npm run dist:unpacked`: produce unpacked Windows app output

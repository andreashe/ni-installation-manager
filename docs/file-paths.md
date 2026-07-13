# File Paths

Every disk location the application touches, and the rules that apply. Path constants live in `src/config/paths.ts` (app-owned) and `src/config/ni.config.ts` (NI-specific); resolution logic in `src/main/models/ProductFactory.ts`.

## Product disk paths (from registry)

Each product carries `ProductDiskPath` entries (`kind`, `rawValue`, `resolvedPath`, `exists`):

| Kind | Source | Resolution → `resolvedPath` | Uninstall rule |
|---|---|---|---|
| `ContentDir` | registry value | the folder itself | delete recursively |
| `InstallDir` | registry value | the folder itself | delete recursively |
| `InstallAAX64Dir` / `InstallVST364Dir` / `InstallVST64Dir` | registry value | the shared CONTAINER folder itself | **informational only** — never deleted, never backed up, never counted into disk usage (holds other products' plugins) |
| `InstallAAX64File` / `InstallVST364File` / `InstallVST64File` | derived (fuzzy match inside the container, `plugin-file-resolver.ts`) | the product's own plugin file/bundle (`.aaxplugin`/`.aax`, `.vst3`, `.dll`) | delete/backup exactly this file |
| `CommonFilesDetected` | derived | `C:\Program Files\Common Files\Native Instruments\<ProductName>` (base from `NI_COMMON_FILES_BASE`, respects `%CommonProgramFiles%`) | delete recursively if present |
| `Kontakt8ImageDir` / `Kontakt7ImageDir` / `KompleteKontrolImageDir` / `Machine2ImageDir` | derived | `…\Native Instruments\<Host>\PAResources\image\<ProductName>` (`NI_HOST_IMAGE_DIR_RULES`; hosts: Kontakt 8, Kontakt 7, Komplete Kontrol, Maschine 2) | **backup + disk usage only — never deleted** (`BACKUP_ONLY_KINDS`) |
| `InstalledProductsJson` | derived | `C:\Users\Public\Documents\Native Instruments\installed_products\<ProductName>.json` (`NI_INSTALLED_PRODUCTS_BASE`); also exposed as `Product.installedJsonPath` | delete the file if present |

- Entries whose `resolvedPath` does not exist are kept with `exists: false` and ignored by disk-usage scan, backup and removal.
- Disk-usage sums (list + details total) skip duplicates AND paths nested inside another counted folder (`removeNestedPaths`) — nothing is summed twice (TODO7).
- Plugin file names rarely equal the product name exactly — `matchPluginFileName` normalizes both sides (lower case, separators stripped) and accepts exact/containment matches, e.g. "Arturia-Prophet-VS V" finds `Prophet-VS V.dll`, `prophet-vs.dll`, `arturia-prophet-vs-v.dll`, `Prophet_VS_V.dll`.
- All destructive fs operations go through `FsGuard` (dry-run aware); shared containers are filtered out of every uninstall job in `toProductSpec` (`uninstall-job.ts`).

## Product artwork

Discovery is a **recursive scan** (`ArtworkCacheService`, roots in `ni.config.ts`) — fixed patterns miss vendor subfolders like `image\arturia\acid v\…`:

```
C:\Program Files\Common Files\Native Instruments\   (recursive)
C:\Users\Public\Documents\NI Resources\image\       (recursive)
```

Every folder directly containing an artwork candidate (`MST_artwork.png` preferred, then `MST_logo.png`, `VB_artwork.png`; matched case-insensitively) names one product: lower-cased folder name → artwork path map. The parent folder may be a vendor prefix, so the same file is additionally registered as `<parent>-<folder>` — `image\arturia\acid v\…` fits both "Acid V" and "Arturia-Acid V".

**Fallback chain** (per product, first hit wins): existing cache file → disk scan map → **CDN download** → **ContentDir wallpaper**. Cache-first means the disk scan only runs when products are still missing artwork.

- *CDN:* lookup (case-insensitive) in `src/config/na_cdn-assets.json`, downloaded via `ArtworkImageProcessor` (`src/main/utils/`, Electron `net` + `nativeImage`, 3 s timeout), cover-cropped centered to 134×66 (`CACHED_ARTWORK_SIZE`, never squeezed). Failures are logged and skipped.
- *Wallpaper:* `<ContentDir>\wallpaper.png` — copied to a temp file, proportionally resized to 66 px height, then LEFT-cropped to 134×66.

Preferences offers a **Clear cache** button (`cache:clear` IPC → `ArtworkCacheService.clearCache`) that wipes the cache folder and resets all artwork references. Products are looked up in that map case-insensitively and hits are copied into the **frontend assets cache**; the status bar shows the directory being scanned and the product being copied. Products without any artwork show the bundled alternative image `src/renderer/assets/MST_artwork_alt.png`.

## App-owned locations (under `app.getPath('userData')`)

| Path | Purpose | Constant |
|---|---|---|
| `userData/settings.json` | persisted user settings | `getSettingsFilePath()` |
| `userData/logs/ni-installation-manager.log` | central log file | `getLogFilePath()` |
| `userData/assets-cache/` | frontend assets cache (artwork copies) | `getFrontendAssetsCachePath()` |
| `userData/uninstall-jobs/` | job + progress files for the elevated uninstall/restore workers | `getUninstallJobsPath()` |
| `userData/rename-patterns.json` | persisted "Restore As…" rename patterns (TODO9) | `getRenamePatternsFilePath()` |

## Backup structure (phase 6)

Per uninstalled product inside the configured backup folder:

```
<backupFolder>/<productName>/files/<Kind>/…          (Kind = ContentDir, InstallDir, …, CommonFiles)
<backupFolder>/<productName>/registry/64-bit.json    (values incl. registry types)
<backupFolder>/<productName>/registry/32-bit.json
<backupFolder>/<productName>/niim-backup-desc.json   (name, version, backup date, full product object)
<backupFolder>/<productName>/product.png             (cached artwork, when available)
```

Layout constants and path mapping live in `src/main/utils/backup-layout.ts` — written by `BackupService`, read back by the restore domain (`RestoreScanService`, `RestoreDetailsService`, `restore-job.ts`; see [restore-flow.md](./restore-flow.md)). `<productName>` is sanitized (Windows-forbidden characters replaced); each `files/<Kind>/<basename>` entry maps back to the original `resolvedPath` recorded in the description's product object.

# Registry

How NI Installation Manager reads (and later removes) Windows registry data. All registry logic lives in the main process; constants in `src/config/ni.config.ts`, access in `src/main/services/RegistryService.ts`.

## Scanned locations

One subkey per installed product under **both** roots (`NI_REGISTRY_ROOTS`):

```
HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Native Instruments\<ProductName>\   (64-bit view)
HKEY_LOCAL_MACHINE\SOFTWARE\Native Instruments\<ProductName>\               (32-bit view)
```

The same product may appear in both views. `ProductScanService` merges subkeys **by name (case-insensitive)** into one `Product`, which remembers every key path it was found under (`Product.registryEntries`, keyed by full path).

Every product found under HKLM is then **supplemented** with two more keys when they exist (TODO12) — they join `registryEntries` and therefore uninstall, backup and restore automatically:

```
HKCU\SOFTWARE\Native Instruments\<ProductName>\        (per-user key, NI_HKCU_PRODUCT_ROOT)
HKCR\Installer\Products\<hash>\                        (Windows Installer registration)
```

The installer key's subkey name is a random hash; it is located by enumerating `NI_INSTALLER_PRODUCTS_ROOT` once per scan and matching each key's `ProductName` value against `Native Instruments <ProductName>` (case-insensitive).

### Hive-qualified key paths

Key paths may carry a hive prefix (`HKLM\`, `HKCU\`, `HKCR\`); a **bare path means HKLM**. Parsing/formatting lives in `src/main/utils/registry-path.ts` (`splitHiveKeyPath`, `displayKeyPath` — the latter is used everywhere key paths are logged or shown). The bare-equals-HKLM default keeps registry backups from before this convention restorable unchanged.

## Values used

| Value | Use |
|---|---|
| `ContentVersion` | Product version shown in the UI (optional) |
| `ContentDir`, `InstallDir` | Product-owned folders (removed as-is on uninstall) |
| `InstallAAX64Dir`, `InstallVST364Dir`, `InstallVST64Dir` | **Shared** plugin folders; product owns only `<folder>\<ProductName>.aaxplugin/.vst3/.dll` — resolution rules in `NI_PATH_VALUE_RULES` |
| everything else (`KEY`, `SNO`, `HU`, …) | Not interpreted, but retained on the product object for registry backup |

A product is **removable** when at least one of `ContentVersion`/`ContentDir`/`InstallDir`/`InstallAAX64Dir`/`InstallVST364Dir`/`InstallVST64Dir` exists (`NI_REMOVABLE_VALUE_NAMES`), regardless of whether the paths still exist on disk.

**Sensitive data:** product keys contain license values (`KEY`, `SNO`, …). Never write registry *values* to the log — only counts and key paths.

## Access layer

- `RegistryService` wraps the `native-reg` library (native bindings; no `reg.exe`/`regedit` shell-out). Read API: `listSubkeyNames`, `readAllValues` (returns JSON-serializable `RegistryValueDto` incl. type names like `SZ`, `DWORD_LITTLE_ENDIAN`; binary → base64), `readStringValue`, `keyExists`. All paths HKLM-relative.
- Mutating operations (`deleteKeyTree`, `deleteValue`, `restoreKeyValues` — the restore write-back of backed-up keys with original value types, TODO8) implement the `RegistryMutationBackend` interface and are reachable **only** through `RegistryGuard` (`src/main/utils/RegistryGuard.ts`), which enforces dry-run mode. The backend is wired in `app-context.ts`.
- `native-reg` is a native addon: it is marked `external` in `vite.main.config.ts` and unpacked from ASAR by the forge auto-unpack-natives plugin.

## Scan flow

`ProductScanService.scan()` (startup + reload button, overlap-protected):
1. enumerate subkeys of both roots, read all values per key,
2. group by product name, `ProductFactory.create()` per product (path resolution + fs existence checks, see [file-paths.md](./file-paths.md)),
3. `ProductStore.replaceAll()` → store-sync pushes `products:changed` to the renderer.

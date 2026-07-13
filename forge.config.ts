import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

// Native addons stay external to the Vite bundle (see vite.main.config.ts),
// so their node_modules folders must survive packaging. The Vite plugin's
// default ignore drops the node_modules directory entirely, which breaks
// require() of native modules at runtime ("Cannot find module 'native-reg'").
// Everything bundled by Vite belongs in devDependencies; only unbundled
// native modules live in "dependencies", which the packager's pruner keeps.
// node-gyp-build is native-reg's runtime prebuild loader (transitive dep).
const externalNativeModules = ['native-reg', 'node-gyp-build'];

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // Replaces plugin-vite's default ignore (keep only .vite) so node_modules
    // survives. Note: for paths under /node_modules/ that are real modules,
    // @electron/packager consults its pruner (production deps) instead of this
    // function — the whitelist below only guards junk files and the case where
    // prune is disabled. Paths start with '/'.
    ignore: (file: string) => {
      if (!file) return false;
      const path = file.replace(/\\/g, '/');
      if (path.startsWith('/.vite')) return false;
      if (path === '/package.json') return false;
      if (path === '/node_modules') return false;
      for (const mod of externalNativeModules) {
        if (path === `/node_modules/${mod}` || path.startsWith(`/node_modules/${mod}/`)) {
          return false;
        }
      }
      return true;
    },
    // Application/exe icon: packager picks the platform extension itself
    // (niim.ico on Windows). The packaged app's taskbar icon derives from
    // the exe; the dev-mode window icon is set in src/main/main.ts.
    icon: './assets/icons/niim',
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      // Icon of the generated Setup.exe installer.
      setupIcon: './assets/icons/niim.ico',
      // Fixed, version-free filename so README/releases can link a stable
      // "latest" download URL (github.com/.../releases/latest/download/...).
      setupExe: 'NI-Installation-Manager-Setup.exe',
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    // Moves *.node binaries out of the asar (app.asar.unpacked) — native
    // addons cannot be loaded from inside an asar archive.
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/main/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;

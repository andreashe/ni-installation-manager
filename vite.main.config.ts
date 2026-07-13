import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Native addon: must stay a runtime require from node_modules, cannot
      // be bundled by Rollup. Packaged via dependencies + auto-unpack-natives.
      external: ['native-reg'],
    },
  },
});

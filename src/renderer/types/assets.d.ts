/**
 * Static asset imports handled by Vite: importing a PNG yields its bundled
 * URL string (used e.g. for the fallback product artwork in ProductRow).
 */
declare module '*.png' {
  const url: string;
  export default url;
}

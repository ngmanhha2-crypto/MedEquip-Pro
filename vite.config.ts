import {optimize} from '@tailwindcss/node';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

function oklabToSrgb(L: number, a: number, b: number, alpha?: number): string {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const toByte = (x: number) => {
    const clamped = Math.max(0, Math.min(1, x));
    const srgb =
      clamped <= 0.0031308
        ? 12.92 * clamped
        : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(srgb * 255)));
  };

  const r = toByte(rLin);
  const g = toByte(gLin);
  const bl = toByte(bLin);

  if (alpha !== undefined && !Number.isNaN(alpha)) {
    const clampedAlpha = Math.max(0, Math.min(1, alpha));
    return `rgba(${r}, ${g}, ${bl}, ${Number(clampedAlpha.toFixed(4))})`;
  }
  return (
    '#' +
    [r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')
  );
}

function parsePercentOrNumber(raw: string, percentScale = 1): number {
  if (raw === 'none') return 0;
  return raw.endsWith('%')
    ? (parseFloat(raw) / 100) * percentScale
    : parseFloat(raw);
}

function convertOklchAndOklabToSrgb(css: string): string {
  // Convert oklch(L C h [/ alpha]) -> #rrggbb or rgba(...)
  let out = css.replace(
    /oklch\(\s*([^\s/)]+)\s+([^\s/)]+)\s+([^\s/)]+)(?:\s*\/\s*([^)]+))?\s*\)/gi,
    (match, lRaw: string, cRaw: string, hRaw: string, aRaw?: string) => {
      if (lRaw.includes('var(') || cRaw.includes('var(') || hRaw.includes('var(')) {
        return match;
      }
      const L = parsePercentOrNumber(lRaw, 1);
      const C = parsePercentOrNumber(cRaw, 0.4);
      let hDeg = 0;
      if (hRaw !== 'none') {
        if (hRaw.endsWith('rad')) hDeg = (parseFloat(hRaw) * 180) / Math.PI;
        else if (hRaw.endsWith('grad')) hDeg = parseFloat(hRaw) * 0.9;
        else if (hRaw.endsWith('turn')) hDeg = parseFloat(hRaw) * 360;
        else hDeg = parseFloat(hRaw);
      }
      const hRad = (hDeg * Math.PI) / 180;
      const a = C * Math.cos(hRad);
      const b = C * Math.sin(hRad);
      const alpha = aRaw !== undefined ? parsePercentOrNumber(aRaw.trim(), 1) : undefined;
      return oklabToSrgb(L, a, b, alpha);
    },
  );

  // Convert oklab(L a b [/ alpha]) -> #rrggbb or rgba(...)
  out = out.replace(
    /oklab\(\s*([^\s/)]+)\s+([^\s/)]+)\s+([^\s/)]+)(?:\s*\/\s*([^)]+))?\s*\)/gi,
    (match, lRaw: string, aValRaw: string, bValRaw: string, alphaRaw?: string) => {
      if (lRaw.includes('var(') || aValRaw.includes('var(') || bValRaw.includes('var(')) {
        return match;
      }
      const L = parsePercentOrNumber(lRaw, 1);
      const a = parsePercentOrNumber(aValRaw, 0.4);
      const b = parsePercentOrNumber(bValRaw, 0.4);
      const alpha = alphaRaw !== undefined ? parsePercentOrNumber(alphaRaw.trim(), 1) : undefined;
      return oklabToSrgb(L, a, b, alpha);
    },
  );

  // Strip CSS Color 4 gradient interpolation spaces (e.g. "to right in oklab" -> "to right")
  // unsupported in Chrome < 111 (Windows 7 Chrome stops at v109).
  out = out.replace(
    /(--tw-gradient-position\s*:\s*[^;}]*?)\s+in\s+(?:oklab|oklch|lab|lch|srgb(?:-linear)?|hsl|hwb|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz(?:-d50|-d65)?)(?:\s+(?:shorter|longer|increasing|decreasing)\s+hue)?(?=\s*[;}])/gi,
    '$1',
  );
  out = out.replace(
    /((?:linear|radial|conic)-gradient\(\s*[^,)]*?)\s+in\s+(?:oklab|oklch|lab|lch|srgb(?:-linear)?|hsl|hwb|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz(?:-d50|-d65)?)(?:\s+(?:shorter|longer|increasing|decreasing)\s+hue)?(?=\s*,)/gi,
    '$1',
  );

  return out;
}

function chrome109CssCompat(): Plugin {
  let isServe = false;
  return {
    name: 'chrome109-css-compat',
    configResolved(config) {
      isServe = config.command === 'serve';
    },
    transform(code, id) {
      const cleanId = id.split('?', 2)[0];
      if (!cleanId.endsWith('.css')) return null;

      let css = code;
      // In dev mode @tailwindcss/vite skips optimize(), leaving CSS nesting and
      // color-mix(in srgb, oklch(...)) fallbacks unexpanded for Chrome 109.
      if (isServe && css.includes('tailwindcss')) {
        css = optimize(css, {minify: false}).code;
      }
      const compatCss = convertOklchAndOklabToSrgb(css);
      if (compatCss === code) return null;
      return {code: compatCss, map: null};
    },
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type === 'asset' && asset.fileName.endsWith('.css') && typeof asset.source === 'string') {
          asset.source = convertOklchAndOklabToSrgb(asset.source);
        }
      }
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), chrome109CssCompat()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: ['es2020', 'chrome100'],
      cssTarget: 'chrome100',
    },
    server: {
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

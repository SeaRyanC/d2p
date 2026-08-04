import { build } from 'esbuild';

await build({
    entryPoints: ['src/web/app.tsx'],
    bundle: true,
    outfile: 'dist/web/app.bundle.js',
    platform: 'browser',
    format: 'esm',
    target: ['es2022'],
    jsx: 'automatic',
    jsxImportSource: 'preact',
    sourcemap: 'inline',
});

const esbuild = require('esbuild');
const { execSync } = require('child_process');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const rootDir = __dirname;

async function main() {
  // Build extension
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    external: ['vscode'],
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    outfile: 'dist/extension.js',
    platform: 'node',
    target: 'node18',
    logLevel: 'info',
  });

  if (watch) {
    await ctx.watch();
    console.log('Watching extension for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }

  // Build Svelte webview
  if (!watch) {
    console.log('Building webview...');
    const configPath = path.join(rootDir, 'src', 'webview', 'ui', 'vite.config.ts');
    execSync(`npx vite build --config "${configPath}"`, {
      stdio: 'inherit',
      cwd: path.join(rootDir, 'src', 'webview', 'ui'),
      env: { ...process.env, NODE_OPTIONS: '' },
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import esbuild from 'esbuild';
import path from 'path';

// Build the CLI with the real-network obsidian shim (requestUrl -> global fetch).
await esbuild.build({
  entryPoints: ['cli/sync-cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  alias: { obsidian: path.resolve('test/mock/obsidian-real.ts') },
  outfile: 'cli/sync-cli.cjs',
  logLevel: 'info',
});
console.log('built cli/sync-cli.cjs');

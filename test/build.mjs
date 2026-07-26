import esbuild from 'esbuild';
import path from 'path';

await esbuild.build({
  entryPoints: ['test/run.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  alias: {
    obsidian: path.resolve('test/mock/obsidian.ts'),
  },
  external: [],
  outfile: 'test/out.cjs',
  logLevel: 'info',
});
console.log('built test/out.cjs');

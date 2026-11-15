import { cpSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const task = process.argv[2];
const cwd = process.cwd();

function check(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && !['node_modules', 'dist', 'coverage', 'data', 'artifacts'].includes(entry.name)) {
        check(path);
      }
    } else if (entry.isFile() && /\.(?:js|cjs|mjs)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status ?? 1);
    }
  }
}

if (task === 'check') {
  check(cwd);
} else if (task === 'clean' || task === 'build') {
  const dist = join(cwd, 'dist');
  rmSync(dist, { recursive: true, force: true });
  if (task === 'build') {
    cpSync(join(cwd, 'src'), dist, {
      recursive: true,
      filter: (path) => !path.split(/[\\/]/).includes('__tests__') && !/\.test\.[cm]?js$/.test(path),
    });
  }
} else {
  throw new Error('Expected build, clean, or check');
}


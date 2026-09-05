import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parentDir = path.resolve(__dirname, '..');

console.log('Running build in parent frontend directory:', parentDir);
execSync('npm run build', { cwd: parentDir, stdio: 'inherit' });

const srcDist = path.join(parentDir, 'dist');
const targetDist = path.join(__dirname, 'dist');

if (fs.existsSync(srcDist)) {
  fs.cpSync(srcDist, targetDist, { recursive: true });
  console.log('Synchronized build output to nested dist directory');
}

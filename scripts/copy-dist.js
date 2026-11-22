import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Ensure dist exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 1. Copy js/ -> dist/js/
copyDirRecursive(path.join(rootDir, 'js'), path.join(distDir, 'js'));

// 2. Copy css/ -> dist/css/
copyDirRecursive(path.join(rootDir, 'css'), path.join(distDir, 'css'));

// 3. Copy assets/ -> dist/assets/
copyDirRecursive(path.join(rootDir, 'assets'), path.join(distDir, 'assets'));

// 4. Netlify SPA Redirects
const redirectsContent = '/*    /index.html   200\n';
fs.writeFileSync(path.join(distDir, '_redirects'), redirectsContent);
fs.writeFileSync(path.join(rootDir, '_redirects'), redirectsContent);

// 5. Copy manifest.json -> dist/manifest.json
if (fs.existsSync(path.join(rootDir, 'manifest.json'))) {
  fs.copyFileSync(path.join(rootDir, 'manifest.json'), path.join(distDir, 'manifest.json'));
}

console.log('✓ Successfully copied all js, css, assets, and redirects to dist/');

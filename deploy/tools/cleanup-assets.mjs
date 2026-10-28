#!/usr/bin/env node
// Sprzątanie starych buildów w app.pfgfootball.com.
//
// Zostawia w /assets/ wszystko, do czego prowadzą aktualne strony index.html
// (także pośrednio: importy JS, dynamiczne importy, fonty z CSS), oraz pliki
// młodsze niż --keep-days (żeby karty otwarte na poprzedniej wersji mogły
// jeszcze doczytać swoje fragmenty). Resztę wypisuje — a z --delete usuwa.
//
// Użycie:
//   node cleanup-assets.mjs <public_html>                 # tylko raport
//   node cleanup-assets.mjs <public_html> --delete        # usuń
//   opcje: --keep-days N   (domyślnie 2; 0 = tylko pliki aktualnego buildu)
//          --legacy        także pozostałości sprzed PFG Coach Studio:
//                          /assets_old/, nieużywane pliki w /coach/ i /coach/*/icons/

import { readdirSync, readFileSync, statSync, rmSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith('--'));
const del = args.includes('--delete');
const legacy = args.includes('--legacy');
const kdIdx = args.indexOf('--keep-days');
const keepDays = kdIdx >= 0 ? Number(args[kdIdx + 1]) : 2;

if (!root || !existsSync(join(root, 'assets')) || !Number.isFinite(keepDays)) {
  console.error('Użycie: node cleanup-assets.mjs <public_html> [--delete] [--keep-days N] [--legacy]');
  process.exit(1);
}

const assetsDir = join(root, 'assets');
const SKIP_DIRS = new Set(['assets', 'assets_old', 'node_modules', '.git', '.well-known']);
const REF = /(?:\.\/|\/assets\/|assets\/)([A-Za-z0-9_.-]+\.(?:js|css|woff2?|png|webp|svg|jpe?g))/g;

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out);
    } else out.push(join(dir, e.name));
  }
  return out;
}

const refsIn = (text) => [...text.matchAll(REF)].map((m) => m[1]);

// 1. Punkty wejścia: wszystkie strony HTML poza /assets/.
const pages = walk(root).filter((f) => f.endsWith('.html'));
const keep = new Set();
const queue = [];
for (const p of pages) {
  for (const name of refsIn(readFileSync(p, 'utf8'))) {
    if (existsSync(join(assetsDir, name)) && !keep.has(name)) {
      keep.add(name);
      queue.push(name);
    }
  }
}

// 2. Zależności (importy, mapDeps, url() w CSS).
while (queue.length) {
  const name = queue.pop();
  if (!['.js', '.css'].includes(extname(name))) continue;
  for (const dep of refsIn(readFileSync(join(assetsDir, name), 'utf8'))) {
    if (existsSync(join(assetsDir, dep)) && !keep.has(dep)) {
      keep.add(dep);
      queue.push(dep);
    }
  }
}

// 3. Kandydaci do usunięcia w /assets/.
const cutoff = Date.now() - keepDays * 864e5;
const current = keep.size;
const remove = [];
let keptRecent = 0;
for (const name of readdirSync(assetsDir)) {
  if (name.startsWith('.') || keep.has(name)) continue;
  if (statSync(join(assetsDir, name)).mtimeMs >= cutoff) {
    keptRecent++;
    continue;
  }
  remove.push(join(assetsDir, name));
}

// 4. Pozostałości sprzed PFG Coach Studio.
if (legacy) {
  const old = join(root, 'assets_old');
  if (existsSync(old)) remove.push(old);

  // Pliki leżące bezpośrednio w /coach/ (dawna strona marketingowa), do których nic się nie odwołuje.
  const coach = join(root, 'coach');
  const allText = walk(root)
    .filter((f) => /\.(html|css|js|webmanifest)$/.test(f))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  const coachPages = walk(coach).filter((f) => f.endsWith('.html'));
  const coachText = coachPages.map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const e of readdirSync(coach, { withFileTypes: true })) {
    if (!e.isFile() || e.name.startsWith('.') || e.name === 'index.html') continue;
    const used = allText.includes('/coach/' + e.name) || coachText.includes(e.name);
    if (!used) remove.push(join(coach, e.name));
  }
  for (const app of ['tactics', 'training']) {
    const icons = join(coach, app, 'icons');
    if (existsSync(icons) && !allText.includes(`/coach/${app}/icons/`)) remove.push(icons);
  }
}

// 5. Raport / usuwanie.
const size = (p) => {
  const s = statSync(p);
  return s.isDirectory() ? readdirSync(p).reduce((a, n) => a + size(join(p, n)), 0) : s.size;
};
const total = remove.reduce((a, p) => a + size(p), 0);
console.log(`Strony HTML: ${pages.length}, pliki aktualnego buildu w /assets/: ${current}`);
console.log(`Zostawione jako młodsze niż ${keepDays} dni: ${keptRecent}`);
console.log(`${del ? 'Usuwam' : 'Do usunięcia'} (${remove.length}, ${(total / 1024).toFixed(0)} kB):`);
for (const p of remove) console.log('  ' + relative(root, p));
if (del) {
  for (const p of remove) rmSync(p, { recursive: true, force: true });
  console.log('Gotowe.');
} else if (remove.length) {
  console.log('\nTo był tylko raport. Uruchom ponownie z --delete, aby usunąć.');
}

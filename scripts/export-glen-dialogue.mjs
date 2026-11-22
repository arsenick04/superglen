import fs from 'node:fs';
import path from 'node:path';

const lines = new Map();
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.ts')) files.push(file);
  }
}
walk('src');
const sourceText = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
for (const line of JSON.parse(fs.readFileSync('audio/dialog.json', 'utf8'))) {
  if (line.speaker !== 'glen') continue;
  const used = sourceText.includes(`'${line.id}'`) || sourceText.includes(`"${line.id}"`);
  lines.set(line.id, { ...line, source: 'audio/dialog.json', status: used ? 'Dirujuk kode' : 'Katalog audio — perlu konfirmasi penggunaan' });
}
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\{[^{}]*\}/gs)) {
      const values = {};
      for (const property of match[0].matchAll(/\b(id|speaker|text)\s*:\s*(['"])((?:\\.|(?!\2).)*)\2/gs)) {
        values[property[1]] = property[3].replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
      }
      if (values.speaker === 'glen' && values.text) {
        const id = values.id ?? `${file}:${source.slice(0, match.index).split('\n').length}`;
        lines.set(id, { id, text: values.text, source: file, status: 'Deklarasi dialog dalam kode' });
      }
  }
}
const entries = [...lines.values()].sort((a, b) => a.id.localeCompare(b.id));
const text = ['NASKAH REKAMAN GLEN / SUPERGLEN', 'Baca kalimatnya saja. Nama file rekaman sebaiknya sama dengan ID.', 'Jeda 1–2 detik sebelum dan sesudah kalimat; boleh 2 versi ekspresi.', 'Catatan: inventaris deklarasi, bukan urutan pemutaran. Baris katalog yang tidak dirujuk kode dipisahkan di akhir; dialog sinematik/video tidak tercakup.', ''];
for (const catalog of [false, true]) {
  text.push(catalog ? '\nKATALOG LAMA — KONFIRMASI SEBELUM MEREKAM' : 'DIALOG DARI KODE / ID YANG DIRUJUK');
  for (const line of entries.filter(line => line.status.startsWith('Katalog') === catalog)) text.push(`\n[${line.id}]`, line.text, `Sumber: ${line.source}`);
}
fs.mkdirSync('public/recording', { recursive: true });
fs.writeFileSync('public/recording/glen-dialogue.txt', text.join('\n') + '\n');
fs.writeFileSync('public/recording/glen-dialogue.json', JSON.stringify(entries, null, 2) + '\n');
console.log(`Exported ${entries.length} Glen lines`);

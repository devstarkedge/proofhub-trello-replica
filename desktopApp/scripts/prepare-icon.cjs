const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.whenReady().then(() => {
  const root = path.join(__dirname, '..');
  const icon = nativeImage.createFromPath(path.join(root, 'public/Fav.png'));
  if (icon.isEmpty()) throw new Error('Could not read public/Fav.png');
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  // Builder requires a larger source than the existing 42px favicon.
  fs.writeFileSync(path.join(root, 'build/Fav.png'), icon.resize({ width: 512, height: 512, quality: 'best' }).toPNG());
  const png = icon.resize({ width: 256, height: 256, quality: 'best' }).toPNG();
  const ico = Buffer.alloc(22);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(1, 4);
  ico.writeUInt16LE(1, 10);
  ico.writeUInt16LE(32, 12);
  ico.writeUInt32LE(png.length, 14);
  ico.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(root, 'build/Fav.ico'), Buffer.concat([ico, png]));
  const macPNG = icon.resize({ width: 512, height: 512, quality: 'best' }).toPNG();
  const icns = Buffer.alloc(16);
  icns.write('icns', 0);
  icns.writeUInt32BE(16 + macPNG.length, 4);
  icns.write('ic09', 8);
  icns.writeUInt32BE(8 + macPNG.length, 12);
  fs.writeFileSync(path.join(root, 'build/Fav.icns'), Buffer.concat([icns, macPNG]));
  app.exit(0);
}).catch((error) => { console.error(error); app.exit(1); });

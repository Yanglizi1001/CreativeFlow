const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const desktopPackagePath = path.join(root, 'package-desktop', 'package.json');
const desktopPackage = JSON.parse(fs.readFileSync(desktopPackagePath, 'utf8'));
desktopPackage.version = rootPackage.version;
fs.writeFileSync(desktopPackagePath, `${JSON.stringify(desktopPackage, null, 2)}\n`);

for (const folder of ['dist', 'electron']) {
  const destination = path.join(root, 'package-desktop', folder);
  const allowedRoot = path.resolve(root, 'package-desktop') + path.sep;
  if (!path.resolve(destination).startsWith(allowedRoot)) throw new Error('Unsafe packaging destination');
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(path.join(root, folder), destination, { recursive: true });
}

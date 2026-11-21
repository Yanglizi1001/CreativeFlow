const fs = require('fs');
const path = require('path');
const {layout,absolute}=require('./project-paths.cjs');

const root = path.join(__dirname, '..');
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const desktopPackagePath = absolute('desktopStaging','package.json');
const desktopPackage = JSON.parse(fs.readFileSync(desktopPackagePath, 'utf8'));
desktopPackage.version = rootPackage.version;
desktopPackage.build.fileAssociations=rootPackage.build.fileAssociations;
desktopPackage.build.files=['dist/**/*','electron/**/*','host-manager/electron/**/*','host-manager/dist/**/*','package.json'];
desktopPackage.build.extraResources=[{from:'../../host-manager/resources',to:'collaboration-host'}];
desktopPackage.build.nsis.include='electron/unified-installer.nsh';
desktopPackage.build.electronDist=path.relative(absolute('desktopStaging'),path.join(root,'node_modules/electron/dist')).replaceAll('\\','/');
desktopPackage.build.directories.output=path.relative(absolute('desktopStaging'),absolute('buildRoot','client')).replaceAll('\\','/');
delete desktopPackage.build.asarUnpack;
fs.writeFileSync(desktopPackagePath, `${JSON.stringify(desktopPackage, null, 2)}\n`);

for (const folder of ['dist', 'electron', 'host-manager/electron', 'host-manager/dist']) {
  const destination = absolute('desktopStaging',folder);
  const allowedRoot = absolute('desktopStaging') + path.sep;
  if (!path.resolve(destination).startsWith(allowedRoot)) throw new Error('Unsafe packaging destination');
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(path.join(root, folder), destination, { recursive: true });
}

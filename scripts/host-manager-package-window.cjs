const {app}=require('electron'),path=require('node:path'),os=require('node:os');
const profile=path.resolve(process.env.CF_MANAGER_PACKAGE_PROFILE||'');
if(!profile.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(profile).startsWith('creativeflow-manager-package-'))throw Error('Isolated profile required');
app.setPath('userData',profile);app.setPath('crashDumps',path.join(profile,'crashes'));
app.whenReady().then(()=>require(process.env.CF_MANAGER_ASAR?path.join(process.env.CF_MANAGER_ASAR,'electron/main.cjs'):require('./project-paths.cjs').absolute('buildRoot', 'manager/win-unpacked/resources/app.asar/electron/main.cjs')).start());app.on('window-all-closed',()=>app.quit());

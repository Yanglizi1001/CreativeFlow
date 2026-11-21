const {app}=require('electron'),path=require('node:path');
const Manager=require('../host-manager/electron/main.cjs');
function managerResources(){return app.isPackaged?path.join(process.resourcesPath,'collaboration-host'):path.join(__dirname,'../host-manager/resources');}
function managerExecutable(){return process.env.PORTABLE_EXECUTABLE_FILE||app.getPath('exe');}
function developmentEntry(){return app.isPackaged?undefined:path.join(__dirname,'main.cjs');}
module.exports={Manager,managerResources,managerExecutable,developmentEntry};

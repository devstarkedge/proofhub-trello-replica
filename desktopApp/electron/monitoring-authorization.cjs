const fs=require('node:fs');
const path=require('node:path');
const {randomBytes}=require('node:crypto');

// Main process only. Neither the preload bridge nor renderer receives this
// credential. The server stores its hash, scoped to the registered device.
function noticeAuthorization(root,safeStorage){
  if(!safeStorage.isEncryptionAvailable()||safeStorage.getSelectedStorageBackend?.()==='basic_text')throw new Error('Secure device authorization storage is unavailable. Desktop monitoring cannot be approved on this device.');
  const file=path.join(root,'notice-authorization');
  if(fs.existsSync(file)){
    const value=safeStorage.decryptString(fs.readFileSync(file));
    if(!/^[a-f\d]{64}$/.test(value))throw new Error('Device authorization could not be recovered. Revoke this device before registering it again.');
    return value;
  }
  const value=randomBytes(32).toString('hex');
  try{fs.writeFileSync(file,safeStorage.encryptString(value),{flag:'wx',mode:0o600});}
  catch(error){if(error.code!=='EEXIST')throw error;return noticeAuthorization(root,safeStorage);}
  return value;
}
module.exports={noticeAuthorization};

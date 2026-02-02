export const isModuleAccessGranted = ({ previousAccess, nextAccess }) => {
  return previousAccess === false && nextAccess === true;
};

export const shouldNotifyOnModuleGrant = ({ previousAccess, nextAccess }) => {
  return isModuleAccessGranted({ previousAccess, nextAccess });
};

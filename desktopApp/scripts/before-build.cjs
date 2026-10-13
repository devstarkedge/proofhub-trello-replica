// All renderer dependencies are compiled into dist; the Electron main process
// needs only built-ins. Returning false also disables automatic node_modules
// collection, which otherwise searches the parent frontend package.
module.exports = async () => false;

export const canConfigureWorkspace = workspace => workspace?.role === 'admin' || workspace?.isOwner === true;

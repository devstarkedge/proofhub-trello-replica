import Board from '../../models/Board.js';
import ProjectDropdownOption from '../../models/ProjectDropdownOption.js';
import { digest, payloadFor, sourceHash, technologyIds, SyncError } from './domain.js';
import { technologyValues } from './contactProperties.js';

export async function clientSnapshot(board, workspaceId) {
  const identity = payloadFor(board);
  const others = await Board.find({ workspaceId, projectType: 'Hired Client', isDeleted: { $ne: true },
    $or: [{ 'hubspotSync.clientKey': board.hubspotSync.clientKey }, { 'hubspotSync.emailHash': digest(identity.email) }],
  }).select('clientDetails technologies hubspotSync').lean();
  if (!others.some(item => String(item._id) === String(board._id))) others.push(board);
  for (const project of others) {
    if (digest(payloadFor(project)) !== digest(identity)) {
      throw new SyncError('CLIENT_CONFLICT', 'Eligible projects sharing this client must agree on client details.', { permanent: true });
    }
  }
  const ids = [...new Set(others.flatMap(technologyIds))].sort();
  const options = await ProjectDropdownOption.find({ workspaceId, _id: { $in: ids }, type: 'technology' }).select('value label').lean();
  if (options.length !== ids.length) throw new SyncError('INVALID_TECHNOLOGY', 'A project technology is missing or belongs to another workspace.', { permanent: true });
  return { identity, options,
    fingerprint: digest(others.map(item => [String(item._id), sourceHash(item)]).sort((a, b) => a[0].localeCompare(b[0]))) };
}
export async function enrichPayload(snapshot, connection, api) {
  let technology;
  try {
    technology = await api.getProperty('technology');
  } catch (error) {
    if (error.status === 404) throw new SyncError('PROPERTY_SETUP_REQUIRED', 'The HubSpot contact property technology must be available.', { permanent: true });
    if (error.status === 403) throw new SyncError('PROPERTY_ACCESS_REQUIRED', 'The Service Key cannot read contact property definitions. Check its contact/schema read permissions in HubSpot.', { permanent: true, status: 403 });
    throw error;
  }
  if (connection.contactOwnerId) await api.validateOwner(connection.contactOwnerId);
  return { ...snapshot.identity, technology: technologyValues(snapshot.options, technology),
    ...(connection.contactOwnerId ? { hubspot_owner_id: connection.contactOwnerId } : {}) };
}

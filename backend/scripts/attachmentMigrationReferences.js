import mongoose from 'mongoose';

const parentFields = { card: 'cards', subtask: 'subtasks', nanoSubtask: 'subtasknanos', comment: 'comments' };
const contextFields = { card: 'card', subtask: 'subtask', subtaskNano: 'nanoSubtask', nanoSubtask: 'nanoSubtask', board: 'board' };
const same = (a, b) => String(a) === String(b);
function missingParent(message, code = 'ATTACHMENT_PARENT_MISSING') {
  const error = new Error(message); error.code = code; return error;
}
function objectId(value, label) {
  if (!value) throw missingParent(`${label} is missing`, 'ATTACHMENT_PARENT_UNLINKED');
  if (!/^[a-f\d]{24}$/i.test(String(value))) throw new Error(`${label} is not a valid ID`);
  return new mongoose.Types.ObjectId(String(value));
}

/** Announcements have their own embedded-file delivery policy. A legacy
 * attachment is outside this project migration only when its actual owning
 * announcement and workspace exist and no project relationships are present. */
export async function isAnnouncementAttachment(asset, db = mongoose.connection.db) {
  if (asset.contextType !== 'announcement') return false;
  if (['board', 'card', 'subtask', 'nanoSubtask', 'comment'].some(field => asset[field])) throw new Error('Announcement attachment also has project references; review its ownership');
  const announcement = await db.collection('announcements').findOne({ _id: objectId(asset.contextRef, 'Announcement context') });
  if (!announcement) throw missingParent('Referenced announcement does not exist; review this orphan before migration', 'ANNOUNCEMENT_PARENT_MISSING');
  const workspaceId = objectId(asset.workspaceId, 'Announcement attachment workspace');
  if (!announcement.workspaceId || !same(workspaceId, announcement.workspaceId)) throw new Error('Announcement attachment workspace conflicts with its parent');
  if (!await db.collection('workspaces').findOne({ _id: workspaceId })) throw new Error('Announcement workspace does not exist');
  return true;
}

/** Resolve only actual parent relationships. Never infer tenancy from the
 * uploader, the selected workspace, a file name, or a cloud folder name. */
export async function resolveAttachmentParents(asset, db = mongoose.connection.db) {
  const references = { ...asset };
  const projects = [], cards = [];
  const load = async (collection, value) => {
    const row = await db.collection(collection).findOne({ _id: objectId(value, `${collection} reference`) });
    if (!row) throw missingParent(`Referenced ${collection} record ${value} does not exist; review this orphan before migration`);
    return row;
  };
  const parent = async (collection, value, chain = new Set()) => {
    const key = `${collection}:${value}`;
    if (chain.has(key)) throw new Error('Parent relationships contain a cycle');
    const next = new Set(chain).add(key), row = await load(collection, value);
    let project;
    if (collection === 'boards') {
      objectId(row.workspaceId, 'Project workspace');
      await load('workspaces', row.workspaceId);
      project = row;
    } else if (collection === 'cards') {
      project = await parent('boards', row.board, next); cards.push(row._id);
    } else if (collection === 'subtasks') {
      project = await parent('cards', row.task, next);
    } else if (collection === 'subtasknanos') {
      project = await parent('subtasks', row.subtask, next);
      const taskProject = await parent('cards', row.task, next);
      if (!same(project._id, taskProject._id)) throw new Error('Nano and task reference different projects');
    } else if (collection === 'comments') {
      project = await parent('cards', row.card, next);
      for (const [field, name] of [['subtask', 'subtasks'], ['subtaskNano', 'subtasknanos']]) if (row[field]) {
        const nested = await parent(name, row[field], next);
        if (!same(project._id, nested._id)) throw new Error('Comment and task reference different projects');
      }
    }
    if (collection !== 'boards' && (!row.workspaceId || !same(row.workspaceId, project.workspaceId))) throw new Error(`Referenced ${collection} record ${row._id} has a missing or conflicting workspace; reconcile the parent first`);
    if (collection !== 'boards' && row.board && !same(row.board, project._id)) throw new Error('Parent hierarchy references different projects');
    return project;
  };

  if (asset.contextRef) {
    let field = contextFields[asset.contextType];
    if (['description', 'comment'].includes(asset.contextType)) {
      const matches = [];
      for (const [candidate, collection] of Object.entries(parentFields)) {
        if (await db.collection(collection).findOne({ _id: objectId(asset.contextRef, 'Context reference') })) matches.push(candidate);
      }
      if (!matches.length) throw missingParent('Context reference has no unique existing parent; review its mapping', 'ATTACHMENT_CONTEXT_MISSING');
      if (matches.length !== 1) throw new Error('Context reference has no unique existing parent; review its mapping');
      [field] = matches;
    }
    if (!field) throw new Error('Context type has no supported project parent');
    if (references[field] && !same(references[field], asset.contextRef)) throw new Error('Context and explicit parent references conflict');
    references[field] = objectId(asset.contextRef, 'Context reference');
  }
  if (references.board) projects.push(await parent('boards', references.board));
  for (const [field, collection] of Object.entries(parentFields)) if (references[field]) projects.push(await parent(collection, references[field]));
  if (asset.contextType !== 'board' && !Object.keys(parentFields).some(field => references[field])) throw missingParent('No existing project/task parent can establish ownership; a reviewed mapping is required', 'ATTACHMENT_PARENT_UNLINKED');
  if (!projects.length) throw missingParent('No existing project/task parent can establish ownership; a reviewed mapping is required', 'ATTACHMENT_PARENT_UNLINKED');
  const project = projects[0];
  if (projects.some(row => !same(row._id, project._id) || !same(row.workspaceId, project.workspaceId))) throw new Error('Attachment references conflict across projects or workspaces');
  if (new Set(cards.map(String)).size > 1) throw new Error('Attachment references different root tasks');
  if (asset.workspaceId && !same(asset.workspaceId, project.workspaceId)) throw new Error('Attachment workspace conflicts with its verified parent');

  const patch = { workspaceId: project.workspaceId, board: project._id };
  for (const field of Object.keys(parentFields)) if (references[field] && !asset[field]) patch[field] = references[field];
  if (!asset.contextRef || !asset.contextType) {
    const field = ['comment', 'nanoSubtask', 'subtask', 'card', 'board'].find(key => references[key]);
    patch.contextRef = references[field]; patch.contextType = field;
  }
  return patch;
}

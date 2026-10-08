import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preMigrationReport, reportMarkdown } from '../authz/preMigrationReport.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(backendDir, '.env') });
const collections = {
  users: ['users', { email: 1, role: 1, roleId: 1, department: 1, team: 1, accessType: 1, allowedProjects: 1 }],
  workspaces: ['workspaces', { owner: 1 }],
  memberships: ['workspacememberships', { workspace: 1, user: 1, status: 1, kind: 1, role: 1, roleId: 1, department: 1, departments: 1, team: 1, accessType: 1, allowedProjects: 1, restriction: 1 }],
  roles: ['roles', { workspaceId: 1, name: 1, slug: 1, isSystem: 1, permissions: 1 }],
  invitations: ['workspaceinvitations', { workspace: 1, email: 1, role: 1, acceptedBy: 1 }],
  joinRequests: ['workspacejoinrequests', { workspace: 1, user: 1, requestedRole: 1 }],
  overrides: ['accessoverrides', { workspace: 1, user: 1, resource: 1, effect: 1, actions: 1, scope: 1, scopedResourceIds: 1, expiresAt: 1, isActive: 1 }],
  userPermissions: ['userpermissions', { workspaceId: 1, user: 1, pageKey: 1, hasAccess: 1 }],
  salesPermissions: ['salespermissions', { workspaceId: 1, user: 1, moduleVisible: 1, permissions: 1 }],
  boards: ['boards', { workspaceId: 1, visibility: 1, department: 1 }],
  departments: ['departments', { workspaceId: 1, members: 1, managers: 1 }],
  schedules: ['analyticsreportschedules', { workspaceId: 1, createdBy: 1, recipients: 1, active: 1 }],
  cards: ['cards', { workspaceId: 1, board: 1 }],
  lists: ['lists', { workspaceId: 1, board: 1 }],
  subtasks: ['subtasks', { workspaceId: 1, board: 1, task: 1 }],
  nanos: ['subtasknanos', { workspaceId: 1, board: 1, task: 1 }],
  comments: ['comments', { workspaceId: 1, card: 1, contextType: 1, contextRef: 1 }],
  announcements: ['announcements', { workspaceId: 1, 'subscribers.users': 1 }],
  notifications: ['notifications', { workspaceId: 1, user: 1, entityType: 1, entityId: 1, relatedBoard: 1, projectId: 1 }]
};
const uri = process.env.AUTHZ_REPORT_MONGO_URI || process.env.MONGO_URI;
if (!uri) throw new Error('Set AUTHZ_REPORT_MONGO_URI or MONGO_URI for the read-only report');
const client = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: 3, appName: 'FlowTaskAuthzReadOnlyReport' });
try {
  await client.connect();
  const db = client.db();
  // Native driver intentionally bypasses Mongoose: no model initialization,
  // automatic index creation, application startup or boot-time migrations.
  const data = Object.fromEntries(await Promise.all(Object.entries(collections).map(async ([key,[name,projection]]) => [key, await db.collection(name).find({}, { projection }).toArray()])));
  const report = preMigrationReport(data);
  const directory = path.join(backendDir, '..', 'reports');
  await fs.mkdir(directory, { recursive: true });
  const base = `authz-premigration-${report.generatedAt.replace(/[:.]/g,'-')}`;
  await fs.writeFile(path.join(directory,`${base}.json`), JSON.stringify(report,null,2) + '\n');
  await fs.writeFile(path.join(directory,`${base}.md`), reportMarkdown(report));
  console.log(`Read-only report saved: reports/${base}.md and .json`);
  console.log(`Incident indicators: ${report.possibleIncident ? 'FOUND - STOP and review evidence' : 'none detected'}; memberships: ${data.memberships.length}; workspaces: ${data.workspaces.length}`);
  if (report.possibleIncident) process.exitCode = 2;
} catch (error) {
  // Driver errors can contain host names. Never print the connection URI,
  // credentials or an environment dump.
  console.error(`Read-only report failed (${error.name || 'Error'}). No database records were changed.`);
  process.exitCode = 1;
} finally { await client.close(); }

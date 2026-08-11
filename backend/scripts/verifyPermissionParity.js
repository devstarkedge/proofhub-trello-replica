/**
 * Permission Parity Verification
 *
 * Compares the OLD per-model resolution (SalesPermission, UserPermission)
 * against the NEW engine resolution (AccessOverride via
 * modules/permissions/permissionEngine.js) for every user, and reports any
 * mismatch. Run this after the migration (and again before removing the
 * legacy write paths for good) to prove no user's effective access changed.
 *
 *   node backend/scripts/verifyPermissionParity.js
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import User from '../models/User.js';
import SalesPermission from '../models/SalesPermission.js';
import UserPermission, { FINANCE_PAGE_KEY, serializePagePermission } from '../models/UserPermission.js';
import { resolveResourceAccess } from '../modules/permissions/permissionEngine.js';
import { toLegacyShape } from '../config/permissionRegistry.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { ensureDefaultWorkspace } from '../modules/permissions/workspaceService.js';

export async function verifyPermissionParity() {
  return workspaceContext.runUnscoped(() => verifyPermissionParityUnscoped());
}

async function verifyPermissionParityUnscoped() {
  const workspaceId = await ensureDefaultWorkspace();
  const users = await User.find({}).select('role accessType allowedProjects name email').lean();
  const mismatches = [];

  for (const user of users) {
    const oldSales = user.role === 'admin'
      ? { moduleVisible: true, canCreate: true, canUpdate: true, canDelete: true, canExport: true, canImport: true, canManageDropdowns: true, canViewActivityLog: true }
      : await SalesPermission.getUserPermissions(user._id);
    const newSalesResult = await resolveResourceAccess(user, 'sales', workspaceId);
    const newSales = toLegacyShape('sales', newSalesResult.actions);

    for (const field of ['moduleVisible', 'canCreate', 'canUpdate', 'canDelete', 'canExport', 'canImport', 'canManageDropdowns', 'canViewActivityLog']) {
      if (Boolean(oldSales[field]) !== Boolean(newSales[field])) {
        mismatches.push({ userId: user._id, email: user.email, resource: 'sales', field, old: Boolean(oldSales[field]), new: Boolean(newSales[field]) });
      }
    }

    const financePerm = await UserPermission.findOne({ user: user._id, pageKey: FINANCE_PAGE_KEY }).lean();
    const oldFinance = serializePagePermission(financePerm, user.role, FINANCE_PAGE_KEY);
    const newFinanceResult = await resolveResourceAccess(user, 'finance', workspaceId);
    const newFinance = toLegacyShape('finance', newFinanceResult.actions);

    for (const field of ['hasAccess', 'revenueAnalytics', 'billingDetails']) {
      if (Boolean(oldFinance[field]) !== Boolean(newFinance[field])) {
        mismatches.push({ userId: user._id, email: user.email, resource: 'finance', field, old: Boolean(oldFinance[field]), new: Boolean(newFinance[field]) });
      }
    }
  }

  return { totalUsers: users.length, mismatchCount: mismatches.length, mismatches };
}

export default verifyPermissionParity;

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: No MONGO_URI/MONGODB_URI environment variable found.');
    process.exit(1);
  }
  mongoose.connect(mongoUri)
    .then(async () => {
      console.log('Connected to MongoDB.');
      const result = await verifyPermissionParity();
      console.log(`Checked ${result.totalUsers} users, found ${result.mismatchCount} mismatch(es).`);
      if (result.mismatchCount > 0) {
        console.table(result.mismatches);
      }
      await mongoose.disconnect();
      process.exit(result.mismatchCount > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Verification failed:', err);
      process.exit(1);
    });
}

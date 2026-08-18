/**
 * Grant (or revoke) Super Admin platform access for one user, by email.
 * Standalone CLI — for adding a Super Admin after initial deploy without a
 * redeploy/restart (the SUPER_ADMIN_EMAILS env-var bootstrap in utils/seed.js
 * only runs at server boot).
 *
 *   node backend/scripts/grantSuperAdmin.js <email>            # grant
 *   node backend/scripts/grantSuperAdmin.js <email> --revoke   # revoke
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import User from '../models/User.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { recordSuperAdminAuditLog } from '../modules/superAdmin/superAdminAuditService.js';

export async function grantSuperAdmin(email, { revoke = false } = {}) {
  return workspaceContext.runUnscoped(async () => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('An email address is required.');
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      throw new Error(`No user found with email "${normalizedEmail}".`);
    }

    if (revoke) {
      user.isSuperAdmin = false;
      user.superAdminGrantedAt = null;
      user.superAdminGrantedBy = null;
      await user.save();
      await recordSuperAdminAuditLog({
        actor: null,
        action: 'SUPER_ADMIN_ACCESS_REVOKED',
        targetType: 'User',
        targetId: user._id,
        targetName: user.name,
        targetEmail: user.email,
        summary: `Revoked Super Admin access from ${user.email} via grantSuperAdmin.js --revoke`,
        changeDetails: [
          { label: 'Super Admin Access', previous: 'Active / Granted', next: 'Revoked' }
        ]
      });
      return { email: user.email, isSuperAdmin: false };
    }

    user.isSuperAdmin = true;
    user.superAdminGrantedAt = new Date();
    user.superAdminGrantedBy = 'script:grantSuperAdmin.js';
    await user.save();
    await recordSuperAdminAuditLog({
      actor: null,
      action: 'SUPER_ADMIN_ACCESS_GRANTED',
      targetType: 'User',
      targetId: user._id,
      targetName: user.name,
      targetEmail: user.email,
      summary: `Granted Super Admin access to ${user.email} via grantSuperAdmin.js`,
      changeDetails: [
        { label: 'Super Admin Access', previous: 'Standard User', next: 'Active / Granted' }
      ]
    });
    return { email: user.email, isSuperAdmin: true };
  });
}

// Allow standalone execution: node backend/scripts/grantSuperAdmin.js <email> [--revoke]
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const revoke = args.includes('--revoke');
  const email = args.find((a) => !a.startsWith('--'));

  if (!email) {
    console.error('Usage: node backend/scripts/grantSuperAdmin.js <email> [--revoke]');
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: No MONGO_URI/MONGODB_URI environment variable found.');
    process.exit(1);
  }

  mongoose.connect(mongoUri)
    .then(async () => {
      console.log('Connected to MongoDB.');
      const result = await grantSuperAdmin(email, { revoke });
      console.log(revoke
        ? `Revoked Super Admin access from ${result.email}.`
        : `Granted Super Admin access to ${result.email}.`);
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('grantSuperAdmin failed:', err.message);
      process.exit(1);
    });
}

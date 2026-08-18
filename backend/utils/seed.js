import User from "../models/User.js";
import Role from "../models/Role.js";
import Plan from "../models/Plan.js";
import PlatformBootstrap from "../models/PlatformBootstrap.js";
import dotenv from "dotenv";
import * as workspaceContext from "../modules/workspaces/workspaceContext.js";
import { recordSuperAdminAuditLog } from "../modules/superAdmin/superAdminAuditService.js";

const SUPER_ADMIN_BOOTSTRAP_KEY = "SUPER_ADMIN_INITIALIZED";

dotenv.config();

/**
 * Seed default system roles
 */
const seedRoles = async () => workspaceContext.runUnscoped(async () => {
  try {
    const systemRoles = [
      {
        name: 'Admin',
        slug: 'admin',
        description: 'Full system access with all permissions',
        permissions: {
          canCreateDepartment: true,
          canCreateTask: true,
          canCreateProject: true,
          canCreateAnnouncement: true,
          canCreateReminder: true,
          canAssignMembers: true,
          canDeleteTasks: true,
          canDeleteProjects: true,
          canInviteMembers: true,
          canApproveJoinRequests: true
        },
        isSystem: true
      },
      {
        name: 'Manager',
        slug: 'manager',
        description: 'Can manage projects, tasks, and team members',
        permissions: {
          canCreateDepartment: false,
          canCreateTask: true,
          canCreateProject: true,
          canCreateAnnouncement: true,
          canCreateReminder: true,
          canAssignMembers: true,
          canDeleteTasks: true,
          canDeleteProjects: true,
          canInviteMembers: false,
          canApproveJoinRequests: false
        },
        isSystem: true
      },
      {
        name: 'HR',
        slug: 'hr',
        description: 'Human resources with department and announcement access',
        permissions: {
          canCreateDepartment: true,
          canCreateTask: true,
          canCreateProject: false,
          canCreateAnnouncement: true,
          canCreateReminder: true,
          canAssignMembers: true,
          canDeleteTasks: false,
          canDeleteProjects: false,
          canInviteMembers: true,
          canApproveJoinRequests: true
        },
        isSystem: true
      },
      {
        name: 'Employee',
        slug: 'employee',
        description: 'Standard employee with basic task access',
        permissions: {
          canCreateDepartment: false,
          canCreateTask: true,
          canCreateProject: false,
          canCreateAnnouncement: false,
          canCreateReminder: true,
          canAssignMembers: false,
          canDeleteTasks: false,
          canDeleteProjects: false,
          canInviteMembers: false,
          canApproveJoinRequests: false
        },
        isSystem: true
      }
    ];

    let createdCount = 0;
    let existingCount = 0;

    for (const roleData of systemRoles) {
      const existingRole = await Role.findOne({ slug: roleData.slug, workspaceId: null });
      if (!existingRole) {
        await Role.create(roleData);
        createdCount++;
        console.log(`Created system role: ${roleData.name}`);
      } else {
        existingCount++;
      }
    }

    if (createdCount > 0) {
      console.log(`Successfully seeded ${createdCount} system role(s).`);
    }
    if (existingCount > 0) {
      console.log(`${existingCount} system role(s) already exist.`);
    }
  } catch (error) {
    console.error("Error seeding roles:", error);
  }
});

const seedAdmin = async () => {
  try {
    const adminExists = await User.findOne({ role: "admin" });

    if (!adminExists) {
      const email = process.env.ADMIN_EMAIL || "dev@starkedge.com";
      const password = process.env.ADMIN_PASSWORD || "Admin@1234";
      const name = "Admin User";

      if (
        password.length < 8 ||
        !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(
          password
        )
      ) {
        console.error(
          "Error: The admin password does not meet the security requirements (minimum 8 characters, at least one uppercase letter, one lowercase letter, one number, and one special character). Please set a compliant ADMIN_PASSWORD in your .env file."
        );
        // Exiting process if the default/provided password is not strong enough.
        // This is a security measure to prevent seeding a weak default admin.
        process.exit(1);
      }

      const adminUser = new User({
        name,
        email,
        password,
        role: "admin",
        isVerified: true, // Admin user is verified by default
        forcePasswordChange: true, // Force password change on first login
      });

      await adminUser.save();
      console.log("Default admin user created successfully.");
      console.log(`Email: ${email}`);
      console.log(`Password: ${password}`);
      console.log(
        "IMPORTANT: Please change this default password immediately after your first login."
      );
    } else {
      console.log("Admin user already exists. Skipping seed.");
    }
    
    // Always seed roles
    await seedRoles();
  } catch (error) {
    console.error("Error seeding admin user:", error);
    process.exit(1);
  }
};

/**
 * Seed the platform Plan catalog (Super Admin Dashboard). Idempotent — same
 * findOne-by-slug-skip-if-exists pattern as seedRoles() above. No payment
 * gateway is integrated; this is a real, persisted tier catalog a Super
 * Admin manually assigns workspaces to (see modules/superAdmin/subscriptionService.js).
 */
export const seedPlans = async () => {
  try {
    const plans = [
      {
        name: 'Free', slug: 'free', description: 'For small teams getting started',
        memberLimit: 5, storageLimitBytes: 1 * 1024 * 1024 * 1024, projectLimit: 3,
        priceCents: 0, isDefault: true, sortOrder: 0
      },
      {
        name: 'Pro', slug: 'pro', description: 'For growing teams',
        memberLimit: 25, storageLimitBytes: 25 * 1024 * 1024 * 1024, projectLimit: 25,
        priceCents: 1900, sortOrder: 1
      },
      {
        name: 'Business', slug: 'business', description: 'For scaling organizations',
        memberLimit: 100, storageLimitBytes: 100 * 1024 * 1024 * 1024, projectLimit: null,
        priceCents: 4900, sortOrder: 2
      },
      {
        name: 'Enterprise', slug: 'enterprise', description: 'Unlimited scale with custom terms',
        memberLimit: null, storageLimitBytes: null, projectLimit: null,
        priceCents: 0, isCustomPricing: true, sortOrder: 3
      },
      {
        // Backfill-only tier for pre-existing workspaces (see
        // scripts/migrateWorkspaceSubscriptions.js) — never assignable to a
        // newly created workspace, since a workspace that already had, say,
        // 40 members never agreed to Free's 5-member cap.
        name: 'Legacy', slug: 'legacy', description: 'Grandfathered — unlimited, not assignable to new workspaces',
        memberLimit: null, storageLimitBytes: null, projectLimit: null,
        priceCents: 0, isAssignableToNew: false, sortOrder: 99
      }
    ];

    let createdCount = 0;
    for (const planData of plans) {
      const existing = await Plan.findOne({ slug: planData.slug });
      if (!existing) {
        await Plan.create(planData);
        createdCount++;
        console.log(`Created plan: ${planData.name}`);
      }
    }
    if (createdCount > 0) {
      console.log(`Successfully seeded ${createdCount} plan(s).`);
    }
  } catch (error) {
    console.error("Error seeding plans:", error);
  }
};

/**
 * One-time Super Admin bootstrap — creates (or converges) the very first
 * platform administrator account. This is now the ONLY code path that can
 * grant the isSuperAdmin role automatically; SUPER_ADMIN_EMAILS is
 * deliberately NOT used here (see requireSuperAdmin.js) — granting the role
 * "solely by manipulating .env" is exactly the anti-pattern this replaces.
 * After the first successful run, adding more Super Admins is always an
 * explicit, human-triggered action (scripts/grantSuperAdmin.js), never
 * automatic.
 *
 * Guarded by a persistent PlatformBootstrap marker, not by the presence of
 * this seed file or by "does any isSuperAdmin:true user already exist" (the
 * latter breaks the moment a second admin is granted via the script).
 *
 * Idempotent and safely re-runnable:
 *  - Marker already exists → no-op, logs and returns.
 *  - No SUPER_ADMIN_BOOTSTRAP_EMAIL/PASSWORD configured yet → warns and
 *    returns WITHOUT writing the marker, so it retries on every future boot
 *    until an operator configures them.
 *  - User doesn't exist yet → created fresh with the configured password.
 *  - User already exists (e.g. created through the normal signup flow
 *    before this bootstrap ran, which is exactly how this account came to
 *    exist the first time) → password and role are converged to the
 *    configured values ONCE, in this single allowed window before the
 *    marker is written; every run after that leaves the account alone.
 *
 * Never logs the password itself.
 */
export const bootstrapSuperAdmin = async () => {
  try {
    const alreadyDone = await PlatformBootstrap.findOne({ key: SUPER_ADMIN_BOOTSTRAP_KEY });
    if (alreadyDone) {
      console.log("Super Admin bootstrap already completed. Skipping.");
      return;
    }

    const email = (process.env.SUPER_ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
    const password = process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD || '';

    if (!email || !password) {
      console.warn(
        "Super Admin bootstrap skipped: set SUPER_ADMIN_BOOTSTRAP_EMAIL and " +
        "SUPER_ADMIN_BOOTSTRAP_PASSWORD to create the initial platform administrator. " +
        "This check will run again on next boot until both are configured."
      );
      return;
    }

    let user = await User.findOne({ email });
    let created = false;

    if (!user) {
      user = new User({
        name: "Super Admin",
        email,
        password,
        isVerified: true,
        isActive: true
      });
      created = true;
    } else {
      user.password = password; // triggers the pre('save') hash hook below
      user.isVerified = true;
    }

    user.isSuperAdmin = true;
    user.superAdminGrantedAt = new Date();
    user.superAdminGrantedBy = "bootstrap";
    await user.save();

    await PlatformBootstrap.create({
      key: SUPER_ADMIN_BOOTSTRAP_KEY,
      version: "1",
      meta: { email }
    });

    console.log(
      created
        ? `Super Admin bootstrap: created platform administrator account (${email}).`
        : `Super Admin bootstrap: converged existing account (${email}) to platform administrator.`
    );

    await recordSuperAdminAuditLog({
      actor: null,
      action: "SUPER_ADMIN_ACCESS_GRANTED",
      targetType: "User",
      targetId: user._id,
      targetName: user.name,
      targetEmail: user.email,
      summary: `Initial Super Admin bootstrap ${created ? 'created' : 'converged'} platform administrator ${email}`,
      changeDetails: [
        { label: 'Super Admin Access', previous: created ? 'None (new account)' : 'Standard User', next: 'Active / Granted' }
      ]
    });
  } catch (error) {
    console.error("Error running Super Admin bootstrap:", error);
  }
};

export default seedAdmin;

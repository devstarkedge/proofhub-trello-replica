import User from "../models/User.js";
import Role from "../models/Role.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * Seed default system roles
 */
const seedRoles = async () => {
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
          canDeleteProjects: true
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
          canDeleteProjects: true
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
          canDeleteProjects: false
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
          canDeleteProjects: false
        },
        isSystem: true
      }
    ];

    let createdCount = 0;
    let existingCount = 0;

    for (const roleData of systemRoles) {
      const existingRole = await Role.findOne({ slug: roleData.slug });
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
};

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

export default seedAdmin;

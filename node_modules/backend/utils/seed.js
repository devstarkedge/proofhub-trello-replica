import User from "../models/User.js";
import dotenv from "dotenv";

dotenv.config();

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
  } catch (error) {
    console.error("Error seeding admin user:", error);
    process.exit(1);
  }
};

export default seedAdmin;

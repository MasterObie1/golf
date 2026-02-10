/**
 * Seed script to create the initial super-admin user.
 *
 * Usage:
 *   npx tsx scripts/seed-superadmin.ts
 *
 * Environment variables:
 *   SUPER_ADMIN_USERNAME - Username for the super admin (default: "admin")
 *   SUPER_ADMIN_PASSWORD - Password for the super admin (REQUIRED)
 *   DATABASE_URL         - Database URL (default: "file:./dev.db")
 */

import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

async function main() {
  const username = process.env.SUPER_ADMIN_USERNAME || "admin";
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!password) {
    console.error("Error: SUPER_ADMIN_PASSWORD environment variable is required.");
    console.error("Usage: SUPER_ADMIN_PASSWORD=your-password npx tsx scripts/seed-superadmin.ts");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Error: Password must be at least 8 characters.");
    process.exit(1);
  }

  const dbUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "file:./dev.db";
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  const adapter = new PrismaLibSql({
    url: dbUrl,
    authToken: tursoToken || undefined,
  });

  const prisma = new PrismaClient({ adapter });

  try {
    // Check if user already exists
    const existing = await prisma.superAdmin.findUnique({
      where: { username },
    });

    const hashedPassword = await bcrypt.hash(password, 12);

    if (existing) {
      // Update existing admin's password
      await prisma.superAdmin.update({
        where: { username },
        data: { password: hashedPassword },
      });
      console.log(`Super-admin "${username}" password updated.`);
    } else {
      // Create new admin
      await prisma.superAdmin.create({
        data: {
          username,
          password: hashedPassword,
        },
      });
      console.log(`Super-admin "${username}" created.`);
    }
  } catch (error) {
    console.error("Failed to seed super-admin:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

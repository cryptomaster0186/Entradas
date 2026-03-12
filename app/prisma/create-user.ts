/**
 * CLI script to create a user in the database.
 *
 * Usage:
 *   npm run user:create <email> <password> [admin|viewer]
 *
 * Examples:
 *   npm run user:create friend@example.com mypassword123
 *   npm run user:create friend@example.com mypassword123 viewer
 *   npm run user:create boss@example.com secretpass admin
 *
 * Requires DATABASE_URL to be set (in .env or environment).
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const [, , emailArg, passwordArg, roleArg] = process.argv;

if (!emailArg || !passwordArg) {
  console.error("Usage: npm run user:create <email> <password> [admin|viewer]");
  process.exit(1);
}

if (passwordArg.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const role = roleArg?.toLowerCase() === "admin" ? "ADMIN" : "VIEWER";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Add it to your .env file.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: emailArg } });
  if (existing) {
    console.error(`A user with email "${emailArg}" already exists.`);
    process.exit(1);
  }

  const hashed = await bcrypt.hash(passwordArg, 12);
  const user = await prisma.user.create({
    data: { email: emailArg, password: hashed, role },
  });

  console.log(`✅  Created ${user.role} user: ${user.email}`);
  console.log(`    They can now log in at your deployed URL.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

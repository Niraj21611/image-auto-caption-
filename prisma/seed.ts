const { PrismaClient, UserRole  } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const users = [
    {
      name: "User 1",
      email: "user1@example.com",
      password: "user123",
      role: UserRole.USER,
    },
    {
      name: "User 2",
      email: "user2@example.com",
      password: "user123",
      role: UserRole.USER,
    },
    {
      name: "User 3",
      email: "user3@example.com",
      password: "user123",
      role: UserRole.USER,
    },
    {
      name: "User 4",
      email: "user4@example.com",
      password: "user123",
      role: UserRole.USER,
    },
    {
      name: "admin",
      email: "admin@example.com",
      password: "admin123",
      role: UserRole.ADMIN,
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        name: user.name,
        email: user.email,
        password: user.password,
        role: user.role,
      },
    });
  }

  console.log("✅ Seed completed: 5 users created!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

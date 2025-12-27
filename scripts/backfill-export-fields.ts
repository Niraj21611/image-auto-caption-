/**
 * Backfill script to set isExported = false for all existing ImageCaption records
 * Run this once after adding the export tracking fields
 * 
 * Usage: npx tsx scripts/backfill-export-fields.ts
 * Or: node --loader ts-node/esm scripts/backfill-export-fields.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function backfillExportFields() {
  try {
    console.log("🔄 Starting backfill of export fields...");

    // Count total ImageCaptions
    const totalCount = await prisma.imageCaption.count();
    console.log(`📊 Found ${totalCount} total ImageCaption records`);

    // Update ALL ImageCaption records to ensure isExported is explicitly set to false
    // This handles any records where the field might be missing or null
    const result = await prisma.imageCaption.updateMany({
      data: {
        isExported: false,
        exportedAt: null,
      },
    });

    console.log(`✅ Successfully updated ${result.count} records`);
    console.log(`✅ All ImageCaption records now have isExported = false`);

    // Show summary by status
    const approvedCount = await prisma.imageCaption.count({
      where: { status: "APPROVED", isExported: false },
    });

    const totalApproved = await prisma.imageCaption.count({
      where: { status: "APPROVED" },
    });

    console.log("\n📊 Summary:");
    console.log(`   Total ImageCaptions: ${totalCount}`);
    console.log(`   Total APPROVED: ${totalApproved}`);
    console.log(`   APPROVED & not exported: ${approvedCount}`);

    console.log("\n🎉 Backfill completed successfully!");
    console.log("💡 All approved images are now ready to be exported!");
  } catch (error) {
    console.error("❌ Error during backfill:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the backfill
backfillExportFields()
  .then(() => {
    console.log("✅ Script finished");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });

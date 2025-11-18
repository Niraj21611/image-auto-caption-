import OpenAI from "openai";
import "dotenv/config";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

(async () => {
  // Delete all files
  const files = await openai.files.list();
  for (const f of files.data) {
    console.log("Deleting file:", f.id);
    await openai.files.delete(f.id).catch((err) => {
      console.log("File delete error:", err.message);
    });
  }

  // Cancel all batches
  const batches = await openai.batches.list();
  for (const b of batches.data) {
    console.log("Canceling batch:", b.id);
    await openai.batches.cancel(b.id).catch((err) => {
      console.log("Batch cancel error:", err.message);
    });
  }

  console.log("✔ All files deleted & all batches cancelled");
})();

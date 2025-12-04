"use server";

import fs from "fs";
import path from "path";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function listImagesRecursive(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(p: string) {
    const entries = await fs.promises.readdir(p, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (IMAGE_EXTS.has(ext)) out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}

interface MediaFolder {
  fullPath: string;
  relativePath: string;
  imageCount: number;
}

/**
 * Scans the given rootPath (e.g., "root/place") and discovers all subdirectories named "media".
 * For each "media" folder, counts images recursively.
 * Returns list of { fullPath, relativePath, imageCount }.
 */
export async function scanMediaFolders(rootPath: string) {
  try {
    if (!rootPath || typeof rootPath !== "string") {
      return { success: false, error: "Valid root path is required" } as const;
    }

    const stats = await fs.promises.stat(rootPath).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      return {
        success: false,
        error: "Provided path is not a directory or not accessible",
      } as const;
    }

    const mediaFolders: MediaFolder[] = [];

    // Recursively walk the tree and find folders named "media"
    async function walk(currentPath: string) {
      const entries = await fs.promises.readdir(currentPath, {
        withFileTypes: true,
      });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const fullPath = path.join(currentPath, entry.name);

        if (entry.name.toLowerCase() === "media") {
          // Found a media folder; count images
          const images = await listImagesRecursive(fullPath);
          const relativePath = path.relative(rootPath, fullPath);
          mediaFolders.push({
            fullPath,
            relativePath,
            imageCount: images.length,
          });
        } else {
          // Recurse into subdirectory
          await walk(fullPath);
        }
      }
    }

    await walk(rootPath);

    return {
      success: true,
      data: mediaFolders,
    } as const;
  } catch (err) {
    console.error("scanMediaFolders error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to scan folders",
    } as const;
  }
}

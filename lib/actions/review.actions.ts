"use server";

import prisma from "../prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { nextauthOptions } from "@/lib/auth";
import * as fsp from "node:fs/promises";
import path from "node:path";

function mimeFromExt(ext: string) {
	switch (ext.toLowerCase()) {
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".png":
			return "image/png";
		case ".webp":
			return "image/webp";
		default:
			return "application/octet-stream";
	}
}

async function filePathToDataUrl(filePath: string) {
	try {
		const buf = await fsp.readFile(filePath);
		const ext = path.extname(filePath);
		const mime = mimeFromExt(ext);
		const base64 = buf.toString("base64");
		return `data:${mime};base64,${base64}`;
	} catch {
		return "data:application/octet-stream;base64,";
	}
}

// (unused) previously used helper retained for reference

async function ensureCaptionsLinkedToJob(jobId: string) {
	if (!jobId) return 0;
	const job = await prisma.imageJob.findUnique({
		where: { id: jobId },
		select: { id: true, dirPath: true },
	});
	if (!job?.dirPath) return 0;

	// Attach any captions that belong to this job's directory but are missing/mismatched.
	const result = await prisma.imageCaption.updateMany({
		where: {
			jobId: { not: job.id },
			filePath: { startsWith: job.dirPath },
		},
		data: { jobId: job.id },
	});

	return result.count || 0;
}


export async function getUserAssignedJobs(userId: string) {
	if (!userId) throw new Error("userId is required");
	return prisma.imageJob.findMany({
		where: { assignedTo: userId },
		orderBy: { createdAt: "desc" },
		select: {
			id: true,
			dirPath: true,
			totalImages: true,
			processed: true,
			reviewed: true,
			createdAt: true,
		},
	});
}

export async function getCaptionsPage(jobId: string, page = 0, pageSize = 10) {
	if (!jobId) throw new Error("jobId is required");
	await ensureCaptionsLinkedToJob(jobId);
	const skip = Math.max(0, page) * Math.max(1, pageSize);
	const take = Math.max(1, pageSize);
	const job = await prisma.imageJob.findUnique({
		where: { id: jobId },
		select: { dirPath: true },
	});
	const dirPath = job?.dirPath;

	console.log("Job Id: ", jobId)
	const itemsRaw = await prisma.imageCaption.findMany({
		where: {
			status: "CAPTIONED",
			OR: [
				{ jobId },
				...(dirPath ? [{ filePath: { startsWith: dirPath } }] : []),
			],
		},
		orderBy: { createdAt: "asc" },
		skip,
		take,
		select: {
			id: true,
			filePath: true,
			preCaption: true,
			postCaption: true,
			status: true,
			createdAt: true,
		},
	});

	const totalPending = await prisma.imageCaption.count({
		where: {
			status: "CAPTIONED",
			OR: [
				{ jobId },
				...(dirPath ? [{ filePath: { startsWith: dirPath } }] : []),
			],
		},
	});

	const items = await Promise.all(
		itemsRaw.map(async (it) => ({
			...it,
			src: await filePathToDataUrl(it.filePath),
		}))
	);


	return { items, totalPending, page, pageSize };
}

// Summaries for all batches assigned to a user
export async function getUserBatchSummaries(userId: string) {
	if (!userId) throw new Error("userId is required");
	const jobs = await prisma.imageJob.findMany({
		where: { assignedTo: userId },
		orderBy: { createdAt: "desc" },
		select: { id: true, dirPath: true, totalImages: true, processed: true, reviewed: true, createdAt: true },
	});

	// For each job, compute available (CAPTIONED) and underReview (REVIEWED by this user)
	const out = await Promise.all(
		jobs.map(async (j) => {
			await ensureCaptionsLinkedToJob(j.id);
			const [available, underReview] = await Promise.all([
				prisma.imageCaption.count({ where: { jobId: j.id, status: "CAPTIONED" } }),
				prisma.imageCaption.count({ where: { jobId: j.id, status: "REVIEWED", reviewerId: userId } }),
			]);
			return { ...j, available, underReview };
		})
	);
	return out;
}

// Form post server action
export async function submitReviewAction(formData: FormData) {
	const captionId = String(formData.get("captionId") || "").trim();
	const jobId = String(formData.get("jobId") || "").trim();
	const postCaption = String(formData.get("postCaption") || "").trim();
	if (!captionId || !jobId) throw new Error("captionId and jobId required");

	// Identify reviewer from session
	const session = await getServerSession(nextauthOptions);
	const reviewerId = session?.user?.id;

	// Idempotent increment: only if transitioning to REVIEWED now
	const current = await prisma.imageCaption.findUnique({
		where: { id: captionId },
		select: { id: true, status: true, jobId: true, filePath: true },
	});
	if (!current) throw new Error("Caption not found");

	let realJobId = current.jobId || jobId || undefined;
	try {
		const job = await prisma.imageJob.findUnique({
			where: { id: jobId },
			select: { dirPath: true },
		});
		if (job?.dirPath && current.filePath?.startsWith(job.dirPath)) {
			realJobId = jobId;
		}
	} catch {}

	if (current.status !== "REVIEWED") {
		// Update caption, attach jobId if it was missing
		await prisma.imageCaption.update({
			where: { id: captionId },
			data: {
				postCaption,
				status: "REVIEWED",
				reviewedAt: new Date(),
				reviewerId: reviewerId ?? undefined,
				...(realJobId ? { jobId: realJobId } : {}),
			},
		});
		try {
			if (realJobId) {
				await prisma.imageJob.update({
					where: { id: realJobId },
					data: { reviewed: { increment: 1 } },
				});
			}
		} catch (err) {
			console.error("Failed to increment job.reviewed", err);
		}
	} else {
		// Already reviewed: still allow postCaption edit without increment
		await prisma.imageCaption.update({
			where: { id: captionId },
			data: { postCaption, reviewerId: reviewerId ?? undefined },
		});
	}

	// Revalidate assignment pages
	revalidatePath(`/admin/assign`);
	// Also revalidate reviewer-specific page if the job is assigned
	try {
		const job = await prisma.imageJob.findUnique({ where: { id: realJobId || jobId }, select: { assignedTo: true } });
		if (job?.assignedTo) {
			revalidatePath(`/admin/user/${job.assignedTo}`);
		}
	} catch {}
}

// Direct-call variant from client components
export async function submitReview(captionId: string, jobId: string, postCaption: string) {
	const fd = new FormData();
	fd.set("captionId", captionId);
	fd.set("jobId", jobId);
	fd.set("postCaption", postCaption);
	return submitReviewAction(fd);
}

// Skip a caption (mark status as SKIPPED without incrementing reviewed count)
export async function skipReview(captionId: string, jobId: string) {
	try {
		if (!captionId || !jobId) {
			return { success: false, error: "captionId and jobId are required" } as const;
		}

		const current = await prisma.imageCaption.findUnique({
			where: { id: captionId },
			select: { id: true, status: true, jobId: true },
		});
		if (!current) {
			return { success: false, error: "Caption not found" } as const;
		}

		// If it's already approved or skipped, do nothing
		if (current.status === "APPROVED" || current.status === "SKIPPED") {
			return { success: true, data: { skipped: false } } as const;
		}

		const realJobId = current.jobId || jobId;

		await prisma.imageCaption.update({
			where: { id: captionId },
			data: {
				status: "SKIPPED",
				postCaption: null,
				// attach jobId if it was missing
				...(current.jobId ? {} : realJobId ? { jobId: realJobId } : {}),
			},
		});

		// We intentionally do NOT increment job.reviewed here

		// Revalidate assignment-related pages if needed
		revalidatePath(`/admin/assign`);
		if (realJobId) {
			try {
				const job = await prisma.imageJob.findUnique({
					where: { id: realJobId },
					select: { assignedTo: true },
				});
				if (job?.assignedTo) {
					revalidatePath(`/admin/user/${job.assignedTo}`);
				}
			} catch {}
		}

		return { success: true, data: { skipped: true } } as const;
	} catch (err) {
		console.error("skipReview error", err);
		return { success: false, error: "Failed to skip caption" } as const;
	}
}
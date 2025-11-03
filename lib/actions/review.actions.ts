"use server";

import prisma from "../prisma";
import { revalidatePath } from "next/cache";
import * as fsp from "node:fs/promises";
import path from "node:path";
import { getServerSession } from "next-auth";
import { nextauthOptions } from "@/lib/auth";

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
		// If file missing or unreadable, return empty data URL to avoid client crash
		return "data:application/octet-stream;base64,";
	}
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
	const skip = Math.max(0, page) * Math.max(1, pageSize);
	const take = Math.max(1, pageSize);

	// Pending review: not REVIEWED yet
	const where = {
		jobId,
		NOT: { status: "REVIEWED" as const },
	} as const;

		const [itemsRaw, totalPending] = await Promise.all([
		prisma.imageCaption.findMany({
			where,
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
		}),
		prisma.imageCaption.count({ where }),
	]);

		// Map to include data URL src for client rendering
		const items = await Promise.all(
			itemsRaw.map(async (it) => ({
				...it,
				src: await filePathToDataUrl(it.filePath),
			}))
		);

		return { items, totalPending, page, pageSize };
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
	const current = await prisma.imageCaption.findUnique({ where: { id: captionId }, select: { id: true, status: true } });
	if (!current) throw new Error("Caption not found");

	if (current.status !== "REVIEWED") {
		await prisma.imageCaption.update({
			where: { id: captionId },
			data: {
				postCaption,
				status: "REVIEWED",
				reviewedAt: new Date(),
				reviewerId: reviewerId ?? undefined,
			},
		});
		try {
			await prisma.imageJob.update({
				where: { id: jobId },
				data: { reviewed: { increment: 1 } },
			});
		} catch {}
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
		const job = await prisma.imageJob.findUnique({ where: { id: jobId }, select: { assignedTo: true } });
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
"use server";

import prisma from "../prisma";
import { revalidatePath } from "next/cache";

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

	const [items, totalPending] = await Promise.all([
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

	return { items, totalPending, page, pageSize };
}

// Form post server action
export async function submitReviewAction(formData: FormData) {
	const captionId = String(formData.get("captionId") || "").trim();
	const jobId = String(formData.get("jobId") || "").trim();
	const postCaption = String(formData.get("postCaption") || "").trim();
	if (!captionId || !jobId) throw new Error("captionId and jobId required");

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
			data: { postCaption },
		});
	}

	revalidatePath(`/admin/assign`);
	revalidatePath(`/admin/assign/${jobId}`); // not exact route but harmless
}

// Direct-call variant from client components
export async function submitReview(captionId: string, jobId: string, postCaption: string) {
	const fd = new FormData();
	fd.set("captionId", captionId);
	fd.set("jobId", jobId);
	fd.set("postCaption", postCaption);
	return submitReviewAction(fd);
}
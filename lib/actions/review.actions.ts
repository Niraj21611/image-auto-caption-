"use server";

import prisma from "../prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { nextauthOptions } from "@/lib/auth";


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

	// Primary filter: by jobId

	const itemsRaw = await prisma.imageCaption.findMany({
		where: {jobId, status: "CAPTIONED"},
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
	const totalPending = await prisma.imageCaption.count({ where: {jobId, status: "CAPTIONED"} });


	return { itemsRaw, totalPending, page, pageSize };
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
	const current = await prisma.imageCaption.findUnique({ where: { id: captionId }, select: { id: true, status: true, jobId: true } });
	if (!current) throw new Error("Caption not found");
	const realJobId = current.jobId || jobId || undefined;

	if (current.status !== "REVIEWED") {
		// Update caption, attach jobId if it was missing
		await prisma.imageCaption.update({
			where: { id: captionId },
			data: {
				postCaption,
				status: "REVIEWED",
				reviewedAt: new Date(),
				reviewerId: reviewerId ?? undefined,
				...(current.jobId ? {} : realJobId ? { jobId: realJobId } : {}),
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
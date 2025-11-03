"use server";

import prisma from "../prisma";
import { revalidatePath } from "next/cache";

// Contract
// - listCompletedJobs(): jobs ready to assign (COMPLETED or processed>=total)
// - listUsers(): reviewers to assign to (role USER)
// - assignJobAction(FormData): assign a job to a user (server action via <form>)
// - getUserReviewStats(userId): totals for reviewed and pending for that user

export async function listCompletedJobs() {
	// Return most recent first, include assigned user info for UI label
		const jobs = await prisma.imageJob.findMany({
			where: { status: "COMPLETED" },
		orderBy: { createdAt: "desc" },
		select: {
			id: true,
			dirPath: true,
			totalImages: true,
			processed: true,
			reviewed: true,
			status: true,
			assignedTo: true,
			assignedUser: { select: { id: true, name: true, email: true } },
			createdAt: true,
		},
	});
	return jobs;
}

export async function listUsers() {
	const users = await prisma.user.findMany({
		where: { role: "USER" },
		orderBy: { name: "asc" },
		select: { id: true, name: true, email: true, role: true },
	});
	return users;
}

export async function assignJob(jobId: string, userId: string) {
	if (!jobId || !userId) throw new Error("jobId and userId are required");
	// Ensure both exist
	const [job, user] = await Promise.all([
		prisma.imageJob.findUnique({ where: { id: jobId }, select: { id: true } }),
		prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
	]);
	if (!job) throw new Error("Job not found");
	if (!user) throw new Error("User not found");

	await prisma.imageJob.update({ where: { id: jobId }, data: { assignedTo: userId } });
}

// Form-bound server action for <form action={assignJobAction}>
export async function assignJobAction(formData: FormData) {
	const jobId = String(formData.get("jobId") || "").trim();
	const userId = String(formData.get("userId") || "").trim();
	await assignJob(jobId, userId);
	// Revalidate both list and the user's detail page
	revalidatePath("/admin/assign");
	if (userId) revalidatePath(`/admin/assign/${userId}`);
}

export async function getUserReviewStats(userId: string) {
	console.log("Getting review stats for userId:", userId);
	if (!userId) throw new Error("userId is required");
	const jobs = await prisma.imageJob.findMany({
		where: { assignedTo: userId },
		orderBy: { createdAt: "desc" },
		select: {
			id: true,
			dirPath: true,
			totalImages: true,
			processed: true,
			reviewed: true,
			status: true,
			createdAt: true,
		},
	});
	let reviewed = 0;
	let pending = 0;
	for (const j of jobs) {
		reviewed += j.reviewed || 0;
		const toReview = Math.max(0, (j.processed || 0) - (j.reviewed || 0));
		pending += toReview;
	}
	return { reviewed, pending, jobs };
}
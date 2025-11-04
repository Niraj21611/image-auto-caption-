import { getUserAssignedJobs, getCaptionsPage } from "@/lib/actions/review.actions";
import ReviewClient from "./ReviewClient";

type Params = { params: { userId: string } };

export default async function ReviewPage({ params }: Params) {
  const { userId } = await params;
  
  const jobs = await getUserAssignedJobs(userId);
  
  if (jobs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-neutral-900">No Assignments</h2>
          <p className="text-neutral-600">You don&apos;t have any batches assigned for review yet.</p>
        </div>
      </div>
    );
  }

  // Get first job and its first page of captions
  const firstJob = jobs[0];
  const initialData = await getCaptionsPage(firstJob.id, 0, 10);

  if (initialData.items.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-neutral-900">All Caught Up!</h2>
          <p className="text-neutral-600">All images in your assigned batches have been reviewed.</p>
        </div>
      </div>
    );
  }

  return (
    <ReviewClient
      userId={userId}
      jobs={jobs}
      initialJob={firstJob}
      initialData={initialData}
    />
  );
}
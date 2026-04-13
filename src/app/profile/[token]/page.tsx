import { ProfileCompletionForm } from "@/components/profile-completion-form";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold text-slate-900">Complete your profile</h1>
          <p className="text-sm text-slate-600">
            Please add the remaining details below so the 1 Plus 1 team can review your profile.
          </p>
        </div>
        <ProfileCompletionForm token={token} />
      </div>
    </main>
  );
}

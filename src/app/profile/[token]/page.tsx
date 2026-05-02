import { LogoMark } from "@/components/admin/primitives/logo-mark";
import { ProfileCompletionForm } from "@/components/profile-completion-form";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main data-admin className="min-h-screen">
      <div className="applicant-profile">
        <header className="applicant-profile-head">
          <div className="brand compact">
            <LogoMark />
            <div>
              <div className="brand-name">Taaruf</div>
              <div className="brand-tag">Profile</div>
            </div>
          </div>
          <div className="page-head">
            <div>
              <h1>
                Complete your <em>profile</em>
              </h1>
              <p>
                Add the remaining details below so the 1Plus1 team can review your profile
                and start matching.
              </p>
            </div>
          </div>
        </header>

        <ProfileCompletionForm token={token} />
      </div>
    </main>
  );
}

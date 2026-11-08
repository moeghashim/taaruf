import { FemaleReviews } from "@/components/applicant/female-reviews";

export default function ReviewDashboardPage() {
  return <main data-admin className="min-h-screen"><div className="content"><div className="page-head"><div><h1>Profile <em>review</em></h1><p><a href="/me">Return to your applicant portal</a></p></div></div><FemaleReviews /></div></main>;
}

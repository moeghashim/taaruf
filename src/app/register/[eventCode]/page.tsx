import { notFound } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { LogoMark } from "@/components/admin/primitives/logo-mark";
import { RegistrationForm } from "@/components/registration-form";
import { getConvexClient } from "@/lib/convex";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ eventCode: string }>;
};

async function getEvent(eventCode: string) {
  try {
    return await getConvexClient().query(api.events.getPublicByCode, { eventCode });
  } catch (error) {
    console.error("Failed to load registration event", error);
    return null;
  }
}

export default async function EventRegisterPage({ params }: PageProps) {
  const { eventCode } = await params;
  const event = await getEvent(decodeURIComponent(eventCode));
  if (!event) notFound();

  return (
    <main data-admin className="min-h-screen">
      <div className="applicant-register">
        <header className="applicant-register-head">
          <div className="brand compact">
            <LogoMark />
            <div>
              <div className="brand-name">Taaruf</div>
              <div className="brand-tag">Event registration</div>
            </div>
          </div>
          <div className="page-head">
            <div>
              <h1>
                Register for <em>{event.title}</em>
              </h1>
              <p>Submit your profile once. Your application will be attached to this event automatically.</p>
            </div>
          </div>
        </header>

        <section className="panel applicant-register-intro">
          <p>
            Finding the right spouse has become one of the biggest challenges for young Muslims today. With busy schedules, limited opportunities, and a culture that often complicates the path to marriage, many are searching without the right environment to do so.
          </p>
          <p>
            1Plus1 is an internal matching program designed to create intentional, dignified, faith-centered spaces where meaningful connections can grow. Our team carefully reviews each profile, supports thoughtful introductions, and helps participants explore values, character, and compatibility in a natural and purposeful way.
          </p>
          <p>
            The $10 registration fee covers the cost of a background check conducted by the 1Plus1 team to ensure the safety and integrity of all participants.
          </p>
          <p className="mute">
            By registering, you consent to be added to our internal matching program{" "}
            <a href="https://1plus1match.com" target="_blank" rel="noopener noreferrer">
              1plus1match.com
            </a>{" "}
            where we track potential matches.
          </p>
        </section>

        <RegistrationForm event={event} />
      </div>
    </main>
  );
}

import { LogoMark } from "@/components/admin/primitives/logo-mark";
import { RegistrationForm } from "@/components/registration-form";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <main data-admin className="min-h-screen">
      <div className="applicant-register">
        <header className="applicant-register-head">
          <div className="brand compact">
            <LogoMark />
            <div>
              <div className="brand-name">Taaruf</div>
              <div className="brand-tag">Registration</div>
            </div>
          </div>
          <div className="page-head">
            <div>
              <h1>
                Join the 1Plus1 <em>Matching Program</em>
              </h1>
              <p>Intentional, dignified, faith-centered introductions.</p>
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

        <RegistrationForm />
      </div>
    </main>
  );
}

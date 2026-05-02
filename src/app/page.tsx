import Link from "next/link";
import { LogoMark } from "@/components/admin/primitives/logo-mark";
import { Ico } from "@/components/admin/primitives/icons";

export default function Home() {
  return (
    <main data-admin className="min-h-screen">
      <div className="applicant-home">
        <header className="applicant-home-head">
          <div className="brand compact">
            <LogoMark />
            <div>
              <div className="brand-tag">1Plus1 Matching</div>
            </div>
          </div>
          <div className="page-head applicant-home-hero">
            <div>
              <h1>
                Marriage, with <em>intention</em>.
              </h1>
              <p>
                1Plus1 is an internal matching program for sincere Muslim singles ready
                to begin a dignified, faith-centered path to marriage.
              </p>
            </div>
          </div>
          <div className="applicant-home-cta">
            <Link href="/register" className="btn btn-primary">
              {Ico.heart}
              <span>Get started</span>
            </Link>
            <Link href="/login" className="btn">
              {Ico.inbox}
              <span>Sign in</span>
            </Link>
          </div>
        </header>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>What is 1Plus1?</h3>
              <p>An internal matching program for the Plus 1 HTX community.</p>
            </div>
          </div>
          <div className="applicant-home-body">
            <p>
              Finding the right spouse has become one of the biggest challenges for young
              Muslims today. With busy schedules, limited opportunities, and a culture that
              often complicates the path to marriage, many are searching without the right
              environment to do so.
            </p>
            <p>
              1Plus1 was created to support the Plus 1 HTX community &mdash; a vibrant
              Houston-based Muslim space dedicated to connection, growth, and Islamic
              learning. As members of this community voiced a need for a more intentional
              and dignified path to marriage, 1Plus1 emerged as a natural extension of that
              mission.
            </p>
            <p>
              Inspired by the Qur&apos;anic principle of ta&apos;aruf &mdash; getting to
              know one another with purpose &mdash; we aim to make the pre-marriage journey
              more accessible, thoughtful, and grounded. Our team carefully reviews each
              profile, supports thoughtful introductions, and helps participants explore
              values, character, and compatibility in a natural and purposeful way.
            </p>
            <p>
              Through these faith-centered spaces, we help sincere individuals connect with
              integrity and confidence &mdash; building toward marriages that are
              supported, healthy, and pleasing to Allah.
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>How it works</h3>
              <p>From registration to introduction.</p>
            </div>
          </div>
          <div className="applicant-home-steps">
            <div className="step">
              <div className="step-num">01</div>
              <h4>Register</h4>
              <p>
                Submit your profile and consent to a background check. The $10 fee covers
                that check, conducted by the 1Plus1 team.
              </p>
            </div>
            <div className="step">
              <div className="step-num">02</div>
              <h4>Review</h4>
              <p>
                Our team carefully reviews each profile to maintain safety and integrity for
                every participant in the program.
              </p>
            </div>
            <div className="step">
              <div className="step-num">03</div>
              <h4>Connect</h4>
              <p>
                Express interest in others through your applicant portal. The team supports
                thoughtful introductions toward marriage.
              </p>
            </div>
          </div>
        </section>

        <footer className="applicant-home-foot">
          <p>
            New here?{" "}
            <Link href="/register">Start your registration</Link>. Already registered?{" "}
            <Link href="/login">Sign in to your applicant portal</Link>.
          </p>
        </footer>
      </div>
    </main>
  );
}

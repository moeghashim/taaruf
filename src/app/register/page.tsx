import { RegistrationForm } from "@/components/registration-form";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-12 px-4">
      <div className="container mx-auto max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">
            1Plus1 Pre-Marriage Workshop
          </h1>
          <p className="text-lg font-semibold text-slate-700 mb-2">
            April 12, 3:00 &ndash; 5:30 PM
          </p>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm mb-8 text-slate-700 space-y-4 text-sm leading-relaxed">
          <p>
            Finding the right spouse has become one of the biggest challenges for young Muslims today. With busy schedules, limited opportunities, and a culture that often complicates the path to marriage, many are searching without the right environment to do so.
          </p>
          <p>
            Our 1Plus1 Pre-Marriage Workshop is designed to create intentional, dignified, faith-centered spaces where meaningful connections can grow. Through a blend of educational discussions and guided opportunities to interact, participants will explore values, character, and compatibility in a natural and purposeful way.
          </p>
          <p>
            The $10 registration fee covers the cost of a background check conducted by the 1Plus1 team to ensure the safety and integrity of all participants.
          </p>
          <p className="text-xs text-slate-500">
            By registering for this event, you consent to be added to our internal matching program{" "}
            <a href="https://1plus1match.com" className="underline text-slate-600 hover:text-slate-900" target="_blank" rel="noopener noreferrer">
              1plus1match.com
            </a>{" "}
            where we track potential matches.
          </p>
        </div>
        <RegistrationForm />
      </div>
    </main>
  );
}

import { RegistrationForm } from "@/components/registration-form";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-12 px-4">
      <div className="container mx-auto max-w-2xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">
            Join 1 Plus 1 Matching & Taaruf
          </h1>
          <p className="text-lg text-slate-600">
            Complete your registration to get started on your journey to finding the right match.
          </p>
        </div>
        <RegistrationForm />
      </div>
    </main>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sessionId = params.session_id;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md p-8 shadow-lg text-center">
        <div className="mb-6 flex justify-center">
          <CheckCircle className="h-16 w-16 text-green-500" />
        </div>

        <h1 className="text-3xl font-bold text-slate-900 mb-3">
          Registration Complete!
        </h1>

        <p className="text-lg text-slate-600 mb-2">
          Welcome to 1 Plus 1 Matching & Taaruf
        </p>

        <p className="text-slate-600 mb-6">
          Your registration has been successfully processed. Your profile is now
          active and visible to our matching team.
        </p>

        {sessionId && (
          <div className="bg-slate-100 rounded-lg p-4 mb-6 text-left">
            <p className="text-xs text-slate-600 mb-1">Session ID:</p>
            <p className="text-sm font-mono text-slate-900 break-all">{sessionId}</p>
          </div>
        )}

        <div className="space-y-3 text-left mb-8">
          <h3 className="font-semibold text-slate-900">Next Steps:</h3>
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex gap-3">
              <span className="text-green-500 font-bold">✓</span>
              <span>Check your email for a confirmation message</span>
            </li>
            <li className="flex gap-3">
              <span className="text-green-500 font-bold">✓</span>
              <span>Our team will review your profile within 24 hours</span>
            </li>
            <li className="flex gap-3">
              <span className="text-green-500 font-bold">✓</span>
              <span>Potential matches will be sent to your email</span>
            </li>
          </ul>
        </div>

        <Link href="/">
          <Button className="w-full">Return to Home</Button>
        </Link>
      </Card>
    </main>
  );
}

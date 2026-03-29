import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

export default function SuccessPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md p-8 shadow-lg text-center">
        <div className="mb-6 flex justify-center">
          <CheckCircle className="h-16 w-16 text-green-500" />
        </div>

        <h1 className="text-3xl font-bold text-slate-900 mb-3">
          Registration Submitted!
        </h1>

        <p className="text-lg text-slate-600 mb-2">
          Welcome to 1 Plus 1 Matching & Taaruf
        </p>

        <p className="text-slate-600 mb-6">
          Your application is under review. Our team will carefully evaluate your profile
          and get back to you within 24 hours.
        </p>

        <div className="space-y-3 text-left mb-8">
          <h3 className="font-semibold text-slate-900">Next Steps:</h3>
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex gap-3">
              <span className="text-green-500 font-bold">✓</span>
              <span>Check your email for confirmation</span>
            </li>
            <li className="flex gap-3">
              <span className="text-green-500 font-bold">✓</span>
              <span>Our team will review your profile within 24 hours</span>
            </li>
            <li className="flex gap-3">
              <span className="text-green-500 font-bold">✓</span>
              <span>You will receive an approval or rejection decision</span>
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

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { XCircle } from "lucide-react";

export default function CancelledPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md p-8 shadow-lg text-center">
        <div className="mb-6 flex justify-center">
          <XCircle className="h-16 w-16 text-amber-500" />
        </div>

        <h1 className="text-3xl font-bold text-slate-900 mb-3">
          Payment Cancelled
        </h1>

        <p className="text-lg text-slate-600 mb-6">
          Your registration payment was not completed. No charges have been made to
          your account.
        </p>

        <p className="text-slate-600 mb-8">
          Your registration information has been saved. You can try again whenever
          you&apos;re ready.
        </p>

        <div className="space-y-3">
          <Link href="/register">
            <Button className="w-full">Try Again</Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="w-full">
              Return to Home
            </Button>
          </Link>
        </div>

        <p className="text-xs text-slate-500 mt-6">
          If you have any questions or need assistance, please contact our support
          team.
        </p>
      </Card>
    </main>
  );
}

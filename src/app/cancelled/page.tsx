import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function CancelledPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md p-8 shadow-lg text-center">
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Payment Cancelled</h1>
        <p className="text-slate-600 mb-6">
          Your registration was not submitted because checkout was cancelled.
        </p>
        <Link href="/register">
          <Button className="w-full">Return to Registration</Button>
        </Link>
      </Card>
    </main>
  );
}

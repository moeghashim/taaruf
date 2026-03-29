import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SlotCounter } from "@/components/slot-counter";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-20">
        <div className="text-center space-y-8">
          {/* Logo/Branding */}
          <div className="space-y-2">
            <h1 className="text-5xl md:text-6xl font-bold text-slate-900">
              1 Plus 1
            </h1>
            <p className="text-2xl md:text-3xl font-semibold text-slate-700">
              Matching & Taaruf
            </p>
          </div>

          {/* Tagline */}
          <p className="text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Discover meaningful connections with our premium Islamic matchmaking
            service. Find your perfect match with integrity, respect, and shared values.
          </p>

          {/* Slot Counter */}
          <div className="my-12">
            <SlotCounter />
          </div>

          {/* CTA Button */}
          <div className="pt-8">
            <Link href="/register">
              <Button size="lg" className="text-lg px-8 py-6">
                Start Your Journey Today
              </Button>
            </Link>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-8 mt-16 max-w-4xl mx-auto">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-2">Verified Profiles</h3>
              <p className="text-slate-600 text-sm">
                All members are carefully verified to ensure authenticity and safety.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-2">Trusted Values</h3>
              <p className="text-slate-600 text-sm">
                Founded on Islamic principles of respect, dignity, and faith.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-2">Quality Matches</h3>
              <p className="text-slate-600 text-sm">
                Thoughtfully matched based on compatibility and shared values.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

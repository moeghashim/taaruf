import Link from "next/link";
import { Button } from "@/components/ui/button";

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

          {/* Upcoming Event */}
          <div className="bg-white rounded-lg p-6 shadow-sm max-w-md mx-auto">
            <p className="text-sm font-medium text-emerald-600 uppercase tracking-wide mb-1">Upcoming Event</p>
            <h3 className="text-xl font-bold text-slate-900">Pre-Marriage Workshop</h3>
            <p className="text-lg text-slate-700 font-semibold">April 12, 3:00 &ndash; 5:30 PM</p>
          </div>

          {/* CTA Button */}
          <div className="pt-4">
            <Link href="/register">
              <Button size="lg" className="text-lg px-8 py-6">
                Sign Up
              </Button>
            </Link>
          </div>

          {/* About Us */}
          <div className="max-w-3xl mx-auto mt-16 text-left space-y-6">
            <h2 className="text-3xl font-bold text-slate-900 text-center">About Us</h2>

            <div className="bg-white rounded-lg p-8 shadow-sm space-y-4 text-slate-700 leading-relaxed">
              <p>
                1Plus1 was created to support the Plus 1 HTX community &mdash; a vibrant Houston-based Muslim space dedicated to connection, growth, and Islamic learning. As members of this community voiced a need for a more intentional and dignified path to marriage, 1Plus1 emerged as a natural extension of that mission.
              </p>
              <p>
                At 1Plus1, we believe that finding a spouse should take place in environments rooted in clarity, sincerity, and the guidance of our deen. Inspired by the Qur&apos;anic principle of ta&apos;aruf &mdash; getting to know one another with purpose &mdash; our work is designed to make the pre-marriage journey more accessible, thoughtful, and grounded.
              </p>
              <p>Our workshops and gatherings serve two core goals:</p>
              <ol className="list-decimal list-inside space-y-2 pl-2">
                <li>To address the real barriers to marriage through beneficial, reflective educational discussions.</li>
                <li>To create the right environment for intentional interaction, where participants can explore values, character, and mindset in a way that allows natural and meaningful matches to form.</li>
              </ol>
              <p>
                Through these faith-centered spaces, we aim to help sincere individuals connect with integrity and confidence &mdash; building toward marriages that are supported, healthy, and pleasing to Allah.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DashboardInterest = {
  interestId: string;
  direction: "inbound" | "outbound" | "private";
  status: string;
  flowStatus: string;
  visibility: string;
  adminStatus: string;
  keepOpenExpiresAt: number | null;
  bioVisibleAt: number | null;
  contactSharedAt: number | null;
  requesterFinalApproval: string;
  recipientFinalApproval: string;
  photoDecision: string;
  counterparty: {
    applicantNumber: number | null;
    name: string | null;
    age: number;
    gender: string;
    shareableBio: string | null;
    email: string | null;
    phone: string | null;
    label: string;
  } | null;
};

type DashboardData = {
  applicant: {
    name: string;
    gender: "male" | "female";
    applicantNumber: number | null;
    profileCompletionStatus: string;
  };
  inbound: DashboardInterest[];
  outbound: DashboardInterest[];
  privateDocumented: DashboardInterest[];
};

function titleize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(timestamp: number | null) {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
      {titleize(value)}
    </span>
  );
}

function InterestCard({
  interest,
  onAction,
  busy,
}: {
  interest: DashboardInterest;
  onAction: (body: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const counterparty = interest.counterparty;
  const canRespond =
    interest.direction === "inbound" &&
    interest.visibility !== "internal_only" &&
    (interest.flowStatus === "awaiting_inbound_response" || interest.flowStatus === "kept_open");
  const canFinalApprove = Boolean(
    interest.bioVisibleAt &&
    interest.flowStatus !== "contact_shared" &&
    interest.flowStatus !== "declined" &&
    interest.flowStatus !== "closed"
  );

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-950">{counterparty?.label ?? "Unknown applicant"}</h3>
          <p className="text-sm text-slate-600">
            {counterparty ? `${counterparty.gender} · age ${counterparty.age}` : "Profile unavailable"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge value={interest.flowStatus} />
          <StatusBadge value={interest.status} />
        </div>
      </div>

      {interest.keepOpenExpiresAt && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Keep Open expires {formatDate(interest.keepOpenExpiresAt)}.
        </p>
      )}

      {counterparty?.shareableBio && (
        <div className="space-y-1">
          <h4 className="text-sm font-medium text-slate-900">Bio</h4>
          <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            {counterparty.shareableBio}
          </p>
        </div>
      )}

      {interest.contactSharedAt && counterparty?.email && counterparty.phone && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
          <p className="font-medium">Contact info shared</p>
          <p>Email: {counterparty.email}</p>
          <p>Phone: {counterparty.phone}</p>
        </div>
      )}

      {canRespond && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy}
            onClick={() => onAction({ action: "respond", interestId: interest.interestId, decision: "accept" })}
          >
            Accept
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onAction({ action: "respond", interestId: interest.interestId, decision: "keep_open" })}
          >
            Keep Open
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onAction({ action: "respond", interestId: interest.interestId, decision: "decline" })}
          >
            Decline
          </Button>
        </div>
      )}

      {canFinalApprove && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy}
            onClick={() => onAction({ action: "final_approval", interestId: interest.interestId, approved: true })}
          >
            Final Approval
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onAction({ action: "final_approval", interestId: interest.interestId, approved: false })}
          >
            Decline After Bio
          </Button>
        </div>
      )}
    </Card>
  );
}

function Section({
  title,
  description,
  interests,
  onAction,
  busy,
}: {
  title: string;
  description: string;
  interests: DashboardInterest[];
  onAction: (body: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
      {interests.length ? (
        <div className="grid gap-3">
          {interests.map((interest) => (
            <InterestCard key={interest.interestId} interest={interest} onAction={onAction} busy={busy} />
          ))}
        </div>
      ) : (
        <Card className="p-5 text-sm text-slate-600">Nothing to show right now.</Card>
      )}
    </section>
  );
}

export default function ApplicantDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [applicantNumber, setApplicantNumber] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/applicant/me");
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load dashboard");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const interestHint = useMemo(() => {
    if (!data) return "";
    return data.applicant.gender === "female"
      ? "Document a male applicant number privately. This is visible only to you and admins before a match."
      : "Submit a female applicant number to send a visible interest for her to review.";
  }, [data]);

  async function runAction(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/applicant/interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Action failed");
      setMessage("Updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitNumber(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const number = Number(applicantNumber);
    await runAction({ action: "submit_number", applicantNumber: number });
    setApplicantNumber("");
  }

  async function logout() {
    await fetch("/api/applicant/logout", { method: "POST" });
    router.replace("/login");
  }

  if (isLoading && !data) {
    return <main className="min-h-screen bg-slate-50 px-4 py-10">Loading...</main>;
  }

  if (!data) {
    return <main className="min-h-screen bg-slate-50 px-4 py-10 text-red-600">{error ?? "Unable to load dashboard."}</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Applicant #{data.applicant.applicantNumber ?? "-"}</p>
            <h1 className="text-3xl font-semibold text-slate-950">{data.applicant.name}</h1>
            <p className="text-sm text-slate-600">{titleize(data.applicant.gender)} applicant portal</p>
          </div>
          <Button type="button" variant="outline" onClick={logout}>
            Log Out
          </Button>
        </header>

        <Card className="p-5">
          <form onSubmit={submitNumber} className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="applicantNumber">Applicant number</Label>
              <Input
                id="applicantNumber"
                type="number"
                min="1"
                inputMode="numeric"
                value={applicantNumber}
                onChange={(event) => setApplicantNumber(event.target.value)}
                placeholder="e.g. 137"
                required
              />
              <p className="text-sm text-slate-600">{interestHint}</p>
            </div>
            <Button type="submit" disabled={busy}>
              {data.applicant.gender === "female" ? "Document Interest" : "Submit Interest"}
            </Button>
          </form>
        </Card>

        {message && <p className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
        {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <Section
          title="Inbound Interests"
          description="People who expressed interest in you."
          interests={data.inbound}
          onAction={runAction}
          busy={busy}
        />
        <Section
          title="Outbound Interests"
          description="Visible interests you sent."
          interests={data.outbound}
          onAction={runAction}
          busy={busy}
        />
        {data.applicant.gender === "female" && (
          <Section
            title="Private Documented Interests"
            description="Interests you documented for yourself and the admin team. These are not visible to men before a match."
            interests={data.privateDocumented}
            onAction={runAction}
            busy={busy}
          />
        )}
      </div>
    </main>
  );
}

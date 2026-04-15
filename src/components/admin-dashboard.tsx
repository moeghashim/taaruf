"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api } from "../../convex/_generated/api";
import { RegistrationsTable } from "@/components/registrations-table";
import { RegistrationDetail } from "@/components/registration-detail";

export default function AdminDashboard() {
  type FilterStatus = "all" | "approved" | "pending" | "rejected" | "waitlisted";

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [maleSlots, setMaleSlots] = useState<number | string>("");
  const [femaleSlots, setFemaleSlots] = useState<number | string>("");
  const [savingSlots, setSavingSlots] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterGender, setFilterGender] = useState<"all" | "male" | "female">("all");
  const [fixingPayments, setFixingPayments] = useState(false);
  const [fixResult, setFixResult] = useState<string | null>(null);
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [slotSaveMessage, setSlotSaveMessage] = useState<string | null>(null);

  const rawRegistrations = useQuery(api.registrations.getAll);
  const allRegistrations = useMemo(() => rawRegistrations || [], [rawRegistrations]);
  const slotLimits = useQuery(api.settings.getSlotLimits);

  const deleteRegistration = useMutation(api.registrations.deleteRegistration);
  const updateSlotLimits = useMutation(api.settings.updateSlotLimits);
  const updateStatus = useMutation(api.registrations.updateStatus);
  const updateAdminNotes = useMutation(api.registrations.updateAdminNotes);

  if (slotLimits && !maleSlots && !femaleSlots) {
    setMaleSlots(slotLimits.maleSlots || 40);
    setFemaleSlots(slotLimits.femaleSlots || 40);
  }

  const maleLimit = slotLimits?.maleSlots || 40;
  const femaleLimit = slotLimits?.femaleSlots || 40;

  const nonRejectedMales = [...allRegistrations]
    .filter((r) => r.gender === "male" && r.status !== "rejected")
    .sort((a, b) => a._creationTime - b._creationTime);
  const nonRejectedFemales = [...allRegistrations]
    .filter((r) => r.gender === "female" && r.status !== "rejected")
    .sort((a, b) => a._creationTime - b._creationTime);

  const waitlistIds = useMemo(() => {
    const ids = new Set<string>();
    nonRejectedMales.slice(maleLimit).forEach((r) => ids.add(r._id));
    nonRejectedFemales.slice(femaleLimit).forEach((r) => ids.add(r._id));
    return ids;
  }, [femaleLimit, maleLimit, nonRejectedFemales, nonRejectedMales]);

  const sortedRegistrations = useMemo(
    () => [...allRegistrations].sort((a, b) => a._creationTime - b._creationTime),
    [allRegistrations]
  );

  const registrationNumbers = useMemo(
    () => new Map(sortedRegistrations.map((registration, index) => [registration._id, index + 1])),
    [sortedRegistrations]
  );

  const filteredRegistrations = useMemo(() => {
    return allRegistrations.filter((reg) => {
      if (filterStatus === "waitlisted") {
        if (!waitlistIds.has(reg._id)) return false;
      } else if (filterStatus !== "all" && reg.status !== filterStatus) {
        return false;
      }

      if (filterGender !== "all" && reg.gender !== filterGender) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          reg.name.toLowerCase().includes(q) ||
          reg.email.toLowerCase().includes(q) ||
          (reg.phone && reg.phone.includes(q))
        );
      }

      return true;
    });
  }, [allRegistrations, filterStatus, filterGender, searchQuery, waitlistIds]);

  const totalCount = allRegistrations.length;
  const approvedCount = allRegistrations.filter((r) => r.status === "approved").length;
  const pendingCount = allRegistrations.filter((r) => r.status === "pending").length;
  const rejectedCount = allRegistrations.filter((r) => r.status === "rejected").length;
  const waitlistedCount = waitlistIds.size;
  const maleCount = allRegistrations.filter((r) => r.gender === "male").length;
  const femaleCount = allRegistrations.filter((r) => r.gender === "female").length;

  const selectedRegistration = allRegistrations.find(
    (r) => r._id === selectedRegistrationId
  ) || null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRowClick = (registration: any) => {
    setSelectedRegistrationId(registration._id);
    setSheetOpen(true);
  };

  const handleDeleteRegistration = async (registrationId: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await deleteRegistration({ id: registrationId as any });
    } catch (error) {
      console.error("Error deleting registration:", error);
    }
  };

  const handleStatusUpdate = async (registrationId: string, newStatus: "approved" | "rejected") => {
    setUpdatingStatus(registrationId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateStatus({ id: registrationId as any, status: newStatus });
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleSaveSlots = async () => {
    setSavingSlots(true);
    try {
      await updateSlotLimits({
        maleSlots: Number(maleSlots),
        femaleSlots: Number(femaleSlots),
      });
      setSlotSaveMessage("Slot limits updated successfully");
    } catch (error) {
      console.error("Error updating slots:", error);
      setSlotSaveMessage("Failed to update slot limits");
    } finally {
      setSavingSlots(false);
    }
  };

  useEffect(() => {
    if (slotSaveMessage) {
      const timer = setTimeout(() => setSlotSaveMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [slotSaveMessage]);

  const handleExportCSV = () => {
    const headers = [
      "Number",
      "Name",
      "Age",
      "Gender",
      "Status",
      "Marital Status",
      "Education",
      "Job",
      "Email",
      "Phone",
      "Describe Yourself",
      "Looking For",
      "Payment Status",
      "Date",
    ];
    const rows = filteredRegistrations.map((r) => [
      registrationNumbers.get(r._id) || "",
      r.name,
      r.age,
      r.gender,
      r.status,
      r.maritalStatus,
      r.education,
      r.job,
      r.email,
      r.phone,
      (r.describeYourself || "").replace(/"/g, '""'),
      (r.lookingFor || "").replace(/"/g, '""'),
      r.paymentStatus || "",
      r._creationTime ? new Date(r._creationTime).toLocaleDateString() : "",
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((val) => `"${val}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registrations-${filterStatus}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveNotes = async (id: string, notes: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateAdminNotes({ id: id as any, adminNotes: notes });
    } catch (error) {
      console.error("Failed to save notes:", error);
    }
  };

  const handleFixPayments = async () => {
    setFixingPayments(true);
    setFixResult(null);
    try {
      const response = await fetch("/api/admin/fix-payments", {
        method: "POST",
      });
      const data = await response.json();
      if (response.ok) {
        setFixResult(
          `Checked ${data.sessionsChecked} sessions. Fixed ${data.fixed} payment(s). Sent ${data.emailsSent} email(s).`
        );
      } else {
        setFixResult(`Error: ${data.error}`);
      }
    } catch (error) {
      setFixResult("Failed to fix payments. Please try again.");
      console.error("Fix payments error:", error);
    } finally {
      setFixingPayments(false);
    }
  };

  const handleLogout = async () => {
    document.cookie = "admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    window.location.href = "/admin";
  };

  const stats = [
    { label: "Total registrations", value: totalCount, color: "zinc-300" },
    { label: "Approved", value: approvedCount, color: "green-500" },
    { label: "Pending", value: pendingCount, color: "yellow-500" },
    { label: "Rejected", value: rejectedCount, color: "red-500" },
    { label: "Waitlisted", value: waitlistedCount, color: "amber-500" },
    { label: "Males", value: maleCount, color: "blue-500" },
    { label: "Females", value: femaleCount, color: "pink-500" },
  ];

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-zinc-50 p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-semibold text-zinc-900">Admin Dashboard</h1>
              <p className="text-sm text-zinc-500 mt-1">Manage Taaruf registrations and settings</p>
            </div>
            <Button variant="outline" onClick={handleLogout} className="text-red-600 hover:bg-red-50">
              Logout
            </Button>
          </div>

          <Separator />

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className={`border-t-2 border-${stat.color} px-4 py-3`}
              >
                <p className="text-sm text-zinc-500 truncate">{stat.label}</p>
                <p className="text-2xl font-semibold tabular-nums text-zinc-900">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Slot Limits */}
          <Card>
            <CardHeader>
              <CardTitle>Slot limits</CardTitle>
              <CardDescription>Set maximum registration slots for each gender</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="male-slots" className="text-sm font-medium">
                    Male slots
                  </label>
                  <Input
                    id="male-slots"
                    type="number"
                    value={maleSlots}
                    onChange={(e) => setMaleSlots(e.target.value)}
                    placeholder="50"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="female-slots" className="text-sm font-medium">
                    Female slots
                  </label>
                  <Input
                    id="female-slots"
                    type="number"
                    value={femaleSlots}
                    onChange={(e) => setFemaleSlots(e.target.value)}
                    placeholder="50"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <Button onClick={handleSaveSlots} disabled={savingSlots}>
                  {savingSlots ? "Saving..." : "Save slot limits"}
                </Button>
                {slotSaveMessage && (
                  <p className="text-sm text-zinc-600">{slotSaveMessage}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Payment Reconciliation */}
          <Card>
            <CardHeader>
              <CardTitle>Payment reconciliation</CardTitle>
              <CardDescription>Fix mismatched payment statuses and send missing confirmation emails</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleFixPayments} disabled={fixingPayments} variant="outline">
                {fixingPayments ? "Fixing..." : "Fix payments and send emails"}
              </Button>
              {fixResult && (
                <p className="mt-3 text-sm text-zinc-700 bg-zinc-100 p-3 rounded-md">{fixResult}</p>
              )}
            </CardContent>
          </Card>

          {/* Registrations Table */}
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">Registrations</h2>
            <RegistrationsTable
              registrations={filteredRegistrations}
              allCount={totalCount}
              approvedCount={approvedCount}
              pendingCount={pendingCount}
              rejectedCount={rejectedCount}
              waitlistedCount={waitlistedCount}
              registrationNumbers={registrationNumbers}
              waitlistIds={waitlistIds}
              filterStatus={filterStatus}
              setFilterStatus={(s) => setFilterStatus(s as FilterStatus)}
              filterGender={filterGender}
              setFilterGender={(g) => setFilterGender(g as "all" | "male" | "female")}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onRowClick={handleRowClick}
              onExportCSV={handleExportCSV}
              onStatusUpdate={handleStatusUpdate}
              onDelete={handleDeleteRegistration}
              updatingStatus={updatingStatus}
              selectedId={selectedRegistrationId}
            />
          </div>

          {/* Registration Detail Sheet */}
          <RegistrationDetail
            registration={selectedRegistration}
            open={sheetOpen}
            onOpenChange={(open) => {
              setSheetOpen(open);
              if (!open) setSelectedRegistrationId(null);
            }}
            registrationNumber={
              selectedRegistration
                ? registrationNumbers.get(selectedRegistration._id)
                : undefined
            }
            isWaitlisted={
              selectedRegistration ? waitlistIds.has(selectedRegistration._id) : false
            }
            onStatusUpdate={handleStatusUpdate}
            onDelete={handleDeleteRegistration}
            onSaveNotes={handleSaveNotes}
            updatingStatus={updatingStatus}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

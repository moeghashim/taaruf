"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "../../convex/_generated/api";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminDashboard() {
  type FilterStatus = "all" | "approved" | "pending" | "rejected" | "waitlisted";

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [maleSlots, setMaleSlots] = useState<number | string>("");
  const [femaleSlots, setFemaleSlots] = useState<number | string>("");
  const [savingSlots, setSavingSlots] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [fixingPayments, setFixingPayments] = useState(false);
  const [fixResult, setFixResult] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<{ id: string; notes: string } | null>(null);

  const allRegistrations = useQuery(api.registrations.getAll) || [];
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
  }, [allRegistrations, filterStatus, searchQuery, waitlistIds]);

  const totalCount = allRegistrations.length;
  const approvedCount = allRegistrations.filter((r) => r.status === "approved").length;
  const pendingCount = allRegistrations.filter((r) => r.status === "pending").length;
  const rejectedCount = allRegistrations.filter((r) => r.status === "rejected").length;
  const waitlistedCount = waitlistIds.size;
  const maleCount = allRegistrations.filter((r) => r.gender === "male").length;
  const femaleCount = allRegistrations.filter((r) => r.gender === "female").length;

  const handleDeleteRegistration = async (registrationId: string) => {
    if (window.confirm("Are you sure you want to delete this registration?")) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await deleteRegistration({ id: registrationId as any });
      } catch (error) {
        console.error("Error deleting registration:", error);
        alert("Failed to delete registration");
      }
    }
  };

  const handleStatusUpdate = async (registrationId: string, newStatus: "approved" | "rejected") => {
    setUpdatingStatus(registrationId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateStatus({ id: registrationId as any, status: newStatus });
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Failed to update status");
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
      alert("Slot limits updated successfully");
    } catch (error) {
      console.error("Error updating slots:", error);
      alert("Failed to update slot limits");
    } finally {
      setSavingSlots(false);
    }
  };

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

  const handleSaveNotes = async () => {
    if (!editingNotes) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateAdminNotes({ id: editingNotes.id as any, adminNotes: editingNotes.notes });
      setEditingNotes(null);
    } catch (error) {
      console.error("Failed to save notes:", error);
      alert("Failed to save notes");
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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 mt-2">Manage Taaruf registrations and settings</p>
          </div>
          <Button variant="outline" onClick={handleLogout} className="text-red-600 hover:bg-red-50">
            Logout
          </Button>
        </div>

        <Separator />

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Registrations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-600">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{approvedCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-yellow-600">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{pendingCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-600">Rejected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{rejectedCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-amber-600">Waitlisted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-600">{waitlistedCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-600">Males</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{maleCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-pink-600">Females</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-pink-600">{femaleCount}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Slot Limits</CardTitle>
            <CardDescription>Set maximum registration slots for each gender</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="male-slots" className="text-sm font-medium">
                  Male Slots
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
                  Female Slots
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
            <Button onClick={handleSaveSlots} disabled={savingSlots} className="mt-4">
              {savingSlots ? "Saving..." : "Save Slot Limits"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Reconciliation</CardTitle>
            <CardDescription>Fix mismatched payment statuses and send missing confirmation emails</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleFixPayments} disabled={fixingPayments} variant="outline">
              {fixingPayments ? "Fixing..." : "Fix Payments & Send Emails"}
            </Button>
            {fixResult && (
              <p className="mt-3 text-sm text-slate-700 bg-slate-50 p-3 rounded-md">{fixResult}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registrations</CardTitle>
            <CardDescription>View and manage all registrations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Input
                type="text"
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
              <Button variant="outline" onClick={handleExportCSV}>
                Export CSV
              </Button>
            </div>

            <Tabs value={filterStatus} onValueChange={(value) => setFilterStatus(value as FilterStatus)}>
              <TabsList>
                <TabsTrigger value="all">
                  All <span className="ml-2 text-xs">{allRegistrations.length}</span>
                </TabsTrigger>
                <TabsTrigger value="approved">
                  Approved <span className="ml-2 text-xs">{approvedCount}</span>
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending <span className="ml-2 text-xs">{pendingCount}</span>
                </TabsTrigger>
                <TabsTrigger value="rejected">
                  Rejected <span className="ml-2 text-xs">{rejectedCount}</span>
                </TabsTrigger>
                <TabsTrigger value="waitlisted">
                  Waitlisted <span className="ml-2 text-xs">{waitlistedCount}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {filteredRegistrations.length === 0 ? (
              <p className="text-gray-500 py-8 text-center">No registrations found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">#</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Name</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Age</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Gender</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Marital</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Education</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Job</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Phone</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">About</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Looking For</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Payment</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Notes</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRegistrations.map((registration) => (
                      <tr key={registration._id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium text-gray-700">
                          {registrationNumbers.get(registration._id)}
                        </td>
                        <td className="py-3 px-4">{registration.name}</td>
                        <td className="py-3 px-4">{registration.age}</td>
                        <td className="py-3 px-4">
                          <Badge variant={registration.gender === "male" ? "default" : "secondary"}>
                            {registration.gender}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-1 flex-wrap">
                            <Badge
                              variant={
                                registration.status === "approved"
                                  ? "default"
                                  : registration.status === "rejected"
                                    ? "destructive"
                                    : "outline"
                              }
                              className={
                                registration.status === "approved"
                                  ? "bg-green-100 text-green-800"
                                  : registration.status === "rejected"
                                    ? "bg-red-100 text-red-800"
                                    : "bg-yellow-100 text-yellow-800"
                              }
                            >
                              {registration.status}
                            </Badge>
                            {waitlistIds.has(registration._id) && (
                              <Badge variant="outline" className="bg-amber-100 text-amber-800">
                                Waitlist
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs">{registration.maritalStatus || "-"}</td>
                        <td className="py-3 px-4 text-xs">{registration.education || "-"}</td>
                        <td className="py-3 px-4 text-xs">{registration.job || "-"}</td>
                        <td className="py-3 px-4 text-xs">{registration.email}</td>
                        <td className="py-3 px-4 text-xs">{registration.phone}</td>
                        <td className="py-3 px-4 text-xs max-w-[200px]">
                          {registration.describeYourself ? (
                            <Dialog>
                              <DialogTrigger asChild>
                                <button className="text-left truncate block max-w-[200px] text-blue-600 hover:underline cursor-pointer">
                                  {registration.describeYourself}
                                </button>
                              </DialogTrigger>
                              <DialogContent className="max-w-lg">
                                <DialogHeader>
                                  <DialogTitle>About - {registration.name}</DialogTitle>
                                </DialogHeader>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                                  {registration.describeYourself}
                                </p>
                              </DialogContent>
                            </Dialog>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs max-w-[200px]">
                          {registration.lookingFor ? (
                            <Dialog>
                              <DialogTrigger asChild>
                                <button className="text-left truncate block max-w-[200px] text-blue-600 hover:underline cursor-pointer">
                                  {registration.lookingFor}
                                </button>
                              </DialogTrigger>
                              <DialogContent className="max-w-lg">
                                <DialogHeader>
                                  <DialogTitle>Looking For - {registration.name}</DialogTitle>
                                </DialogHeader>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                                  {registration.lookingFor}
                                </p>
                              </DialogContent>
                            </Dialog>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <Badge
                            variant="outline"
                            className={
                              registration.paymentStatus === "paid"
                                ? "bg-green-100 text-green-800"
                                : registration.paymentStatus === "failed"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-yellow-100 text-yellow-800"
                            }
                          >
                            {registration.paymentStatus || "-"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {registration._creationTime ? formatDate(registration._creationTime) : "-"}
                        </td>
                        <td className="py-3 px-4 text-xs max-w-[200px]">
                          <Dialog>
                            <DialogTrigger asChild>
                              <button
                                className="text-left truncate block max-w-[200px] text-blue-600 hover:underline cursor-pointer"
                                onClick={() =>
                                  setEditingNotes({ id: registration._id, notes: registration.adminNotes || "" })
                                }
                              >
                                {registration.adminNotes || "Add note..."}
                              </button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                              <DialogHeader>
                                <DialogTitle>Notes - {registration.name}</DialogTitle>
                              </DialogHeader>
                              <textarea
                                value={editingNotes?.id === registration._id ? editingNotes.notes : (registration.adminNotes || "")}
                                onChange={(e) => setEditingNotes({ id: registration._id, notes: e.target.value })}
                                onFocus={() =>
                                  setEditingNotes({ id: registration._id, notes: registration.adminNotes || "" })
                                }
                                placeholder="Add notes about background check, follow-ups, etc..."
                                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                rows={4}
                              />
                              <Button onClick={handleSaveNotes} className="w-full">
                                Save Notes
                              </Button>
                            </DialogContent>
                          </Dialog>
                        </td>
                        <td className="py-3 px-4 space-x-2">
                          {(registration.status === "pending" || registration.status === "waitlisted") && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStatusUpdate(registration._id, "approved")}
                                disabled={updatingStatus === registration._id}
                                className="text-green-600 hover:bg-green-50"
                              >
                                {updatingStatus === registration._id ? "..." : "Approve"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStatusUpdate(registration._id, "rejected")}
                                disabled={updatingStatus === registration._id}
                                className="text-red-600 hover:bg-red-50"
                              >
                                {updatingStatus === registration._id ? "..." : "Reject"}
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteRegistration(registration._id)}
                            className="text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

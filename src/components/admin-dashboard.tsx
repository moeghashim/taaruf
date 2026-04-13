"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "../../convex/_generated/api";

type FilterStatus = "all" | "approved" | "pending" | "rejected" | "waitlisted";
type SearchStatus = "active" | "paused" | "inactive";

function titleizeValue(value?: string) {
  if (!value) return "-";
  return value.replace(/_/g, " ");
}

export default function AdminDashboard() {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [maleSlots, setMaleSlots] = useState<number | string>("");
  const [femaleSlots, setFemaleSlots] = useState<number | string>("");
  const [savingSlots, setSavingSlots] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<{ id: string; notes: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sendingUpdateProfile, setSendingUpdateProfile] = useState(false);
  const [updateProfileResult, setUpdateProfileResult] = useState<string | null>(null);
  const [fixingPayments, setFixingPayments] = useState(false);
  const [fixResult, setFixResult] = useState<string | null>(null);

  const allRegistrationsQuery = useQuery(api.registrations.getAll);
  const allRegistrations = useMemo(() => allRegistrationsQuery || [], [allRegistrationsQuery]);
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

  function toggleSelection(registrationId: string) {
    setSelectedIds((current) =>
      current.includes(registrationId)
        ? current.filter((id) => id !== registrationId)
        : [...current, registrationId]
    );
  }

  function toggleSelectAllFiltered() {
    if (selectedIds.length === filteredRegistrations.length && filteredRegistrations.length > 0) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(filteredRegistrations.map((registration) => registration._id));
  }

  async function handleDeleteRegistration(registrationId: string) {
    if (window.confirm("Are you sure you want to delete this registration?")) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await deleteRegistration({ id: registrationId as any });
      } catch (error) {
        console.error("Error deleting registration:", error);
        alert("Failed to delete registration");
      }
    }
  }

  async function handleStatusUpdate(registrationId: string, newStatus: "approved" | "rejected") {
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
  }

  async function handleSaveSlots() {
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
  }

  async function handleSaveNotes() {
    if (!editingNotes) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateAdminNotes({ id: editingNotes.id as any, adminNotes: editingNotes.notes });
      setEditingNotes(null);
    } catch (error) {
      console.error("Failed to save notes:", error);
      alert("Failed to save notes");
    }
  }

  async function handleSendUpdateProfile() {
    if (selectedIds.length === 0) {
      setUpdateProfileResult("Please select at least one applicant.");
      return;
    }

    setSendingUpdateProfile(true);
    setUpdateProfileResult(null);
    try {
      const response = await fetch("/api/admin/send-profile-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationIds: selectedIds }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to send profile update emails");
      }
      setUpdateProfileResult(
        `Update Profile emails sent: ${data.summary.sent}. Failed: ${data.summary.failed}.`
      );
      setSelectedIds([]);
    } catch (error) {
      setUpdateProfileResult(error instanceof Error ? error.message : String(error));
    } finally {
      setSendingUpdateProfile(false);
    }
  }

  async function handleFixPayments() {
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
  }

  function handleLogout() {
    document.cookie = "admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    window.location.href = "/admin";
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 mt-2">Manage Taaruf registrations and profile completion.</p>
          </div>
          <Button variant="outline" onClick={handleLogout} className="text-red-600 hover:bg-red-50">
            Logout
          </Button>
        </div>

        <Separator />

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-600">Total Registrations</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{totalCount}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-green-600">Approved</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-green-600">{approvedCount}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-yellow-600">Pending</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-yellow-600">{pendingCount}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-red-600">Rejected</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-red-600">{rejectedCount}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-amber-600">Waitlisted</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-amber-600">{waitlistedCount}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-blue-600">Males</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-blue-600">{maleCount}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-pink-600">Females</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-pink-600">{femaleCount}</div></CardContent></Card>
        </div>

        <Tabs defaultValue="registrations" className="space-y-6">
          <TabsList>
            <TabsTrigger value="registrations">Registrations</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="registrations" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Registrations</CardTitle>
                <CardDescription>Approve participants, track profile completion, and request profile updates.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-slate-100 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-4 flex-wrap">
                    <Input
                      type="text"
                      placeholder="Search by name, email, or phone..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="max-w-sm bg-white"
                    />
                    <Button variant="outline" size="sm" onClick={toggleSelectAllFiltered}>
                      {selectedIds.length === filteredRegistrations.length && filteredRegistrations.length > 0 ? "Clear Selection" : "Select All Filtered"}
                    </Button>
                    <Button size="sm" onClick={handleSendUpdateProfile} disabled={sendingUpdateProfile || selectedIds.length === 0}>
                      {sendingUpdateProfile ? "Sending..." : "Update Profile"}
                    </Button>
                  </div>
                  <Tabs value={filterStatus} onValueChange={(value) => setFilterStatus(value as FilterStatus)}>
                    <TabsList className="bg-slate-200">
                      <TabsTrigger value="all">All <span className="ml-2 text-xs">{allRegistrations.length}</span></TabsTrigger>
                      <TabsTrigger value="approved">Approved <span className="ml-2 text-xs">{approvedCount}</span></TabsTrigger>
                      <TabsTrigger value="pending">Pending <span className="ml-2 text-xs">{pendingCount}</span></TabsTrigger>
                      <TabsTrigger value="rejected">Rejected <span className="ml-2 text-xs">{rejectedCount}</span></TabsTrigger>
                      <TabsTrigger value="waitlisted">Waitlisted <span className="ml-2 text-xs">{waitlistedCount}</span></TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {updateProfileResult && <p className="text-sm text-slate-700 bg-white p-3 rounded-md">{updateProfileResult}</p>}
                </div>

                {filteredRegistrations.length === 0 ? (
                  <p className="text-gray-500 py-8 text-center">No registrations found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Select</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Name</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Approval</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Profile</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Details</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRegistrations.map((registration) => (
                          <tr key={registration._id} className="border-b hover:bg-gray-50 align-top">
                            <td className="py-3 px-4">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(registration._id)}
                                onChange={() => toggleSelection(registration._id)}
                                className="h-4 w-4"
                              />
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-start gap-3">
                                <div className="h-12 w-12 overflow-hidden rounded-md bg-slate-100 border border-slate-200 shrink-0">
                                  {registration.imageUrls?.[0] ? (
                                    <img
                                      src={registration.imageUrls[0]}
                                      alt={`${registration.name} profile thumbnail`}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                                      No photo
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <div className="font-medium">{registration.name}</div>
                                  <div className="text-xs text-slate-500">{registration.email}</div>
                                  <div className="text-xs text-slate-500">{registration.phone}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex gap-1 flex-wrap">
                                <Badge className={registration.status === "approved" ? "bg-green-100 text-green-800" : registration.status === "rejected" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}>
                                  {registration.status}
                                </Badge>
                                {waitlistIds.has(registration._id) && <Badge variant="outline" className="bg-amber-100 text-amber-800">Waitlist</Badge>}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs">
                              <div className="space-y-1">
                                <Badge variant="outline">{registration.profileCompletionStatus || "not_started"}</Badge>
                                <div>Photos: {registration.imageStorageIds?.length || 0}</div>
                                <div>Permission: {titleizeValue(registration.photoSharingPermission || "ask_me_first")}</div>
                                <div>Email sent: {registration.profileUpdateEmailSent ? "Yes" : "No"}</div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <button className="text-left text-blue-600 hover:underline">View profile details</button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl">
                                  <DialogHeader><DialogTitle>{registration.name}</DialogTitle></DialogHeader>
                                  <div className="grid gap-4 md:grid-cols-2 text-sm">
                                    <div><strong>Age:</strong> {registration.age}</div>
                                    <div><strong>Gender:</strong> {registration.gender}</div>
                                    <div><strong>Marital:</strong> {registration.maritalStatus}</div>
                                    <div><strong>Education:</strong> {registration.education}</div>
                                    <div><strong>Job:</strong> {registration.job}</div>
                                    <div><strong>Ethnicity:</strong> {registration.ethnicity || "-"}</div>
                                    <div><strong>Prayer:</strong> {titleizeValue(registration.prayerCommitment)}</div>
                                    <div><strong>Hijab:</strong> {titleizeValue(registration.hijabResponse)}</div>
                                    <div><strong>Photo permission:</strong> {titleizeValue(registration.photoSharingPermission)}</div>
                                    <div><strong>Search status:</strong> {titleizeValue((registration.searchStatus || "active") as SearchStatus)}</div>
                                  </div>
                                  <div className="space-y-3 text-sm">
                                    <div>
                                      <strong>Photos:</strong>
                                      {registration.imageUrls?.length ? (
                                        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                          {registration.imageUrls.map((imageUrl: string, index: number) => (
                                            <a
                                              key={`${registration._id}-image-${index}`}
                                              href={imageUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="block overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                                            >
                                              <img
                                                src={imageUrl}
                                                alt={`${registration.name} profile image ${index + 1}`}
                                                className="h-32 w-full object-cover"
                                              />
                                            </a>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="mt-1 text-slate-500">No profile photos uploaded.</p>
                                      )}
                                    </div>
                                    <div><strong>Requirement 1:</strong> {registration.spouseRequirement1 || "-"}</div>
                                    <div><strong>Requirement 2:</strong> {registration.spouseRequirement2 || "-"}</div>
                                    <div><strong>Requirement 3:</strong> {registration.spouseRequirement3 || "-"}</div>
                                    <div><strong>Basic bio:</strong><p className="whitespace-pre-wrap">{registration.shareableBio || "-"}</p></div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </td>
                            <td className="py-3 px-4 space-y-2">
                              {(registration.status === "pending" || registration.status === "waitlisted") && (
                                <div className="flex flex-col gap-2">
                                  <Button variant="ghost" size="sm" onClick={() => handleStatusUpdate(registration._id, "approved")} disabled={updatingStatus === registration._id} className="text-green-600 hover:bg-green-50">{updatingStatus === registration._id ? "..." : "Approve"}</Button>
                                  <Button variant="ghost" size="sm" onClick={() => handleStatusUpdate(registration._id, "rejected")} disabled={updatingStatus === registration._id} className="text-red-600 hover:bg-red-50">{updatingStatus === registration._id ? "..." : "Reject"}</Button>
                                </div>
                              )}
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm">Notes</Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-lg">
                                  <DialogHeader><DialogTitle>Notes - {registration.name}</DialogTitle></DialogHeader>
                                  <textarea
                                    value={editingNotes?.id === registration._id ? editingNotes.notes : (registration.adminNotes || "")}
                                    onChange={(e) => setEditingNotes({ id: registration._id, notes: e.target.value })}
                                    onFocus={() => setEditingNotes({ id: registration._id, notes: registration.adminNotes || "" })}
                                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    rows={4}
                                  />
                                  <Button onClick={handleSaveNotes} className="w-full">Save Notes</Button>
                                </DialogContent>
                              </Dialog>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteRegistration(registration._id)} className="text-red-600 hover:bg-red-50">Delete</Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Slot Limits</CardTitle>
                <CardDescription>Set maximum registration slots for each gender</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="male-slots" className="text-sm font-medium">Male Slots</label>
                    <Input id="male-slots" type="number" value={maleSlots} onChange={(e) => setMaleSlots(e.target.value)} placeholder="50" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="female-slots" className="text-sm font-medium">Female Slots</label>
                    <Input id="female-slots" type="number" value={femaleSlots} onChange={(e) => setFemaleSlots(e.target.value)} placeholder="50" />
                  </div>
                </div>
                <Button onClick={handleSaveSlots} disabled={savingSlots} className="mt-4">{savingSlots ? "Saving..." : "Save Slot Limits"}</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Reconciliation</CardTitle>
                <CardDescription>Fix mismatched payment statuses and send missing confirmation emails</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleFixPayments} disabled={fixingPayments} variant="outline">{fixingPayments ? "Fixing..." : "Fix Payments & Send Emails"}</Button>
                {fixResult && <p className="mt-3 text-sm text-slate-700 bg-slate-50 p-3 rounded-md">{fixResult}</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

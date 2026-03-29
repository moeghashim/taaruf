"use client";

import { useQuery, useMutation } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { api } from "../../convex/_generated/api";
// Simple date formatter
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminDashboard() {
  type FilterStatus = "all" | "paid" | "pending";
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [maleSlots, setMaleSlots] = useState<number | string>("");
  const [femaleSlots, setFemaleSlots] = useState<number | string>("");
  const [savingSlots, setSavingSlots] = useState(false);

  // Queries
  const allRegistrations = useQuery(api.registrations.getAll) || [];
  const slotLimits = useQuery(api.settings.getSlotLimits);

  // Mutations
  const deleteRegistration = useMutation(api.registrations.deleteRegistration);
  const updateSlotLimits = useMutation(api.settings.updateSlotLimits);
  // Logout is handled client-side by clearing the cookie

  // Initialize slot inputs on load
  if (slotLimits && !maleSlots && !femaleSlots) {
    setMaleSlots(slotLimits.maleSlots || 40);
    setFemaleSlots(slotLimits.femaleSlots || 40);
  }

  // Filter registrations
  const filteredRegistrations = allRegistrations.filter((reg) => {
    if (filterStatus === "all") return true;
    if (filterStatus === "paid") return reg.paymentStatus === "paid";
    if (filterStatus === "pending") return reg.paymentStatus === "pending";
    return true;
  });

  // Statistics
  const totalCount = allRegistrations.length;
  const paidCount = allRegistrations.filter((r) => r.paymentStatus === "paid").length;
  const pendingCount = allRegistrations.filter((r) => r.paymentStatus === "pending").length;
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

  const handleLogout = async () => {
    // Clear the cookie by making a request, or redirect
    document.cookie = "admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    window.location.href = "/admin";
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 mt-2">Manage Taaruf registrations and settings</p>
          </div>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="text-red-600 hover:bg-red-50"
          >
            Logout
          </Button>
        </div>

        <Separator />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
              <CardTitle className="text-sm font-medium text-green-600">Paid</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{paidCount}</div>
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

        {/* Slot Limits Settings */}
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
            <Button
              onClick={handleSaveSlots}
              disabled={savingSlots}
              className="mt-4"
            >
              {savingSlots ? "Saving..." : "Save Slot Limits"}
            </Button>
          </CardContent>
        </Card>

        {/* Registrations */}
        <Card>
          <CardHeader>
            <CardTitle>Registrations</CardTitle>
            <CardDescription>View and manage all registrations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="all" onValueChange={(value) => setFilterStatus(value as FilterStatus)}>
              <TabsList>
                <TabsTrigger value="all">
                  All <span className="ml-2 text-xs">{allRegistrations.length}</span>
                </TabsTrigger>
                <TabsTrigger value="paid">
                  Paid <span className="ml-2 text-xs">{paidCount}</span>
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending <span className="ml-2 text-xs">{pendingCount}</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value={filterStatus} className="space-y-4 mt-4">
                {filteredRegistrations.length === 0 ? (
                  <p className="text-gray-500 py-8 text-center">No registrations found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Name</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Age</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Gender</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Marital</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Education</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Job</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Phone</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRegistrations.map((registration) => (
                          <tr key={registration._id} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4">{registration.name}</td>
                            <td className="py-3 px-4">{registration.age}</td>
                            <td className="py-3 px-4">
                              <Badge variant={registration.gender === "male" ? "default" : "secondary"}>
                                {registration.gender}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                variant={
                                  registration.paymentStatus === "paid"
                                    ? "default"
                                    : "outline"
                                }
                                className={
                                  registration.paymentStatus === "paid"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-yellow-100 text-yellow-800"
                                }
                              >
                                {registration.paymentStatus}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-xs">
                              {registration.maritalStatus || "-"}
                            </td>
                            <td className="py-3 px-4 text-xs">
                              {registration.education || "-"}
                            </td>
                            <td className="py-3 px-4 text-xs">
                              {registration.job || "-"}
                            </td>
                            <td className="py-3 px-4 text-xs">{registration.email}</td>
                            <td className="py-3 px-4 text-xs">{registration.phone}</td>
                            <td className="py-3 px-4 text-xs">
                              {registration._creationTime
                                ? formatDate(registration._creationTime)
                                : "-"}
                            </td>
                            <td className="py-3 px-4">
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
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

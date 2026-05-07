"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export type RegistrationDoc = NonNullable<ReturnType<typeof useAllRegistrations>>[number];
export type FilterStatus = "all" | "approved" | "pending" | "rejected" | "waitlisted";
export type FilterGender = "all" | "male" | "female";
export type FilterProfileCompletionStatus = "all" | "completed" | "in_progress" | "not_started";

function useAllRegistrations() {
  return useQuery(api.registrations.getAll);
}

/**
 * Single source of truth for the admin Profiles surface — wraps the
 * Convex queries + mutations plus the derived state (event waitlist ids,
 * registration numbers, counts, filter helpers) so each page can stay
 * focused on rendering.
 */
export function useRegistrations() {
  const registrationsRaw = useAllRegistrations();
  const eventWaitlistedRegistrationIds = useQuery(api.events.getWaitlistedRegistrationIds);

  const updateStatusMutation = useMutation(api.registrations.updateStatus);
  const deleteMutation = useMutation(api.registrations.deleteRegistration);
  const updateNotesMutation = useMutation(api.registrations.updateAdminNotes);

  const registrations = useMemo(() => registrationsRaw ?? [], [registrationsRaw]);
  const isLoading =
    registrationsRaw === undefined || eventWaitlistedRegistrationIds === undefined;

  const sortedRegistrations = useMemo(
    () => [...registrations].sort((a, b) => a._creationTime - b._creationTime),
    [registrations]
  );

  const registrationNumbers = useMemo(
    () => new Map(sortedRegistrations.map((r, i) => [r._id, i + 1])),
    [sortedRegistrations]
  );

  const waitlistIds = useMemo(
    () => new Set<string>((eventWaitlistedRegistrationIds ?? []).map((id) => String(id))),
    [eventWaitlistedRegistrationIds]
  );

  const counts = useMemo(
    () => ({
      total: registrations.length,
      approved: registrations.filter((r) => r.status === "approved").length,
      pending: registrations.filter((r) => r.status === "pending").length,
      rejected: registrations.filter((r) => r.status === "rejected").length,
      waitlisted: waitlistIds.size,
      male: registrations.filter((r) => r.gender === "male").length,
      female: registrations.filter((r) => r.gender === "female").length,
    }),
    [registrations, waitlistIds]
  );

  const filterRegistrations = (
    status: FilterStatus,
    gender: FilterGender,
    search: string,
    profileCompletionStatus: FilterProfileCompletionStatus = "all"
  ) =>
    registrations.filter((reg) => {
      if (status === "waitlisted") {
        if (!waitlistIds.has(reg._id)) return false;
      } else if (status !== "all" && reg.status !== status) {
        return false;
      }
      if (gender !== "all" && reg.gender !== gender) return false;
      if (
        profileCompletionStatus !== "all" &&
        (reg.profileCompletionStatus ?? "not_started") !== profileCompletionStatus
      ) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          reg.name.toLowerCase().includes(q) ||
          reg.email.toLowerCase().includes(q) ||
          (reg.phone && reg.phone.includes(q))
        );
      }
      return true;
    });

  const updateStatus = (id: string, status: "approved" | "rejected") =>
    updateStatusMutation({ id: id as Id<"registrations">, status });

  const deleteRegistration = (id: string) =>
    deleteMutation({ id: id as Id<"registrations"> });

  const updateAdminNotes = (id: string, adminNotes: string) =>
    updateNotesMutation({ id: id as Id<"registrations">, adminNotes });

  return {
    isLoading,
    registrations,
    sortedRegistrations,
    registrationNumbers,
    waitlistIds,
    counts,
    filterRegistrations,
    actions: {
      updateStatus,
      deleteRegistration,
      updateAdminNotes,
    },
  };
}

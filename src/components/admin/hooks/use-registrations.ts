"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export type RegistrationDoc = NonNullable<ReturnType<typeof useAllRegistrations>>[number];
export type FilterStatus = "all" | "approved" | "pending" | "rejected" | "waitlisted";
export type FilterGender = "all" | "male" | "female";

function useAllRegistrations() {
  return useQuery(api.registrations.getAll);
}

/**
 * Single source of truth for the admin Profiles surface — wraps the
 * Convex queries + mutations that the legacy admin-dashboard.tsx used,
 * plus the derived state (waitlist computation, registration numbers,
 * counts, filter helpers) so each page can stay focused on rendering.
 */
export function useRegistrations() {
  const registrationsRaw = useAllRegistrations();
  const slotLimits = useQuery(api.settings.getSlotLimits);

  const updateStatusMutation = useMutation(api.registrations.updateStatus);
  const deleteMutation = useMutation(api.registrations.deleteRegistration);
  const updateNotesMutation = useMutation(api.registrations.updateAdminNotes);
  const updateSlotsMutation = useMutation(api.settings.updateSlotLimits);

  const registrations = useMemo(() => registrationsRaw ?? [], [registrationsRaw]);
  const isLoading = registrationsRaw === undefined;

  const maleLimit = slotLimits?.maleSlots ?? 40;
  const femaleLimit = slotLimits?.femaleSlots ?? 40;

  const sortedRegistrations = useMemo(
    () => [...registrations].sort((a, b) => a._creationTime - b._creationTime),
    [registrations]
  );

  const registrationNumbers = useMemo(
    () => new Map(sortedRegistrations.map((r, i) => [r._id, i + 1])),
    [sortedRegistrations]
  );

  const waitlistIds = useMemo(() => {
    const males = sortedRegistrations.filter((r) => r.gender === "male" && r.status !== "rejected");
    const females = sortedRegistrations.filter(
      (r) => r.gender === "female" && r.status !== "rejected"
    );
    const ids = new Set<string>();
    males.slice(maleLimit).forEach((r) => ids.add(r._id));
    females.slice(femaleLimit).forEach((r) => ids.add(r._id));
    return ids;
  }, [sortedRegistrations, maleLimit, femaleLimit]);

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

  const filterRegistrations = (status: FilterStatus, gender: FilterGender, search: string) =>
    registrations.filter((reg) => {
      if (status === "waitlisted") {
        if (!waitlistIds.has(reg._id)) return false;
      } else if (status !== "all" && reg.status !== status) {
        return false;
      }
      if (gender !== "all" && reg.gender !== gender) return false;
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

  const updateSlotLimits = (maleSlots: number, femaleSlots: number) =>
    updateSlotsMutation({ maleSlots, femaleSlots });

  return {
    isLoading,
    registrations,
    sortedRegistrations,
    registrationNumbers,
    waitlistIds,
    counts,
    slotLimits: { male: maleLimit, female: femaleLimit, raw: slotLimits },
    filterRegistrations,
    actions: {
      updateStatus,
      deleteRegistration,
      updateAdminNotes,
      updateSlotLimits,
    },
  };
}

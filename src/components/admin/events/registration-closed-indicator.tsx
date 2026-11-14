import { Pill } from "@/components/admin/primitives/status-pill";

export function registrationIsClosed(closesAt: number | undefined, now = Date.now()) {
  return Boolean(closesAt && closesAt < now);
}

/** Read-only registration state, independent of the event's Scheduled status. */
export function RegistrationClosedIndicator({ closesAt, now = Date.now() }: { closesAt?: number; now?: number }) {
  return registrationIsClosed(closesAt, now) ? <Pill tone="rose">Registration closed</Pill> : null;
}

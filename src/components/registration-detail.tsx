"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Registration = any;

interface Props {
  registration: Registration | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registrationNumber?: number;
  isWaitlisted: boolean;
  onStatusUpdate: (id: string, status: "approved" | "rejected") => Promise<void>;
  onDelete: (id: string) => void;
  onSaveNotes: (id: string, notes: string) => Promise<void>;
  updatingStatus: string | null;
}

export function RegistrationDetail({
  registration,
  open,
  onOpenChange,
  registrationNumber,
  isWaitlisted,
  onStatusUpdate,
  onDelete,
  onSaveNotes,
  updatingStatus,
}: Props) {
  const [adminNotes, setAdminNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (registration?._id) {
      setAdminNotes(registration.adminNotes || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registration?._id]);

  if (!registration) return null;

  const isPendingOrWaitlisted =
    registration.status === "pending" || isWaitlisted;

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await onSaveNotes(registration._id, adminNotes);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDelete = () => {
    setDeleteDialogOpen(false);
    onDelete(registration._id);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            {registrationNumber !== undefined && (
              <Badge variant="outline" className="tabular-nums">
                #{registrationNumber}
              </Badge>
            )}
            <div className="flex items-center gap-1.5">
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
              {isWaitlisted && (
                <Badge variant="outline" className="bg-amber-100 text-amber-800">
                  WL
                </Badge>
              )}
            </div>
          </div>
          <SheetTitle className="text-xl font-semibold">
            {registration.name}
          </SheetTitle>
          <SheetDescription>
            {registration.gender === "male" ? "Male" : "Female"}, {registration.age} years old
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-0">
          {/* Personal info */}
          <div className="border-t border-zinc-950/5 py-4">
            <h3 className="text-sm font-medium text-zinc-500 mb-3">Personal information</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-500">Marital status</p>
                <p className="text-sm text-zinc-900">{registration.maritalStatus || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500">Education</p>
                <p className="text-sm text-zinc-900">{registration.education || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500">Job</p>
                <p className="text-sm text-zinc-900">{registration.job || "-"}</p>
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="border-t border-zinc-950/5 py-4">
            <h3 className="text-sm font-medium text-zinc-500 mb-3">Contact</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-500">Email</p>
                <a
                  href={`mailto:${registration.email}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {registration.email}
                </a>
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500">Phone</p>
                <a
                  href={`tel:${registration.phone}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {registration.phone}
                </a>
              </div>
            </div>
          </div>

          {/* About */}
          {registration.describeYourself && (
            <div className="border-t border-zinc-950/5 py-4">
              <h3 className="text-sm font-medium text-zinc-500 mb-2">About</h3>
              <p className="text-sm text-zinc-900 whitespace-pre-wrap text-pretty">
                {registration.describeYourself}
              </p>
            </div>
          )}

          {/* Looking for */}
          {registration.lookingFor && (
            <div className="border-t border-zinc-950/5 py-4">
              <h3 className="text-sm font-medium text-zinc-500 mb-2">Looking for</h3>
              <p className="text-sm text-zinc-900 whitespace-pre-wrap text-pretty">
                {registration.lookingFor}
              </p>
            </div>
          )}

          {/* Payment & date */}
          <div className="border-t border-zinc-950/5 py-4">
            <h3 className="text-sm font-medium text-zinc-500 mb-3">Payment and date</h3>
            <div className="flex items-center gap-4">
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
                {registration.paymentStatus || "pending"}
              </Badge>
              <span className="text-sm text-zinc-500">
                Registered {formatDate(registration._creationTime)}
              </span>
            </div>
          </div>

          {/* Admin notes */}
          <div className="border-t border-zinc-950/5 py-4">
            <h3 className="text-sm font-medium text-zinc-500 mb-2">Admin notes</h3>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Add notes about background check, follow-ups, etc..."
              className="flex min-h-[100px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              rows={4}
            />
            <Button
              onClick={handleSaveNotes}
              disabled={savingNotes}
              size="sm"
              variant="outline"
              className="mt-2"
            >
              {savingNotes ? "Saving..." : "Save notes"}
            </Button>
          </div>

          {/* Actions */}
          <div className="border-t border-zinc-950/5 py-4">
            <h3 className="text-sm font-medium text-zinc-500 mb-3">Actions</h3>
            <div className="flex items-center gap-2 flex-wrap">
              {isPendingOrWaitlisted && (
                <>
                  <Button
                    onClick={() => onStatusUpdate(registration._id, "approved")}
                    disabled={updatingStatus === registration._id}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {updatingStatus === registration._id ? "Updating..." : "Approve"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onStatusUpdate(registration._id, "rejected")}
                    disabled={updatingStatus === registration._id}
                    className="border-red-300 text-red-600 hover:bg-red-50"
                  >
                    {updatingStatus === registration._id ? "Updating..." : "Reject"}
                  </Button>
                </>
              )}
              <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="text-zinc-500 hover:text-red-600"
                  >
                    Delete registration
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete registration</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-zinc-600">
                    Are you sure you want to delete the registration for{" "}
                    <span className="font-medium text-zinc-900">{registration.name}</span>?
                    This action cannot be undone.
                  </p>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button
                      variant="outline"
                      onClick={() => setDeleteDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDelete}
                    >
                      Delete
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

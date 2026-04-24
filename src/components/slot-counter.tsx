"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card } from "@/components/ui/card";

export function SlotCounter() {
  const stats = useQuery(api.registrations.getStats);

  if (!stats) {
    return null;
  }

  const malePercentage = (stats.maleCount / stats.maleLimit) * 100;
  const femalePercentage = (stats.femaleCount / stats.femaleLimit) * 100;

  const maleSlotsFull = stats.maleCount >= stats.maleLimit;
  const femaleSlotsFull = stats.femaleCount >= stats.femaleLimit;

  return (
    <div className="flex justify-center gap-8 flex-wrap">
      {/* Male Slots */}
      <Card className="p-6 w-full max-w-sm">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Male Slots</h3>
            <span className={`text-sm font-medium ${maleSlotsFull ? "text-amber-600" : "text-green-600"}`}>
              {stats.maleCount} / {stats.maleLimit}
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${maleSlotsFull ? "bg-amber-500" : "bg-blue-500"}`}
              style={{ width: `${Math.min(malePercentage, 100)}%` }}
            ></div>
          </div>
          {maleSlotsFull ? (
            <p className="text-amber-600 text-sm font-medium">Waitlist open</p>
          ) : (
            <p className="text-slate-600 text-sm">
              {stats.maleLimit - stats.maleCount} spot{stats.maleLimit - stats.maleCount !== 1 ? "s" : ""} remaining
            </p>
          )}
        </div>
      </Card>

      {/* Female Slots */}
      <Card className="p-6 w-full max-w-sm">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Female Slots</h3>
            <span className={`text-sm font-medium ${femaleSlotsFull ? "text-amber-600" : "text-green-600"}`}>
              {stats.femaleCount} / {stats.femaleLimit}
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${femaleSlotsFull ? "bg-amber-500" : "bg-pink-500"}`}
              style={{ width: `${Math.min(femalePercentage, 100)}%` }}
            ></div>
          </div>
          {femaleSlotsFull ? (
            <p className="text-amber-600 text-sm font-medium">Waitlist open</p>
          ) : (
            <p className="text-slate-600 text-sm">
              {stats.femaleLimit - stats.femaleCount} spot{stats.femaleLimit - stats.femaleCount !== 1 ? "s" : ""} remaining
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

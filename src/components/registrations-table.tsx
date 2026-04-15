"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MoreHorizontal, Eye, Check, X, Trash2 } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Registration = any;

interface Props {
  registrations: Registration[];
  allCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  waitlistedCount: number;
  registrationNumbers: Map<string, number>;
  waitlistIds: Set<string>;
  filterStatus: string;
  setFilterStatus: (s: string) => void;
  filterGender: string;
  setFilterGender: (g: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onRowClick: (registration: Registration) => void;
  onExportCSV: () => void;
  onStatusUpdate: (id: string, status: "approved" | "rejected") => Promise<void>;
  onDelete: (id: string) => void;
  updatingStatus: string | null;
  selectedId: string | null;
}

export function RegistrationsTable({
  registrations,
  allCount,
  approvedCount,
  pendingCount,
  rejectedCount,
  waitlistedCount,
  registrationNumbers,
  waitlistIds,
  filterStatus,
  setFilterStatus,
  filterGender,
  setFilterGender,
  searchQuery,
  setSearchQuery,
  onRowClick,
  onExportCSV,
  onStatusUpdate,
  onDelete,
  updatingStatus,
  selectedId,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="bg-zinc-100 rounded-lg p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <Input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm bg-white"
          />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-600">Gender:</span>
            <Button
              variant={filterGender === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterGender("all")}
            >
              All
            </Button>
            <Button
              variant={filterGender === "male" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterGender("male")}
              className={filterGender === "male" ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              Male
            </Button>
            <Button
              variant={filterGender === "female" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterGender("female")}
              className={filterGender === "female" ? "bg-pink-600 hover:bg-pink-700" : ""}
            >
              Female
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={onExportCSV}>
            Export CSV
          </Button>
        </div>
      </div>

      <Tabs value={filterStatus} onValueChange={setFilterStatus}>
        <TabsList>
          <TabsTrigger value="all">
            All <span className="ml-1.5 text-sm tabular-nums">{allCount}</span>
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved <span className="ml-1.5 text-sm tabular-nums">{approvedCount}</span>
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending <span className="ml-1.5 text-sm tabular-nums">{pendingCount}</span>
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected <span className="ml-1.5 text-sm tabular-nums">{rejectedCount}</span>
          </TabsTrigger>
          <TabsTrigger value="waitlisted">
            Waitlisted <span className="ml-1.5 text-sm tabular-nums">{waitlistedCount}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {registrations.length === 0 ? (
        <p className="text-zinc-500 py-8 text-center text-sm">No registrations found</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="whitespace-nowrap text-left py-3 px-4 font-semibold text-zinc-700">
                  #
                </th>
                <th className="whitespace-nowrap text-left py-3 px-4 font-semibold text-zinc-700">
                  Name
                </th>
                <th className="whitespace-nowrap text-left py-3 px-4 font-semibold text-zinc-700">
                  Gender
                </th>
                <th className="whitespace-nowrap text-left py-3 px-4 font-semibold text-zinc-700">
                  Status
                </th>
                <th className="whitespace-nowrap text-left py-3 px-4 font-semibold text-zinc-700">
                  Payment
                </th>
                <th className="whitespace-nowrap text-left py-3 px-4 font-semibold text-zinc-700">
                  Email
                </th>
                <th className="whitespace-nowrap text-left py-3 px-4 font-semibold text-zinc-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((registration) => {
                const isSelected = selectedId === registration._id;
                const isPendingOrWaitlisted =
                  registration.status === "pending" ||
                  waitlistIds.has(registration._id);

                return (
                  <tr
                    key={registration._id}
                    onClick={() => onRowClick(registration)}
                    className={`border-b border-zinc-100 cursor-pointer hover:bg-zinc-50 ${
                      isSelected ? "bg-zinc-100" : ""
                    }`}
                  >
                    <td className="py-3 px-4 tabular-nums text-zinc-700">
                      {registrationNumbers.get(registration._id)}
                    </td>
                    <td className="py-3 px-4 font-medium text-zinc-900">
                      {registration.name}
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={registration.gender === "male" ? "default" : "secondary"}
                        className={
                          registration.gender === "male"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-pink-100 text-pink-800"
                        }
                      >
                        {registration.gender}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
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
                            WL
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
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
                    </td>
                    <td className="py-3 px-4">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block max-w-[200px] truncate text-zinc-700">
                            {registration.email}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{registration.email}</p>
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-3 px-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onRowClick(registration);
                            }}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View details
                          </DropdownMenuItem>
                          {isPendingOrWaitlisted && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-green-600"
                                disabled={updatingStatus === registration._id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onStatusUpdate(registration._id, "approved");
                                }}
                              >
                                <Check className="mr-2 h-4 w-4" />
                                Approve
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                disabled={updatingStatus === registration._id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onStatusUpdate(registration._id, "rejected");
                                }}
                              >
                                <X className="mr-2 h-4 w-4" />
                                Reject
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(registration._id);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

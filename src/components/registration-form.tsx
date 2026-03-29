"use client";

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface RegistrationFormData {
  name: string;
  age: number;
  gender: "male" | "female" | "";
  maritalStatus: string;
  education: string;
  job: string;
  email: string;
  phone: string;
  describeYourself: string;
  lookingFor: string;
  backgroundCheck: string;
}

export function RegistrationForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const stats = useQuery(api.registrations.getStats) as { maleCount: number; femaleCount: number; maleLimit: number; femaleLimit: number } | undefined;

  const form = useForm({
    defaultValues: {
      name: "",
      age: 0,
      gender: "",
      maritalStatus: "",
      education: "",
      job: "",
      email: "",
      phone: "",
      describeYourself: "",
      lookingFor: "",
      backgroundCheck: "",
    } as RegistrationFormData,
    onSubmit: async ({ value }) => {
      setIsSubmitting(true);
      try {
        const response = await fetch("/api/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: value.name,
            age: value.age,
            gender: value.gender,
            maritalStatus: value.maritalStatus,
            education: value.education,
            job: value.job,
            email: value.email,
            phone: value.phone,
            describeYourself: value.describeYourself || undefined,
            lookingFor: value.lookingFor || undefined,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to create checkout session");
        }

        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } catch (error) {
        console.error("Registration error:", error);
        alert("Failed to proceed to payment. Please try again.");
        setIsSubmitting(false);
      }
    },
  });

  // Check if slots are full
  const isMaleFull = stats && stats.maleCount >= stats.maleLimit;
  const isFemaleFull = stats && stats.femaleCount >= stats.femaleLimit;

  return (
    <Card className="p-8 shadow-lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-6"
      >
        {/* Name Field */}
        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) =>
              !value || value.trim().length === 0 ? "Name is required" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Full Name *</Label>
              <Input
                id={field.name}
                type="text"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="Enter your full name"
                className="h-10"
              />
              {field.state.meta.errors?.length > 0 && (
                <p className="text-red-500 text-sm">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        {/* Age Field */}
        <form.Field
          name="age"
          validators={{
            onChange: ({ value }) => {
              if (!value) return "Age is required";
              if (value < 18 || value > 99) return "Age must be between 18 and 99";
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Age *</Label>
              <Input
                id={field.name}
                type="number"
                min="18"
                max="99"
                value={field.state.value || ""}
                onChange={(e) => field.handleChange(parseInt(e.target.value) || 0)}
                onBlur={field.handleBlur}
                placeholder="18-99"
                className="h-10"
              />
              {field.state.meta.errors?.length > 0 && (
                <p className="text-red-500 text-sm">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        {/* Gender Field */}
        <form.Field
          name="gender"
          validators={{
            onChange: ({ value }) =>
              !value ? "Gender is required" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-3">
              <Label>Gender *</Label>
              <RadioGroup
                value={field.state.value}
                onValueChange={(val) => field.handleChange(val as "male" | "female" | "")}
                onBlur={field.handleBlur}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem
                    value="male"
                    id="male"
                    disabled={isMaleFull}
                  />
                  <Label htmlFor="male" className="font-normal cursor-pointer">
                    Male {isMaleFull && <span className="text-red-500 text-sm ml-2">(Slots Full)</span>}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem
                    value="female"
                    id="female"
                    disabled={isFemaleFull}
                  />
                  <Label htmlFor="female" className="font-normal cursor-pointer">
                    Female {isFemaleFull && <span className="text-red-500 text-sm ml-2">(Slots Full)</span>}
                  </Label>
                </div>
              </RadioGroup>
              {field.state.meta.errors?.length > 0 && (
                <p className="text-red-500 text-sm">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        {/* Marital Status Field */}
        <form.Field
          name="maritalStatus"
          validators={{
            onChange: ({ value }) =>
              !value ? "Marital status is required" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="maritalStatus">Marital Status *</Label>
              <Select value={field.state.value} onValueChange={(value) => field.handleChange(value)}>
                <SelectTrigger id="maritalStatus" onBlur={field.handleBlur}>
                  <SelectValue placeholder="Select marital status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="divorced">Divorced</SelectItem>
                  <SelectItem value="divorced_with_children">Divorced with Children</SelectItem>
                  <SelectItem value="widowed">Widowed</SelectItem>
                  <SelectItem value="widowed_with_children">Widowed with Children</SelectItem>
                </SelectContent>
              </Select>
              {field.state.meta.errors?.length > 0 && (
                <p className="text-red-500 text-sm">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        {/* Education Field */}
        <form.Field
          name="education"
          validators={{
            onChange: ({ value }) =>
              !value ? "Education is required" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="education">Education Level *</Label>
              <Select value={field.state.value} onValueChange={(value) => field.handleChange(value)}>
                <SelectTrigger id="education" onBlur={field.handleBlur}>
                  <SelectValue placeholder="Select education level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="highSchool">High School</SelectItem>
                  <SelectItem value="bachelor">Bachelor&apos;s</SelectItem>
                  <SelectItem value="master">Master&apos;s</SelectItem>
                  <SelectItem value="phd">PhD</SelectItem>
                </SelectContent>
              </Select>
              {field.state.meta.errors?.length > 0 && (
                <p className="text-red-500 text-sm">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        {/* Job Field */}
        <form.Field
          name="job"
          validators={{
            onChange: ({ value }) =>
              !value || value.trim().length === 0 ? "Job/Occupation is required" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Job/Occupation *</Label>
              <Input
                id={field.name}
                type="text"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="e.g., Software Engineer, Teacher, etc."
                className="h-10"
              />
              {field.state.meta.errors?.length > 0 && (
                <p className="text-red-500 text-sm">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        {/* Email Field */}
        <form.Field
          name="email"
          validators={{
            onChange: ({ value }) => {
              if (!value) return "Email is required";
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailRegex.test(value)) return "Please enter a valid email address";
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Email Address *</Label>
              <Input
                id={field.name}
                type="email"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="your.email@example.com"
                className="h-10"
              />
              {field.state.meta.errors?.length > 0 && (
                <p className="text-red-500 text-sm">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        {/* Phone Field */}
        <form.Field
          name="phone"
          validators={{
            onChange: ({ value }) =>
              !value || value.trim().length === 0 ? "Phone number is required" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Phone Number *</Label>
              <Input
                id={field.name}
                type="tel"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="+1 (555) 123-4567"
                className="h-10"
              />
              {field.state.meta.errors?.length > 0 && (
                <p className="text-red-500 text-sm">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        {/* Describe Yourself Field */}
        <form.Field
          name="describeYourself"
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>
                Describe yourself with any details you find important for the 1Plus1 team
              </Label>
              <textarea
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="Tell us about yourself..."
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                rows={4}
              />
            </div>
          )}
        </form.Field>

        {/* Looking For Field */}
        <form.Field
          name="lookingFor"
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>
                Describe anything we should know about what you are looking for in a spouse
              </Label>
              <textarea
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="What are you looking for in a spouse..."
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                rows={4}
              />
            </div>
          )}
        </form.Field>

        {/* Slot Status Warning */}
        {(isMaleFull || isFemaleFull) && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 text-sm">
              {isMaleFull && isFemaleFull
                ? "Both male and female slots are currently full. Please check back later."
                : isMaleFull
                ? "Male slots are currently full. Only female registrations are accepted at this time."
                : "Female slots are currently full. Only male registrations are accepted at this time."}
            </p>
          </div>
        )}

        {/* Submit Button */}
        <div className="pt-4">
          <Button
            type="submit"
            className="w-full h-11 text-base"
            disabled={isSubmitting || (isMaleFull && isFemaleFull)}
          >
            {isSubmitting ? "Redirecting to payment..." : "Proceed to Payment ($10)"}
          </Button>
        </div>

        <p className="text-xs text-slate-500 text-center">
          You will be redirected to Stripe to complete your $10 registration payment.
          Have a promo code? You can enter it at checkout.
        </p>
      </form>
    </Card>
  );
}

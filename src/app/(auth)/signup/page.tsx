"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    // 1. Sign up user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (authError) {
      toast.error(authError.message);
      setLoading(false);
      return;
    }

    if (!authData.user) {
      toast.error("Signup failed. Please try again.");
      setLoading(false);
      return;
    }

    // 2. Create organization via API (bypasses RLS)
    const setupRes = await fetch("/api/auth/setup-org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: authData.user.id,
        orgName,
        userEmail: email,
        userName: fullName,
      }),
    });

    const setupData = await setupRes.json();

    if (!setupRes.ok) {
      toast.error("Organization setup failed: " + setupData.error);
      setLoading(false);
      router.push("/login");
      return;
    }

    toast.success("Verification code sent to your email!");
    router.push(`/verify?email=${encodeURIComponent(email)}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <MessageSquare className="h-12 w-12 text-green-600" />
          </div>
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <CardDescription>
            Start sending WhatsApp messages in minutes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgName">Business / Organization Name</Label>
              <Input
                id="orgName"
                type="text"
                placeholder="e.g. City Hospital"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700"
              disabled={loading}
            >
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-green-600 hover:underline">
              Login
            </Link>
          </p>
          <p className="text-center text-sm text-gray-400 mt-2">
            <Link href="/docs" className="text-green-600 hover:underline">
              View API Documentation
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

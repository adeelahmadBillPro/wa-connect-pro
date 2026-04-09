"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageSquare, Eye, EyeOff, Users, Zap, Shield } from "lucide-react";
import { toast } from "sonner";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
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

    toast.success("Account created! Redirecting...");
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-green-600 to-emerald-700 flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <MessageSquare className="h-6 w-6 text-white" />
          </div>
          <span className="text-white font-bold text-xl">WA Connect Pro</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Get started<br />in minutes
          </h1>
          <p className="text-green-100 text-lg mb-10">
            Create your account, scan QR with<br />WhatsApp, and start sending.
          </p>

          <div className="grid grid-cols-1 gap-4">
            {[
              { icon: Zap, title: "Quick Setup", desc: "Account ready in 2 minutes" },
              { icon: Users, title: "Multi-Center", desc: "One platform for all branches" },
              { icon: Shield, title: "Secure & Stable", desc: "Auto-reconnect, never miss a message" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4 bg-white/10 rounded-xl p-4">
                <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{title}</p>
                  <p className="text-green-200 text-xs mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-green-200 text-xs">
          © {new Date().getFullYear()} WA Connect Pro. All rights reserved.
        </p>
      </div>

      {/* Right Panel — Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-gray-50 px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg">WA Connect Pro</span>
          </div>

          <h2 className="text-3xl font-bold text-gray-900 mb-1">Create account</h2>
          <p className="text-gray-500 mb-8">Start sending WhatsApp messages today</p>

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="fullName" className="text-sm font-medium text-gray-700">
                  Full Name
                </Label>
                <Input
                  id="fullName"
                  placeholder="Ahmed Khan"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orgName" className="text-sm font-medium text-gray-700">
                  Organization
                </Label>
                <Input
                  id="orgName"
                  placeholder="City Hospital"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-green-600 hover:bg-green-700 text-base font-medium"
              disabled={loading}
            >
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-green-600 hover:underline font-medium">
              Sign in
            </Link>
          </p>
          <p className="text-center text-sm text-gray-400 mt-3">
            <Link href="/docs" className="hover:text-green-600 transition-colors">
              View API Documentation →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

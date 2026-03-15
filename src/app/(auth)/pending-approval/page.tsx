"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Clock, LogOut } from "lucide-react";

export default function PendingApprovalPage() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleCheckAgain() {
    // Force a full page reload to re-trigger middleware check
    window.location.href = "/dashboard";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Clock className="h-12 w-12 text-amber-500" />
          </div>
          <CardTitle className="text-2xl">Pending Approval</CardTitle>
          <CardDescription>
            Your account has been created and email verified. An administrator
            needs to approve your account before you can access the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            <p className="font-semibold mb-1">What happens next?</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>The admin has been notified of your signup</li>
              <li>Once approved, you&apos;ll have full access to the dashboard</li>
              <li>You&apos;ll be able to connect WhatsApp numbers and send messages</li>
            </ul>
          </div>

          <Button
            onClick={handleCheckAgain}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            Check Again
          </Button>

          <Button
            variant="outline"
            onClick={handleLogout}
            className="w-full"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

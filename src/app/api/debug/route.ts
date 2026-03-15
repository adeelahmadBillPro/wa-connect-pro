import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const headerStore = await headers();
  const authHeader = headerStore.get("authorization");

  const envCheck = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    MONGODB_URI: !!process.env.MONGODB_URI,
    hasAuthHeader: !!authHeader,
    authHeaderPrefix: authHeader?.substring(0, 15) || null,
  };

  // Try to verify the token if we have one
  let verifyResult = null;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const { createServiceClient } = await import("@/lib/supabase/service");
      const supabase = createServiceClient();
      const { data, error } = await supabase.auth.getUser(token);
      verifyResult = {
        success: !!data?.user,
        userId: data?.user?.id || null,
        error: error?.message || null,
      };
    } catch (e: any) {
      verifyResult = { success: false, error: e.message };
    }
  }

  return NextResponse.json({ envCheck, verifyResult });
}

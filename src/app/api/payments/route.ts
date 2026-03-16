import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// GET — list payment receipts for user's org
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: member } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .single();
    if (!member) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { data: receipts } = await supabase
      .from("payment_receipts")
      .select("*, plan:subscription_plans(*)")
      .eq("org_id", member.org_id)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({ receipts: receipts || [] });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — submit a new payment receipt
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: member } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .single();
    if (!member) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const plan_id = formData.get("plan_id") as string | null;
    const amount = parseFloat(formData.get("amount") as string) || 0;
    const payment_method = (formData.get("payment_method") as string) || "other";
    const notes = (formData.get("notes") as string) || null;

    if (!file) {
      return NextResponse.json({ error: "Receipt screenshot is required" }, { status: 400 });
    }
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }

    // Validate file type (images only for receipts)
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only image files allowed (JPG, PNG, WebP)" },
        { status: 400 }
      );
    }

    // Max 5MB for receipts
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum 5MB." },
        { status: 400 }
      );
    }

    // Upload to Supabase Storage
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `receipts/${member.org_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "Upload failed: " + uploadError.message },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from("media")
      .getPublicUrl(fileName);

    // Create payment receipt record
    const { data: receipt, error } = await supabase
      .from("payment_receipts")
      .insert({
        org_id: member.org_id,
        plan_id: plan_id || null,
        amount,
        payment_method,
        receipt_url: urlData.publicUrl,
        notes,
        status: "pending",
      })
      .select("*, plan:subscription_plans(*)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, receipt });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

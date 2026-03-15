import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session and check auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Protected routes: require authentication + verified email + approved org
  if (pathname.startsWith("/dashboard")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    // Check if email is verified
    if (!user.email_confirmed_at) {
      const url = request.nextUrl.clone();
      url.pathname = "/verify";
      url.searchParams.set("email", user.email || "");
      return NextResponse.redirect(url);
    }

    // Check if user's organization is approved
    const { data: member } = await supabase
      .from("org_members")
      .select("org_id, organizations(is_approved)")
      .eq("user_id", user.id)
      .single();

    if (member) {
      const org = member.organizations as unknown as { is_approved: boolean } | null;
      if (org && !org.is_approved) {
        const url = request.nextUrl.clone();
        url.pathname = "/pending-approval";
        return NextResponse.redirect(url);
      }
    }
  }

  // Auth routes: redirect to dashboard if already logged in and verified
  if (pathname === "/login" || pathname === "/signup") {
    if (user && user.email_confirmed_at) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

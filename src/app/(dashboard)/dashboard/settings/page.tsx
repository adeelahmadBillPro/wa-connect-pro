"use client";

import { useEffect, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, User, Building2, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import type { Profile, Organization } from "@/types/database";

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Profile form
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  // Org form
  const [orgName, setOrgName] = useState("");

  // WhatsApp form
  const [waPhoneNumberId, setWaPhoneNumberId] = useState("");
  const [waBusinessAccountId, setWaBusinessAccountId] = useState("");
  const [waAccessToken, setWaAccessToken] = useState("");
  const [waDisplayName, setWaDisplayName] = useState("");
  const [waNumber, setWaNumber] = useState("");

  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileData) {
      setProfile(profileData);
      setFullName(profileData.full_name);
      setPhone(profileData.phone || "");
    }

    const { data: member } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .single();

    if (member) {
      const { data: orgData } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", member.org_id)
        .single();

      if (orgData) {
        setOrg(orgData);
        setOrgName(orgData.name);
        setWaPhoneNumberId(orgData.whatsapp_phone_number_id || "");
        setWaBusinessAccountId(orgData.whatsapp_business_account_id || "");
        setWaAccessToken(orgData.whatsapp_access_token || "");
        setWaDisplayName(orgData.whatsapp_display_name || "");
        setWaNumber(orgData.whatsapp_number || "");
      }
    }

    setLoading(false);
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone: phone || null })
      .eq("id", profile.id);

    if (error) {
      toast.error("Failed to update profile");
    } else {
      toast.success("Profile updated!");
    }
    setSaving(false);
  }

  async function handleUpdateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    setSaving(true);

    const { error } = await supabase
      .from("organizations")
      .update({ name: orgName })
      .eq("id", org.id);

    if (error) {
      toast.error("Failed to update organization");
    } else {
      toast.success("Organization updated!");
    }
    setSaving(false);
  }

  async function handleConnectWhatsApp(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    setSaving(true);

    if (!waPhoneNumberId || !waAccessToken) {
      toast.error("Phone Number ID and Access Token are required");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("organizations")
      .update({
        whatsapp_phone_number_id: waPhoneNumberId,
        whatsapp_business_account_id: waBusinessAccountId || null,
        whatsapp_access_token: waAccessToken,
        whatsapp_connected: true,
        whatsapp_display_name: waDisplayName || null,
        whatsapp_number: waNumber || null,
      })
      .eq("id", org.id);

    if (error) {
      toast.error("Failed to connect WhatsApp");
    } else {
      toast.success("WhatsApp connected successfully!");
      setOrg({ ...org, whatsapp_connected: true });
    }
    setSaving(false);
  }

  async function handleDisconnectWhatsApp() {
    if (!org) return;
    setSaving(true);

    const { error } = await supabase
      .from("organizations")
      .update({
        whatsapp_phone_number_id: null,
        whatsapp_business_account_id: null,
        whatsapp_access_token: null,
        whatsapp_connected: false,
        whatsapp_display_name: null,
        whatsapp_number: null,
      })
      .eq("id", org.id);

    if (error) {
      toast.error("Failed to disconnect");
    } else {
      toast.success("WhatsApp disconnected");
      setOrg({ ...org, whatsapp_connected: false });
      setWaPhoneNumberId("");
      setWaBusinessAccountId("");
      setWaAccessToken("");
      setWaDisplayName("");
      setWaNumber("");
    }
    setSaving(false);
  }

  if (loading) {
    return <p className="text-gray-500">Loading settings...</p>;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">
          Manage your account, organization, and WhatsApp connection
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="organization" className="gap-2">
            <Building2 className="h-4 w-4" />
            Organization
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            WhatsApp
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={profile?.email || ""} disabled />
                  <p className="text-xs text-gray-500">
                    Email cannot be changed
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="923001234567"
                  />
                </div>
                <Button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organization Tab */}
        <TabsContent value="organization">
          <Card>
            <CardHeader>
              <CardTitle>Organization Details</CardTitle>
              <CardDescription>
                Manage your business information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateOrg} className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label>Organization Name</Label>
                  <Input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Your business name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input value={org?.slug || ""} disabled />
                  <p className="text-xs text-gray-500">
                    Auto-generated, cannot be changed
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input value={org?.api_key || ""} disabled className="font-mono" />
                  <p className="text-xs text-gray-500">
                    Use this key for API access
                  </p>
                </div>
                <Button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WhatsApp Tab */}
        <TabsContent value="whatsapp">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>WhatsApp Business API</CardTitle>
                  <CardDescription>
                    Connect your WhatsApp Business number via Meta Cloud API
                  </CardDescription>
                </div>
                {org?.whatsapp_connected ? (
                  <Badge className="bg-green-100 text-green-700 gap-1">
                    <Wifi className="h-3 w-3" />
                    Connected
                  </Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-700 gap-1">
                    <WifiOff className="h-3 w-3" />
                    Not Connected
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Setup Guide */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h4 className="font-semibold text-blue-900 mb-2">
                  How to get these values:
                </h4>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Go to developers.facebook.com and create an app</li>
                  <li>Add WhatsApp product to your app</li>
                  <li>Go to WhatsApp {">"} API Setup</li>
                  <li>
                    Copy the <strong>Phone Number ID</strong> and{" "}
                    <strong>Access Token</strong> from that page
                  </li>
                  <li>
                    Set the Webhook URL to:{" "}
                    <code className="bg-blue-100 px-1 rounded">
                      {typeof window !== "undefined"
                        ? window.location.origin
                        : "https://your-domain.com"}
                      /api/webhooks/whatsapp
                    </code>
                  </li>
                </ol>
              </div>

              <form onSubmit={handleConnectWhatsApp} className="space-y-4 max-w-lg">
                <div className="space-y-2">
                  <Label>Phone Number ID *</Label>
                  <Input
                    value={waPhoneNumberId}
                    onChange={(e) => setWaPhoneNumberId(e.target.value)}
                    placeholder="e.g. 123456789012345"
                    required
                  />
                  <p className="text-xs text-gray-500">
                    Found in WhatsApp {">"} API Setup in Meta Developer Console
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>WhatsApp Business Account ID</Label>
                  <Input
                    value={waBusinessAccountId}
                    onChange={(e) => setWaBusinessAccountId(e.target.value)}
                    placeholder="e.g. 123456789012345"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Permanent Access Token *</Label>
                  <Input
                    type="password"
                    value={waAccessToken}
                    onChange={(e) => setWaAccessToken(e.target.value)}
                    placeholder="EAAxxxxxxx..."
                    required
                  />
                  <p className="text-xs text-gray-500">
                    Generate a permanent token in Meta Business Settings {">"}{" "}
                    System Users
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Display Name (for your reference)</Label>
                  <Input
                    value={waDisplayName}
                    onChange={(e) => setWaDisplayName(e.target.value)}
                    placeholder="e.g. My Business"
                  />
                </div>

                <div className="space-y-2">
                  <Label>WhatsApp Number (for your reference)</Label>
                  <Input
                    value={waNumber}
                    onChange={(e) => setWaNumber(e.target.value)}
                    placeholder="e.g. +92 300 1234567"
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    type="submit"
                    className="bg-green-600 hover:bg-green-700"
                    disabled={saving}
                  >
                    {saving
                      ? "Saving..."
                      : org?.whatsapp_connected
                      ? "Update Connection"
                      : "Connect WhatsApp"}
                  </Button>

                  {org?.whatsapp_connected && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDisconnectWhatsApp}
                      disabled={saving}
                    >
                      Disconnect
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

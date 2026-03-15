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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  Wifi,
  WifiOff,
  CreditCard,
  MessageSquare,
  Settings2,
  Plus,
  CalendarPlus,
  CheckCircle2,
  XCircle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import type { Organization, SubscriptionPlan, Subscription } from "@/types/database";

interface OrgWithCounts extends Organization {
  message_count: number;
}

interface SubscriptionWithPlan extends Subscription {
  plan: SubscriptionPlan;
}

export default function AdminPage() {
  const [orgs, setOrgs] = useState<OrgWithCounts[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [orgSubscriptions, setOrgSubscriptions] = useState<Record<string, SubscriptionWithPlan | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<OrgWithCounts | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // WhatsApp credentials form
  const [waPhoneNumberId, setWaPhoneNumberId] = useState("");
  const [waBusinessAccountId, setWaBusinessAccountId] = useState("");
  const [waAccessToken, setWaAccessToken] = useState("");
  const [waDisplayName, setWaDisplayName] = useState("");
  const [waNumber, setWaNumber] = useState("");

  // Credits form
  const [creditsToAdd, setCreditsToAdd] = useState("");

  // Subscription form
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [subMonths, setSubMonths] = useState("1");

  const supabase = createClient();

  useEffect(() => {
    loadOrgs();
    loadPlans();
  }, []);

  async function loadPlans() {
    const { data } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("price_monthly", { ascending: true });
    if (data) setPlans(data);
  }

  async function loadOrgs() {
    const res = await fetchWithAuth("/api/admin/organizations");
    const data = await res.json();

    if (!res.ok) {
      setError(data.error);
      setLoading(false);
      return;
    }

    setOrgs(data.organizations);

    // Load subscriptions for all orgs
    const orgIds = data.organizations.map((o: OrgWithCounts) => o.id);
    if (orgIds.length > 0) {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("*, plan:subscription_plans(*)")
        .in("org_id", orgIds)
        .eq("status", "active")
        .gte("expires_at", new Date().toISOString());

      const subMap: Record<string, SubscriptionWithPlan | null> = {};
      orgIds.forEach((id: string) => {
        subMap[id] = null;
      });
      subs?.forEach((sub: SubscriptionWithPlan) => {
        subMap[sub.org_id] = sub;
      });
      setOrgSubscriptions(subMap);
    }

    setLoading(false);
  }

  function openWhatsAppDialog(org: OrgWithCounts) {
    setSelectedOrg(org);
    setWaPhoneNumberId(org.whatsapp_phone_number_id || "");
    setWaBusinessAccountId(org.whatsapp_business_account_id || "");
    setWaAccessToken(org.whatsapp_access_token || "");
    setWaDisplayName(org.whatsapp_display_name || "");
    setWaNumber(org.whatsapp_number || "");
    setDialogOpen(true);
  }

  function openCreditsDialog(org: OrgWithCounts) {
    setSelectedOrg(org);
    setCreditsToAdd("");
    setCreditsDialogOpen(true);
  }

  function openSubDialog(org: OrgWithCounts) {
    setSelectedOrg(org);
    setSelectedPlanId(plans[0]?.id || "");
    setSubMonths("1");
    setSubDialogOpen(true);
  }

  async function handleSaveWhatsApp(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrg) return;
    setSaving(true);

    const res = await fetchWithAuth("/api/admin/organizations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: selectedOrg.id,
        whatsapp_phone_number_id: waPhoneNumberId || null,
        whatsapp_business_account_id: waBusinessAccountId || null,
        whatsapp_access_token: waAccessToken || null,
        whatsapp_connected: !!(waPhoneNumberId && waAccessToken),
        whatsapp_display_name: waDisplayName || null,
        whatsapp_number: waNumber || null,
      }),
    });

    if (res.ok) {
      toast.success(`WhatsApp credentials updated for ${selectedOrg.name}`);
      setDialogOpen(false);
      loadOrgs();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to update");
    }
    setSaving(false);
  }

  async function handleAddCredits(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrg) return;
    const amount = parseInt(creditsToAdd);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid number of credits");
      return;
    }
    setSaving(true);

    const res = await fetchWithAuth("/api/admin/organizations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: selectedOrg.id,
        credits: selectedOrg.credits + amount,
      }),
    });

    if (res.ok) {
      toast.success(`Added ${amount} credits to ${selectedOrg.name}`);
      setCreditsDialogOpen(false);
      loadOrgs();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to add credits");
    }
    setSaving(false);
  }

  async function handleActivateSub(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrg || !selectedPlanId) return;
    setSaving(true);

    const res = await fetchWithAuth("/api/admin/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: selectedOrg.id,
        plan_id: selectedPlanId,
        months: parseInt(subMonths) || 1,
      }),
    });

    if (res.ok) {
      const selectedPlan = plans.find((p) => p.id === selectedPlanId);
      toast.success(
        `Activated ${selectedPlan?.name} plan for ${selectedOrg.name} (${subMonths} month${parseInt(subMonths) > 1 ? "s" : ""})`
      );
      setSubDialogOpen(false);
      loadOrgs();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to activate subscription");
    }
    setSaving(false);
  }

  async function handleApprove(org: OrgWithCounts) {
    const res = await fetchWithAuth("/api/admin/organizations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: org.id, is_approved: true }),
    });

    if (res.ok) {
      toast.success(`${org.name} approved!`);
      loadOrgs();
    } else {
      toast.error("Failed to approve");
    }
  }

  async function handleReject(org: OrgWithCounts) {
    if (!confirm(`Reject and block ${org.name}? They won't be able to access the dashboard.`)) return;
    const res = await fetchWithAuth("/api/admin/organizations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: org.id, is_approved: false }),
    });

    if (res.ok) {
      toast.success(`${org.name} rejected`);
      loadOrgs();
    } else {
      toast.error("Failed to reject");
    }
  }

  async function handleDisconnectWhatsApp(org: OrgWithCounts) {
    const res = await fetchWithAuth("/api/admin/organizations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: org.id,
        whatsapp_phone_number_id: null,
        whatsapp_business_account_id: null,
        whatsapp_access_token: null,
        whatsapp_connected: false,
        whatsapp_display_name: null,
        whatsapp_number: null,
      }),
    });

    if (res.ok) {
      toast.success(`Disconnected WhatsApp for ${org.name}`);
      loadOrgs();
    } else {
      toast.error("Failed to disconnect");
    }
  }

  if (loading) return <p className="text-gray-500">Loading admin panel...</p>;

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-red-600">
          {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
        <p className="text-gray-500 mt-1">
          Manage organizations, subscriptions, WhatsApp connections, and credits
        </p>
      </div>

      {/* Stats */}
      {/* Pending Approvals Alert */}
      {orgs.filter((o) => !o.is_approved).length > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-800">
                  {orgs.filter((o) => !o.is_approved).length} organization(s) pending approval
                </p>
                <p className="text-sm text-amber-700">
                  Review and approve them below to grant dashboard access
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{orgs.length}</p>
                <p className="text-sm text-gray-500">Organizations</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Wifi className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">
                  {orgs.filter((o) => o.whatsapp_connected).length}
                </p>
                <p className="text-sm text-gray-500">WhatsApp Connected</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">
                  {orgs.reduce((sum, o) => sum + o.message_count, 0)}
                </p>
                <p className="text-sm text-gray-500">Total Messages</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CreditCard className="h-8 w-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">
                  {Object.values(orgSubscriptions).filter(Boolean).length}
                </p>
                <p className="text-sm text-gray-500">Active Subscriptions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Organizations Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Organizations</CardTitle>
          <CardDescription>
            Manage subscriptions, WhatsApp credentials, and credits
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org) => {
                const sub = orgSubscriptions[org.id];
                const daysLeft = sub
                  ? Math.max(0, Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                  : 0;
                return (
                  <TableRow key={org.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{org.name}</p>
                        <p className="text-xs text-gray-500">{org.slug}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {org.is_approved ? (
                        <Badge className="bg-green-100 text-green-700 gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          Approved
                        </Badge>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Badge className="bg-amber-100 text-amber-700">Pending</Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                            onClick={() => handleApprove(org)}
                            title="Approve"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                            onClick={() => handleReject(org)}
                            title="Reject"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {sub ? (
                        <div>
                          <Badge className="bg-green-100 text-green-700">
                            {sub.plan.name}
                          </Badge>
                          <p className="text-xs text-gray-500 mt-1">
                            {daysLeft}d left
                          </p>
                        </div>
                      ) : (
                        <Badge className="bg-red-100 text-red-700">No Plan</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {org.whatsapp_connected ? (
                        <Badge className="bg-green-100 text-green-700 gap-1">
                          <Wifi className="h-3 w-3" />
                          Connected
                        </Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-700 gap-1">
                          <WifiOff className="h-3 w-3" />
                          Off
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {sub ? (
                        <span>
                          {sub.messages_used}/{sub.plan.message_limit} msgs
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openSubDialog(org)}
                        >
                          <CalendarPlus className="h-3 w-3 mr-1" />
                          Plan
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openWhatsAppDialog(org)}
                        >
                          <Settings2 className="h-3 w-3 mr-1" />
                          WA
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openCreditsDialog(org)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Credits
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Activate Subscription Dialog */}
      <Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Activate Subscription — {selectedOrg?.name}
            </DialogTitle>
          </DialogHeader>
          {orgSubscriptions[selectedOrg?.id || ""] && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
              <p className="text-yellow-800">
                Current plan: <strong>{orgSubscriptions[selectedOrg?.id || ""]?.plan.name}</strong>
                {" "}— expires {new Date(orgSubscriptions[selectedOrg?.id || ""]?.expires_at || "").toLocaleDateString()}
              </p>
              <p className="text-yellow-700 text-xs mt-1">
                Activating a new plan will replace the current one.
              </p>
            </div>
          )}
          <form onSubmit={handleActivateSub} className="space-y-4">
            <div className="space-y-2">
              <Label>Select Plan</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedPlanId}
                onChange={(e) => setSelectedPlanId(e.target.value)}
                required
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — Rs. {plan.price_monthly.toLocaleString()}/mo ({plan.message_limit.toLocaleString()} msgs)
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Duration (months)</Label>
              <Input
                type="number"
                min="1"
                max="12"
                value={subMonths}
                onChange={(e) => setSubMonths(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700"
              disabled={saving}
            >
              {saving ? "Activating..." : "Activate Subscription"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Credentials Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              WhatsApp Credentials — {selectedOrg?.name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveWhatsApp} className="space-y-4">
            <div className="space-y-2">
              <Label>Phone Number ID *</Label>
              <Input
                value={waPhoneNumberId}
                onChange={(e) => setWaPhoneNumberId(e.target.value)}
                placeholder="e.g. 123456789012345"
              />
            </div>
            <div className="space-y-2">
              <Label>Business Account ID</Label>
              <Input
                value={waBusinessAccountId}
                onChange={(e) => setWaBusinessAccountId(e.target.value)}
                placeholder="e.g. 123456789012345"
              />
            </div>
            <div className="space-y-2">
              <Label>Access Token *</Label>
              <Input
                type="password"
                value={waAccessToken}
                onChange={(e) => setWaAccessToken(e.target.value)}
                placeholder="EAAxxxxxxx..."
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={waDisplayName}
                onChange={(e) => setWaDisplayName(e.target.value)}
                placeholder="e.g. City Hospital"
              />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp Number</Label>
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
                {saving ? "Saving..." : "Save Credentials"}
              </Button>
              {selectedOrg?.whatsapp_connected && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    handleDisconnectWhatsApp(selectedOrg);
                    setDialogOpen(false);
                  }}
                >
                  Disconnect
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Credits Dialog */}
      <Dialog open={creditsDialogOpen} onOpenChange={setCreditsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add Credits — {selectedOrg?.name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            Current balance: <strong>{selectedOrg?.credits}</strong> credits
          </p>
          <form onSubmit={handleAddCredits} className="space-y-4">
            <div className="space-y-2">
              <Label>Credits to Add</Label>
              <Input
                type="number"
                min="1"
                value={creditsToAdd}
                onChange={(e) => setCreditsToAdd(e.target.value)}
                placeholder="e.g. 100"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700"
              disabled={saving}
            >
              {saving
                ? "Adding..."
                : `Add Credits (New balance: ${
                    (selectedOrg?.credits || 0) + (parseInt(creditsToAdd) || 0)
                  })`}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

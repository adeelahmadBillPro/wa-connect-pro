"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Play } from "lucide-react";
import { toast } from "sonner";
import type { Campaign, MessageTemplate, ContactGroup } from "@/types/database";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    template_id: "",
    group_id: "",
  });
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  async function getOrgId() {
    if (orgId) return orgId;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: member } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .single();
    if (member) {
      setOrgId(member.org_id);
      return member.org_id;
    }
    return null;
  }

  async function loadData() {
    const oid = await getOrgId();
    if (!oid) return;

    const [campaignsRes, templatesRes, groupsRes] = await Promise.all([
      supabase
        .from("campaigns")
        .select("*, template:message_templates(*)")
        .eq("org_id", oid)
        .order("created_at", { ascending: false }),
      supabase
        .from("message_templates")
        .select("*")
        .eq("org_id", oid),
      supabase
        .from("contact_groups")
        .select("*")
        .eq("org_id", oid),
    ]);

    if (campaignsRes.data) setCampaigns(campaignsRes.data);
    if (templatesRes.data) setTemplates(templatesRes.data);
    if (groupsRes.data) setGroups(groupsRes.data);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const oid = await getOrgId();
    if (!oid) return;

    const { error } = await supabase.from("campaigns").insert({
      org_id: oid,
      name: newCampaign.name,
      template_id: newCampaign.template_id,
      group_id: newCampaign.group_id || null,
    });

    if (error) {
      toast.error("Failed to create campaign");
      return;
    }

    toast.success("Campaign created!");
    setNewCampaign({ name: "", template_id: "", group_id: "" });
    setDialogOpen(false);
    loadData();
  }

  async function handleSendCampaign(campaignId: string) {
    toast.info("Sending campaign...");

    const response = await fetch("/api/campaigns/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId }),
    });

    const result = await response.json();

    if (response.ok) {
      toast.success(`Campaign sent! ${result.sent} messages queued.`);
      loadData();
    } else {
      toast.error(result.error || "Failed to send campaign");
    }
  }

  const statusColor: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    scheduled: "bg-blue-100 text-blue-700",
    sending: "bg-yellow-100 text-yellow-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-500 mt-1">
            Send bulk messages to your contact groups
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button className="bg-green-600 hover:bg-green-700" />}>
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Campaign</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Campaign Name</Label>
                <Input
                  placeholder="e.g. March Promotions"
                  value={newCampaign.name}
                  onChange={(e) =>
                    setNewCampaign({ ...newCampaign, name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Message Template</Label>
                <Select
                  value={newCampaign.template_id}
                  onValueChange={(v) =>
                    setNewCampaign({ ...newCampaign, template_id: v ?? "" })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Contact Group (optional — sends to all contacts if empty)</Label>
                <Select
                  value={newCampaign.group_id}
                  onValueChange={(v) =>
                    setNewCampaign({ ...newCampaign, group_id: v ?? "" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All contacts" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full bg-green-600 hover:bg-green-700">
                Create Campaign
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Campaigns Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead>Read</TableHead>
                <TableHead>Failed</TableHead>
                <TableHead className="w-24">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                    No campaigns yet. Create your first campaign!
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>{campaign.template?.name || "-"}</TableCell>
                    <TableCell>
                      <Badge className={statusColor[campaign.status]}>
                        {campaign.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{campaign.sent_count}</TableCell>
                    <TableCell>{campaign.delivered_count}</TableCell>
                    <TableCell>{campaign.read_count}</TableCell>
                    <TableCell>{campaign.failed_count}</TableCell>
                    <TableCell>
                      {campaign.status === "draft" && (
                        <Button
                          size="sm"
                          onClick={() => handleSendCampaign(campaign.id)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Send
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Send, Search } from "lucide-react";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import type { Message, MessageTemplate } from "@/types/database";

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState({
    to_phone: "",
    template_id: "",
    params: "",
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

    const [msgsRes, tmplRes] = await Promise.all([
      supabase
        .from("messages")
        .select("*")
        .eq("org_id", oid)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("message_templates").select("*").eq("org_id", oid),
    ]);

    if (msgsRes.data) setMessages(msgsRes.data);
    if (tmplRes.data) setTemplates(tmplRes.data);
    setLoading(false);
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();

    const response = await fetchWithAuth("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to_phone: newMessage.to_phone.replace(/[^0-9+]/g, ""),
        template_id: newMessage.template_id,
        params: newMessage.params
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
      }),
    });

    const result = await response.json();

    if (response.ok) {
      toast.success("Message sent!");
      setNewMessage({ to_phone: "", template_id: "", params: "" });
      setDialogOpen(false);
      loadData();
    } else {
      toast.error(result.error || "Failed to send message");
    }
  }

  const statusColor: Record<string, string> = {
    queued: "bg-gray-100 text-gray-700",
    sent: "bg-blue-100 text-blue-700",
    delivered: "bg-green-100 text-green-700",
    read: "bg-purple-100 text-purple-700",
    failed: "bg-red-100 text-red-700",
  };

  const filtered = messages.filter((m) => m.to_phone.includes(search));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
          <p className="text-gray-500 mt-1">Message log and quick send</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button className="bg-green-600 hover:bg-green-700" />}>
              <Send className="h-4 w-4 mr-2" />
              Quick Send
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send WhatsApp Message</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSendMessage} className="space-y-4">
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input
                  placeholder="923001234567"
                  value={newMessage.to_phone}
                  onChange={(e) =>
                    setNewMessage({ ...newMessage, to_phone: e.target.value })
                  }
                  required
                />
                <p className="text-xs text-gray-500">
                  Include country code (92 for Pakistan)
                </p>
              </div>
              <div className="space-y-2">
                <Label>Template</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={newMessage.template_id}
                  onChange={(e) =>
                    setNewMessage({ ...newMessage, template_id: e.target.value })
                  }
                  required
                >
                  <option value="">Select template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Parameters (comma separated)</Label>
                <Input
                  placeholder="Ahmed, Blood Test, City Hospital"
                  value={newMessage.params}
                  onChange={(e) =>
                    setNewMessage({ ...newMessage, params: e.target.value })
                  }
                />
                <p className="text-xs text-gray-500">
                  Values for {"{{1}}"}, {"{{2}}"}, {"{{3}}"} in template
                </p>
              </div>
              <Button type="submit" className="w-full bg-green-600 hover:bg-green-700">
                Send Message
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by phone number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Messages Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>To</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                    No messages yet.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((msg) => (
                  <TableRow key={msg.id}>
                    <TableCell className="font-mono">{msg.to_phone}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{msg.message_type}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {msg.content || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColor[msg.status]}>
                        {msg.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {msg.sent_at
                        ? new Date(msg.sent_at).toLocaleString()
                        : "-"}
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

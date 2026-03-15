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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Send,
  Users,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  Upload,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

interface ContactGroup {
  id: string;
  name: string;
}

interface QueueItem {
  id: string;
  to_phone: string;
  content: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

const isVercel = process.env.NEXT_PUBLIC_VERCEL === "1" || process.env.VERCEL === "1";

export default function WASendPage() {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  if (isVercel) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">WA Send</h1>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-orange-500" />
              VPS Required
            </CardTitle>
            <CardDescription>
              WhatsApp Web sending requires a persistent server with Puppeteer.
              This feature cannot run on Vercel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Deploy on a VPS (DigitalOcean, AWS, Railway) to use WA Web sending.
              The Meta Cloud API (Templates, Campaigns) works on Vercel — use those instead.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Single send form
  const [toPhone, setToPhone] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("text");
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");

  // Bulk send form
  const [bulkGroupId, setBulkGroupId] = useState("");
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkSending, setBulkSending] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: member } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .single();
    if (!member) return;

    setOrgId(member.org_id);

    const [groupsRes, queueRes] = await Promise.all([
      supabase
        .from("contact_groups")
        .select("id, name")
        .eq("org_id", member.org_id),
      supabase
        .from("wa_message_queue")
        .select("*")
        .eq("org_id", member.org_id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (groupsRes.data) setGroups(groupsRes.data);
    if (queueRes.data) setQueueItems(queueRes.data);
    setQueueLoading(false);
  }

  async function handleSingleSend(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/wa/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_phone: toPhone,
          message,
          message_type: messageType,
          media_url: mediaUrl || undefined,
          caption: caption || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("Message sent!");
        setToPhone("");
        setMessage("");
        setMediaUrl("");
        setCaption("");
        loadData();
      } else {
        toast.error(data.error || "Failed to send");
      }
    } catch {
      toast.error("Network error");
    }

    setLoading(false);
  }

  async function handleBulkSend(e: React.FormEvent) {
    e.preventDefault();

    if (!bulkGroupId || !bulkMessage) {
      toast.error("Select a group and enter a message");
      return;
    }

    setBulkSending(true);

    try {
      // Get contacts from group
      const { data: contacts } = await supabase
        .from("contacts")
        .select("name, phone")
        .eq("org_id", orgId!)
        .eq("group_id", bulkGroupId);

      if (!contacts || contacts.length === 0) {
        toast.error("No contacts in this group");
        setBulkSending(false);
        return;
      }

      // Prepare messages with personalization
      const messages = contacts.map((contact) => ({
        to_phone: contact.phone,
        message: bulkMessage.replace("{{name}}", contact.name),
        message_type: "text",
      }));

      const res = await fetch("/api/wa/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(
          `${data.queued} messages queued! They will be sent with safe delays.`
        );
        setBulkMessage("");
        setBulkGroupId("");
        loadData();
      } else {
        toast.error(data.error || "Failed to queue messages");
      }
    } catch {
      toast.error("Network error");
    }

    setBulkSending(false);
  }

  async function processQueue() {
    toast.info("Processing queue...");
    try {
      const res = await fetch("/api/wa/queue?secret=process");
      const data = await res.json();
      toast.success(
        `Processed: ${data.sent || 0} sent, ${data.failed || 0} failed`
      );
      loadData();
    } catch {
      toast.error("Failed to process queue");
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "sent":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "pending":
        return <Clock className="h-4 w-4 text-gray-400" />;
      case "sending":
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const statusColor: Record<string, string> = {
    sent: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    pending: "bg-gray-100 text-gray-600",
    sending: "bg-blue-100 text-blue-700",
    cancelled: "bg-yellow-100 text-yellow-700",
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Send via WhatsApp Web</h1>
        <p className="text-gray-500 mt-1">
          Send messages using connected WhatsApp sessions (no Meta API fees)
        </p>
      </div>

      <Tabs defaultValue="single" className="space-y-6">
        <TabsList>
          <TabsTrigger value="single" className="gap-2">
            <Send className="h-4 w-4" />
            Single Message
          </TabsTrigger>
          <TabsTrigger value="bulk" className="gap-2">
            <Users className="h-4 w-4" />
            Bulk Send
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Queue
          </TabsTrigger>
        </TabsList>

        {/* Single Message */}
        <TabsContent value="single">
          <Card>
            <CardHeader>
              <CardTitle>Send Single Message</CardTitle>
              <CardDescription>
                Send directly via WhatsApp Web session. No template required.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSingleSend} className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input
                    value={toPhone}
                    onChange={(e) => setToPhone(e.target.value)}
                    placeholder="923001234567"
                    required
                  />
                  <p className="text-xs text-gray-500">
                    Include country code (92 for Pakistan)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Message Type</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={messageType}
                    onChange={(e) => setMessageType(e.target.value)}
                  >
                    <option value="text">Text Message</option>
                    <option value="image">Image</option>
                    <option value="document">Document (PDF)</option>
                    <option value="video">Video</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Message</Label>
                  <textarea
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Dear Ahmed, your Blood Test report is ready..."
                    required
                  />
                </div>

                {messageType !== "text" && (
                  <>
                    <div className="space-y-2">
                      <Label>Media URL</Label>
                      <Input
                        value={mediaUrl}
                        onChange={(e) => setMediaUrl(e.target.value)}
                        placeholder="https://example.com/report.pdf"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Caption (optional)</Label>
                      <Input
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        placeholder="Your lab report attached"
                      />
                    </div>
                  </>
                )}

                <Button
                  type="submit"
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send Message
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bulk Send */}
        <TabsContent value="bulk">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Send to Group</CardTitle>
              <CardDescription>
                Send to all contacts in a group. Messages are queued with safe
                delays (5-15 sec between each).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBulkSend} className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label>Contact Group</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={bulkGroupId}
                    onChange={(e) => setBulkGroupId(e.target.value)}
                    required
                  >
                    <option value="">Select group</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Message</Label>
                  <textarea
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={bulkMessage}
                    onChange={(e) => setBulkMessage(e.target.value)}
                    placeholder="Dear {{name}}, your report is ready for collection..."
                    required
                  />
                  <p className="text-xs text-gray-500">
                    Use {"{{name}}"} to insert contact name automatically
                  </p>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  <p className="font-semibold">Safe Sending:</p>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    <li>5-15 seconds random delay between messages</li>
                    <li>60 second pause every 25 messages</li>
                    <li>Distributed across all connected numbers</li>
                  </ul>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={bulkSending}
                >
                  {bulkSending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Users className="h-4 w-4 mr-2" />
                  )}
                  Queue Messages
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Queue */}
        <TabsContent value="queue">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Message Queue</CardTitle>
                  <CardDescription>
                    Queued and sent messages via WhatsApp Web
                  </CardDescription>
                </div>
                <Button onClick={processQueue} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Process Queue
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>To</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                      </TableCell>
                    </TableRow>
                  ) : queueItems.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center py-8 text-gray-500"
                      >
                        No queued messages
                      </TableCell>
                    </TableRow>
                  ) : (
                    queueItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">
                          {item.to_phone}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm">
                          {item.content}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              statusColor[item.status] || statusColor.pending
                            }
                          >
                            <span className="mr-1">{statusIcon(item.status)}</span>
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-gray-500">
                          {item.sent_at
                            ? new Date(item.sent_at).toLocaleString()
                            : new Date(item.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

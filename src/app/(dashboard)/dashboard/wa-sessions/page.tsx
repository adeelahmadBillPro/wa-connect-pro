"use client";

import { useEffect, useState, useRef } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  QrCode,
  Smartphone,
  Wifi,
  WifiOff,
  Trash2,
  RefreshCw,
  Loader2,
  Phone,
  MessageSquare,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/fetch-with-auth";

interface WASession {
  id: string;
  session_name: string;
  phone_number: string | null;
  status: string;
  is_active: boolean;
  daily_limit: number;
  messages_sent_today: number;
  last_message_at: string | null;
  last_connected_at: string | null;
  created_at: string;
}

const isVercel = process.env.NEXT_PUBLIC_VERCEL === "1" || process.env.VERCEL === "1";

export default function WASessionsPage() {
  const [sessions, setSessions] = useState<WASession[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("Default");
  const [newLimit, setNewLimit] = useState(700);
  const [creating, setCreating] = useState(false);

  // QR Code scanning
  const [scanningSessionId, setScanningSessionId] = useState<string | null>(null);

  if (isVercel) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">WA Sessions</h1>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-orange-500" />
              VPS Required
            </CardTitle>
            <CardDescription>
              WhatsApp Web sessions require a persistent server with Puppeteer (headless Chrome).
              This feature cannot run on serverless platforms like Vercel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">
              To use WA Web features, deploy this app on a VPS:
            </p>
            <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
              <li>DigitalOcean Droplet ($6/mo)</li>
              <li>AWS EC2 / Lightsail</li>
              <li>Railway or Render</li>
              <li>Any Linux VPS with Node.js 18+</li>
            </ul>
            <p className="text-sm text-gray-500 mt-4">
              Run <code className="bg-gray-100 px-2 py-1 rounded">npm run dev</code> or <code className="bg-gray-100 px-2 py-1 rounded">npm start</code> on your VPS and WA Web will work.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string>("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadSessions();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function loadSessions() {
    const res = await fetchWithAuth("/api/wa/session");
    const data = await res.json();
    if (data.sessions) setSessions(data.sessions);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);

    const res = await fetchWithAuth("/api/wa/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        session_name: newName,
        daily_limit: newLimit,
      }),
    });

    if (res.ok) {
      toast.success("Session created! Now scan QR code to connect.");
      setCreateOpen(false);
      setNewName("Default");
      setNewLimit(700);
      loadSessions();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to create session");
    }
    setCreating(false);
  }

  async function handleStartScan(sessionId: string) {
    setScanningSessionId(sessionId);
    setQrImage(null);
    setQrStatus("connecting");

    // Start the session
    const startRes = await fetchWithAuth("/api/wa/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", session_id: sessionId }),
    });

    if (!startRes.ok) {
      const errData = await startRes.json().catch(() => ({}));
      toast.error(errData.error || "Failed to start session. Check server logs.");
      setQrStatus("error");
      return;
    }

    // Poll function
    async function pollQR() {
      try {
        const res = await fetchWithAuth(
          `/api/wa/session/qr?session_id=${sessionId}`
        );
        const data = await res.json();

        if (data.status === "connected") {
          setQrStatus("connected");
          setQrImage(null);
          setScanningSessionId(null);
          if (pollRef.current) clearInterval(pollRef.current);
          toast.success("WhatsApp connected successfully!");
          loadSessions();
        } else if (data.status === "disconnected") {
          // Session crashed or failed silently
          setQrStatus("error");
          setQrImage(null);
          if (pollRef.current) clearInterval(pollRef.current);
          toast.error("Session failed to start. Chrome may have crashed. Check server terminal.");
        } else if (data.status === "connecting" && !data.qr_image) {
          // QR was scanned, WhatsApp is loading — keep polling, show "Connecting..."
          setQrImage(null);
          setQrStatus("scanned");
        } else if (data.qr_image) {
          setQrImage(data.qr_image);
          setQrStatus("qr_ready");
        } else {
          setQrStatus(data.status || "connecting");
        }
      } catch {
        // Ignore poll errors
      }
    }

    // First check immediately, then poll every 3 seconds
    await pollQR();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(pollQR, 3000);

    // Timeout: if still no QR after 120 seconds, show error
    setTimeout(() => {
      setScanningSessionId((currentId) => {
        if (currentId === sessionId) {
          setQrImage((currentQr) => {
            if (!currentQr) {
              setQrStatus("error");
              if (pollRef.current) clearInterval(pollRef.current);
              toast.error("QR code timed out. Chrome may have failed to start. Check server terminal.");
            }
            return currentQr;
          });
        }
        return currentId;
      });
    }, 120000);
  }

  async function handleDisconnect(sessionId: string) {
    const res = await fetchWithAuth("/api/wa/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect", session_id: sessionId }),
    });

    if (res.ok) {
      toast.success("Session disconnected");
      loadSessions();
    }
  }

  async function handleDelete(sessionId: string) {
    if (!confirm("Delete this session? This cannot be undone.")) return;

    const res = await fetchWithAuth("/api/wa/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", session_id: sessionId }),
    });

    if (res.ok) {
      toast.success("Session deleted");
      loadSessions();
    }
  }

  function cancelScan() {
    setScanningSessionId(null);
    setQrImage(null);
    setQrStatus("idle");
    if (pollRef.current) clearInterval(pollRef.current);
  }

  const statusColor: Record<string, string> = {
    connected: "bg-green-100 text-green-700",
    connecting: "bg-yellow-100 text-yellow-700",
    qr_ready: "bg-blue-100 text-blue-700",
    disconnected: "bg-gray-100 text-gray-600",
    banned: "bg-red-100 text-red-700",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            WhatsApp Sessions
          </h1>
          <p className="text-gray-500 mt-1">
            Connect WhatsApp numbers via QR code scan
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button className="bg-green-600 hover:bg-green-700" />}>
              <Plus className="h-4 w-4 mr-2" />
              Add Number
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add WhatsApp Number</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Session Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Main Number, Reception"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Daily Message Limit</Label>
                <Input
                  type="number"
                  value={newLimit}
                  onChange={(e) => setNewLimit(Number(e.target.value))}
                  min={50}
                  max={2000}
                />
                <p className="text-xs text-gray-500">
                  Recommended: 500-700 per number for safety
                </p>
              </div>
              <Button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700"
                disabled={creating}
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Create Session
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Safety Tips */}
      <Card className="mb-6 border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold mb-1">Anti-Ban Tips:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>Use 2-3 numbers and keep each under 700 msgs/day</li>
                <li>Only send to patients who know your hospital</li>
                <li>Include patient name in messages (personalize)</li>
                <li>Send during business hours (9 AM - 6 PM)</li>
                <li>New numbers: start with 50 msgs/day, increase gradually</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* QR Code Scanner Modal */}
      {scanningSessionId && (
        <Card className="mb-6 border-2 border-green-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-green-600" />
              Scan QR Code
            </CardTitle>
            <CardDescription>
              Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            {qrStatus === "connecting" && !qrImage && (
              <div className="flex flex-col items-center py-8">
                <Loader2 className="h-12 w-12 animate-spin text-green-600 mb-4" />
                <p className="text-gray-500">
                  {scanningSessionId && sessions.find(s => s.id === scanningSessionId)?.status === "connecting"
                    ? "WhatsApp is loading... Please wait"
                    : "Generating QR code..."}
                </p>
              </div>
            )}
            {qrImage && qrStatus === "qr_ready" && (
              <div className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-lg shadow-md mb-4">
                  <img
                    src={qrImage}
                    alt="WhatsApp QR Code"
                    className="w-[300px] h-[300px]"
                  />
                </div>
                <p className="text-sm text-gray-500 mb-2">
                  Scan this with your WhatsApp camera
                </p>
                <div className="flex items-center gap-2 text-xs text-blue-600">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  QR refreshes automatically...
                </div>
              </div>
            )}
            {qrStatus === "scanned" && (
              <div className="flex flex-col items-center py-8">
                <Loader2 className="h-12 w-12 animate-spin text-green-600 mb-4" />
                <p className="text-green-600 font-semibold text-lg">
                  QR Scanned! Connecting to WhatsApp...
                </p>
                <p className="text-sm text-gray-500 mt-1">Please wait, this may take a moment</p>
              </div>
            )}
            {qrStatus === "connected" && (
              <div className="flex flex-col items-center py-8">
                <Wifi className="h-12 w-12 text-green-600 mb-4" />
                <p className="text-green-600 font-semibold text-lg">
                  Connected!
                </p>
              </div>
            )}
            {qrStatus === "error" && (
              <div className="flex flex-col items-center py-8">
                <WifiOff className="h-12 w-12 text-red-500 mb-4" />
                <p className="text-red-600 font-semibold">Failed to start session</p>
                <p className="text-sm text-gray-500 mt-1">Check server terminal for error details</p>
              </div>
            )}
            <Button variant="outline" onClick={cancelScan} className="mt-4">
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sessions List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          Loading sessions...
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Smartphone className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              No sessions yet
            </h3>
            <p className="text-gray-500 mb-4">
              Add a WhatsApp number and scan QR code to start sending messages
            </p>
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-green-600 hover:bg-green-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add First Number
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((session) => (
            <Card
              key={session.id}
              className={
                session.status === "connected"
                  ? "border-green-200"
                  : "border-gray-200"
              }
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {session.session_name}
                  </CardTitle>
                  <Badge className={statusColor[session.status] || statusColor.disconnected}>
                    {session.status === "connected" && (
                      <Wifi className="h-3 w-3 mr-1" />
                    )}
                    {session.status === "disconnected" && (
                      <WifiOff className="h-3 w-3 mr-1" />
                    )}
                    {session.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {session.phone_number && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="h-4 w-4" />
                    <span className="font-mono">+{session.phone_number}</span>
                  </div>
                )}

                {/* Daily Usage */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      Today
                    </span>
                    <span>
                      {session.messages_sent_today} / {session.daily_limit}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        session.messages_sent_today / session.daily_limit > 0.8
                          ? "bg-red-500"
                          : session.messages_sent_today / session.daily_limit >
                            0.5
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      }`}
                      style={{
                        width: `${Math.min(
                          (session.messages_sent_today / session.daily_limit) *
                            100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {session.last_message_at && (
                  <p className="text-xs text-gray-400">
                    Last message:{" "}
                    {new Date(session.last_message_at).toLocaleString()}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {session.status === "disconnected" ? (
                    <Button
                      size="sm"
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => handleStartScan(session.id)}
                    >
                      <QrCode className="h-4 w-4 mr-1" />
                      Scan QR
                    </Button>
                  ) : session.status === "connected" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleDisconnect(session.id)}
                    >
                      <WifiOff className="h-4 w-4 mr-1" />
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleStartScan(session.id)}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Retry
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(session.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

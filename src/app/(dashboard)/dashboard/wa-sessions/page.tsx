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
  AlertTriangle,
  CheckCircle2,
  XCircle,
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
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string>("idle");

  // Track previous session statuses to detect disconnections
  const prevStatusesRef = useRef<Record<string, string>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const disconnectedSinceRef = useRef<number | null>(null);

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
              WhatsApp sessions require a persistent server with a long-running WebSocket connection.
              This feature cannot run on serverless platforms like Vercel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">
              To use WhatsApp features, deploy this app on a VPS:
            </p>
            <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
              <li>DigitalOcean Droplet ($6/mo)</li>
              <li>AWS EC2 / Lightsail</li>
              <li>Railway or Render</li>
              <li>Any Linux VPS with Node.js 18+</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  useEffect(() => {
    loadSessions();

    // Auto-refresh every 10 seconds to detect disconnections
    autoRefreshRef.current = setInterval(() => {
      loadSessionsSilent();
    }, 10000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, []);

  async function loadSessions() {
    const res = await fetchWithAuth("/api/wa/session");
    const data = await res.json();
    if (data.sessions) {
      setSessions(data.sessions);
      // Initialize previous statuses
      const statuses: Record<string, string> = {};
      data.sessions.forEach((s: WASession) => {
        statuses[s.id] = s.status;
      });
      prevStatusesRef.current = statuses;
    }
    setLoading(false);
  }

  // Silent refresh — detects status changes and shows notifications
  async function loadSessionsSilent() {
    try {
      const res = await fetchWithAuth("/api/wa/session");
      const data = await res.json();
      if (!data.sessions) return;

      const newSessions: WASession[] = data.sessions;
      const prevStatuses = prevStatusesRef.current;

      // Detect changes
      newSessions.forEach((session) => {
        const prev = prevStatuses[session.id];
        const curr = session.status;

        if (prev === "connected" && curr === "disconnected") {
          // Session just disconnected
          toast.error(`⚠️ Session "${session.session_name}" disconnected!`, {
            description: session.phone_number
              ? `+${session.phone_number} — Auto-reconnecting... or scan QR to force reconnect`
              : "Auto-reconnecting...",
            duration: 10000,
            action: {
              label: "Scan QR",
              onClick: () => handleStartScan(session.id),
            },
          });
        }

        if (prev === "disconnected" && curr === "connected") {
          toast.success(`✅ Session "${session.session_name}" connected!`, {
            description: session.phone_number ? `+${session.phone_number} is live` : undefined,
            duration: 5000,
          });
        }
      });

      // Update previous statuses
      const newStatuses: Record<string, string> = {};
      newSessions.forEach((s) => {
        newStatuses[s.id] = s.status;
      });
      prevStatusesRef.current = newStatuses;

      setSessions(newSessions);
    } catch {
      // Ignore silent refresh errors
    }
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
      const data = await res.json();
      setCreateOpen(false);
      setNewName("Default");
      setNewLimit(700);
      await loadSessions();
      // Auto-open QR scanner immediately after creating
      if (data.session?.id) {
        handleStartScan(data.session.id);
      }
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
    disconnectedSinceRef.current = null;

    const startRes = await fetchWithAuth("/api/wa/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", session_id: sessionId }),
    });

    if (!startRes.ok) {
      const errData = await startRes.json().catch(() => ({}));
      toast.error(errData.error || "Failed to start session.");
      setQrStatus("error");
      return;
    }

    async function pollQR() {
      try {
        const res = await fetchWithAuth(`/api/wa/session/qr?session_id=${sessionId}`);
        const data = await res.json();

        if (data.status === "connected") {
          setQrStatus("connected");
          setQrImage(null);
          setScanningSessionId(null);
          if (pollRef.current) clearInterval(pollRef.current);
          toast.success("WhatsApp connected successfully!");
          loadSessions();
        } else if (data.status === "disconnected") {
          // After QR scan, Baileys fires 515 (stream restart) and goes disconnected
          // for ~10s before reconnecting. Keep polling for 35s before giving up.
          if (!disconnectedSinceRef.current) {
            disconnectedSinceRef.current = Date.now();
          }
          const waitedMs = Date.now() - disconnectedSinceRef.current;
          if (waitedMs > 35000) {
            setQrStatus("error");
            setQrImage(null);
            if (pollRef.current) clearInterval(pollRef.current);
            toast.error("Session failed to start. Check server logs.");
          } else {
            setQrStatus("scanned");
          }
        } else if (data.status === "connecting" && !data.qr_image) {
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

    await pollQR();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(pollQR, 3000);

    setTimeout(() => {
      setScanningSessionId((currentId) => {
        if (currentId === sessionId) {
          setQrImage((currentQr) => {
            if (!currentQr) {
              setQrStatus("error");
              if (pollRef.current) clearInterval(pollRef.current);
              toast.error("QR code timed out. Check server terminal.");
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

  const disconnectedSessions = sessions.filter((s) => s.status === "disconnected" && s.phone_number);
  const connectedSessions = sessions.filter((s) => s.status === "connected");

  const statusColor: Record<string, string> = {
    connected: "bg-green-100 text-green-700 border-green-200",
    connecting: "bg-yellow-100 text-yellow-700 border-yellow-200",
    qr_ready: "bg-blue-100 text-blue-700 border-blue-200",
    disconnected: "bg-red-100 text-red-700 border-red-200",
    banned: "bg-red-100 text-red-700 border-red-200",
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Sessions</h1>
          <p className="text-gray-500 text-sm mt-1">
            {connectedSessions.length} connected · {sessions.length} total
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
              <p className="text-sm text-gray-500 mt-1">
                After clicking Create, a QR code will appear — scan it with WhatsApp to connect.
              </p>
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
                  <QrCode className="h-4 w-4 mr-2" />
                )}
                {creating ? "Creating..." : "Create & Show QR"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* ACTION REQUIRED ALERT — shown when any session is disconnected */}
      {disconnectedSessions.length > 0 && (
        <Card className="mb-6 border-red-300 bg-red-50">
          <CardContent className="p-4">
            <div className="flex gap-3 items-start">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-red-800 text-sm">
                  Action Required — {disconnectedSessions.length} session{disconnectedSessions.length > 1 ? "s" : ""} disconnected
                </p>
                <div className="mt-2 space-y-2">
                  {disconnectedSessions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-red-200">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{s.session_name}</p>
                        {s.phone_number && (
                          <p className="text-xs text-gray-500">+{s.phone_number}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white text-xs"
                        onClick={() => handleStartScan(s.id)}
                      >
                        <QrCode className="h-3 w-3 mr-1" />
                        Scan QR
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-red-600 mt-2">
                  Auto-reconnecting in background — or scan QR to reconnect immediately
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ALL OK — shown when all sessions connected */}
      {sessions.length > 0 && disconnectedSessions.length === 0 && (
        <Card className="mb-6 border-green-200 bg-green-50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <p className="text-sm font-medium text-green-800">
                All {connectedSessions.length} session{connectedSessions.length !== 1 ? "s" : ""} connected and sending
              </p>
              <span className="ml-auto text-xs text-green-600">Auto-refreshing every 10s</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* QR Code Scanner Modal */}
      {scanningSessionId && (
        <Card className="mb-6 border-2 border-green-500 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-green-600" />
              Scan QR Code
            </CardTitle>
            <CardDescription>
              Open WhatsApp → Settings → Linked Devices → Link a Device
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            {qrStatus === "connecting" && !qrImage && (
              <div className="flex flex-col items-center py-8">
                <Loader2 className="h-12 w-12 animate-spin text-green-600 mb-4" />
                <p className="text-gray-600 font-medium">Connecting...</p>
                <p className="text-gray-400 text-sm mt-1">
                  If number was connected before, it will reconnect automatically
                </p>
              </div>
            )}
            {qrImage && qrStatus === "qr_ready" && (
              <div className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-xl shadow-md mb-4 border-2 border-green-200">
                  <img src={qrImage} alt="WhatsApp QR Code" className="w-[280px] h-[280px]" />
                </div>
                <p className="text-sm text-gray-600 mb-1 font-medium">
                  Scan with WhatsApp camera
                </p>
                <div className="flex items-center gap-2 text-xs text-blue-600">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  QR refreshes automatically
                </div>
              </div>
            )}
            {qrStatus === "scanned" && (
              <div className="flex flex-col items-center py-8">
                <Loader2 className="h-12 w-12 animate-spin text-green-600 mb-4" />
                <p className="text-green-700 font-semibold text-lg">QR Scanned!</p>
                <p className="text-gray-500 text-sm mt-1">Connecting to WhatsApp...</p>
              </div>
            )}
            {qrStatus === "connected" && (
              <div className="flex flex-col items-center py-8">
                <CheckCircle2 className="h-14 w-14 text-green-600 mb-4" />
                <p className="text-green-700 font-bold text-xl">Connected!</p>
              </div>
            )}
            {qrStatus === "error" && (
              <div className="flex flex-col items-center py-8">
                <XCircle className="h-14 w-14 text-red-500 mb-4" />
                <p className="text-red-600 font-semibold">Failed to start session</p>
                <p className="text-sm text-gray-500 mt-1">Check server terminal for details</p>
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
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No sessions yet</h3>
            <p className="text-gray-500 mb-4">
              Add a WhatsApp number and scan QR code to start sending messages
            </p>
            <Button onClick={() => setCreateOpen(true)} className="bg-green-600 hover:bg-green-700">
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
              className={`transition-all ${
                session.status === "connected"
                  ? "border-green-200 shadow-sm"
                  : session.status === "disconnected"
                  ? "border-red-200 bg-red-50/30"
                  : "border-gray-200"
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{session.session_name}</CardTitle>
                  <Badge className={`text-xs ${statusColor[session.status] || statusColor.disconnected}`}>
                    {session.status === "connected" && <Wifi className="h-3 w-3 mr-1" />}
                    {session.status === "disconnected" && <WifiOff className="h-3 w-3 mr-1" />}
                    {session.status === "connecting" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
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
                    <span>{session.messages_sent_today} / {session.daily_limit} msgs</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        session.messages_sent_today / session.daily_limit > 0.8
                          ? "bg-red-500"
                          : session.messages_sent_today / session.daily_limit > 0.5
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      }`}
                      style={{
                        width: `${Math.min(100, (session.messages_sent_today / session.daily_limit) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                {session.last_message_at && (
                  <p className="text-xs text-gray-400">
                    Last: {new Date(session.last_message_at).toLocaleString()}
                  </p>
                )}

                {/* Disconnected reason hint */}
                {session.status === "disconnected" && session.phone_number && (
                  <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                    Auto-reconnecting... or scan QR to reconnect now
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
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
                    className="text-red-600 hover:bg-red-50 hover:border-red-300"
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

      {/* Anti-Ban Tips */}
      <Card className="mt-6 border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold mb-1">Tips to avoid disconnection:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>Use 2-3 numbers — spread messages across them</li>
                <li>Keep each number under 700 msgs/day</li>
                <li>Add delay between messages (developer side)</li>
                <li>Send only to known contacts</li>
                <li>If disconnected — just scan QR once to reconnect</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

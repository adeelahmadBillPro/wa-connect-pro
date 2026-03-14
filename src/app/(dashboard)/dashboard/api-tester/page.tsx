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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, CheckCircle, XCircle, Clock, Loader2, Smartphone, Image, FileText, Video, Upload, X, Wifi, History, Search } from "lucide-react";
import { toast } from "sonner";
import type { MessageTemplate } from "@/types/database";

interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
  duration: number;
}

export default function ApiTesterPage() {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  // Request form
  const [toPhone, setToPhone] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [params, setParams] = useState("");

  // Response
  const [response, setResponse] = useState<ApiResponse | null>(null);

  // Status check
  const [checkMessageId, setCheckMessageId] = useState("");
  const [statusResponse, setStatusResponse] = useState<ApiResponse | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  // WA Web send
  const [waPhone, setWaPhone] = useState("");
  const [waMessage, setWaMessage] = useState("");
  const [waPatientName, setWaPatientName] = useState("");
  const [waType, setWaType] = useState<"text" | "image" | "document" | "video">("text");
  const [waMediaUrl, setWaMediaUrl] = useState("");
  const [waCaption, setWaCaption] = useState("");
  const [waMediaFile, setWaMediaFile] = useState<File | null>(null);
  const [waMediaBase64, setWaMediaBase64] = useState("");
  const [waLoading, setWaLoading] = useState(false);
  const [waResponse, setWaResponse] = useState<ApiResponse | null>(null);

  // WA Web bulk
  const [waBulkMessages, setWaBulkMessages] = useState("");
  const [waBulkLoading, setWaBulkLoading] = useState(false);
  const [waBulkResponse, setWaBulkResponse] = useState<ApiResponse | null>(null);

  // WA Status
  const [waStatusLoading, setWaStatusLoading] = useState(false);
  const [waStatusResponse, setWaStatusResponse] = useState<ApiResponse | null>(null);

  // WA Messages
  const [waMsgLimit, setWaMsgLimit] = useState("20");
  const [waMsgStatus, setWaMsgStatus] = useState("");
  const [waMsgPhone, setWaMsgPhone] = useState("");
  const [waMsgId, setWaMsgId] = useState("");
  const [waMsgLoading, setWaMsgLoading] = useState(false);
  const [waMsgResponse, setWaMsgResponse] = useState<ApiResponse | null>(null);

  const supabase = createClient();

  useEffect(() => {
    setBaseUrl(window.location.origin);
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

    const [orgRes, tmplRes] = await Promise.all([
      supabase
        .from("organizations")
        .select("api_key")
        .eq("id", member.org_id)
        .single(),
      supabase
        .from("message_templates")
        .select("*")
        .eq("org_id", member.org_id),
    ]);

    if (orgRes.data) setApiKey(orgRes.data.api_key);
    if (tmplRes.data) setTemplates(tmplRes.data);
  }

  async function handleSendTest(e: React.FormEvent) {
    e.preventDefault();
    if (!toPhone || !templateName) {
      toast.error("Phone number and template name are required");
      return;
    }

    setLoading(true);
    setResponse(null);

    const startTime = Date.now();

    try {
      const res = await fetch(`${baseUrl}/api/v1/messages/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: toPhone.replace(/[^0-9+]/g, ""),
          template: templateName,
          params: params
            ? params
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean)
            : [],
        }),
      });

      const body = await res.json();
      const duration = Date.now() - startTime;

      setResponse({ status: res.status, body, duration });

      if (body.message_id) {
        setCheckMessageId(body.message_id);
      }

      if (res.ok && body.success) {
        toast.success("API call successful!");
      } else {
        toast.error(body.error || "API call failed");
      }
    } catch {
      setResponse({
        status: 0,
        body: { error: "Network error — could not reach API" },
        duration: Date.now() - startTime,
      });
    }

    setLoading(false);
  }

  async function handleCheckStatus() {
    if (!checkMessageId) {
      toast.error("Enter a message ID to check");
      return;
    }

    setCheckingStatus(true);
    setStatusResponse(null);

    const startTime = Date.now();

    try {
      const res = await fetch(
        `${baseUrl}/api/v1/messages/status?message_id=${checkMessageId}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      const body = await res.json();
      setStatusResponse({
        status: res.status,
        body,
        duration: Date.now() - startTime,
      });
    } catch {
      setStatusResponse({
        status: 0,
        body: { error: "Network error" },
        duration: Date.now() - startTime,
      });
    }

    setCheckingStatus(false);
  }

  async function handleWaSend(e: React.FormEvent) {
    e.preventDefault();
    if (!waPhone) {
      toast.error("Phone number is required");
      return;
    }
    if (waType === "text" && !waMessage) {
      toast.error("Message is required for text type");
      return;
    }
    if (waType !== "text" && !waMediaUrl && !waMediaBase64) {
      toast.error("Please upload a file or provide a URL for " + waType + " type");
      return;
    }
    setWaLoading(true);
    setWaResponse(null);
    const startTime = Date.now();
    try {
      const payload: Record<string, any> = {
        to: waPhone.replace(/[^0-9+]/g, ""),
        message: waMessage || undefined,
        patient_name: waPatientName || undefined,
      };
      if (waType !== "text") {
        payload.type = waType;
        if (waMediaBase64 && waMediaFile) {
          payload.media_data = waMediaBase64;
          payload.media_mimetype = waMediaFile.type;
          payload.media_filename = waMediaFile.name;
        } else if (waMediaUrl) {
          payload.media_url = waMediaUrl;
        }
        payload.caption = waCaption || undefined;
      }
      const res = await fetch(`${baseUrl}/api/v1/wa/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      setWaResponse({ status: res.status, body, duration: Date.now() - startTime });
      if (res.ok && body.success) {
        toast.success("Message sent via WhatsApp Web!");
      } else {
        toast.error(body.error || "Failed to send");
      }
    } catch {
      setWaResponse({
        status: 0,
        body: { error: "Network error" },
        duration: Date.now() - startTime,
      });
    }
    setWaLoading(false);
  }

  async function handleWaBulk(e: React.FormEvent) {
    e.preventDefault();
    if (!waBulkMessages.trim()) {
      toast.error("Enter messages JSON array");
      return;
    }
    setWaBulkLoading(true);
    setWaBulkResponse(null);
    const startTime = Date.now();
    try {
      const messages = JSON.parse(waBulkMessages);
      const res = await fetch(`${baseUrl}/api/v1/wa/bulk`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages }),
      });
      const body = await res.json();
      setWaBulkResponse({ status: res.status, body, duration: Date.now() - startTime });
      if (res.ok && body.success) {
        toast.success(`${body.queued} messages queued!`);
      } else {
        toast.error(body.error || "Failed to queue");
      }
    } catch (err: any) {
      setWaBulkResponse({
        status: 0,
        body: { error: err?.message || "Invalid JSON or network error" },
        duration: Date.now() - startTime,
      });
    }
    setWaBulkLoading(false);
  }

  async function handleWaStatus() {
    setWaStatusLoading(true);
    setWaStatusResponse(null);
    const startTime = Date.now();
    try {
      const res = await fetch(`${baseUrl}/api/v1/wa/status`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const body = await res.json();
      setWaStatusResponse({ status: res.status, body, duration: Date.now() - startTime });
    } catch {
      setWaStatusResponse({ status: 0, body: { error: "Network error" }, duration: Date.now() - startTime });
    }
    setWaStatusLoading(false);
  }

  async function handleWaMessages() {
    setWaMsgLoading(true);
    setWaMsgResponse(null);
    const startTime = Date.now();
    try {
      const params = new URLSearchParams();
      if (waMsgLimit) params.set("limit", waMsgLimit);
      if (waMsgStatus) params.set("status", waMsgStatus);
      if (waMsgPhone) params.set("phone", waMsgPhone.replace(/[^0-9+]/g, ""));
      if (waMsgId) params.set("message_id", waMsgId);
      const res = await fetch(`${baseUrl}/api/v1/wa/messages?${params.toString()}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const body = await res.json();
      setWaMsgResponse({ status: res.status, body, duration: Date.now() - startTime });
    } catch {
      setWaMsgResponse({ status: 0, body: { error: "Network error" }, duration: Date.now() - startTime });
    }
    setWaMsgLoading(false);
  }

  function getStatusBadge(status: number) {
    if (status >= 200 && status < 300)
      return (
        <Badge className="bg-green-100 text-green-700 gap-1">
          <CheckCircle className="h-3 w-3" />
          {status} OK
        </Badge>
      );
    if (status >= 400)
      return (
        <Badge className="bg-red-100 text-red-700 gap-1">
          <XCircle className="h-3 w-3" />
          {status} Error
        </Badge>
      );
    return (
      <Badge className="bg-gray-100 text-gray-700 gap-1">
        <Clock className="h-3 w-3" />
        {status}
      </Badge>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">API Tester</h1>
        <p className="text-gray-500 mt-1">
          Test your API endpoints before sharing with 3rd party
        </p>
      </div>

      <Tabs defaultValue="meta" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="meta">Meta Official API</TabsTrigger>
          <TabsTrigger value="wa-send" className="gap-1">
            <Smartphone className="h-4 w-4" />
            WA Web Send
          </TabsTrigger>
          <TabsTrigger value="wa-bulk" className="gap-1">
            <Smartphone className="h-4 w-4" />
            WA Bulk
          </TabsTrigger>
          <TabsTrigger value="wa-status" className="gap-1">
            <Wifi className="h-4 w-4" />
            WA Status
          </TabsTrigger>
          <TabsTrigger value="wa-messages" className="gap-1">
            <History className="h-4 w-4" />
            WA Messages
          </TabsTrigger>
        </TabsList>

        {/* ===== Meta Official API Tab ===== */}
        <TabsContent value="meta">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Send Message</CardTitle>
                  <CardDescription>POST /api/v1/messages/send</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSendTest} className="space-y-4">
                    <div className="space-y-2">
                      <Label>API Key</Label>
                      <Input
                        value={apiKey ? "wcp_" + "*".repeat(20) : ""}
                        readOnly
                        className="font-mono text-sm bg-gray-50"
                      />
                      <p className="text-xs text-gray-400">Using your org API key</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number (to)</Label>
                      <Input
                        value={toPhone}
                        onChange={(e) => setToPhone(e.target.value)}
                        placeholder="923001234567"
                        required
                      />
                      <p className="text-xs text-gray-500">Include country code</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Template Name</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        required
                      >
                        <option value="">Select template</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.name}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Parameters (comma separated)</Label>
                      <Input
                        value={params}
                        onChange={(e) => setParams(e.target.value)}
                        placeholder="Ahmed Khan, Blood Test, City Hospital"
                      />
                    </div>
                    <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={loading}>
                      {loading ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                      ) : (
                        <><Play className="h-4 w-4 mr-2" />Send Test Request</>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Check Message Status</CardTitle>
                  <CardDescription>GET /api/v1/messages/status</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Message ID</Label>
                      <Input
                        value={checkMessageId}
                        onChange={(e) => setCheckMessageId(e.target.value)}
                        placeholder="paste message_id from send response"
                        className="font-mono text-sm"
                      />
                    </div>
                    <Button onClick={handleCheckStatus} variant="outline" className="w-full" disabled={checkingStatus || !checkMessageId}>
                      {checkingStatus ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking...</>) : "Check Status"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Send Response</CardTitle>
                    {response && (
                      <div className="flex items-center gap-2">
                        {getStatusBadge(response.status)}
                        <span className="text-xs text-gray-400">{response.duration}ms</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {response ? (
                    <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
                      <pre>{JSON.stringify(response.body, null, 2)}</pre>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <Play className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Send a test request to see the response</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Status Response</CardTitle>
                    {statusResponse && (
                      <div className="flex items-center gap-2">
                        {getStatusBadge(statusResponse.status)}
                        <span className="text-xs text-gray-400">{statusResponse.duration}ms</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {statusResponse ? (
                    <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
                      <pre>{JSON.stringify(statusResponse.body, null, 2)}</pre>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Check a message status to see the response</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {toPhone && templateName && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">cURL Command</CardTitle>
                    <CardDescription>Copy this to test from terminal</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs font-mono overflow-x-auto">
                      <pre>{`curl -X POST "${baseUrl}/api/v1/messages/send" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      to: toPhone.replace(/[^0-9+]/g, ""),
      template: templateName,
      params: params ? params.split(",").map((p) => p.trim()).filter(Boolean) : [],
    },
    null,
    2
  )}'`}</pre>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ===== WA Web Single Send Tab ===== */}
        <TabsContent value="wa-send">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-green-600" />
                    Send via WhatsApp Web
                  </CardTitle>
                  <CardDescription>POST /api/v1/wa/send — No Meta API fees</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleWaSend} className="space-y-4">
                    <div className="space-y-2">
                      <Label>API Key</Label>
                      <Input
                        value={apiKey ? "wcp_" + "*".repeat(20) : ""}
                        readOnly
                        className="font-mono text-sm bg-gray-50"
                      />
                      <p className="text-xs text-gray-400">Same API key — different endpoint</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number (to)</Label>
                      <Input
                        value={waPhone}
                        onChange={(e) => setWaPhone(e.target.value)}
                        placeholder="923001234567"
                        required
                      />
                    </div>

                    {/* Message Type Selector */}
                    <div className="space-y-2">
                      <Label>Message Type</Label>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { value: "text" as const, label: "Text", icon: Smartphone },
                          { value: "image" as const, label: "Image", icon: Image },
                          { value: "document" as const, label: "PDF/Doc", icon: FileText },
                          { value: "video" as const, label: "Video", icon: Video },
                        ].map((t) => (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => {
                              setWaType(t.value);
                              setWaMediaFile(null);
                              setWaMediaBase64("");
                              setWaMediaUrl("");
                            }}
                            className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-colors ${
                              waType === t.value
                                ? "border-green-500 bg-green-50 text-green-700"
                                : "border-gray-200 text-gray-500 hover:bg-gray-50"
                            }`}
                          >
                            <t.icon className="h-4 w-4" />
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Media Upload - shown for non-text types */}
                    {waType !== "text" && (
                      <>
                        <div className="space-y-2">
                          <Label>Upload File *</Label>
                          <div className="relative">
                            {waMediaFile ? (
                              <div className="flex items-center gap-2 p-3 border rounded-lg bg-green-50 border-green-200">
                                {waType === "image" ? (
                                  <Image className="h-5 w-5 text-green-600 shrink-0" />
                                ) : waType === "document" ? (
                                  <FileText className="h-5 w-5 text-green-600 shrink-0" />
                                ) : (
                                  <Video className="h-5 w-5 text-green-600 shrink-0" />
                                )}
                                <span className="text-sm text-green-700 truncate flex-1">
                                  {waMediaFile.name}
                                </span>
                                <span className="text-xs text-green-500 shrink-0">
                                  {(waMediaFile.size / 1024).toFixed(0)} KB
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setWaMediaFile(null);
                                    setWaMediaBase64("");
                                  }}
                                  className="p-1 hover:bg-green-100 rounded shrink-0"
                                >
                                  <X className="h-4 w-4 text-green-600" />
                                </button>
                              </div>
                            ) : (
                              <label className="flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors">
                                <Upload className="h-6 w-6 text-gray-400" />
                                <span className="text-sm text-gray-500">
                                  Click to choose {waType === "image" ? "an image" : waType === "document" ? "a PDF/document" : "a video"}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {waType === "image"
                                    ? "JPG, PNG, WEBP (max 16MB)"
                                    : waType === "document"
                                    ? "PDF, DOC, DOCX, XLS, XLSX (max 100MB)"
                                    : "MP4, 3GP (max 16MB)"}
                                </span>
                                <input
                                  type="file"
                                  className="hidden"
                                  accept={
                                    waType === "image"
                                      ? "image/jpeg,image/png,image/webp"
                                      : waType === "document"
                                      ? ".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                      : "video/mp4,video/3gpp"
                                  }
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    setWaMediaFile(file);
                                    // Convert to base64
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                      const result = reader.result as string;
                                      // Remove the data:...;base64, prefix
                                      const base64 = result.split(",")[1];
                                      setWaMediaBase64(base64);
                                    };
                                    reader.readAsDataURL(file);
                                  }}
                                />
                              </label>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            Or provide a URL instead:
                          </p>
                          <Input
                            value={waMediaUrl}
                            onChange={(e) => setWaMediaUrl(e.target.value)}
                            placeholder={
                              waType === "image"
                                ? "https://example.com/report.jpg"
                                : waType === "document"
                                ? "https://example.com/report.pdf"
                                : "https://example.com/video.mp4"
                            }
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Caption (optional)</Label>
                          <Input
                            value={waCaption}
                            onChange={(e) => setWaCaption(e.target.value)}
                            placeholder="Blood Test Report - Ahmed Khan"
                          />
                        </div>
                      </>
                    )}

                    <div className="space-y-2">
                      <Label>{waType === "text" ? "Message" : "Message / Fallback Text"}</Label>
                      <Textarea
                        value={waMessage}
                        onChange={(e) => setWaMessage(e.target.value)}
                        placeholder="Hello {{name}}, your report is ready!"
                        rows={3}
                        required={waType === "text"}
                      />
                      <p className="text-xs text-gray-500">
                        Use {"{{name}}"} or {"{{1}}"} for patient name replacement
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Patient Name (optional)</Label>
                      <Input
                        value={waPatientName}
                        onChange={(e) => setWaPatientName(e.target.value)}
                        placeholder="Ahmed Khan"
                      />
                      <p className="text-xs text-gray-500">
                        Replaces {"{{name}}"} and {"{{1}}"} in message
                      </p>
                    </div>
                    <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={waLoading}>
                      {waLoading ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                      ) : (
                        <><Smartphone className="h-4 w-4 mr-2" />Send via WA Web</>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Response</CardTitle>
                    {waResponse && (
                      <div className="flex items-center gap-2">
                        {getStatusBadge(waResponse.status)}
                        <span className="text-xs text-gray-400">{waResponse.duration}ms</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {waResponse ? (
                    <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
                      <pre>{JSON.stringify(waResponse.body, null, 2)}</pre>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Send a message to see the response</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {waPhone && (waMessage || waMediaUrl || waMediaBase64) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">cURL Command</CardTitle>
                    <CardDescription>Share this with 3rd party hospitals</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs font-mono overflow-x-auto">
                      <pre>{`curl -X POST "${baseUrl}/api/v1/wa/send" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      to: waPhone.replace(/[^0-9+]/g, ""),
      message: waMessage || undefined,
      patient_name: waPatientName || undefined,
      ...(waType !== "text"
        ? {
            type: waType,
            ...(waMediaBase64
              ? { media_data: "<base64_data>", media_mimetype: waMediaFile?.type, media_filename: waMediaFile?.name }
              : { media_url: waMediaUrl }),
            caption: waCaption || undefined,
          }
        : {}),
    },
    null,
    2
  )}'`}</pre>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ===== WA Web Bulk Send Tab ===== */}
        <TabsContent value="wa-bulk">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-green-600" />
                    Bulk Send via WhatsApp Web
                  </CardTitle>
                  <CardDescription>POST /api/v1/wa/bulk — Queue multiple messages</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleWaBulk} className="space-y-4">
                    <div className="space-y-2">
                      <Label>API Key</Label>
                      <Input
                        value={apiKey ? "wcp_" + "*".repeat(20) : ""}
                        readOnly
                        className="font-mono text-sm bg-gray-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Messages (JSON array)</Label>
                      <Textarea
                        value={waBulkMessages}
                        onChange={(e) => setWaBulkMessages(e.target.value)}
                        placeholder={`[\n  { "to": "923001234567", "message": "Hello {{name}}", "patient_name": "Ahmed" },\n  { "to": "923009876543", "message": "Hello {{name}}", "patient_name": "Sara" }\n]`}
                        rows={8}
                        className="font-mono text-sm"
                        required
                      />
                      <p className="text-xs text-gray-500">
                        Each item needs: to, message. Optional: patient_name, type, media_url
                      </p>
                    </div>
                    <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={waBulkLoading}>
                      {waBulkLoading ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Queuing...</>
                      ) : (
                        <><Smartphone className="h-4 w-4 mr-2" />Queue Bulk Messages</>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Response</CardTitle>
                    {waBulkResponse && (
                      <div className="flex items-center gap-2">
                        {getStatusBadge(waBulkResponse.status)}
                        <span className="text-xs text-gray-400">{waBulkResponse.duration}ms</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {waBulkResponse ? (
                    <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
                      <pre>{JSON.stringify(waBulkResponse.body, null, 2)}</pre>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Queue bulk messages to see the response</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">cURL Example</CardTitle>
                  <CardDescription>Share with hospitals for bulk sending</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs font-mono overflow-x-auto">
                    <pre>{`curl -X POST "${baseUrl}/api/v1/wa/bulk" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      messages: [
        { to: "923001234567", message: "Hello {{name}}, your report is ready", patient_name: "Ahmed Khan" },
        { to: "923009876543", message: "Hello {{name}}, your report is ready", patient_name: "Sara Ali" },
      ],
    },
    null,
    2
  )}'`}</pre>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        {/* ===== WA Status Tab ===== */}
        <TabsContent value="wa-status">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Wifi className="h-5 w-5 text-green-600" />
                    Session Status
                  </CardTitle>
                  <CardDescription>GET /api/v1/wa/status — Check connected sessions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <Input
                      value={apiKey ? "wcp_" + "*".repeat(20) : ""}
                      readOnly
                      className="font-mono text-sm bg-gray-50"
                    />
                  </div>
                  <Button onClick={handleWaStatus} className="w-full bg-green-600 hover:bg-green-700" disabled={waStatusLoading}>
                    {waStatusLoading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking...</>
                    ) : (
                      <><Wifi className="h-4 w-4 mr-2" />Check Session Status</>
                    )}
                  </Button>
                  <div className="bg-gray-900 text-green-400 rounded-lg p-3 text-xs font-mono overflow-x-auto">
                    <pre>{`curl -H "Authorization: Bearer ${apiKey}" \\
  "${baseUrl}/api/v1/wa/status"`}</pre>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Response</CardTitle>
                  {waStatusResponse && (
                    <div className="flex items-center gap-2">
                      {getStatusBadge(waStatusResponse.status)}
                      <span className="text-xs text-gray-400">{waStatusResponse.duration}ms</span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {waStatusResponse ? (
                  <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
                    <pre>{JSON.stringify(waStatusResponse.body, null, 2)}</pre>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <Wifi className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Check status to see connected sessions</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== WA Messages Tab ===== */}
        <TabsContent value="wa-messages">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <History className="h-5 w-5 text-green-600" />
                    Message History
                  </CardTitle>
                  <CardDescription>GET /api/v1/wa/messages — View sent messages</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <Input
                      value={apiKey ? "wcp_" + "*".repeat(20) : ""}
                      readOnly
                      className="font-mono text-sm bg-gray-50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Limit</Label>
                      <Input
                        value={waMsgLimit}
                        onChange={(e) => setWaMsgLimit(e.target.value)}
                        placeholder="20"
                        type="number"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Status Filter</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={waMsgStatus}
                        onChange={(e) => setWaMsgStatus(e.target.value)}
                      >
                        <option value="">All</option>
                        <option value="sent">Sent</option>
                        <option value="delivered">Delivered</option>
                        <option value="read">Read</option>
                        <option value="failed">Failed</option>
                        <option value="queued">Queued</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone Filter (optional)</Label>
                    <Input
                      value={waMsgPhone}
                      onChange={(e) => setWaMsgPhone(e.target.value)}
                      placeholder="923001234567"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Message ID (optional)</Label>
                    <Input
                      value={waMsgId}
                      onChange={(e) => setWaMsgId(e.target.value)}
                      placeholder="paste message_id"
                      className="font-mono text-sm"
                    />
                  </div>
                  <Button onClick={handleWaMessages} className="w-full bg-green-600 hover:bg-green-700" disabled={waMsgLoading}>
                    {waMsgLoading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading...</>
                    ) : (
                      <><Search className="h-4 w-4 mr-2" />Fetch Messages</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Response</CardTitle>
                  {waMsgResponse && (
                    <div className="flex items-center gap-2">
                      {getStatusBadge(waMsgResponse.status)}
                      <span className="text-xs text-gray-400">{waMsgResponse.duration}ms</span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {waMsgResponse ? (
                  <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto max-h-[600px] overflow-y-auto">
                    <pre>{JSON.stringify(waMsgResponse.body, null, 2)}</pre>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Fetch messages to see history</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Send,
  Layers,
  Wifi,
  History,
  MessageSquare,
  Search,
  Webhook,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  ExternalLink,
  Copy,
  Check,
  BookOpen,
  Key,
  Zap,
  Shield,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    POST: "bg-green-600 text-white",
    GET: "bg-blue-600 text-white",
    PUT: "bg-amber-600 text-white",
    DELETE: "bg-red-600 text-white",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${colors[method] ?? "bg-gray-600 text-white"}`}
    >
      {method}
    </span>
  );
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded p-1.5 text-gray-400 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
        title="Copy to clipboard"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
      <pre className="overflow-x-auto rounded-lg bg-gray-950 p-4 text-[13px] leading-relaxed text-gray-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 py-3 text-left font-medium transition hover:text-green-600"
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0" />
        ) : (
          <ChevronRight className="size-4 shrink-0" />
        )}
        {title}
      </button>
      {open && <div className="pb-4 pl-6">{children}</div>}
    </div>
  );
}

function ParamTable({
  params,
}: {
  params: { name: string; type: string; required: boolean; description: string }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="pb-2 pr-4 font-semibold">Parameter</th>
            <th className="pb-2 pr-4 font-semibold">Type</th>
            <th className="pb-2 pr-4 font-semibold">Required</th>
            <th className="pb-2 font-semibold">Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={p.name} className="border-b border-border/50">
              <td className="py-2 pr-4">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                  {p.name}
                </code>
              </td>
              <td className="py-2 pr-4 text-muted-foreground">{p.type}</td>
              <td className="py-2 pr-4">
                {p.required ? (
                  <Badge variant="default" className="bg-green-600 text-white text-[10px]">
                    Required
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">Optional</span>
                )}
              </td>
              <td className="py-2 text-muted-foreground">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Code examples
// ---------------------------------------------------------------------------

const codeExamples = {
  sendText: {
    javascript: `const response = await fetch("https://your-domain.com/api/v1/wa/send", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_API_KEY"
  },
  body: JSON.stringify({
    to: "923001234567",
    message: "Hello! Your appointment is confirmed for tomorrow at 10 AM.",
    patient_name: "Ahmed Khan"
  })
});

const data = await response.json();
console.log(data);
// { success: true, message_id: "uuid", status: "sent" }`,
    python: `import requests

response = requests.post(
    "https://your-domain.com/api/v1/wa/send",
    headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer YOUR_API_KEY"
    },
    json={
        "to": "923001234567",
        "message": "Hello! Your appointment is confirmed for tomorrow at 10 AM.",
        "patient_name": "Ahmed Khan"
    }
)

data = response.json()
print(data)
# {"success": True, "message_id": "uuid", "status": "sent"}`,
    php: `<?php
$ch = curl_init("https://your-domain.com/api/v1/wa/send");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Content-Type: application/json",
        "Authorization: Bearer YOUR_API_KEY"
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "to" => "923001234567",
        "message" => "Hello! Your appointment is confirmed for tomorrow at 10 AM.",
        "patient_name" => "Ahmed Khan"
    ])
]);

$response = curl_exec($ch);
curl_close($ch);
$data = json_decode($response, true);
print_r($data);
// ["success" => true, "message_id" => "uuid", "status" => "sent"]`,
    csharp: `using var client = new HttpClient();
client.DefaultRequestHeaders.Add("Authorization", "Bearer YOUR_API_KEY");

var payload = new {
    to = "923001234567",
    message = "Hello! Your appointment is confirmed for tomorrow at 10 AM.",
    patient_name = "Ahmed Khan"
};

var response = await client.PostAsJsonAsync(
    "https://your-domain.com/api/v1/wa/send", payload);
var data = await response.Content.ReadFromJsonAsync<JsonElement>();
Console.WriteLine(data);
// { "success": true, "message_id": "uuid", "status": "sent" }`,
  },
  sendMedia: {
    javascript: `// Send image via URL
const response = await fetch("https://your-domain.com/api/v1/wa/send", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_API_KEY"
  },
  body: JSON.stringify({
    to: "923001234567",
    type: "image",
    media_url: "https://example.com/report.png",
    caption: "Your lab report is ready"
  })
});

// Send document via base64
const docResponse = await fetch("https://your-domain.com/api/v1/wa/send", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_API_KEY"
  },
  body: JSON.stringify({
    to: "923001234567",
    type: "document",
    media_data: "JVBERi0xLjQK...",  // base64 encoded file
    media_mimetype: "application/pdf",
    media_filename: "invoice.pdf",
    caption: "Your invoice"
  })
});`,
    python: `import requests
import base64

# Send image via URL
response = requests.post(
    "https://your-domain.com/api/v1/wa/send",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "to": "923001234567",
        "type": "image",
        "media_url": "https://example.com/report.png",
        "caption": "Your lab report is ready"
    }
)

# Send document via base64
with open("invoice.pdf", "rb") as f:
    encoded = base64.b64encode(f.read()).decode()

response = requests.post(
    "https://your-domain.com/api/v1/wa/send",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "to": "923001234567",
        "type": "document",
        "media_data": encoded,
        "media_mimetype": "application/pdf",
        "media_filename": "invoice.pdf",
        "caption": "Your invoice"
    }
)`,
    php: `<?php
// Send image via URL
$ch = curl_init("https://your-domain.com/api/v1/wa/send");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Content-Type: application/json",
        "Authorization: Bearer YOUR_API_KEY"
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "to" => "923001234567",
        "type" => "image",
        "media_url" => "https://example.com/report.png",
        "caption" => "Your lab report is ready"
    ])
]);
$response = curl_exec($ch);
curl_close($ch);

// Send document via base64
$fileData = base64_encode(file_get_contents("invoice.pdf"));
$ch = curl_init("https://your-domain.com/api/v1/wa/send");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Content-Type: application/json",
        "Authorization: Bearer YOUR_API_KEY"
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "to" => "923001234567",
        "type" => "document",
        "media_data" => $fileData,
        "media_mimetype" => "application/pdf",
        "media_filename" => "invoice.pdf",
        "caption" => "Your invoice"
    ])
]);
$response = curl_exec($ch);
curl_close($ch);`,
    csharp: `using var client = new HttpClient();
client.DefaultRequestHeaders.Add("Authorization", "Bearer YOUR_API_KEY");

// Send image via URL
var imagePayload = new {
    to = "923001234567",
    type = "image",
    media_url = "https://example.com/report.png",
    caption = "Your lab report is ready"
};
await client.PostAsJsonAsync("https://your-domain.com/api/v1/wa/send", imagePayload);

// Send document via base64
var fileBytes = await File.ReadAllBytesAsync("invoice.pdf");
var docPayload = new {
    to = "923001234567",
    type = "document",
    media_data = Convert.ToBase64String(fileBytes),
    media_mimetype = "application/pdf",
    media_filename = "invoice.pdf",
    caption = "Your invoice"
};
await client.PostAsJsonAsync("https://your-domain.com/api/v1/wa/send", docPayload);`,
  },
  bulk: {
    javascript: `const response = await fetch("https://your-domain.com/api/v1/wa/bulk", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_API_KEY"
  },
  body: JSON.stringify({
    messages: [
      {
        to: "923001234567",
        message: "Hi Ahmed, your appointment is tomorrow at 10 AM.",
        patient_name: "Ahmed Khan"
      },
      {
        to: "923009876543",
        message: "Hi Sara, your lab results are ready.",
        patient_name: "Sara Ali"
      },
      {
        to: "923005551234",
        message: "Reminder: Follow-up visit scheduled for next week.",
        type: "image",
        media_url: "https://example.com/reminder.png",
        caption: "Appointment details attached"
      }
    ]
  })
});

const data = await response.json();
console.log(data);
// { success: true, queued: 3, total: 3, estimated_time: "45 seconds" }`,
    python: `import requests

response = requests.post(
    "https://your-domain.com/api/v1/wa/bulk",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "messages": [
            {
                "to": "923001234567",
                "message": "Hi Ahmed, your appointment is tomorrow at 10 AM.",
                "patient_name": "Ahmed Khan"
            },
            {
                "to": "923009876543",
                "message": "Hi Sara, your lab results are ready.",
                "patient_name": "Sara Ali"
            },
            {
                "to": "923005551234",
                "message": "Reminder: Follow-up visit scheduled for next week.",
                "type": "image",
                "media_url": "https://example.com/reminder.png",
                "caption": "Appointment details attached"
            }
        ]
    }
)

data = response.json()
# {"success": True, "queued": 3, "total": 3, "estimated_time": "45 seconds"}`,
    php: `<?php
$ch = curl_init("https://your-domain.com/api/v1/wa/bulk");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Content-Type: application/json",
        "Authorization: Bearer YOUR_API_KEY"
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "messages" => [
            ["to" => "923001234567", "message" => "Hi Ahmed, your appointment is tomorrow.", "patient_name" => "Ahmed Khan"],
            ["to" => "923009876543", "message" => "Hi Sara, your lab results are ready.", "patient_name" => "Sara Ali"],
            ["to" => "923005551234", "message" => "Reminder: Follow-up visit next week.", "type" => "image", "media_url" => "https://example.com/reminder.png", "caption" => "Details attached"]
        ]
    ])
]);
$response = curl_exec($ch);
curl_close($ch);
// {"success": true, "queued": 3, "total": 3, "estimated_time": "45 seconds"}`,
    csharp: `using var client = new HttpClient();
client.DefaultRequestHeaders.Add("Authorization", "Bearer YOUR_API_KEY");

var payload = new {
    messages = new[] {
        new { to = "923001234567", message = "Hi Ahmed, your appointment is tomorrow.", patient_name = "Ahmed Khan" },
        new { to = "923009876543", message = "Hi Sara, your lab results are ready.", patient_name = "Sara Ali" },
        new { to = "923005551234", message = "Reminder: Follow-up visit next week.",
               type = "image", media_url = "https://example.com/reminder.png", caption = "Details attached" }
    }
};

var response = await client.PostAsJsonAsync("https://your-domain.com/api/v1/wa/bulk", payload);
// {"success": true, "queued": 3, "total": 3, "estimated_time": "45 seconds"}`,
  },
  status: {
    javascript: `const response = await fetch("https://your-domain.com/api/v1/wa/status", {
  headers: { "Authorization": "Bearer YOUR_API_KEY" }
});

const data = await response.json();
console.log(data);
// {
//   success: true,
//   connected_sessions: 3,
//   daily_capacity_remaining: 4500,
//   sessions: [
//     { id: "sess_1", phone: "923001234567", status: "connected", messages_today: 150 },
//     { id: "sess_2", phone: "923009876543", status: "connected", messages_today: 200 },
//     { id: "sess_3", phone: "923005551234", status: "disconnected", messages_today: 0 }
//   ]
// }`,
    python: `import requests

response = requests.get(
    "https://your-domain.com/api/v1/wa/status",
    headers={"Authorization": "Bearer YOUR_API_KEY"}
)

data = response.json()
print(f"Connected sessions: {data['connected_sessions']}")
print(f"Remaining capacity: {data['daily_capacity_remaining']}")
for session in data["sessions"]:
    print(f"  {session['phone']}: {session['status']}")`,
    php: `<?php
$ch = curl_init("https://your-domain.com/api/v1/wa/status");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ["Authorization: Bearer YOUR_API_KEY"]
]);
$response = curl_exec($ch);
curl_close($ch);
$data = json_decode($response, true);
echo "Connected: " . $data["connected_sessions"];
echo "Capacity remaining: " . $data["daily_capacity_remaining"];`,
    csharp: `using var client = new HttpClient();
client.DefaultRequestHeaders.Add("Authorization", "Bearer YOUR_API_KEY");

var response = await client.GetAsync("https://your-domain.com/api/v1/wa/status");
var data = await response.Content.ReadFromJsonAsync<JsonElement>();
Console.WriteLine($"Connected: {data.GetProperty("connected_sessions")}");
Console.WriteLine($"Capacity: {data.GetProperty("daily_capacity_remaining")}");`,
  },
  messages: {
    javascript: `// Get recent messages
const response = await fetch(
  "https://your-domain.com/api/v1/wa/messages?limit=50&status=sent",
  { headers: { "Authorization": "Bearer YOUR_API_KEY" } }
);

const data = await response.json();
console.log(\`Found \${data.count} messages\`);

// Filter by phone number
const filtered = await fetch(
  "https://your-domain.com/api/v1/wa/messages?phone=923001234567",
  { headers: { "Authorization": "Bearer YOUR_API_KEY" } }
);

// Lookup specific message
const single = await fetch(
  "https://your-domain.com/api/v1/wa/messages?message_id=abc-123-def",
  { headers: { "Authorization": "Bearer YOUR_API_KEY" } }
);`,
    python: `import requests

headers = {"Authorization": "Bearer YOUR_API_KEY"}

# Get recent messages
response = requests.get(
    "https://your-domain.com/api/v1/wa/messages",
    headers=headers,
    params={"limit": 50, "status": "sent"}
)
data = response.json()
print(f"Found {data['count']} messages")

# Filter by phone
response = requests.get(
    "https://your-domain.com/api/v1/wa/messages",
    headers=headers,
    params={"phone": "923001234567"}
)

# Lookup specific message
response = requests.get(
    "https://your-domain.com/api/v1/wa/messages",
    headers=headers,
    params={"message_id": "abc-123-def"}
)`,
    php: `<?php
// Get recent messages
$ch = curl_init("https://your-domain.com/api/v1/wa/messages?limit=50&status=sent");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ["Authorization: Bearer YOUR_API_KEY"]
]);
$response = curl_exec($ch);
curl_close($ch);
$data = json_decode($response, true);
echo "Found " . $data["count"] . " messages";

// Filter by phone
$ch = curl_init("https://your-domain.com/api/v1/wa/messages?phone=923001234567");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ["Authorization: Bearer YOUR_API_KEY"]
]);
$response = curl_exec($ch);
curl_close($ch);`,
    csharp: `using var client = new HttpClient();
client.DefaultRequestHeaders.Add("Authorization", "Bearer YOUR_API_KEY");

// Get recent messages
var response = await client.GetAsync(
    "https://your-domain.com/api/v1/wa/messages?limit=50&status=sent");
var data = await response.Content.ReadFromJsonAsync<JsonElement>();
Console.WriteLine($"Found {data.GetProperty("count")} messages");

// Filter by phone
var filtered = await client.GetAsync(
    "https://your-domain.com/api/v1/wa/messages?phone=923001234567");

// Lookup specific message
var single = await client.GetAsync(
    "https://your-domain.com/api/v1/wa/messages?message_id=abc-123-def");`,
  },
  metaSend: {
    javascript: `const response = await fetch("https://your-domain.com/api/v1/messages/send", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_API_KEY"
  },
  body: JSON.stringify({
    to: "923001234567",
    template: "appointment_reminder",
    params: ["Ahmed Khan", "March 15, 2026", "10:00 AM"]
  })
});

const data = await response.json();
// Note: This uses the Meta Official API and costs credits`,
    python: `import requests

response = requests.post(
    "https://your-domain.com/api/v1/messages/send",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "to": "923001234567",
        "template": "appointment_reminder",
        "params": ["Ahmed Khan", "March 15, 2026", "10:00 AM"]
    }
)
# Note: This uses the Meta Official API and costs credits`,
    php: `<?php
$ch = curl_init("https://your-domain.com/api/v1/messages/send");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Content-Type: application/json",
        "Authorization: Bearer YOUR_API_KEY"
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "to" => "923001234567",
        "template" => "appointment_reminder",
        "params" => ["Ahmed Khan", "March 15, 2026", "10:00 AM"]
    ])
]);
$response = curl_exec($ch);
curl_close($ch);
// Note: Uses Meta Official API, costs credits`,
    csharp: `using var client = new HttpClient();
client.DefaultRequestHeaders.Add("Authorization", "Bearer YOUR_API_KEY");

var payload = new {
    to = "923001234567",
    template = "appointment_reminder",
    @params = new[] { "Ahmed Khan", "March 15, 2026", "10:00 AM" }
};

var response = await client.PostAsJsonAsync(
    "https://your-domain.com/api/v1/messages/send", payload);
// Note: Uses Meta Official API, costs credits`,
  },
  metaStatus: {
    javascript: `const response = await fetch(
  "https://your-domain.com/api/v1/messages/status?message_id=abc-123-def",
  { headers: { "Authorization": "Bearer YOUR_API_KEY" } }
);
const data = await response.json();`,
    python: `import requests

response = requests.get(
    "https://your-domain.com/api/v1/messages/status",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    params={"message_id": "abc-123-def"}
)
data = response.json()`,
    php: `<?php
$ch = curl_init("https://your-domain.com/api/v1/messages/status?message_id=abc-123-def");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ["Authorization: Bearer YOUR_API_KEY"]
]);
$response = curl_exec($ch);
curl_close($ch);
$data = json_decode($response, true);`,
    csharp: `using var client = new HttpClient();
client.DefaultRequestHeaders.Add("Authorization", "Bearer YOUR_API_KEY");

var response = await client.GetAsync(
    "https://your-domain.com/api/v1/messages/status?message_id=abc-123-def");
var data = await response.Content.ReadFromJsonAsync<JsonElement>();`,
  },
};

function CodeExampleTabs({ examples }: { examples: Record<string, string> }) {
  return (
    <Tabs defaultValue={0}>
      <TabsList className="mb-2">
        <TabsTrigger value={0}>JavaScript</TabsTrigger>
        <TabsTrigger value={1}>Python</TabsTrigger>
        <TabsTrigger value={2}>PHP</TabsTrigger>
        <TabsTrigger value={3}>C#</TabsTrigger>
      </TabsList>
      <TabsContent value={0}>
        <CodeBlock code={examples.javascript} language="javascript" />
      </TabsContent>
      <TabsContent value={1}>
        <CodeBlock code={examples.python} language="python" />
      </TabsContent>
      <TabsContent value={2}>
        <CodeBlock code={examples.php} language="php" />
      </TabsContent>
      <TabsContent value={3}>
        <CodeBlock code={examples.csharp} language="csharp" />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Table of contents data
// ---------------------------------------------------------------------------

const tocItems = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "authentication", label: "Authentication", icon: Key },
  { id: "send-message", label: "Send Message", icon: Send },
  { id: "send-media", label: "Send Media", icon: Send },
  { id: "bulk-send", label: "Bulk Send", icon: Layers },
  { id: "session-status", label: "Session Status", icon: Wifi },
  { id: "message-history", label: "Message History", icon: History },
  { id: "meta-send", label: "Meta API - Send", icon: MessageSquare },
  { id: "meta-status", label: "Meta API - Status", icon: Search },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "errors", label: "Error Codes", icon: AlertTriangle },
  { id: "rate-limits", label: "Rate Limits", icon: Shield },
];

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function ApiDocsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden rounded p-1.5 hover:bg-muted"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Layers className="size-5" />
            </button>
            <div className="flex items-center gap-2">
              <Zap className="size-5 text-green-600" />
              <h1 className="text-lg font-bold">
                WA Connect Pro{" "}
                <span className="font-normal text-muted-foreground">
                  — API Documentation
                </span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/api-tester"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-green-700"
            >
              <Zap className="size-3.5" />
              Try in API Tester
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition hover:bg-muted"
            >
              <ArrowLeft className="size-3.5" />
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[240px_1fr] lg:gap-8">
        {/* Sidebar / TOC */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-border bg-background p-4 pt-20 transition-transform lg:sticky lg:top-14 lg:z-0 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 lg:border-r-0 lg:pt-6 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-[-1] bg-black/40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <nav className="space-y-1 overflow-y-auto">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Navigation
            </p>
            {tocItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <Icon className="size-3.5 shrink-0" />
                  {item.label}
                </button>
              );
            })}
            <div className="my-4 border-t border-border" />
            <Link
              href="/dashboard/api-tester"
              className="flex w-full items-center gap-2 rounded-md bg-green-600/10 px-2.5 py-1.5 text-sm font-medium text-green-600 transition hover:bg-green-600/20"
            >
              <ExternalLink className="size-3.5 shrink-0" />
              API Tester
            </Link>
          </nav>
        </aside>

        {/* Main content */}
        <main className="min-w-0 px-4 py-6 lg:py-8">
          <div className="space-y-10">
            {/* Overview */}
            <section id="overview">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <BookOpen className="size-5 text-green-600" />
                    Overview
                  </CardTitle>
                  <CardDescription>
                    Integrate WhatsApp messaging into your application using the
                    WA Connect Pro API.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    The WA Connect Pro API provides two messaging channels:
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border p-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Badge variant="default" className="bg-green-600 text-white">
                          WhatsApp Web
                        </Badge>
                      </h4>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Send messages via connected WhatsApp Web sessions. No
                        per-message cost. Endpoints under{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                          /api/v1/wa/*
                        </code>
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Badge variant="default" className="bg-blue-600 text-white">
                          Meta Official API
                        </Badge>
                      </h4>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Send template messages via Meta Cloud API. Costs credits
                        per message. Endpoints under{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                          /api/v1/messages/*
                        </code>
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <h4 className="text-sm font-semibold">Base URL</h4>
                    <code className="mt-1 block rounded bg-gray-950 px-3 py-2 text-sm text-green-400 font-mono">
                      https://your-domain.com
                    </code>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Replace with your actual deployment domain.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Authentication */}
            <section id="authentication">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Key className="size-5 text-green-600" />
                    Authentication
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    All API requests must include an{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                      Authorization
                    </code>{" "}
                    header with a Bearer token. You can generate API keys from
                    the{" "}
                    <Link
                      href="/dashboard"
                      className="text-green-600 underline underline-offset-2 hover:text-green-700"
                    >
                      dashboard settings
                    </Link>
                    .
                  </p>
                  <CodeBlock
                    code={`// Include this header in every request
Authorization: Bearer YOUR_API_KEY`}
                  />
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-2">
                      <AlertTriangle className="size-4" />
                      Security Notice
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Keep your API keys secret. Do not expose them in
                      client-side code, public repositories, or browser
                      requests. Always make API calls from your backend server.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* ------------------------------------------------------------ */}
            {/* Endpoint: Send Message (text) */}
            {/* ------------------------------------------------------------ */}
            <section id="send-message">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <Send className="size-5 text-green-600" />
                    Send Text Message
                    <MethodBadge method="POST" />
                  </CardTitle>
                  <CardDescription>
                    <code className="font-mono text-sm">/api/v1/wa/send</code>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Send a single text message to a WhatsApp number via a
                    connected Web session.
                  </p>

                  <div>
                    <h4 className="mb-2 text-sm font-semibold">
                      Request Body
                    </h4>
                    <ParamTable
                      params={[
                        {
                          name: "to",
                          type: "string",
                          required: true,
                          description:
                            'Recipient phone number in international format without "+" (e.g. 923001234567)',
                        },
                        {
                          name: "message",
                          type: "string",
                          required: true,
                          description: "Text message content",
                        },
                        {
                          name: "patient_name",
                          type: "string",
                          required: false,
                          description:
                            "Optional recipient name for logging and personalization",
                        },
                      ]}
                    />
                  </div>

                  <Collapsible title="Response" defaultOpen>
                    <CodeBlock
                      code={`{
  "success": true,
  "message_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "sent"
}`}
                    />
                  </Collapsible>

                  <Collapsible title="Code Examples" defaultOpen>
                    <CodeExampleTabs examples={codeExamples.sendText} />
                  </Collapsible>
                </CardContent>
              </Card>
            </section>

            {/* ------------------------------------------------------------ */}
            {/* Endpoint: Send Media */}
            {/* ------------------------------------------------------------ */}
            <section id="send-media">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <Send className="size-5 text-green-600" />
                    Send Media Message
                    <MethodBadge method="POST" />
                  </CardTitle>
                  <CardDescription>
                    <code className="font-mono text-sm">/api/v1/wa/send</code>{" "}
                    — with media attachment
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Send images, documents, or videos. You can provide media via
                    a public URL or as base64-encoded data.
                  </p>

                  <Collapsible title="Option A: Media via URL" defaultOpen>
                    <ParamTable
                      params={[
                        {
                          name: "to",
                          type: "string",
                          required: true,
                          description: "Recipient phone number",
                        },
                        {
                          name: "type",
                          type: '"image" | "document" | "video"',
                          required: true,
                          description: "Type of media to send",
                        },
                        {
                          name: "media_url",
                          type: "string",
                          required: true,
                          description: "Publicly accessible URL of the media file",
                        },
                        {
                          name: "caption",
                          type: "string",
                          required: false,
                          description: "Caption for the media",
                        },
                        {
                          name: "message",
                          type: "string",
                          required: false,
                          description: "Additional text message",
                        },
                      ]}
                    />
                  </Collapsible>

                  <Collapsible title="Option B: Media via Base64 Upload">
                    <ParamTable
                      params={[
                        {
                          name: "to",
                          type: "string",
                          required: true,
                          description: "Recipient phone number",
                        },
                        {
                          name: "type",
                          type: '"image" | "document" | "video"',
                          required: true,
                          description: "Type of media to send",
                        },
                        {
                          name: "media_data",
                          type: "string",
                          required: true,
                          description: "Base64-encoded file content",
                        },
                        {
                          name: "media_mimetype",
                          type: "string",
                          required: true,
                          description:
                            'MIME type of the file (e.g. "application/pdf", "image/png")',
                        },
                        {
                          name: "media_filename",
                          type: "string",
                          required: true,
                          description: "Filename for the attachment",
                        },
                        {
                          name: "caption",
                          type: "string",
                          required: false,
                          description: "Caption for the media",
                        },
                        {
                          name: "message",
                          type: "string",
                          required: false,
                          description: "Additional text message",
                        },
                      ]}
                    />
                  </Collapsible>

                  <Collapsible title="Response">
                    <CodeBlock
                      code={`{
  "success": true,
  "message_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "sent"
}`}
                    />
                  </Collapsible>

                  <Collapsible title="Code Examples" defaultOpen>
                    <CodeExampleTabs examples={codeExamples.sendMedia} />
                  </Collapsible>
                </CardContent>
              </Card>
            </section>

            {/* ------------------------------------------------------------ */}
            {/* Endpoint: Bulk Send */}
            {/* ------------------------------------------------------------ */}
            <section id="bulk-send">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <Layers className="size-5 text-green-600" />
                    Bulk Send
                    <MethodBadge method="POST" />
                  </CardTitle>
                  <CardDescription>
                    <code className="font-mono text-sm">/api/v1/wa/bulk</code>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Send messages to multiple recipients. Messages are queued and
                    sent with delays to avoid rate limiting.
                  </p>

                  <div>
                    <h4 className="mb-2 text-sm font-semibold">
                      Request Body
                    </h4>
                    <ParamTable
                      params={[
                        {
                          name: "messages",
                          type: "array",
                          required: true,
                          description:
                            "Array of message objects (see fields below)",
                        },
                      ]}
                    />
                    <p className="mt-3 mb-2 text-sm font-medium text-muted-foreground">
                      Each message object:
                    </p>
                    <ParamTable
                      params={[
                        {
                          name: "to",
                          type: "string",
                          required: true,
                          description: "Recipient phone number",
                        },
                        {
                          name: "message",
                          type: "string",
                          required: true,
                          description: "Text message content",
                        },
                        {
                          name: "patient_name",
                          type: "string",
                          required: false,
                          description: "Recipient name",
                        },
                        {
                          name: "type",
                          type: '"image" | "document" | "video"',
                          required: false,
                          description: "Media type (omit for text-only)",
                        },
                        {
                          name: "media_url",
                          type: "string",
                          required: false,
                          description: "Media URL (required if type is set)",
                        },
                        {
                          name: "caption",
                          type: "string",
                          required: false,
                          description: "Caption for media",
                        },
                      ]}
                    />
                  </div>

                  <Collapsible title="Response" defaultOpen>
                    <CodeBlock
                      code={`{
  "success": true,
  "queued": 3,
  "total": 3,
  "estimated_time": "45 seconds"
}`}
                    />
                  </Collapsible>

                  <Collapsible title="Code Examples" defaultOpen>
                    <CodeExampleTabs examples={codeExamples.bulk} />
                  </Collapsible>
                </CardContent>
              </Card>
            </section>

            {/* ------------------------------------------------------------ */}
            {/* Endpoint: Session Status */}
            {/* ------------------------------------------------------------ */}
            <section id="session-status">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <Wifi className="size-5 text-green-600" />
                    Session Status
                    <MethodBadge method="GET" />
                  </CardTitle>
                  <CardDescription>
                    <code className="font-mono text-sm">/api/v1/wa/status</code>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Check the status of connected WhatsApp Web sessions and
                    remaining daily capacity.
                  </p>

                  <Collapsible title="Response" defaultOpen>
                    <CodeBlock
                      code={`{
  "success": true,
  "connected_sessions": 3,
  "daily_capacity_remaining": 4500,
  "sessions": [
    {
      "id": "sess_1",
      "phone": "923001234567",
      "status": "connected",
      "messages_today": 150
    },
    {
      "id": "sess_2",
      "phone": "923009876543",
      "status": "connected",
      "messages_today": 200
    },
    {
      "id": "sess_3",
      "phone": "923005551234",
      "status": "disconnected",
      "messages_today": 0
    }
  ]
}`}
                    />
                  </Collapsible>

                  <Collapsible title="Code Examples" defaultOpen>
                    <CodeExampleTabs examples={codeExamples.status} />
                  </Collapsible>
                </CardContent>
              </Card>
            </section>

            {/* ------------------------------------------------------------ */}
            {/* Endpoint: Message History */}
            {/* ------------------------------------------------------------ */}
            <section id="message-history">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <History className="size-5 text-green-600" />
                    Message History
                    <MethodBadge method="GET" />
                  </CardTitle>
                  <CardDescription>
                    <code className="font-mono text-sm">
                      /api/v1/wa/messages
                    </code>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Retrieve sent message history with optional filtering.
                  </p>

                  <div>
                    <h4 className="mb-2 text-sm font-semibold">
                      Query Parameters
                    </h4>
                    <ParamTable
                      params={[
                        {
                          name: "limit",
                          type: "number",
                          required: false,
                          description: "Max messages to return (default: 50)",
                        },
                        {
                          name: "status",
                          type: "string",
                          required: false,
                          description:
                            'Filter by status (e.g. "sent", "delivered", "failed")',
                        },
                        {
                          name: "phone",
                          type: "string",
                          required: false,
                          description: "Filter by recipient phone number",
                        },
                        {
                          name: "message_id",
                          type: "string",
                          required: false,
                          description: "Look up a specific message by ID",
                        },
                      ]}
                    />
                  </div>

                  <Collapsible title="Response" defaultOpen>
                    <CodeBlock
                      code={`{
  "success": true,
  "count": 2,
  "messages": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "to": "923001234567",
      "message": "Hello! Your appointment is confirmed.",
      "status": "delivered",
      "created_at": "2026-03-14T10:30:00Z"
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "to": "923009876543",
      "message": "Your lab results are ready.",
      "status": "sent",
      "created_at": "2026-03-14T10:25:00Z"
    }
  ]
}`}
                    />
                  </Collapsible>

                  <Collapsible title="Code Examples" defaultOpen>
                    <CodeExampleTabs examples={codeExamples.messages} />
                  </Collapsible>
                </CardContent>
              </Card>
            </section>

            {/* ------------------------------------------------------------ */}
            {/* Endpoint: Meta API - Send */}
            {/* ------------------------------------------------------------ */}
            <section id="meta-send">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <MessageSquare className="size-5 text-blue-600" />
                    Send via Meta Official API
                    <MethodBadge method="POST" />
                    <Badge variant="outline" className="ml-1 text-[10px]">
                      Costs Credits
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    <code className="font-mono text-sm">
                      /api/v1/messages/send
                    </code>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Send template messages through the Meta Official WhatsApp
                    Cloud API. Each message costs credits from your balance.
                  </p>

                  <div>
                    <h4 className="mb-2 text-sm font-semibold">
                      Request Body
                    </h4>
                    <ParamTable
                      params={[
                        {
                          name: "to",
                          type: "string",
                          required: true,
                          description: "Recipient phone number",
                        },
                        {
                          name: "template",
                          type: "string",
                          required: true,
                          description:
                            "Name of the approved WhatsApp template",
                        },
                        {
                          name: "params",
                          type: "string[]",
                          required: true,
                          description:
                            "Array of parameter values to fill template placeholders",
                        },
                      ]}
                    />
                  </div>

                  <Collapsible title="Code Examples" defaultOpen>
                    <CodeExampleTabs examples={codeExamples.metaSend} />
                  </Collapsible>
                </CardContent>
              </Card>
            </section>

            {/* ------------------------------------------------------------ */}
            {/* Endpoint: Meta API - Status */}
            {/* ------------------------------------------------------------ */}
            <section id="meta-status">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <Search className="size-5 text-blue-600" />
                    Message Status (Meta API)
                    <MethodBadge method="GET" />
                  </CardTitle>
                  <CardDescription>
                    <code className="font-mono text-sm">
                      /api/v1/messages/status
                    </code>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Check the delivery status of a message sent via Meta
                    Official API.
                  </p>

                  <div>
                    <h4 className="mb-2 text-sm font-semibold">
                      Query Parameters
                    </h4>
                    <ParamTable
                      params={[
                        {
                          name: "message_id",
                          type: "string",
                          required: true,
                          description: "The message ID to look up",
                        },
                      ]}
                    />
                  </div>

                  <Collapsible title="Code Examples" defaultOpen>
                    <CodeExampleTabs examples={codeExamples.metaStatus} />
                  </Collapsible>
                </CardContent>
              </Card>
            </section>

            {/* ------------------------------------------------------------ */}
            {/* Webhooks */}
            {/* ------------------------------------------------------------ */}
            <section id="webhooks">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <Webhook className="size-5 text-green-600" />
                    Webhook Callbacks
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    If your organization has a{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                      webhook_url
                    </code>{" "}
                    configured, WA Connect Pro will send POST callbacks to your
                    endpoint whenever a message status changes.
                  </p>

                  <div>
                    <h4 className="mb-2 text-sm font-semibold">
                      Webhook Payload
                    </h4>
                    <CodeBlock
                      code={`{
  "event": "message.sent",
  "message_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "to_phone": "923001234567",
  "status": "sent",
  "timestamp": "2026-03-14T10:30:00.000Z"
}`}
                    />
                  </div>

                  <div>
                    <h4 className="mb-3 text-sm font-semibold">Event Types</h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        {
                          event: "message.sent",
                          desc: "Message was sent successfully",
                          color: "bg-green-600",
                        },
                        {
                          event: "message.delivered",
                          desc: "Message was delivered to the device",
                          color: "bg-blue-600",
                        },
                        {
                          event: "message.read",
                          desc: "Message was read by the recipient",
                          color: "bg-purple-600",
                        },
                        {
                          event: "message.failed",
                          desc: "Message delivery failed",
                          color: "bg-red-600",
                        },
                      ].map((e) => (
                        <div
                          key={e.event}
                          className="flex items-start gap-3 rounded-lg border border-border p-3"
                        >
                          <div
                            className={`mt-0.5 size-2 shrink-0 rounded-full ${e.color}`}
                          />
                          <div>
                            <code className="text-xs font-mono font-semibold">
                              {e.event}
                            </code>
                            <p className="text-xs text-muted-foreground">
                              {e.desc}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <h4 className="text-sm font-semibold">Best Practices</h4>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      <li>
                        Respond with a{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                          200
                        </code>{" "}
                        status within 5 seconds
                      </li>
                      <li>
                        Process webhook payloads asynchronously if needed
                      </li>
                      <li>
                        Implement idempotency using the{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                          message_id
                        </code>{" "}
                        field
                      </li>
                      <li>
                        Verify the source IP or use a shared secret for security
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* ------------------------------------------------------------ */}
            {/* Error Codes */}
            {/* ------------------------------------------------------------ */}
            <section id="errors">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <AlertTriangle className="size-5 text-amber-500" />
                    Error Codes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="pb-2 pr-4 font-semibold">
                            Status Code
                          </th>
                          <th className="pb-2 pr-4 font-semibold">Meaning</th>
                          <th className="pb-2 font-semibold">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          {
                            code: "400",
                            label: "Bad Request",
                            desc: "Invalid or missing parameters in the request body. Check the required fields.",
                            color: "text-amber-600",
                          },
                          {
                            code: "401",
                            label: "Unauthorized",
                            desc: "Missing or invalid API key. Ensure you pass a valid Bearer token in the Authorization header.",
                            color: "text-red-600",
                          },
                          {
                            code: "429",
                            label: "Too Many Requests",
                            desc: "Rate limit exceeded. Back off and retry after the period indicated in the Retry-After header.",
                            color: "text-orange-600",
                          },
                          {
                            code: "500",
                            label: "Internal Server Error",
                            desc: "An unexpected error occurred on the server. Retry with exponential backoff. If the issue persists, contact support.",
                            color: "text-red-600",
                          },
                        ].map((err) => (
                          <tr
                            key={err.code}
                            className="border-b border-border/50"
                          >
                            <td className="py-3 pr-4">
                              <code
                                className={`font-mono font-bold ${err.color}`}
                              >
                                {err.code}
                              </code>
                            </td>
                            <td className="py-3 pr-4 font-medium">
                              {err.label}
                            </td>
                            <td className="py-3 text-muted-foreground">
                              {err.desc}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-5">
                    <h4 className="mb-2 text-sm font-semibold">
                      Error Response Format
                    </h4>
                    <CodeBlock
                      code={`{
  "success": false,
  "error": "Invalid phone number format",
  "code": "INVALID_PHONE"
}`}
                    />
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* ------------------------------------------------------------ */}
            {/* Rate Limits */}
            {/* ------------------------------------------------------------ */}
            <section id="rate-limits">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <Shield className="size-5 text-green-600" />
                    Rate Limits
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    API requests are rate-limited to protect the service and
                    ensure fair usage across all customers.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="pb-2 pr-4 font-semibold">Endpoint</th>
                          <th className="pb-2 pr-4 font-semibold">Limit</th>
                          <th className="pb-2 font-semibold">Window</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          {
                            endpoint: "/api/v1/wa/send",
                            limit: "60 requests",
                            window: "Per minute",
                          },
                          {
                            endpoint: "/api/v1/wa/bulk",
                            limit: "10 requests",
                            window: "Per minute",
                          },
                          {
                            endpoint: "/api/v1/wa/status",
                            limit: "120 requests",
                            window: "Per minute",
                          },
                          {
                            endpoint: "/api/v1/wa/messages",
                            limit: "120 requests",
                            window: "Per minute",
                          },
                          {
                            endpoint: "/api/v1/messages/*",
                            limit: "30 requests",
                            window: "Per minute",
                          },
                        ].map((r) => (
                          <tr
                            key={r.endpoint}
                            className="border-b border-border/50"
                          >
                            <td className="py-2 pr-4">
                              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                                {r.endpoint}
                              </code>
                            </td>
                            <td className="py-2 pr-4 font-medium">
                              {r.limit}
                            </td>
                            <td className="py-2 text-muted-foreground">
                              {r.window}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">
                      When rate limited, the API returns a{" "}
                      <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono font-bold text-orange-600">
                        429
                      </code>{" "}
                      status with a{" "}
                      <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                        Retry-After
                      </code>{" "}
                      header indicating how many seconds to wait before
                      retrying.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Footer CTA */}
            <div className="rounded-xl border border-green-600/20 bg-green-600/5 p-6 text-center">
              <h3 className="text-lg font-semibold">Ready to integrate?</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Test your API calls interactively using the built-in API tester.
              </p>
              <Link
                href="/dashboard/api-tester"
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-green-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-green-700"
              >
                <Zap className="size-4" />
                Open API Tester
                <ExternalLink className="size-3.5" />
              </Link>
            </div>

            {/* Spacer */}
            <div className="pb-8" />
          </div>
        </main>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function ApiKeysPage() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [orgId, setOrgId] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    setBaseUrl(window.location.origin);
    loadApiKey();
  }, []);

  async function loadApiKey() {
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

    const { data: org } = await supabase
      .from("organizations")
      .select("api_key, webhook_url")
      .eq("id", member.org_id)
      .single();
    if (org) {
      setApiKey(org.api_key);
      setWebhookUrl(org.webhook_url || "");
    }
  }

  async function handleSaveWebhook() {
    if (!orgId) return;
    setSavingWebhook(true);
    const { error } = await supabase
      .from("organizations")
      .update({ webhook_url: webhookUrl || null })
      .eq("id", orgId);
    if (error) {
      toast.error("Failed to save webhook URL");
    } else {
      toast.success("Webhook URL saved!");
    }
    setSavingWebhook(false);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  }

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">API Keys</h1>
          <p className="text-gray-500 mt-1">
            Use these keys to send messages from your own software
          </p>
        </div>
        <a
          href="/docs"
          target="_blank"
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
        >
          API Docs
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
        </a>
      </div>

      {/* API Key */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Your API Key</CardTitle>
          <CardDescription>
            Include this key in the header of every API request
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={showKey ? apiKey : "wcp_" + "*".repeat(32)}
              readOnly
              className="font-mono"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(apiKey)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-red-500 mt-2">
            Keep this key secret. Do not share it publicly or commit to git.
          </p>
        </CardContent>
      </Card>

      {/* Webhook URL */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Webhook URL (Optional)</CardTitle>
          <CardDescription>
            Receive delivery status updates (sent, delivered, read, failed) at your server
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-server.com/api/whatsapp-callback"
              className="font-mono"
            />
            <Button
              onClick={handleSaveWebhook}
              className="bg-green-600 hover:bg-green-700"
              disabled={savingWebhook}
            >
              {savingWebhook ? "Saving..." : "Save"}
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            We will POST to this URL when a message status changes. Example payload:
          </p>
          <div className="bg-gray-900 text-green-400 rounded-lg p-3 text-xs font-mono mt-2 overflow-x-auto">
            <pre>{`{
  "event": "message.status_update",
  "message_id": "abc-123",
  "to_phone": "923001234567",
  "status": "delivered",
  "timestamp": "2026-03-14T10:30:00Z"
}`}</pre>
          </div>
        </CardContent>
      </Card>

      {/* API Documentation */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Quick Start</CardTitle>
          <CardDescription>Send your first message via API</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Send Message */}
          <div>
            <h3 className="font-semibold mb-2">Send a Message</h3>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`POST ${baseUrl || "https://your-domain.com"}/api/v1/messages/send

Headers:
  Authorization: Bearer ${showKey ? apiKey : "your_api_key"}
  Content-Type: application/json

Body:
{
  "to": "923001234567",
  "template": "report_ready",
  "params": ["Ahmed Khan", "Blood Test", "City Hospital"]
}`}</pre>
            </div>
          </div>

          {/* Response */}
          <div>
            <h3 className="font-semibold mb-2">Response</h3>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`{
  "success": true,
  "message_id": "msg_abc123",
  "status": "queued",
  "credits_remaining": 95
}`}</pre>
            </div>
          </div>

          {/* Code Examples */}
          <div>
            <h3 className="font-semibold mb-2">JavaScript / Node.js Example</h3>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`const response = await fetch('${baseUrl || "https://your-domain.com"}/api/v1/messages/send', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${showKey ? apiKey : "your_api_key"}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    to: '923001234567',
    template: 'report_ready',
    params: ['Ahmed Khan', 'Blood Test', 'City Hospital']
  })
});

const data = await response.json();
console.log(data);`}</pre>
            </div>
          </div>

          {/* Python Example */}
          <div>
            <h3 className="font-semibold mb-2">Python Example</h3>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`import requests

response = requests.post(
    '${baseUrl || "https://your-domain.com"}/api/v1/messages/send',
    headers={
        'Authorization': 'Bearer ${showKey ? apiKey : "your_api_key"}',
        'Content-Type': 'application/json'
    },
    json={
        'to': '923001234567',
        'template': 'report_ready',
        'params': ['Ahmed Khan', 'Blood Test', 'City Hospital']
    }
)

print(response.json())`}</pre>
            </div>
          </div>

          {/* PHP Example */}
          <div>
            <h3 className="font-semibold mb-2">PHP Example</h3>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`$ch = curl_init('${baseUrl || "https://your-domain.com"}/api/v1/messages/send');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ${showKey ? apiKey : "your_api_key"}',
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'to' => '923001234567',
    'template' => 'report_ready',
    'params' => ['Ahmed Khan', 'Blood Test', 'City Hospital']
]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = curl_exec($ch);
echo $response;`}</pre>
            </div>
          </div>
          {/* Send Media */}
          <div>
            <h3 className="font-semibold mb-2">Send Image / PDF (Direct Media)</h3>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`POST ${baseUrl || "https://your-domain.com"}/api/v1/messages/send

Headers:
  Authorization: Bearer ${showKey ? apiKey : "your_api_key"}
  Content-Type: application/json

Body (Image):
{
  "to": "923001234567",
  "media_url": "https://example.com/report.jpg",
  "media_type": "image",
  "caption": "Your lab report image"
}

Body (PDF):
{
  "to": "923001234567",
  "media_url": "https://example.com/report.pdf",
  "media_type": "document",
  "caption": "Your lab report"
}`}</pre>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t pt-6">
            <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
              WhatsApp Web API (No Meta Fees)
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Same API key, different endpoints. Messages sent via your connected WhatsApp Web session.
            </p>
          </div>

          {/* WA Web Send */}
          <div>
            <h3 className="font-semibold mb-2">Send Message via WA Web</h3>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`POST ${baseUrl || "https://your-domain.com"}/api/v1/wa/send

Headers:
  Authorization: Bearer ${showKey ? apiKey : "your_api_key"}
  Content-Type: application/json

Body:
{
  "to": "923001234567",
  "message": "Hello {{name}}, your report is ready!",
  "patient_name": "Ahmed Khan"
}

Response:
{
  "success": true,
  "message_id": "msg_abc123",
  "status": "sent",
  "session_phone": "session-uuid"
}`}</pre>
            </div>
          </div>

          {/* WA Web Send Media via URL */}
          <div>
            <h3 className="font-semibold mb-2">Send Image / Document via URL</h3>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`POST ${baseUrl || "https://your-domain.com"}/api/v1/wa/send

Body (Image from URL):
{
  "to": "923001234567",
  "type": "image",
  "media_url": "https://example.com/report.jpg",
  "caption": "Blood Test Report - Ahmed Khan"
}

Body (PDF from URL):
{
  "to": "923001234567",
  "type": "document",
  "media_url": "https://example.com/report.pdf",
  "caption": "Lab Report"
}

Body (Video from URL):
{
  "to": "923001234567",
  "type": "video",
  "media_url": "https://example.com/video.mp4",
  "caption": "Test results video"
}`}</pre>
            </div>
          </div>

          {/* WA Web Send Media via File Upload (base64) */}
          <div>
            <h3 className="font-semibold mb-2">Send File Upload (Base64) — No URL needed</h3>
            <p className="text-sm text-gray-500 mb-2">
              Convert your file to base64 and send directly. No public URL required.
            </p>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`POST ${baseUrl || "https://your-domain.com"}/api/v1/wa/send

Body:
{
  "to": "923001234567",
  "type": "document",
  "media_data": "<base64_encoded_file_content>",
  "media_mimetype": "application/pdf",
  "media_filename": "report.pdf",
  "caption": "Your Lab Report - Ahmed Khan"
}

Supported types: "image", "document", "video"
Supported mimetypes:
  image: image/jpeg, image/png, image/webp
  document: application/pdf, application/msword, etc.
  video: video/mp4, video/3gpp`}</pre>
            </div>
          </div>

          {/* WA Session Status */}
          <div>
            <h3 className="font-semibold mb-2">Check Session Status</h3>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`GET ${baseUrl || "https://your-domain.com"}/api/v1/wa/status

Headers:
  Authorization: Bearer ${showKey ? apiKey : "your_api_key"}

Response:
{
  "success": true,
  "connected_sessions": 1,
  "total_sessions": 2,
  "daily_capacity_remaining": 650,
  "sessions": [
    {
      "id": "uuid",
      "name": "Default",
      "phone": "+923001234567",
      "status": "connected",
      "daily_limit": 700,
      "messages_sent_today": 50
    }
  ]
}`}</pre>
            </div>
          </div>

          {/* WA Message History */}
          <div>
            <h3 className="font-semibold mb-2">Message History</h3>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`GET ${baseUrl || "https://your-domain.com"}/api/v1/wa/messages

Optional query params:
  ?limit=50          (max 100, default 50)
  ?status=sent       (sent, delivered, read, failed)
  ?phone=923001234567
  ?message_id=uuid

Headers:
  Authorization: Bearer ${showKey ? apiKey : "your_api_key"}

Response:
{
  "success": true,
  "count": 2,
  "messages": [
    {
      "id": "uuid",
      "to_phone": "923001234567",
      "message_type": "text",
      "content": "Hello Ahmed, your report is ready!",
      "status": "sent",
      "sent_at": "2026-03-14T10:00:00Z"
    }
  ]
}`}</pre>
            </div>
          </div>

          {/* WA Web Bulk */}
          <div>
            <h3 className="font-semibold mb-2">Bulk Send via WA Web (Queued)</h3>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`POST ${baseUrl || "https://your-domain.com"}/api/v1/wa/bulk

Headers:
  Authorization: Bearer ${showKey ? apiKey : "your_api_key"}
  Content-Type: application/json

Body:
{
  "messages": [
    {
      "to": "923001234567",
      "message": "Hello {{name}}, your report is ready",
      "patient_name": "Ahmed Khan"
    },
    {
      "to": "923009876543",
      "message": "Hello {{name}}, your report is ready",
      "patient_name": "Sara Ali"
    }
  ]
}

Response:
{
  "success": true,
  "queued": 2,
  "total": 2,
  "message": "2 messages queued. They will be sent with safe delays.",
  "estimated_time": "~1 minutes"
}`}</pre>
            </div>
          </div>

          {/* WA Web Node.js Example */}
          <div>
            <h3 className="font-semibold mb-2">WA Web — JavaScript / Node.js Examples</h3>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`const API_KEY = '${showKey ? apiKey : "your_api_key"}';
const BASE = '${baseUrl || "https://your-domain.com"}';

// 1. Send text message
await fetch(BASE + '/api/v1/wa/send', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: '923001234567',
    message: 'Hello {{name}}, your Blood Test report is ready!',
    patient_name: 'Ahmed Khan'
  })
});

// 2. Send PDF file (Node.js - read file as base64)
const fs = require('fs');
const fileBase64 = fs.readFileSync('report.pdf').toString('base64');
await fetch(BASE + '/api/v1/wa/send', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: '923001234567',
    type: 'document',
    media_data: fileBase64,
    media_mimetype: 'application/pdf',
    media_filename: 'report.pdf',
    caption: 'Lab Report - Ahmed Khan'
  })
});

// 3. Send image from URL
await fetch(BASE + '/api/v1/wa/send', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: '923001234567',
    type: 'image',
    media_url: 'https://example.com/xray.jpg',
    caption: 'X-Ray Report'
  })
});

// 4. Check session status
const status = await fetch(BASE + '/api/v1/wa/status', {
  headers: { 'Authorization': 'Bearer ' + API_KEY }
}).then(r => r.json());
console.log('Connected:', status.connected_sessions);

// 5. Bulk messages (queued with safe delays)
await fetch(BASE + '/api/v1/wa/bulk', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: patients.map(p => ({
      to: p.phone,
      message: 'Hello {{name}}, your report is ready!',
      patient_name: p.name
    }))
  })
});

// 6. Get message history
const msgs = await fetch(BASE + '/api/v1/wa/messages?limit=10', {
  headers: { 'Authorization': 'Bearer ' + API_KEY }
}).then(r => r.json());`}</pre>
            </div>
          </div>

          {/* WA Web PHP Example */}
          <div>
            <h3 className="font-semibold mb-2">WA Web — PHP Examples</h3>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`$api_key = '${showKey ? apiKey : "your_api_key"}';
$base_url = '${baseUrl || "https://your-domain.com"}';

// Send text message
$ch = curl_init($base_url . '/api/v1/wa/send');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $api_key,
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'to' => '923001234567',
    'message' => 'Hello {{name}}, your report is ready!',
    'patient_name' => 'Ahmed Khan'
]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = json_decode(curl_exec($ch), true);

// Send PDF file (base64)
$pdf_base64 = base64_encode(file_get_contents('report.pdf'));
$ch = curl_init($base_url . '/api/v1/wa/send');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $api_key,
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'to' => '923001234567',
    'type' => 'document',
    'media_data' => $pdf_base64,
    'media_mimetype' => 'application/pdf',
    'media_filename' => 'report.pdf',
    'caption' => 'Lab Report - Ahmed Khan'
]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = json_decode(curl_exec($ch), true);

// Check session status
$ch = curl_init($base_url . '/api/v1/wa/status');
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $api_key
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$status = json_decode(curl_exec($ch), true);
echo "Connected sessions: " . $status['connected_sessions'];`}</pre>
            </div>
          </div>

          {/* WA Web Python Example */}
          <div>
            <h3 className="font-semibold mb-2">WA Web — Python Example</h3>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`import requests, base64

API_KEY = '${showKey ? apiKey : "your_api_key"}'
BASE = '${baseUrl || "https://your-domain.com"}'
HEADERS = {'Authorization': f'Bearer {API_KEY}', 'Content-Type': 'application/json'}

# Send text
requests.post(f'{BASE}/api/v1/wa/send', headers=HEADERS, json={
    'to': '923001234567',
    'message': 'Hello {{name}}, your report is ready!',
    'patient_name': 'Ahmed Khan'
})

# Send PDF file
with open('report.pdf', 'rb') as f:
    pdf_base64 = base64.b64encode(f.read()).decode()

requests.post(f'{BASE}/api/v1/wa/send', headers=HEADERS, json={
    'to': '923001234567',
    'type': 'document',
    'media_data': pdf_base64,
    'media_mimetype': 'application/pdf',
    'media_filename': 'report.pdf',
    'caption': 'Lab Report - Ahmed Khan'
})

# Check status
status = requests.get(f'{BASE}/api/v1/wa/status', headers=HEADERS).json()
print(f"Connected: {status['connected_sessions']}")

# Message history
msgs = requests.get(f'{BASE}/api/v1/wa/messages?limit=10', headers=HEADERS).json()`}</pre>
            </div>
          </div>

          {/* WA Web C# Example */}
          <div>
            <h3 className="font-semibold mb-2">WA Web — C# / .NET Example</h3>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`using var client = new HttpClient();
client.DefaultRequestHeaders.Add("Authorization", "Bearer ${showKey ? apiKey : "your_api_key"}");
var baseUrl = "${baseUrl || "https://your-domain.com"}";

// Send text
var textResponse = await client.PostAsync(
    baseUrl + "/api/v1/wa/send",
    new StringContent(JsonSerializer.Serialize(new {
        to = "923001234567",
        message = "Hello {{name}}, your report is ready!",
        patient_name = "Ahmed Khan"
    }), Encoding.UTF8, "application/json")
);

// Send PDF file
var pdfBytes = await File.ReadAllBytesAsync("report.pdf");
var pdfResponse = await client.PostAsync(
    baseUrl + "/api/v1/wa/send",
    new StringContent(JsonSerializer.Serialize(new {
        to = "923001234567",
        type = "document",
        media_data = Convert.ToBase64String(pdfBytes),
        media_mimetype = "application/pdf",
        media_filename = "report.pdf",
        caption = "Lab Report - Ahmed Khan"
    }), Encoding.UTF8, "application/json")
);`}</pre>
            </div>
          </div>

          {/* Check Status */}
          <div>
            <h3 className="font-semibold mb-2">Check Message Status</h3>
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
              <pre>{`GET ${baseUrl || "https://your-domain.com"}/api/v1/messages/status?message_id=abc-123

Headers:
  Authorization: Bearer ${showKey ? apiKey : "your_api_key"}

Response:
{
  "id": "abc-123",
  "to_phone": "923001234567",
  "status": "delivered",
  "sent_at": "2026-03-14T10:00:00Z",
  "delivered_at": "2026-03-14T10:00:05Z",
  "read_at": null
}`}</pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

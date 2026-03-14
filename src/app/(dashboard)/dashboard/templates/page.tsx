"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Upload, Image, FileText, X } from "lucide-react";
import { toast } from "sonner";
import type { MessageTemplate } from "@/types/database";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    category: "utility" as "marketing" | "utility" | "authentication",
    language: "en",
    header_type: "none" as "none" | "text" | "image" | "document" | "video",
    header_text: "",
    header_media_url: "",
    body_text: "",
    footer_text: "",
  });
  const [uploading, setUploading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    loadTemplates();
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

  async function loadTemplates() {
    const oid = await getOrgId();
    if (!oid) return;

    const { data } = await supabase
      .from("message_templates")
      .select("*")
      .eq("org_id", oid)
      .order("created_at", { ascending: false });

    if (data) setTemplates(data);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const oid = await getOrgId();
    if (!oid) return;

    const { error } = await supabase.from("message_templates").insert({
      org_id: oid,
      name: newTemplate.name,
      category: newTemplate.category,
      language: newTemplate.language,
      header_type: newTemplate.header_type,
      header_text: newTemplate.header_type === "text" ? (newTemplate.header_text || null) : null,
      header_media_url: ["image", "document", "video"].includes(newTemplate.header_type) ? (newTemplate.header_media_url || null) : null,
      body_text: newTemplate.body_text,
      footer_text: newTemplate.footer_text || null,
    });

    if (error) {
      toast.error("Failed to create template");
      return;
    }

    toast.success("Template created!");
    setNewTemplate({
      name: "",
      category: "utility",
      language: "en",
      header_type: "none",
      header_text: "",
      header_media_url: "",
      body_text: "",
      footer_text: "",
    });
    setDialogOpen(false);
    loadTemplates();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        setNewTemplate({ ...newTemplate, header_media_url: data.url });
        toast.success(`${file.name} uploaded!`);
      } else {
        toast.error(data.error || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    }
    setUploading(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase
      .from("message_templates")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to delete template");
      return;
    }
    toast.success("Template deleted");
    setTemplates(templates.filter((t) => t.id !== id));
  }

  const statusColor = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Message Templates</h1>
          <p className="text-gray-500 mt-1">
            Create templates for WhatsApp messages. Use {"{{1}}"}, {"{{2}}"} etc for
            dynamic values.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button className="bg-green-600 hover:bg-green-700" />}>
              <Plus className="h-4 w-4 mr-2" />
              New Template
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Message Template</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input
                  placeholder="e.g. report_ready"
                  value={newTemplate.name}
                  onChange={(e) =>
                    setNewTemplate({ ...newTemplate, name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={newTemplate.category}
                    onValueChange={(v) =>
                      setNewTemplate({
                        ...newTemplate,
                        category: (v ?? "utility") as "marketing" | "utility" | "authentication",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utility">Utility</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="authentication">Authentication</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select
                    value={newTemplate.language}
                    onValueChange={(v) =>
                      setNewTemplate({ ...newTemplate, language: v ?? "en" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ur">Urdu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Header Type</Label>
                <Select
                  value={newTemplate.header_type}
                  onValueChange={(v) =>
                    setNewTemplate({
                      ...newTemplate,
                      header_type: (v ?? "none") as "none" | "text" | "image" | "document" | "video",
                      header_text: "",
                      header_media_url: "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Header</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="image">Image (JPG, PNG)</SelectItem>
                    <SelectItem value="document">Document (PDF)</SelectItem>
                    <SelectItem value="video">Video (MP4)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newTemplate.header_type === "text" && (
                <div className="space-y-2">
                  <Label>Header Text</Label>
                  <Input
                    placeholder="e.g. Report Notification"
                    value={newTemplate.header_text}
                    onChange={(e) =>
                      setNewTemplate({ ...newTemplate, header_text: e.target.value })
                    }
                  />
                </div>
              )}

              {["image", "document", "video"].includes(newTemplate.header_type) && (
                <div className="space-y-2">
                  <Label>
                    {newTemplate.header_type === "image" ? "Upload Image" : newTemplate.header_type === "document" ? "Upload PDF" : "Upload Video"}
                  </Label>
                  {newTemplate.header_media_url ? (
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
                      {newTemplate.header_type === "image" ? (
                        <Image className="h-4 w-4 text-green-600" />
                      ) : (
                        <FileText className="h-4 w-4 text-green-600" />
                      )}
                      <span className="text-sm text-green-700 flex-1 truncate">
                        File uploaded
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setNewTemplate({ ...newTemplate, header_media_url: "" })}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="file"
                        accept={
                          newTemplate.header_type === "image"
                            ? "image/jpeg,image/png,image/webp"
                            : newTemplate.header_type === "document"
                            ? "application/pdf"
                            : "video/mp4"
                        }
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        disabled={uploading}
                      />
                      <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-md hover:border-green-400 transition-colors">
                        <Upload className="h-5 w-5 text-gray-400" />
                        <span className="text-sm text-gray-500">
                          {uploading ? "Uploading..." : "Click to upload"}
                        </span>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">Max 16MB. WhatsApp will show this in the message header.</p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Body</Label>
                <Textarea
                  placeholder="Dear {{1}}, your {{2}} report is ready at {{3}}."
                  value={newTemplate.body_text}
                  onChange={(e) =>
                    setNewTemplate({ ...newTemplate, body_text: e.target.value })
                  }
                  rows={4}
                  required
                />
                <p className="text-xs text-gray-500">
                  Use {"{{1}}"}, {"{{2}}"}, {"{{3}}"} for dynamic parameters
                </p>
              </div>
              <div className="space-y-2">
                <Label>Footer (optional)</Label>
                <Input
                  placeholder="e.g. Thank you for choosing us"
                  value={newTemplate.footer_text}
                  onChange={(e) =>
                    setNewTemplate({ ...newTemplate, footer_text: e.target.value })
                  }
                />
              </div>
              <Button type="submit" className="w-full bg-green-600 hover:bg-green-700">
                Create Template
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No templates yet. Create your first message template!
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{template.name}</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(template.id)}
                    className="text-red-500 hover:text-red-700 h-8 w-8"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Badge className={statusColor[template.status]}>
                    {template.status}
                  </Badge>
                  <Badge variant="outline">{template.category}</Badge>
                  <Badge variant="outline">{template.language}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {template.header_type === "image" && template.header_media_url && (
                  <div className="mb-2 rounded overflow-hidden">
                    <img src={template.header_media_url} alt="Header" className="w-full h-32 object-cover" />
                  </div>
                )}
                {template.header_type === "document" && template.header_media_url && (
                  <div className="flex items-center gap-2 mb-2 p-2 bg-gray-50 rounded text-sm">
                    <FileText className="h-4 w-4 text-red-500" />
                    <span className="text-gray-600">PDF Document</span>
                  </div>
                )}
                {template.header_type === "video" && template.header_media_url && (
                  <div className="flex items-center gap-2 mb-2 p-2 bg-gray-50 rounded text-sm">
                    <Image className="h-4 w-4 text-blue-500" />
                    <span className="text-gray-600">Video</span>
                  </div>
                )}
                {template.header_text && (
                  <p className="text-sm font-medium mb-1">{template.header_text}</p>
                )}
                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                  {template.body_text}
                </p>
                {template.footer_text && (
                  <p className="text-xs text-gray-400 mt-2">
                    {template.footer_text}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

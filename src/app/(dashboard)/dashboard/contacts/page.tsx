"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/types/database";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [newContact, setNewContact] = useState({
    name: "",
    phone: "",
    email: "",
    tags: "",
  });
  const supabase = createClient();

  useEffect(() => {
    loadContacts();
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

  async function loadContacts() {
    const oid = await getOrgId();
    if (!oid) return;

    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("org_id", oid)
      .order("created_at", { ascending: false });

    if (data) setContacts(data);
    if (error) toast.error("Failed to load contacts");
    setLoading(false);
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    const oid = await getOrgId();
    if (!oid) return;

    const tags = newContact.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const { error } = await supabase.from("contacts").insert({
      org_id: oid,
      name: newContact.name,
      phone: newContact.phone.replace(/[^0-9+]/g, ""),
      email: newContact.email || null,
      tags,
    });

    if (error) {
      toast.error("Failed to add contact");
      return;
    }

    toast.success("Contact added!");
    setNewContact({ name: "", phone: "", email: "", tags: "" });
    setDialogOpen(false);
    loadContacts();
  }

  async function handleCsvUpload(e: React.FormEvent) {
    e.preventDefault();
    const oid = await getOrgId();
    if (!oid) return;

    const fileInput = document.getElementById("csv-file") as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (!file) {
      toast.error("Please select a CSV file");
      return;
    }

    const text = await file.text();
    const lines = text.split("\n").filter(Boolean);
    const headers = lines[0].toLowerCase().split(",").map((h) => h.trim());

    const nameIdx = headers.findIndex((h) => h.includes("name"));
    const phoneIdx = headers.findIndex((h) => h.includes("phone") || h.includes("number") || h.includes("mobile"));
    const emailIdx = headers.findIndex((h) => h.includes("email"));

    if (phoneIdx === -1) {
      toast.error("CSV must have a phone/number/mobile column");
      return;
    }

    const contactsToInsert = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      return {
        org_id: oid,
        name: nameIdx >= 0 ? cols[nameIdx] || "Unknown" : "Unknown",
        phone: cols[phoneIdx]?.replace(/[^0-9+]/g, "") || "",
        email: emailIdx >= 0 ? cols[emailIdx] || null : null,
        tags: [] as string[],
      };
    }).filter((c) => c.phone.length >= 10);

    if (contactsToInsert.length === 0) {
      toast.error("No valid contacts found in CSV");
      return;
    }

    const { error } = await supabase.from("contacts").insert(contactsToInsert);

    if (error) {
      toast.error("Failed to import contacts");
      return;
    }

    toast.success(`${contactsToInsert.length} contacts imported!`);
    setCsvDialogOpen(false);
    loadContacts();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete contact");
      return;
    }
    toast.success("Contact deleted");
    setContacts(contacts.filter((c) => c.id !== id));
  }

  const filtered = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-500 mt-1">{contacts.length} total contacts</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
            <DialogTrigger render={<Button variant="outline" />}>
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import Contacts from CSV</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCsvUpload} className="space-y-4">
                <p className="text-sm text-gray-500">
                  CSV must have columns: name, phone (required), email (optional)
                </p>
                <Input id="csv-file" type="file" accept=".csv" required />
                <Button type="submit" className="w-full bg-green-600 hover:bg-green-700">
                  Upload & Import
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button className="bg-green-600 hover:bg-green-700" />}>
                <Plus className="h-4 w-4 mr-2" />
                Add Contact
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Contact</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddContact} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="Contact name"
                    value={newContact.name}
                    onChange={(e) =>
                      setNewContact({ ...newContact, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input
                    placeholder="923001234567"
                    value={newContact.phone}
                    onChange={(e) =>
                      setNewContact({ ...newContact, phone: e.target.value })
                    }
                    required
                  />
                  <p className="text-xs text-gray-500">
                    Include country code (92 for Pakistan)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Email (optional)</Label>
                  <Input
                    type="email"
                    placeholder="email@example.com"
                    value={newContact.email}
                    onChange={(e) =>
                      setNewContact({ ...newContact, email: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tags (comma separated)</Label>
                  <Input
                    placeholder="patient, vip"
                    value={newContact.tags}
                    onChange={(e) =>
                      setNewContact({ ...newContact, tags: e.target.value })
                    }
                  />
                </div>
                <Button type="submit" className="w-full bg-green-600 hover:bg-green-700">
                  Add Contact
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Contacts Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="w-16">Actions</TableHead>
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
                    No contacts found. Add your first contact!
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium">{contact.name}</TableCell>
                    <TableCell>{contact.phone}</TableCell>
                    <TableCell>{contact.email || "-"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {contact.tags?.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(contact.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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

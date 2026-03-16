"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  MessageSquare,
  Calendar,
  TrendingUp,
  Package,
  CheckCircle,
  Clock,
  AlertTriangle,
  CreditCard,
  Smartphone,
  Building2,
  Copy,
  Upload,
  Image,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { Subscription, SubscriptionPlan, PaymentReceipt } from "@/types/database";

const UNLIMITED_THRESHOLD = 999999;

interface SubscriptionWithPlan extends Subscription {
  plan: SubscriptionPlan;
}

interface PaymentReceiptWithPlan extends PaymentReceipt {
  plan?: SubscriptionPlan;
}

const WHATSAPP_NUMBER = "923251411320";
const WHATSAPP_MESSAGE = "Hi, I want to subscribe/renew my WA Connect Pro plan.";

export default function BillingPage() {
  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [pastSubs, setPastSubs] = useState<SubscriptionWithPlan[]>([]);
  const [receipts, setReceipts] = useState<PaymentReceiptWithPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
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

    const [orgRes, activeSubRes, plansRes, historyRes] = await Promise.all([
      supabase.from("organizations").select("name").eq("id", member.org_id).single(),
      supabase
        .from("subscriptions")
        .select("*, plan:subscription_plans(*)")
        .eq("org_id", member.org_id)
        .eq("status", "active")
        .gte("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("price_monthly", { ascending: true }),
      supabase
        .from("subscriptions")
        .select("*, plan:subscription_plans(*)")
        .eq("org_id", member.org_id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (orgRes.data) setOrgName(orgRes.data.name);
    if (activeSubRes.data) setSubscription(activeSubRes.data as SubscriptionWithPlan);
    if (plansRes.data) setPlans(plansRes.data);
    if (historyRes.data) setPastSubs(historyRes.data as SubscriptionWithPlan[]);

    // Load payment receipts
    const { data: receiptData } = await supabase
      .from("payment_receipts")
      .select("*, plan:subscription_plans(*)")
      .eq("org_id", member.org_id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (receiptData) setReceipts(receiptData as PaymentReceiptWithPlan[]);

    setLoading(false);
  }

  function openWhatsApp(planName?: string) {
    const msg = planName
      ? `Hi, I want to subscribe to the *${planName}* plan for my organization *${orgName}*.`
      : WHATSAPP_MESSAGE;
    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`,
      "_blank"
    );
  }

  function copyAccountNumber(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only image files allowed (JPG, PNG, WebP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum 5MB.");
      return;
    }
    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
  }

  async function submitReceipt() {
    if (!receiptFile) {
      toast.error("Please select a receipt screenshot");
      return;
    }
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", receiptFile);
      formData.append("amount", paymentAmount);
      formData.append("payment_method", paymentMethod);
      if (selectedPlanId) formData.append("plan_id", selectedPlanId);
      if (paymentNotes) formData.append("notes", paymentNotes);

      const res = await fetch("/api/payments", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to submit receipt");
        return;
      }

      toast.success("Payment receipt submitted! We'll review and activate your plan shortly.");
      setReceipts((prev) => [data.receipt, ...prev]);
      setReceiptFile(null);
      setReceiptPreview(null);
      setPaymentAmount("");
      setPaymentNotes("");
      setSelectedPlanId("");
    } catch {
      toast.error("Failed to submit receipt");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Package className="h-10 w-10 text-green-600 mx-auto mb-3 animate-pulse" />
          <p className="text-gray-500">Loading billing...</p>
        </div>
      </div>
    );
  }

  const daysLeft = subscription
    ? Math.max(0, Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const isUnlimited = subscription?.plan
    ? subscription.plan.message_limit >= UNLIMITED_THRESHOLD
    : false;

  const messagesLeft = subscription?.plan
    ? isUnlimited ? Infinity : Math.max(0, subscription.plan.message_limit - subscription.messages_used)
    : 0;

  const usagePercent = subscription?.plan
    ? isUnlimited ? 0 : Math.round((subscription.messages_used / subscription.plan.message_limit) * 100)
    : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Billing</h1>
        <p className="text-gray-500 mt-1">Manage your subscription and payments</p>
      </div>

      {/* Current Subscription Status */}
      {subscription ? (
        <>
          {/* Active Plan Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Package className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold">{subscription.plan.name}</p>
                    <p className="text-sm text-gray-500">Current Plan</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold">{isUnlimited ? "Unlimited" : messagesLeft.toLocaleString()}</p>
                    <p className="text-sm text-gray-500">Messages Left</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-8 w-8 text-purple-600" />
                  <div>
                    <p className="text-2xl font-bold">{subscription.messages_used.toLocaleString()}</p>
                    <p className="text-sm text-gray-500">Messages Sent</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Calendar className={`h-8 w-8 ${daysLeft <= 5 ? "text-red-600" : "text-orange-600"}`} />
                  <div>
                    <p className={`text-2xl font-bold ${daysLeft <= 5 ? "text-red-600" : ""}`}>{daysLeft}</p>
                    <p className="text-sm text-gray-500">Days Remaining</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Usage Progress */}
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                <div
                  className={`h-3 rounded-full transition-all ${
                    usagePercent >= 90 ? "bg-red-500" : usagePercent >= 70 ? "bg-yellow-500" : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>{subscription.messages_used.toLocaleString()} used</span>
                <span>{isUnlimited ? "Unlimited" : subscription.plan.message_limit.toLocaleString()} limit</span>
              </div>
              {!isUnlimited && usagePercent >= 90 && (
                <div className="flex items-center gap-2 mt-3 text-red-600 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Running low on messages! Upgrade or renew your plan.</span>
                </div>
              )}
              {daysLeft <= 5 && daysLeft > 0 && (
                <div className="flex items-center gap-2 mt-3 text-amber-600 text-sm">
                  <Clock className="h-4 w-4" />
                  <span>Your plan expires in {daysLeft} day{daysLeft > 1 ? "s" : ""}. Renew to continue sending messages.</span>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <CardContent className="py-8 text-center">
            <Package className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <p className="text-amber-800 font-semibold text-lg mb-2">No Active Subscription</p>
            <p className="text-amber-700 mb-4">
              Choose a plan below to start sending WhatsApp messages.
            </p>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => openWhatsApp()}
            >
              <Smartphone className="h-4 w-4 mr-2" />
              Contact Us on WhatsApp
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Available Plans */}
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">
          {subscription ? "Upgrade or Renew" : "Choose a Plan"}
        </h2>
        <p className="text-gray-500 text-sm mb-4">Select a plan that fits your business needs</p>
        <div className="grid md:grid-cols-3 gap-4">
          {plans.map((plan, i) => {
            const isCurrentPlan = subscription?.plan?.id === plan.id;
            const isMostPopular = i === 1 || plans.length === 1;
            return (
              <Card
                key={plan.id}
                className={`relative ${
                  isMostPopular ? "border-green-500 border-2 shadow-lg" : ""
                } ${isCurrentPlan ? "bg-green-50" : ""}`}
              >
                {isMostPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-green-600 text-white">Most Popular</Badge>
                  </div>
                )}
                {isCurrentPlan && (
                  <div className="absolute -top-3 right-4">
                    <Badge className="bg-blue-600 text-white">Current Plan</Badge>
                  </div>
                )}
                <CardContent className="pt-8 text-center">
                  <h3 className="text-lg font-bold mb-1">{plan.name}</h3>
                  {plan.description && (
                    <p className="text-gray-500 text-xs mb-3">{plan.description}</p>
                  )}
                  <p className="text-3xl font-bold mb-1">
                    Rs. {plan.price_monthly.toLocaleString()}
                    <span className="text-sm font-normal text-gray-500">/mo</span>
                  </p>
                  <p className="text-green-600 font-semibold mb-4">
                    {plan.message_limit >= UNLIMITED_THRESHOLD ? "Unlimited" : plan.message_limit.toLocaleString()} messages
                  </p>
                  <Button
                    className={`w-full ${
                      isMostPopular
                        ? "bg-green-600 hover:bg-green-700"
                        : ""
                    }`}
                    variant={isMostPopular ? "default" : "outline"}
                    onClick={() => openWhatsApp(plan.name)}
                  >
                    <Smartphone className="h-4 w-4 mr-2" />
                    {isCurrentPlan ? "Renew Plan" : "Subscribe"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* How to Pay */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            How to Pay
          </CardTitle>
          <CardDescription>
            Choose your preferred payment method and send payment details via WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {/* Bank Transfer */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold">Bank Transfer</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-gray-500">Bank</p>
                  <p className="font-medium">Meezan Bank</p>
                </div>
                <div>
                  <p className="text-gray-500">Account Title</p>
                  <p className="font-medium">Adeel Ahmad</p>
                </div>
                <div>
                  <p className="text-gray-500">Account Number</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium font-mono">02330108278971</p>
                    <button
                      onClick={() => copyAccountNumber("02330108278971")}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* JazzCash */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Smartphone className="h-5 w-5 text-red-600" />
                <h3 className="font-semibold">JazzCash</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-gray-500">Account Name</p>
                  <p className="font-medium">Adeel Ahmad</p>
                </div>
                <div>
                  <p className="text-gray-500">Number</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium font-mono">0325-1411320</p>
                    <button
                      onClick={() => copyAccountNumber("03251411320")}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* EasyPaisa */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Smartphone className="h-5 w-5 text-green-600" />
                <h3 className="font-semibold">EasyPaisa</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-gray-500">Account Name</p>
                  <p className="font-medium">Adeel Ahmad</p>
                </div>
                <div>
                  <p className="text-gray-500">Number</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium font-mono">0325-1411320</p>
                    <button
                      onClick={() => copyAccountNumber("03251411320")}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-semibold text-green-800 mb-2">After Payment</h4>
            <ol className="list-decimal list-inside text-sm text-green-700 space-y-1">
              <li>Take a screenshot of your payment receipt</li>
              <li>Upload it below or send it via WhatsApp</li>
              <li>Your plan will be activated within 1 hour</li>
            </ol>
            <Button
              className="mt-4 bg-green-600 hover:bg-green-700"
              onClick={() => openWhatsApp()}
            >
              <Smartphone className="h-4 w-4 mr-2" />
              Send Payment Receipt on WhatsApp
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Upload Payment Receipt */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Submit Payment Receipt
          </CardTitle>
          <CardDescription>
            Upload your payment screenshot and we'll activate your plan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label>Plan</Label>
                <Select value={selectedPlanId} onValueChange={(v) => setSelectedPlanId(v || "")}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select plan you paid for" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} - Rs. {plan.price_monthly.toLocaleString()}/mo
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount Paid (Rs.)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 5000"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v || "bank_transfer")}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="jazzcash">JazzCash</SelectItem>
                    <SelectItem value="easypaisa">EasyPaisa</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Any additional info..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="mt-1"
                  rows={2}
                />
              </div>
            </div>
            <div>
              <Label>Receipt Screenshot</Label>
              <div className="mt-1">
                {receiptPreview ? (
                  <div className="relative">
                    <img
                      src={receiptPreview}
                      alt="Receipt preview"
                      className="w-full max-h-60 object-contain border rounded-lg"
                    />
                    <button
                      onClick={() => {
                        setReceiptFile(null);
                        setReceiptPreview(null);
                      }}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      x
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors">
                    <Image className="h-10 w-10 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-500">Click to upload screenshot</span>
                    <span className="text-xs text-gray-400 mt-1">JPG, PNG, WebP (max 5MB)</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
              <Button
                className="w-full mt-4 bg-green-600 hover:bg-green-700"
                onClick={submitReceipt}
                disabled={uploading || !receiptFile}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Submit Receipt
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment History */}
      {receipts.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Payment History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">
                      {new Date(r.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {r.plan?.name || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      Rs. {r.amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm capitalize">
                      {r.payment_method.replace("_", " ")}
                    </TableCell>
                    <TableCell>
                      {r.status === "confirmed" ? (
                        <Badge className="bg-green-100 text-green-700 gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Confirmed
                        </Badge>
                      ) : r.status === "rejected" ? (
                        <Badge className="bg-red-100 text-red-700 gap-1">
                          Rejected
                        </Badge>
                      ) : (
                        <Badge className="bg-yellow-100 text-yellow-700 gap-1">
                          <Clock className="h-3 w-3" />
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.receipt_url && (
                        <a
                          href={r.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-sm"
                        >
                          View
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Subscription History */}
      {pastSubs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscription History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Messages Used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pastSubs.map((sub) => {
                  const isActive =
                    sub.status === "active" &&
                    new Date(sub.expires_at) > new Date();
                  const isExpired =
                    sub.status === "active" &&
                    new Date(sub.expires_at) <= new Date();
                  return (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">
                        {sub.plan?.name || "—"}
                      </TableCell>
                      <TableCell>
                        {isActive ? (
                          <Badge className="bg-green-100 text-green-700 gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Active
                          </Badge>
                        ) : isExpired ? (
                          <Badge className="bg-red-100 text-red-700 gap-1">
                            <Clock className="h-3 w-3" />
                            Expired
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-700">
                            {sub.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(sub.starts_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(sub.expires_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {sub.messages_used.toLocaleString()}
                        {sub.plan && ` / ${sub.plan.message_limit >= UNLIMITED_THRESHOLD ? "Unlimited" : sub.plan.message_limit.toLocaleString()}`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* WhatsApp Support Footer */}
      <div className="mt-6 text-center text-sm text-gray-500">
        <p>
          Need help? Message us on{" "}
          <button
            onClick={() => openWhatsApp()}
            className="text-green-600 hover:underline font-medium"
          >
            WhatsApp
          </button>{" "}
          or call{" "}
          <a href="tel:+923251411320" className="text-green-600 hover:underline font-medium">
            0325-1411320
          </a>
        </p>
      </div>
    </div>
  );
}

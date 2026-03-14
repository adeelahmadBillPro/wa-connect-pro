"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import type { CreditTransaction } from "@/types/database";

const pricingPlans = [
  { credits: 500, price: "Rs. 2,500", popular: false },
  { credits: 1000, price: "Rs. 4,000", popular: false },
  { credits: 5000, price: "Rs. 15,000", popular: true },
  { credits: 10000, price: "Rs. 25,000", popular: false },
];

export default function CreditsPage() {
  const [credits, setCredits] = useState(0);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
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

    const [orgRes, txRes] = await Promise.all([
      supabase
        .from("organizations")
        .select("credits")
        .eq("id", member.org_id)
        .single(),
      supabase
        .from("credit_transactions")
        .select("*")
        .eq("org_id", member.org_id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (orgRes.data) setCredits(orgRes.data.credits);
    if (txRes.data) setTransactions(txRes.data);
  }

  function handleBuyCredits(amount: number) {
    // In production, integrate with JazzCash, EasyPaisa, or Stripe
    toast.info(
      `Payment gateway integration needed. Contact admin to add ${amount} credits.`
    );
  }

  const typeColor: Record<string, string> = {
    purchase: "bg-green-100 text-green-700",
    usage: "bg-blue-100 text-blue-700",
    refund: "bg-yellow-100 text-yellow-700",
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Credits</h1>
        <p className="text-gray-500 mt-1">
          Buy credits to send WhatsApp messages
        </p>
      </div>

      {/* Current Balance */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Current Balance</p>
              <p className="text-5xl font-bold text-green-600">{credits}</p>
              <p className="text-gray-500 mt-1">credits remaining</p>
            </div>
            <CreditCard className="h-16 w-16 text-green-200" />
          </div>
        </CardContent>
      </Card>

      {/* Buy Credits */}
      <h2 className="text-xl font-bold mb-4">Buy Credits</h2>
      <div className="grid md:grid-cols-4 gap-4 mb-8">
        {pricingPlans.map((plan) => (
          <Card
            key={plan.credits}
            className={plan.popular ? "border-green-500 border-2" : ""}
          >
            <CardContent className="pt-6 text-center">
              {plan.popular && (
                <Badge className="bg-green-100 text-green-700 mb-2">
                  Most Popular
                </Badge>
              )}
              <p className="text-3xl font-bold">{plan.credits.toLocaleString()}</p>
              <p className="text-gray-500 mb-2">credits</p>
              <p className="text-xl font-semibold mb-4">{plan.price}</p>
              <Button
                className={
                  plan.popular
                    ? "w-full bg-green-600 hover:bg-green-700"
                    : "w-full"
                }
                variant={plan.popular ? "default" : "outline"}
                onClick={() => handleBuyCredits(plan.credits)}
              >
                Buy Now
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Transaction History */}
      <h2 className="text-xl font-bold mb-4">Transaction History</h2>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Balance After</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                    No transactions yet.
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge className={typeColor[tx.type]}>{tx.type}</Badge>
                    </TableCell>
                    <TableCell
                      className={
                        tx.type === "usage" ? "text-red-600" : "text-green-600"
                      }
                    >
                      {tx.type === "usage" ? "-" : "+"}
                      {Math.abs(tx.amount)}
                    </TableCell>
                    <TableCell>{tx.description}</TableCell>
                    <TableCell className="font-medium">{tx.balance_after}</TableCell>
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

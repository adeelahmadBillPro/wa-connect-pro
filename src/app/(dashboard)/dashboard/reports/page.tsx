"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, CheckCheck, Eye, XCircle, MessageSquare } from "lucide-react";

interface ReportData {
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
  deliveryRate: number;
  readRate: number;
  last7Days: { date: string; count: number }[];
}

export default function ReportsPage() {
  const [report, setReport] = useState<ReportData>({
    totalSent: 0,
    totalDelivered: 0,
    totalRead: 0,
    totalFailed: 0,
    deliveryRate: 0,
    readRate: 0,
    last7Days: [],
  });
  const supabase = createClient();

  useEffect(() => {
    loadReport();
  }, []);

  async function loadReport() {
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

    const { data: messages } = await supabase
      .from("messages")
      .select("status, created_at")
      .eq("org_id", member.org_id);

    if (!messages) return;

    const totalSent = messages.filter((m) =>
      ["sent", "delivered", "read"].includes(m.status)
    ).length;
    const totalDelivered = messages.filter((m) =>
      ["delivered", "read"].includes(m.status)
    ).length;
    const totalRead = messages.filter((m) => m.status === "read").length;
    const totalFailed = messages.filter((m) => m.status === "failed").length;

    // Last 7 days
    const last7Days: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const count = messages.filter(
        (m) => m.created_at.split("T")[0] === dateStr
      ).length;
      last7Days.push({ date: dateStr, count });
    }

    setReport({
      totalSent,
      totalDelivered,
      totalRead,
      totalFailed,
      deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
      readRate: totalDelivered > 0 ? Math.round((totalRead / totalDelivered) * 100) : 0,
      last7Days,
    });
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-500 mt-1">Message analytics and delivery reports</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="inline-flex p-2 rounded-lg bg-blue-50 mb-3">
              <Send className="h-5 w-5 text-blue-600" />
            </div>
            <p className="text-3xl font-bold">{report.totalSent}</p>
            <p className="text-sm text-gray-500">Total Sent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="inline-flex p-2 rounded-lg bg-green-50 mb-3">
              <CheckCheck className="h-5 w-5 text-green-600" />
            </div>
            <p className="text-3xl font-bold">{report.totalDelivered}</p>
            <p className="text-sm text-gray-500">Delivered</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="inline-flex p-2 rounded-lg bg-purple-50 mb-3">
              <Eye className="h-5 w-5 text-purple-600" />
            </div>
            <p className="text-3xl font-bold">{report.totalRead}</p>
            <p className="text-sm text-gray-500">Read</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="inline-flex p-2 rounded-lg bg-red-50 mb-3">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <p className="text-3xl font-bold">{report.totalFailed}</p>
            <p className="text-sm text-gray-500">Failed</p>
          </CardContent>
        </Card>
      </div>

      {/* Rates */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <p className="text-5xl font-bold text-green-600">
                {report.deliveryRate}%
              </p>
            </div>
            <div className="mt-4 w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-green-600 h-3 rounded-full transition-all"
                style={{ width: `${report.deliveryRate}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Read Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <p className="text-5xl font-bold text-purple-600">
                {report.readRate}%
              </p>
            </div>
            <div className="mt-4 w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-purple-600 h-3 rounded-full transition-all"
                style={{ width: `${report.readRate}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Last 7 Days */}
      <Card>
        <CardHeader>
          <CardTitle>Last 7 Days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-40">
            {report.last7Days.map((day) => {
              const maxCount = Math.max(...report.last7Days.map((d) => d.count), 1);
              const height = (day.count / maxCount) * 100;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-medium">{day.count}</span>
                  <div
                    className="w-full bg-green-500 rounded-t-sm min-h-[4px]"
                    style={{ height: `${Math.max(height, 3)}%` }}
                  />
                  <span className="text-xs text-gray-500">
                    {new Date(day.date).toLocaleDateString("en", {
                      weekday: "short",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

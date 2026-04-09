import Link from "next/link";
import {
  MessageSquare, Zap, Shield, BarChart3,
  Smartphone, Users, CheckCircle2, ArrowRight, Code2
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">WA Connect Pro</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/docs">
              <Button variant="ghost" size="sm">API Docs</Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost" size="sm">Login</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm" className="bg-green-600 hover:bg-green-700">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-green-50 via-white to-emerald-50 border-b">
        <div className="container mx-auto px-6 py-24 text-center">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            WhatsApp Web Integration — No Meta approval needed
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Send WhatsApp messages<br />
            <span className="text-green-600">to your patients</span>
          </h1>

          <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
            Scan QR once, connect your number, and send appointment reminders,
            reports, and updates — automatically via API.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/signup">
              <Button size="lg" className="bg-green-600 hover:bg-green-700 h-12 px-8 text-base">
                Start Free
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="h-12 px-8 text-base">
                Login to Dashboard
              </Button>
            </Link>
          </div>

          <div className="flex items-center justify-center gap-6 mt-10 text-sm text-gray-500">
            {["No credit card required", "Setup in 5 minutes", "Works with any WhatsApp number"].map((t) => (
              <div key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Everything you need</h2>
          <p className="text-gray-500 text-lg">Built for clinics, hospitals, and multi-center businesses</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: Smartphone,
              color: "text-green-600",
              bg: "bg-green-50",
              title: "WhatsApp Web — No ban risk",
              desc: "Connect your personal or business WhatsApp number by scanning a QR code. No Meta approval, no waiting.",
            },
            {
              icon: Zap,
              color: "text-blue-600",
              bg: "bg-blue-50",
              title: "Auto-reconnect",
              desc: "Network dropped? Server restarted? Sessions automatically reconnect — no manual QR scan needed every time.",
            },
            {
              icon: Users,
              color: "text-purple-600",
              bg: "bg-purple-50",
              title: "Multi-center support",
              desc: "Every branch has its own account and WhatsApp number. 20 centers, 20 numbers — all isolated.",
            },
            {
              icon: Code2,
              color: "text-orange-600",
              bg: "bg-orange-50",
              title: "Simple REST API",
              desc: "One API call to send text, PDF, or image. C# and other language examples included. Bulk sending with safe delays.",
            },
            {
              icon: BarChart3,
              color: "text-teal-600",
              bg: "bg-teal-50",
              title: "Reports & tracking",
              desc: "See sent, delivered, and failed counts. Daily usage per number. Full message history.",
            },
            {
              icon: Shield,
              color: "text-red-600",
              bg: "bg-red-50",
              title: "Anti-ban protection",
              desc: "Built-in delays between messages (5–15 sec), daily limits per number, and safe queue processing.",
            },
          ].map(({ icon: Icon, color, bg, title, desc }) => (
            <div key={title} className="p-6 border border-gray-100 rounded-2xl hover:shadow-md transition-shadow bg-white">
              <div className={`inline-flex p-3 rounded-xl ${bg} mb-4`}>
                <Icon className={`h-6 w-6 ${color}`} />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-gray-50 border-t border-b">
        <div className="container mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Simple, transparent pricing</h2>
            <p className="text-gray-500">Pay once a month — no per-message fees</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Basic */}
            <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Basic</p>
              <p className="text-4xl font-bold text-gray-900 mb-1">
                Rs. 5,000
                <span className="text-base font-normal text-gray-400">/mo</span>
              </p>
              <p className="text-sm text-gray-500 mb-6">For small clinics</p>
              <ul className="space-y-3 text-sm text-gray-600 mb-8">
                {["5,000 messages/month", "1 WhatsApp number", "Dashboard access", "Email support"].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup">
                <Button variant="outline" className="w-full">Get Started</Button>
              </Link>
            </div>

            {/* Pro */}
            <div className="bg-green-600 rounded-2xl p-8 shadow-xl relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-400 text-white text-xs font-bold px-3 py-1 rounded-full">
                MOST POPULAR
              </div>
              <p className="text-sm font-semibold text-green-200 uppercase tracking-wide mb-1">Pro</p>
              <p className="text-4xl font-bold text-white mb-1">
                Rs. 10,000
                <span className="text-base font-normal text-green-200">/mo</span>
              </p>
              <p className="text-sm text-green-200 mb-6">For growing centers</p>
              <ul className="space-y-3 text-sm text-green-100 mb-8">
                {["10,000 messages/month", "3 WhatsApp numbers", "API access + Bulk sending", "Priority support"].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-300 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup">
                <Button className="w-full bg-white text-green-700 hover:bg-green-50">
                  Get Started
                </Button>
              </Link>
            </div>

            {/* Enterprise */}
            <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Enterprise</p>
              <p className="text-4xl font-bold text-gray-900 mb-1">
                Rs. 25,000
                <span className="text-base font-normal text-gray-400">/mo</span>
              </p>
              <p className="text-sm text-gray-500 mb-6">For large networks</p>
              <ul className="space-y-3 text-sm text-gray-600 mb-8">
                {["Unlimited messages", "Unlimited numbers", "API + Webhooks", "Dedicated support"].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup">
                <Button variant="outline" className="w-full">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Ready to get started?</h2>
        <p className="text-gray-500 mb-8 text-lg">
          Create your account, scan QR, and send your first message in minutes.
        </p>
        <Link href="/signup">
          <Button size="lg" className="bg-green-600 hover:bg-green-700 h-12 px-10 text-base">
            Create Free Account
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t bg-gray-50">
        <div className="container mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-gray-700">WA Connect Pro</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <Link href="/docs" className="hover:text-green-600 transition-colors">API Docs</Link>
            <Link href="/login" className="hover:text-green-600 transition-colors">Login</Link>
            <Link href="/signup" className="hover:text-green-600 transition-colors">Sign Up</Link>
          </div>
          <p className="text-sm text-gray-400">
            © {new Date().getFullYear()} WA Connect Pro
          </p>
        </div>
      </footer>
    </div>
  );
}

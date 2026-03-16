import Link from "next/link";
import { MessageSquare, Zap, Shield, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-8 w-8 text-green-600" />
            <span className="text-2xl font-bold text-gray-900">
              WA Connect Pro
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/docs">
              <Button variant="ghost">API Docs</Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link href="/signup">
              <Button className="bg-green-600 hover:bg-green-700">
                Get Started Free
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-6 py-20 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-6">
          Send WhatsApp Messages
          <br />
          <span className="text-green-600">At Scale</span>
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Connect your WhatsApp Business number, create templates, and send
          thousands of messages automatically using the official Meta Cloud API.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/signup">
            <Button size="lg" className="bg-green-600 hover:bg-green-700 text-lg px-8 py-6">
              Start Free Trial
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline" className="text-lg px-8 py-6">
              Login to Dashboard
            </Button>
          </Link>
        </div>
        <p className="text-sm text-gray-500 mt-4">
          100 free messages included. No credit card required.
        </p>
      </section>

      {/* Features */}
      <section className="container mx-auto px-6 py-16">
        <div className="grid md:grid-cols-4 gap-8">
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <Zap className="h-10 w-10 text-green-600 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Official Meta API</h3>
            <p className="text-gray-600">
              100% legal and safe. Your number will never get banned.
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <MessageSquare className="h-10 w-10 text-blue-600 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Bulk Messaging</h3>
            <p className="text-gray-600">
              Send to thousands of contacts with one click. Track delivery in
              real-time.
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <Shield className="h-10 w-10 text-purple-600 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Your Own Number</h3>
            <p className="text-gray-600">
              Messages go from YOUR business number. Customers see YOUR name.
            </p>
          </div>
          <Link href="/docs" className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <BarChart3 className="h-10 w-10 text-orange-600 mb-4" />
            <h3 className="text-lg font-semibold mb-2">API Integration</h3>
            <p className="text-gray-600">
              Connect your existing software via simple REST API. Full
              documentation.
            </p>
            <span className="text-green-600 text-sm font-medium mt-2 inline-block">View API Docs →</span>
          </Link>
        </div>
      </section>

      {/* Pricing */}
      <section className="container mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Simple Pricing</h2>
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="bg-white rounded-xl p-8 shadow-sm border">
            <h3 className="text-lg font-semibold mb-2">Basic</h3>
            <p className="text-4xl font-bold mb-4">
              Rs. 5,000<span className="text-base font-normal text-gray-500">/mo</span>
            </p>
            <ul className="space-y-2 text-gray-600 mb-6">
              <li>5,000 messages/month</li>
              <li>1 WhatsApp number</li>
              <li>Dashboard access</li>
              <li>Email support</li>
            </ul>
            <Link href="/signup">
              <Button className="w-full">Get Started</Button>
            </Link>
          </div>
          <div className="bg-green-600 text-white rounded-xl p-8 shadow-lg scale-105">
            <h3 className="text-lg font-semibold mb-2">Pro</h3>
            <p className="text-4xl font-bold mb-4">
              Rs. 10,000<span className="text-base font-normal text-green-200">/mo</span>
            </p>
            <ul className="space-y-2 text-green-100 mb-6">
              <li>10,000 messages/month</li>
              <li>3 WhatsApp numbers</li>
              <li>API access</li>
              <li>Priority support</li>
            </ul>
            <Link href="/signup">
              <Button className="w-full bg-white text-green-600 hover:bg-green-50">
                Get Started
              </Button>
            </Link>
          </div>
          <div className="bg-white rounded-xl p-8 shadow-sm border">
            <h3 className="text-lg font-semibold mb-2">Enterprise</h3>
            <p className="text-4xl font-bold mb-4">
              Rs. 25,000<span className="text-base font-normal text-gray-500">/mo</span>
            </p>
            <ul className="space-y-2 text-gray-600 mb-6">
              <li>Unlimited messages</li>
              <li>Unlimited numbers</li>
              <li>API + Webhooks</li>
              <li>Dedicated support</li>
            </ul>
            <Link href="/signup">
              <Button className="w-full">Get Started</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white/80 mt-16">
        <div className="container mx-auto px-6 py-8 text-center text-gray-500">
          <p>WA Connect Pro - Official WhatsApp Business Platform</p>
        </div>
      </footer>
    </div>
  );
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  whatsapp_access_token: string | null;
  whatsapp_connected: boolean;
  whatsapp_display_name: string | null;
  whatsapp_number: string | null;
  credits: number;
  api_key: string;
  webhook_url: string | null;
  is_approved: boolean;
  created_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  created_at: string;
  profile?: Profile;
}

export interface Contact {
  id: string;
  org_id: string;
  name: string;
  phone: string;
  email: string | null;
  tags: string[];
  group_id: string | null;
  created_at: string;
}

export interface ContactGroup {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  contact_count: number;
  created_at: string;
}

export interface MessageTemplate {
  id: string;
  org_id: string;
  name: string;
  category: "marketing" | "utility" | "authentication";
  language: string;
  header_type: "none" | "text" | "image" | "document" | "video";
  header_text: string | null;
  header_media_url: string | null;
  body_text: string;
  footer_text: string | null;
  status: "pending" | "approved" | "rejected";
  meta_template_id: string | null;
  created_at: string;
}

export interface Campaign {
  id: string;
  org_id: string;
  name: string;
  template_id: string;
  group_id: string | null;
  status: "draft" | "scheduled" | "sending" | "completed" | "failed";
  scheduled_at: string | null;
  total_messages: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  created_at: string;
  template?: MessageTemplate;
}

export interface Message {
  id: string;
  org_id: string;
  campaign_id: string | null;
  contact_id: string | null;
  template_id: string | null;
  to_phone: string;
  message_type: "template" | "text" | "image" | "document";
  content: string;
  media_url: string | null;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  whatsapp_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  contact?: Contact;
}

export interface CreditTransaction {
  id: string;
  org_id: string;
  amount: number;
  type: "purchase" | "usage" | "refund";
  description: string;
  balance_after: number;
  created_at: string;
}

export interface ApiLog {
  id: string;
  org_id: string;
  endpoint: string;
  method: string;
  status_code: number;
  request_body: string | null;
  response_body: string | null;
  created_at: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  price_monthly: number;
  message_limit: number;
  is_active: boolean;
  created_at: string;
}

export interface Subscription {
  id: string;
  org_id: string;
  plan_id: string;
  status: "active" | "expired" | "cancelled";
  starts_at: string;
  expires_at: string;
  messages_used: number;
  created_at: string;
  plan?: SubscriptionPlan;
}

export interface WASession {
  id: string;
  org_id: string;
  session_name: string;
  phone_number: string | null;
  status: "connecting" | "qr_ready" | "connected" | "disconnected" | "banned";
  is_active: boolean;
  daily_limit: number;
  messages_sent_today: number;
  last_message_at: string | null;
  last_connected_at: string | null;
  created_at: string;
}

export interface PaymentReceipt {
  id: string;
  org_id: string;
  plan_id: string | null;
  amount: number;
  payment_method: "bank_transfer" | "jazzcash" | "easypaisa" | "other";
  receipt_url: string | null;
  notes: string | null;
  status: "pending" | "confirmed" | "rejected";
  admin_notes: string | null;
  created_at: string;
  plan?: SubscriptionPlan;
}

export interface WAMessageQueue {
  id: string;
  org_id: string;
  session_id: string | null;
  campaign_id: string | null;
  to_phone: string;
  message_type: "text" | "image" | "document" | "video";
  content: string;
  media_url: string | null;
  caption: string | null;
  status: "pending" | "sending" | "sent" | "failed" | "cancelled";
  error_message: string | null;
  whatsapp_message_id: string | null;
  retry_count: number;
  scheduled_at: string;
  sent_at: string | null;
  created_at: string;
}

// SECTION: Database Types
// Tipe data sesuai model logis SRS 6

export type UserRole = "owner" | "staff";

export type OrderStatus =
  | "draft"
  | "awaiting_payment"
  | "paid"
  | "processing"
  | "completed"
  | "cancelled";

export type PaymentProofStatus =
  | "pending"
  | "matched"
  | "mismatched"
  | "needs_review";

export type PurchaseOrderStatus =
  | "draft"
  | "pending_approval"
  | "sent"
  | "received"
  | "cancelled";

export type DebtStatus = "outstanding" | "partial" | "paid";

export type MessageDirection = "inbound" | "outbound";

export type MessageType = "text" | "image" | "audio" | "document" | "template";

export type ConversationHandler = "ai" | "owner";

export type MessageDeliveryStatus =
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type ContextLockState =
  | "idle"
  | "awaiting_approval"
  | "executing"
  | "expired";

// SECTION: Table Interfaces

export interface Shop {
  id: string;
  name: string;
  business_type: string;
  opening_hours: string | null;
  address: string | null;
  wa_phone_number_id: string | null;
  plan: string;
  auto_reply_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  shop_id: string;
  auth_id: string;
  role: UserRole;
  phone: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  shop_id: string;
  name: string;
  aliases: string[];
  unit: string;
  sell_price: number;
  buy_price: number;
  stock_qty: number;
  min_stock: number;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  shop_id: string;
  phone: string;
  name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  shop_id: string;
  customer_id: string;
  channel: string;
  status: string;
  handled_by: ConversationHandler;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  shop_id: string;
  conversation_id: string;
  direction: MessageDirection;
  wa_message_id: string | null;
  type: MessageType;
  body: string | null;
  media_path: string | null;
  transcript: string | null;
  status: MessageDeliveryStatus | null;
  created_at: string;
}

export interface Order {
  id: string;
  shop_id: string;
  customer_id: string | null;
  status: OrderStatus;
  total: number;
  payment_status: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  shop_id: string;
  order_id: string;
  product_id: string;
  qty: number;
  unit_price: number;
}

export interface Sale {
  id: string;
  shop_id: string;
  order_id: string | null;
  total: number;
  payment_method: string;
  occurred_at: string;
  source_message_id: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  shop_id: string;
  description: string;
  amount: number;
  category: string | null;
  occurred_at: string;
  attachment_path: string | null;
  created_at: string;
}

export interface Debt {
  id: string;
  shop_id: string;
  party_type: string;
  party_name: string;
  amount: number;
  paid_amount: number;
  due_date: string | null;
  status: DebtStatus;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  shop_id: string;
  name: string;
  wa_phone: string;
  products: string[];
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  shop_id: string;
  supplier_id: string;
  status: PurchaseOrderStatus;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  shop_id: string;
  po_id: string;
  product_id: string;
  qty: number;
}

export interface PaymentProof {
  id: string;
  shop_id: string;
  order_id: string;
  image_path: string;
  image_hash: string | null;
  extracted_amount: number | null;
  extracted_at: string | null;
  status: PaymentProofStatus;
  created_at: string;
}

export interface Notification {
  id: string;
  shop_id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface AgentLog {
  id: string;
  shop_id: string;
  message_id: string | null;
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown> | null;
  latency_ms: number | null;
  error: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  shop_id: string;
  entity: string;
  entity_id: string;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  actor: string;
  created_at: string;
}

export interface UsageCounter {
  id: string;
  shop_id: string;
  date: string;
  ai_calls: number;
  stt_calls: number;
  ocr_calls: number;
}

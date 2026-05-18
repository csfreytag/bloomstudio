/**
 * shared-types.ts
 * Shared Firestore data types for Freytag's Recipe Guide + Purchasing App
 * Copy this file into both repos: src/types/shared.ts
 * DO NOT diverge — any change must be made in both repos simultaneously.
 */

import { Timestamp } from 'firebase/firestore';

// ─────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────

export type RecipeGuideRole = 'admin' | 'manager' | 'designer';

export type PurchasingRole = 'buyer' | 'warehouse' | 'manager' | 'bookkeeper';

export interface UserRecord {
  uid: string;                          // Firebase Auth UID
  email: string;
  displayName: string;
  photoURL?: string;
  authProvider: 'google' | 'email';     // google = @freytags.com, email = designers
  recipeGuideRole?: RecipeGuideRole;    // undefined = no access to Recipe Guide
  purchasingRole?: PurchasingRole;      // undefined = no access to Purchasing
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;                    // uid of admin who created/invited
}

// ─────────────────────────────────────────────
// VENDORS
// ─────────────────────────────────────────────

export type VendorType = 'fresh' | 'hardgoods' | 'local' | 'other';

export type CarrierName =
  | 'Armellini Express Lines'
  | 'Armellini Air Express'
  | 'FedEx'
  | 'Local Pickup';

export interface VendorRecord {
  id: string;                           // Firestore doc ID
  name: string;                         // e.g. "Jet Fresh Flower Distributors"
  shortName: string;                    // e.g. "Jet Fresh" — used in UI lists
  type: VendorType;
  email?: string;
  phone?: string;
  accountNumber?: string;               // our account # with this vendor
  onKomet: boolean;                     // true = orders via Komet platform
  kometVendorName?: string;             // exact name as it appears in Komet email subjects
  helpScoutTags?: string[];             // tags applied to HelpScout convos for this vendor
  defaultCarrier?: CarrierName;
  notes?: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─────────────────────────────────────────────
// PRODUCTS (shared master list)
// ─────────────────────────────────────────────

export type ProductCategory =
  | 'flower'
  | 'filler'
  | 'container'
  | 'accent'
  | 'hardgood'
  | 'plant';

export type MarkupGroup = 'flowers_fillers' | 'containers_accents_hardgoods_plants';

/** Cost level controls how purchasing app groups invoice line items for COGS */
export type CostLevel = 'parent' | 'variety';

export interface UnitConversion {
  factor: number;                       // e.g. 50 stems per bundle
  vendorUnit: string;                   // e.g. "bundle", "box", "flat"
}

export interface ProductRecord {
  id: string;
  name: string;                         // canonical name e.g. "Roses - Med Stem Red"
  category: ProductCategory;            // Recipe Guide uses; Purchasing ignores in UI
  unit: string;                         // e.g. "stem", "bunch", "each"
  unitConversion: UnitConversion | null;
  costLevel: CostLevel;

  aliases: string[];                    // all known vendor name variants

  // PRICING — owned exclusively by Recipe Guide / Google Sheet sync
  // Purchasing app MUST NEVER write retailPrice
  retailPrice: number | null;           // null = market price (peonies, seasonals)
  marketPrice: boolean;                 // true = no fixed retail price

  // COST — owned exclusively by Purchasing app (invoice history)
  // Recipe Guide reads this; never writes it
  currentCost: number | null;           // highest vendor cost from invoice history
  costUpdatedAt: Timestamp | null;
  costVendorId: string | null;          // vendor that produced currentCost

  defaultVendorId: string | null;       // Purchasing uses for suggested PO vendor

  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Calculated fields (never stored, always derived in app)
export interface ProductCalculated {
  markupGroup: MarkupGroup;
  markupMultiplier: 4 | 3.5;
  suggestedRetail: number | null;       // currentCost * multiplier
  margin: number | null;                // (retailPrice - currentCost) / retailPrice * 100
  cogs: number | null;                  // currentCost / retailPrice * 100
}

// ─────────────────────────────────────────────
// PENDING PRODUCTS (alias review queue)
// ─────────────────────────────────────────────

export type MatchConfidence = 'suggest' | 'pending';
// suggest = 50–80%, pending = below 50%

export type PendingProductStatus =
  | 'awaiting_review'
  | 'auto_approved'       // suggest tier, no objection after 24hrs
  | 'confirmed'           // manager confirmed mapping
  | 'rejected'            // manager rejected — treated as fee line or duplicate
  | 'new_product';        // manager confirmed as genuinely new product

export interface PendingProductRecord {
  id: string;
  rawName: string;                      // original string from invoice/order
  strippedName: string;                 // after qualifier stripping
  confidence: MatchConfidence;
  suggestedProductId: string | null;    // null if below 50%
  suggestedProductName: string | null;
  similarityScore: number;              // 0–100
  sourceApp: 'purchasing';              // only purchasing creates these currently
  sourcePOId: string;
  sourceVendorId: string;
  status: PendingProductStatus;
  reviewedBy: string | null;            // uid
  reviewedAt: Timestamp | null;
  autoApproveAt: Timestamp | null;      // set for suggest-tier items
  createdAt: Timestamp;
}

// ─────────────────────────────────────────────
// CHANGE LOGS (both apps write here)
// ─────────────────────────────────────────────

export type ChangeLogApp = 'recipe-guide' | 'purchasing';

export type ChangeLogAction =
  // Products
  | 'product.created'
  | 'product.updated'
  | 'product.alias_added'
  | 'product.deactivated'
  // Pricing (Recipe Guide / Sheet sync only)
  | 'pricing.synced'
  // Purchasing
  | 'po.created'
  | 'po.status_changed'
  | 'po.cancelled'
  | 'receiving.created'
  | 'invoice.matched'
  | 'invoice.exception'
  | 'credit_memo.created'
  | 'credit_memo.sent'
  | 'export.downloaded'
  // Users
  | 'user.invited'
  | 'user.role_changed'
  | 'user.deactivated'
  // Pending products
  | 'pending_product.confirmed'
  | 'pending_product.rejected'
  | 'pending_product.auto_approved';

export interface ChangeLogRecord {
  id: string;
  app: ChangeLogApp;
  action: ChangeLogAction;
  entityType: string;                   // e.g. "product", "purchaseOrder"
  entityId: string;
  entityName?: string;                  // human-readable label for display
  userId: string;                       // uid, or "system" for automated actions
  userEmail?: string;
  before?: Record<string, unknown>;     // snapshot before change
  after?: Record<string, unknown>;      // snapshot after change
  note?: string;                        // free-text context
  createdAt: Timestamp;
}

// ─────────────────────────────────────────────
// PURCHASING — PURCHASE ORDERS
// ─────────────────────────────────────────────

export type POStatus =
  | 'draft'
  | 'inquiry_pending'
  | 'ordered'
  | 'partially_received'
  | 'fully_received'
  | 'invoiced'
  | 'fully_matched'
  | 'exception'
  | 'credit_pending'
  | 'exported'
  | 'cancelled';

export type POType =
  | 'komet'             // auto-created from Komet email
  | 'buyer_initiated'   // buyer created via app form
  | 'inquiry';          // availability check, converts to PO

export interface POLineItem {
  lineId: string;                       // uuid, stable across edits
  productId: string | null;             // null = unmatched / pending
  pendingProductId: string | null;      // reference to pendingProducts if unmatched
  rawDescription: string;               // original text from order/invoice
  resolvedName: string;                 // canonical product name or best guess
  quantity: number;
  unit: string;
  unitCost: number | null;
  totalCost: number | null;
  notes?: string;
}

export interface PurchaseOrderRecord {
  id: string;
  poNumber: string;                     // e.g. "PO-2024-0042"
  type: POType;
  status: POStatus;
  vendorId: string;
  vendorName: string;                   // denormalized for display without join
  carrier: CarrierName | null;
  carrierId?: string;                   // Armellini account number if applicable

  lineItems: POLineItem[];

  // Dates
  orderedAt: Timestamp | null;
  expectedDeliveryDate: Timestamp | null;
  deliveredAt: Timestamp | null;

  // HelpScout
  helpScoutConversationId: string | null;
  helpScoutThreadIds: string[];

  // Komet
  kometInvoiceNumber: string | null;    // populated for komet-type POs

  // Financial summary (calculated on write, stored for export)
  subtotal: number | null;
  totalCost: number | null;

  // Receiving + matching
  receivingRecordIds: string[];
  invoiceIds: string[];

  // Notes
  buyerNotes?: string;
  internalNotes?: string;

  createdBy: string;                    // uid
  createdAt: Timestamp;
  updatedAt: Timestamp;
  exportedAt: Timestamp | null;
}

// ─────────────────────────────────────────────
// PURCHASING — RECEIVING RECORDS
// ─────────────────────────────────────────────

export interface ReceivingLineItem {
  lineId: string;
  poLineId: string;                     // references POLineItem.lineId
  productId: string | null;
  resolvedName: string;
  quantityOrdered: number;
  quantityReceived: number;
  unit: string;
  condition: 'good' | 'damaged' | 'short' | 'wrong_item';
  notes?: string;
  photoUrls?: string[];                 // GCS URLs for damage photos
}

export interface ReceivingRecord {
  id: string;
  poId: string;
  vendorId: string;
  receivedBy: string;                   // uid
  receivedAt: Timestamp;
  carrier: CarrierName | null;
  trackingNumber?: string;
  lineItems: ReceivingLineItem[];
  notes?: string;
  createdAt: Timestamp;
}

// ─────────────────────────────────────────────
// PURCHASING — INVOICES
// ─────────────────────────────────────────────

export type InvoiceMatchStatus =
  | 'unmatched'
  | 'matched'
  | 'exception'
  | 'credit_pending';

export interface InvoiceLineItem {
  lineId: string;
  rawDescription: string;
  productId: string | null;
  resolvedName: string;
  isFee: boolean;                       // true = delivery charge, fuel surcharge, etc.
  // Bill Doran parent/child structure
  isParent: boolean;
  parentLineId: string | null;
  quantity: number | null;
  unit: string | null;
  unitCost: number;
  totalCost: number;
  matchedPOLineId: string | null;
  matchedReceivingLineId: string | null;
  variance: number | null;              // totalCost - PO expected cost
}

export interface InvoiceRecord {
  id: string;
  poId: string | null;                  // null until matched
  vendorId: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: Timestamp | null;
  dueDate: Timestamp | null;

  lineItems: InvoiceLineItem[];

  subtotal: number;
  taxAmount: number;
  totalAmount: number;

  matchStatus: InvoiceMatchStatus;
  matchedBy: string | null;             // uid
  matchedAt: Timestamp | null;

  // Source
  sourceEmail: string | null;           // raw email subject
  helpScoutThreadId: string | null;
  attachmentUrls: string[];             // GCS URLs for PDF invoices

  // Komet-specific
  kometInvoiceNumber: string | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─────────────────────────────────────────────
// PURCHASING — CREDIT MEMOS
// ─────────────────────────────────────────────

export type CreditMemoStatus =
  | 'draft'             // warehouse submitted, buyer hasn't reviewed
  | 'buyer_review'      // buyer is adjusting amounts
  | 'approved'          // buyer approved, ready to send
  | 'sent'              // sent to vendor/carrier
  | 'resolved';         // credit received

export type CreditMemoRecipientType = 'vendor' | 'carrier';

export interface CreditMemoLineItem {
  lineId: string;
  invoiceLineId: string;
  productId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  creditAmount: number;
  reason: string;
  photoUrls: string[];
}

export interface CreditMemoRecord {
  id: string;
  poId: string;
  invoiceId: string;
  vendorId: string;

  recipientType: CreditMemoRecipientType;
  recipientVendorId?: string;
  recipientCarrier?: CarrierName;

  lineItems: CreditMemoLineItem[];

  totalCredit: number;
  status: CreditMemoStatus;

  submittedBy: string;                  // warehouse uid
  submittedAt: Timestamp;
  reviewedBy: string | null;            // buyer uid
  reviewedAt: Timestamp | null;
  sentBy: string | null;
  sentAt: Timestamp | null;

  helpScoutThreadId: string | null;
  notes?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─────────────────────────────────────────────
// RECIPE GUIDE — RECIPES
// ─────────────────────────────────────────────

export type RecipeStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'archived';

export interface RecipeIngredient {
  ingredientId: string;                 // uuid
  productId: string;
  productName: string;                  // denormalized
  quantity: number;
  unit: string;
  notes?: string;
}

export interface RecipeRecord {
  id: string;
  name: string;
  description?: string;
  tagIds: string[];
  status: RecipeStatus;

  ingredients: RecipeIngredient[];

  // Pricing snapshot (calculated on save for margin reports)
  totalCost: number | null;
  retailPrice: number | null;
  margin: number | null;
  cogs: number | null;

  // Photos
  photoUrls: string[];                  // GCS URLs

  // Workflow
  createdBy: string;
  approvedBy: string | null;
  approvedAt: Timestamp | null;

  // Seasonal
  seasonalStart?: string;               // MM-DD
  seasonalEnd?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─────────────────────────────────────────────
// RECIPE GUIDE — TAGS
// ─────────────────────────────────────────────

export interface TagRecord {
  id: string;
  name: string;                         // e.g. "Wedding", "Sympathy", "Summer"
  color?: string;                       // hex color for UI chips
  createdAt: Timestamp;
}

// ─────────────────────────────────────────────
// RECIPE GUIDE — PRICING (synced from Google Sheet)
// ─────────────────────────────────────────────

export type PricingTab =
  | 'Flowers'
  | 'Fillers'
  | 'Containers'
  | 'Accents'
  | 'Hardgoods'
  | 'Plants';

export interface PricingRecord {
  id: string;                           // matches products/{productId}
  productName: string;
  tab: PricingTab;
  retailPrice: number | null;
  marketPrice: boolean;
  lastSyncedAt: Timestamp;
  sheetRowIndex: number;                // for debugging sync issues
}

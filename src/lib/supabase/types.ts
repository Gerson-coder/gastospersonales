// TODO: replace with generated types from `supabase gen types typescript --linked`
// once the remote DB is provisioned. This hand-rolled skeleton mirrors
// `supabase/migrations/00001_schema.sql` so the typed clients compile in the
// meantime.
//
// Notes for future-me:
//   - `__InternalSupabase: { PostgrestVersion: "12" }` is required by
//     `@supabase/postgrest-js` v2.45+ — without it, `.insert/.update/.upsert`
//     are typed as `never` and every CRUD call refuses to compile.
//   - Each table MUST include `Relationships: readonly []` (the postgrest
//     `GenericTable` shape requires it). We use empty arrays because the
//     generated client doesn't auto-infer FKs without the introspection step.

export type Currency = "PEN" | "USD";
export type AccountType = "cash" | "card" | "bank" | "yape" | "plin";
/**
 * Optional product type WITHIN an institution. Set on accounts where the
 * user keeps multiple products under one bank (sueldo + dólares + crédito
 * under "BCP", say). Null = no subtype, the row renders bare. Mirrors
 * the CHECK constraint in migration 00013.
 */
export type AccountSubtype =
  | "sueldo"
  | "corriente"
  | "ahorro"
  | "dolares"
  | "credito"
  | "debito";
export type CategoryKind = "expense" | "income";
export type TransactionSource = "manual" | "ocr";
export type OcrStatus = "pending" | "processing" | "completed" | "failed";
export type OcrPipelineSource =
  | "yape"
  | "plin"
  | "bbva"
  | "bcp"
  | "unknown";
export type OcrPipelineModel = "gpt-4o-mini" | "gpt-4o";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          default_currency: Currency;
          locale: string;
          timezone: string;
          display_name: string | null;
          avatar_url: string | null;
          // Added by migration 00021_auth_pin_otp.sql for the new
          // PIN+OTP register flow. Optional on all existing rows.
          full_name: string | null;
          birth_date: string | null;
          phone: string | null;
          email_verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: AccountType;
          currency: Currency;
          subtype: AccountSubtype | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["accounts"]["Row"]> & {
          user_id: string;
          name: string;
          type: AccountType;
          currency: Currency;
        };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Row"]>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          // NULL → system category visible to every authenticated user.
          user_id: string | null;
          name: string;
          kind: CategoryKind;
          color: string | null;
          icon: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["categories"]["Row"]> & {
          name: string;
          kind: CategoryKind;
        };
        Update: Partial<Database["public"]["Tables"]["categories"]["Row"]>;
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          // category_id is `references categories on delete set null`, so it is nullable.
          category_id: string | null;
          // merchant_id is `references merchants on delete set null`, so it is nullable.
          // Added manually to unblock the merchants-picker frontend; will be
          // overwritten when this file is regenerated via
          // `supabase gen types typescript --linked` after migration 00006.
          merchant_id: string | null;
          kind: CategoryKind;
          amount_minor: number;
          currency: Currency;
          occurred_at: string;
          note: string | null;
          source: TransactionSource;
          receipt_id: string | null;
          transfer_group_id: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["transactions"]["Row"]> & {
          user_id: string;
          account_id: string;
          kind: CategoryKind;
          amount_minor: number;
          currency: Currency;
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Row"]>;
        Relationships: [];
      };
      // Manually added ahead of `supabase gen types typescript --linked` so
      // the `merchants-picker` frontend can compile against migrations
      // 00006 + 00008 before they land in the remote DB. Regenerate this
      // file once the migrations are applied to keep these in sync.
      merchants: {
        Row: {
          id: string;
          // NULL → system merchant visible to every authenticated user.
          user_id: string | null;
          category_id: string;
          name: string;
          // Added by 00008_merchants_logo_slug.sql. Maps to a static SVG
          // at /public/logos/merchants/{logo_slug}.svg; NULL → render the
          // initials avatar at runtime.
          logo_slug: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["merchants"]["Row"]> & {
          category_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["merchants"]["Row"]>;
        Relationships: [];
      };
      receipts: {
        Row: {
          id: string;
          user_id: string;
          image_path: string;
          ocr_status: OcrStatus;
          // jsonb — opaque payload from the OCR provider.
          ocr_raw: unknown;
          parsed_merchant: string | null;
          parsed_total_minor: number | null;
          parsed_currency: Currency | null;
          parsed_occurred_at: string | null;
          parsed_category_suggestion: string | null;
          confidence: number | null;
          linked_transaction_id: string | null;
          error_message: string | null;
          // Added in migration 00022 — the OCR pipeline classifies the
          // receipt source, picks the model, and stamps a 90-day TTL.
          source: OcrPipelineSource | null;
          model_used: OcrPipelineModel | null;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["receipts"]["Row"]> & {
          user_id: string;
          image_path: string;
        };
        Update: Partial<Database["public"]["Tables"]["receipts"]["Row"]>;
        Relationships: [];
      };
      exchange_rates: {
        Row: {
          date: string;
          base: Currency;
          quote: Currency;
          rate: number;
        };
        Insert: Database["public"]["Tables"]["exchange_rates"]["Row"];
        Update: Partial<Database["public"]["Tables"]["exchange_rates"]["Row"]>;
        Relationships: [];
      };
      allowed_emails: {
        Row: {
          email: string;
          invited_by: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: Partial<
          Database["public"]["Tables"]["allowed_emails"]["Row"]
        > & {
          email: string;
        };
        Update: Partial<Database["public"]["Tables"]["allowed_emails"]["Row"]>;
        Relationships: [];
      };
      // ─── Added by migration 00021_auth_pin_otp.sql ─────────────────
      user_pins: {
        Row: {
          user_id: string;
          pin_hash: string;
          set_at: string;
          failed_attempts: number;
          locked_until: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["user_pins"]["Row"]> & {
          user_id: string;
          pin_hash: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_pins"]["Row"]>;
        Relationships: [];
      };
      trusted_devices: {
        Row: {
          id: string;
          user_id: string;
          fingerprint_hash: string;
          device_name: string;
          trusted_at: string;
          last_seen_at: string;
        };
        Insert: Partial<
          Database["public"]["Tables"]["trusted_devices"]["Row"]
        > & {
          user_id: string;
          fingerprint_hash: string;
          device_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["trusted_devices"]["Row"]>;
        Relationships: [];
      };
      auth_otps: {
        Row: {
          id: string;
          user_id: string;
          code_hash: string;
          purpose: "email_verification" | "new_device" | "pin_reset";
          expires_at: string;
          used_at: string | null;
          attempts: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["auth_otps"]["Row"]> & {
          user_id: string;
          code_hash: string;
          purpose: "email_verification" | "new_device" | "pin_reset";
          expires_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["auth_otps"]["Row"]>;
        Relationships: [];
      };
      auth_attempts: {
        Row: {
          id: string;
          user_id: string | null;
          ip: string | null;
          action: "pin" | "password" | "otp";
          succeeded: boolean;
          occurred_at: string;
        };
        Insert: Partial<
          Database["public"]["Tables"]["auth_attempts"]["Row"]
        > & {
          action: "pin" | "password" | "otp";
          succeeded: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["auth_attempts"]["Row"]>;
        Relationships: [];
      };
      // ─── Added by migration 00023_budgets_goals.sql ────────────────
      budgets: {
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          limit_minor: number;
          currency: Currency;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["budgets"]["Row"]> & {
          user_id: string;
          category_id: string;
          limit_minor: number;
          currency: Currency;
        };
        Update: Partial<Database["public"]["Tables"]["budgets"]["Row"]>;
        Relationships: [];
      };
      goals: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          target_minor: number;
          current_minor: number;
          currency: Currency;
          deadline: string | null;
          icon: string;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["goals"]["Row"]> & {
          user_id: string;
          name: string;
          target_minor: number;
          currency: Currency;
        };
        Update: Partial<Database["public"]["Tables"]["goals"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      list_mru_merchants: {
        Args: {
          p_category_id: string;
          p_limit?: number;
        };
        Returns: Database["public"]["Tables"]["merchants"]["Row"][];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

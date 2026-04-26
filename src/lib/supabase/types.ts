// TODO: replace with generated types from `supabase gen types typescript --linked`
// once the remote DB is provisioned. This hand-rolled skeleton mirrors
// `supabase/migrations/00001_schema.sql` so the typed clients compile in the
// meantime.

export type Currency = "PEN" | "USD";
export type AccountType = "cash" | "card" | "bank";
export type CategoryKind = "expense" | "income";
export type TransactionSource = "manual" | "ocr";
export type OcrStatus = "pending" | "processing" | "completed" | "failed";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          default_currency: Currency;
          locale: string;
          timezone: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      accounts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: AccountType;
          currency: Currency;
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
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          // category_id is `references categories on delete set null`, so it is nullable.
          category_id: string | null;
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
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["receipts"]["Row"]> & {
          user_id: string;
          image_path: string;
        };
        Update: Partial<Database["public"]["Tables"]["receipts"]["Row"]>;
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
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

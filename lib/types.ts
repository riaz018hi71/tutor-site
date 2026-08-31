export interface Suggestion {
  id: string;
  title: string;
  description: string;
  price: number;
  cover_image: string;
  topic: string;
  preview_content: string;
  main_pdf_url: string;
  pdf_url?: string | null;
  cover_image_url?: string | null;
  created_at?: string;
}

export type Order = {
  id: string;
  suggestion_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  payment_method: 'bKash' | 'Nagad' | 'Bank';
  sender_number: string;
  trx_id: string;
  status: 'Pending' | 'Success' | 'Rejected';
  created_at: string;
  suggestions?: Suggestion;
}

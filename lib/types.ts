export type Suggestion = {
  id: string
  title: string
  price: number
  topic: string
  preview_content: string | null
  pdf_url: string | null
  cover_image_url: string | null
  created_at: string
}

export type Order = {
  id: string
  suggestion_id: string
  customer_name: string
  customer_email: string
  customer_phone: string
  payment_method: 'bKash' | 'Nagad' | 'Bank'
  sender_number: string
  trx_id: string
  status: 'Pending' | 'Success' | 'Rejected'
  created_at: string
  suggestions?: Suggestion
}
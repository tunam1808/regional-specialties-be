// src/models/productReview.model.ts

export interface ProductReview {
  id?: number;
  MaSP: number;
  user_id: number;
  rating: number;
  comment?: string;
  images?: string[];
  created_at?: Date;
  updated_at?: Date;
}

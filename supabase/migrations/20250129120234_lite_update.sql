-- Add is_lite column to channels table
ALTER TABLE public.channels
ADD COLUMN is_lite boolean NOT NULL DEFAULT false;

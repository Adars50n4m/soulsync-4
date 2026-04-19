-- Migration: Add sender_name to messages
-- Created: 2026-04-16

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'messages' AND COLUMN_NAME = 'sender_name') THEN
        ALTER TABLE public.messages ADD COLUMN sender_name TEXT;
    END IF;
END $$;

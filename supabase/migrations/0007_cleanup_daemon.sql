-- supabase/migrations/0007_cleanup_daemon.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- CLEANUP DAEMON SUPPORT
-- This migration adds functions to support purging old messages and media
-- from the server to keep storage costs at effectively zero.
-- ─────────────────────────────────────────────────────────────────────────────

-- Function to find and return "expired" media keys and message IDs
-- Usage: SELECT * FROM get_expired_content('5 minutes');
CREATE OR REPLACE FUNCTION get_expired_content(view_window interval DEFAULT '30 minutes')
RETURNS TABLE (
    msg_id text,
    media_url text,
    media_thumbnail text
) AS $$
BEGIN
    RETURN QUERY
    SELECT id, m.media_url, m.media_thumbnail
    FROM messages m
    WHERE created_at < (NOW() - view_window)
    AND status != 'pending'; -- Don't delete messages that are still in flight or failed
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to purge these messages after media has been deleted by an external worker
CREATE OR REPLACE FUNCTION purge_expired_messages(view_window interval DEFAULT '30 minutes')
RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM messages
    WHERE created_at < (NOW() - view_window)
    AND status != 'pending';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

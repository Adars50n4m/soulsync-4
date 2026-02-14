import { supabase } from '../config/supabase';

export interface ChatMessage {
    id: string;
    sender_id: string;
    receiver_id: string;
    text: string;
    timestamp: string;
    status: 'sent' | 'delivered' | 'read';
    media?: {
        type: 'image' | 'video' | 'file' | 'status_reply';
        url: string;
        name?: string;
        caption?: string;
    };
    reply_to?: string;
    reactions?: string[];
}

type MessageCallback = (message: ChatMessage) => void;
type StatusCallback = (messageId: string, status: 'delivered' | 'read') => void;

class ChatService {
    private channel: ReturnType<typeof supabase.channel> | null = null;
    private userId: string | null = null;
    private partnerId: string | null = null;
    private onNewMessage: MessageCallback | null = null;
    private onStatusUpdate: StatusCallback | null = null;
    private isInitialized: boolean = false;

    /**
     * Initialize the chat service for a specific user pair
     */
    async initialize(
        userId: string,
        partnerId: string,
        onMessage: MessageCallback,
        onStatus: StatusCallback
    ): Promise<void> {
        if (this.isInitialized && this.userId === userId && this.partnerId === partnerId) {
            return;
        }

        this.userId = userId;
        this.partnerId = partnerId;
        this.onNewMessage = onMessage;
        this.onStatusUpdate = onStatus;

        // Fetch missed messages
        await this.fetchMissedMessages();

        // Subscribe to database changes (Realtime)
        // We simplified this to remove filters that were causing "mismatch" errors on some Postgres setups
        const channelName = `chat_global_${userId}`; // Use a more stable channel name
        this.channel = supabase.channel(channelName);

        this.channel
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                },
                (payload) => {
                    const newMessage = this.mapDbMessageToChatMessage(payload.new);
                    
                    // Filter messages sent TO us by the CURRENT partner
                    if (newMessage.receiver_id === this.userId && newMessage.sender_id === this.partnerId) {
                        console.log('[ChatService] Received new message for current chat:', newMessage);
                        this.onNewMessage?.(newMessage);
                        this.updateMessageStatus(newMessage.id, 'delivered');
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'messages',
                },
                (payload) => {
                    const updated = payload.new;
                    // Filter updates for messages WE sent
                    if (updated.sender === this.userId && updated.status) {
                        this.onStatusUpdate?.(updated.id.toString(), updated.status);
                    }
                }
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    this.isInitialized = true;
                    console.log('[ChatService] Subscribed to Realtime messages');
                }
                if (err) console.warn('[ChatService] Realtime subscription warning:', err);
            });
    }

    /**
     * Fetch unread/missed messages from DB
     */
    private async fetchMissedMessages() {
        if (!this.userId || !this.partnerId) return;

        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender.eq.${this.partnerId},receiver.eq.${this.userId}),and(sender.eq.${this.userId},receiver.eq.${this.partnerId})`)
            .order('created_at', { ascending: true })
            .limit(50); // Fetch last 50 messages

        if (error) {
            console.error('Error fetching history:', error);
            return;
        }

        if (data) {
            // Notify listener (UI) about these messages 
            // NOTE: In a real app, we might return these to be set in state, 
            // but here we can simulate "receiving" them or just letting the UI load from a separate fetch.
            // For now, let's just let the UI fetch history explicitly if needed, 
            // or we can just emit them?
            // Actually AppContext usually fetches history on load.
            // So this might be redundant if AppContext does it. 
            // Let's assume AppContext handles initial load, this just handles realtime.
        }
    }

    /**
     * Send a message to the chat partner (INSERT into DB)
     */
    async sendMessage(text: string, media?: ChatMessage['media'], replyTo?: string): Promise<ChatMessage | null> {
        if (!this.userId || !this.partnerId) return null;

        const tempId = Date.now().toString();
        const timestamp = new Date().toISOString();

        const messageData = {
            sender: this.userId,
            receiver: this.partnerId,
            text,
            media_type: media?.type || null,
            media_url: media?.url || null,
            media_caption: media?.caption || null,
            reply_to_id: replyTo || null,
            created_at: timestamp
        };


        const { data, error } = await supabase
            .from('messages')
            .insert(messageData)
            .select()
            .single();

        if (error) {
            console.error('Failed to send message:', error);
            return null;
        }

        const sentMessage = this.mapDbMessageToChatMessage(data);
        return sentMessage;
    }

    /**
     * Update message status (delivered/read)
     */
    async updateMessageStatus(messageId: string, status: 'delivered' | 'read'): Promise<void> {
        try {
            await supabase
                .from('messages')
                .update({ status })
                .eq('id', messageId);
        } catch (e) {
            console.warn('Failed to update message status (column likely missing):', e);
        }
    }

    /**
     * Map DB row to ChatMessage interface
     */
    private mapDbMessageToChatMessage(dbRow: any): ChatMessage {
        return {
            id: dbRow.id.toString(),
            sender_id: dbRow.sender,
            receiver_id: dbRow.receiver,
            text: dbRow.text,
            timestamp: dbRow.created_at,
            status: dbRow.status || 'sent',
            media: dbRow.media_url ? {
                type: dbRow.media_type || 'image',
                url: dbRow.media_url,
                caption: dbRow.media_caption
            } : undefined,
            reply_to: dbRow.reply_to_id?.toString(),
            reactions: dbRow.reaction ? [dbRow.reaction] : undefined
        };
    }


    /**
     * Cleanup
     */
    cleanup(): void {
        if (this.channel) {
            this.channel.unsubscribe();
            this.channel = null;
        }
        this.isInitialized = false;
        this.userId = null;
        this.partnerId = null;
    }
}

export const chatService = new ChatService();

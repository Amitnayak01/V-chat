import { memo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Check, CheckCheck, Pin, BellOff, Archive } from 'lucide-react';

const ChatList = memo(({
  conversations = [],
  selectedConversation,
  onSelectConversation,
  onlineUsers,
  currentUserId,
}) => {
  if (!Array.isArray(conversations)) return null;

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    try {
      const d = new Date(timestamp);
      const now = new Date();
      const diffMs = now - d;
      const diffDays = Math.floor(diffMs / 86_400_000);
      if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7)  return d.toLocaleDateString([], { weekday: 'short' });
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch { return ''; }
  };

  const getLastMessagePreview = (conv) => {
    if (!conv?.lastMessage) return <span className="text-slate-400 italic">No messages yet</span>;

    const { content, type, sender } = conv.lastMessage;
    const isMyMessage = sender?._id === currentUserId || sender === currentUserId;
    const prefix = isMyMessage ? 'You: ' : '';

    const typeIcons = { image: '🖼 Photo', file: '📎 File', audio: '🎤 Voice', video: '🎥 Video', 'video-call': '📞 Call' };
    if (type && type !== 'text' && typeIcons[type]) {
      return <>{prefix}<span className="italic">{typeIcons[type]}</span></>;
    }
    if (!content) return <span className="text-slate-400 italic">Message deleted</span>;
    return `${prefix}${content.length > 45 ? content.slice(0, 45) + '…' : content}`;
  };

  const getStatusTick = (conv) => {
    if (!conv?.lastMessage) return null;
    const isMyMessage = conv.lastMessage?.sender?._id === currentUserId || conv.lastMessage?.sender === currentUserId;
    if (!isMyMessage) return null;
    return null; // Could track delivery status here if stored
  };

  return (
    <div className="divide-y divide-slate-100">
      {conversations.map((conv) => {
        if (!conv) return null;

        const isSelected  = selectedConversation?.conversationId === conv.conversationId;
        const isOnline    = conv?.user?._id ? onlineUsers?.has?.(conv.user._id) : false;
        const hasUnread   = (conv.unreadCount || 0) > 0;
        const isPinned    = conv.isPinned;
        const isMuted     = conv.isMuted;

        const timestamp = conv.lastMessage?.timestamp || conv.lastActivityAt || conv.updatedAt;

        return (
          <button
            key={conv.conversationId}
            onClick={() => onSelectConversation?.(conv)}
            className={`
              w-full px-4 py-3.5 flex items-center gap-3 transition-all text-left relative
              ${isSelected
                ? 'bg-primary-50 border-l-[3px] border-l-primary-600'
                : 'hover:bg-slate-50 border-l-[3px] border-l-transparent'
              }
              ${hasUnread && !isSelected ? 'bg-blue-50/40' : ''}
            `}
          >
            {/* Pinned indicator */}
            {isPinned && !isSelected && (
              <Pin className="absolute top-2 right-2 w-3 h-3 text-slate-400" fill="currentColor" />
            )}

            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {conv.user?.avatar ? (
                <img
                  src={conv.user.avatar}
                  alt={conv.user.username}
                  className="w-12 h-12 rounded-full object-cover shadow-sm"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                  {conv.user?.username?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              {isOnline && (
                <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow-sm" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  {isPinned && (
                    <Pin className="w-3 h-3 text-slate-400 flex-shrink-0" fill="currentColor" />
                  )}
                  <h3 className={`text-sm truncate leading-tight
                    ${hasUnread ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}
                  >
                    {conv.user?.username || 'Unknown User'}
                  </h3>
                  {isMuted && (
                    <BellOff className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  )}
                </div>

                {timestamp && (
                  <span className={`text-xs ml-2 flex-shrink-0 ${hasUnread ? 'text-primary-600 font-semibold' : 'text-slate-400'}`}>
                    {formatTime(timestamp)}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className={`text-xs truncate leading-tight
                  ${hasUnread ? 'font-medium text-slate-700' : 'text-slate-500'}`}
                >
                  {getLastMessagePreview(conv)}
                </p>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Unread badge */}
                  {hasUnread && !isMuted && (
                    <span className="min-w-[18px] h-[18px] px-1 bg-primary-600 text-white text-[10px] rounded-full font-bold flex items-center justify-center">
                      {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                    </span>
                  )}
                  {hasUnread && isMuted && (
                    <span className="min-w-[18px] h-[18px] px-1 bg-slate-400 text-white text-[10px] rounded-full font-bold flex items-center justify-center">
                      {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>

              {/* Presence last seen (only show if not online and not selected) */}
              {!isOnline && !isSelected && conv.user?.lastSeen && (
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                  {(() => {
                    try { return formatDistanceToNow(new Date(conv.user.lastSeen), { addSuffix: true }); }
                    catch { return ''; }
                  })()}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
});

ChatList.displayName = 'ChatList';
export default ChatList;
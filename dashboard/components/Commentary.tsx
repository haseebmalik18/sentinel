import { MessageSquare, Info, AlertTriangle, XCircle, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';

interface ActivityMessage {
  id: string;
  timestamp: number;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

interface ActivityLogProps {
  messages: ActivityMessage[];
}

export default function ActivityLog({ messages }: ActivityLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const getIcon = (type: ActivityMessage['type']) => {
    switch (type) {
      case 'info': return <Info className="w-3.5 h-3.5 text-blue-500" />;
      case 'warning': return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
      case 'error': return <XCircle className="w-3.5 h-3.5 text-red-500" />;
      case 'success': return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      setTimeout(checkScroll, 300);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900">Activity Log</h2>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className={`p-1 rounded transition-all ${
              canScrollLeft
                ? 'hover:bg-slate-100 text-slate-600 cursor-pointer'
                : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className={`p-1 rounded transition-all ${
              canScrollRight
                ? 'hover:bg-slate-100 text-slate-600 cursor-pointer'
                : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex gap-3 overflow-x-auto pb-2 scroll-smooth"
          style={{ scrollbarWidth: 'thin' }}
        >
          {messages.slice(0, 8).map((msg) => (
            <div
              key={msg.id}
              className="shrink-0 border border-slate-200 rounded-lg px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors min-w-75"
            >
              <div className="flex items-start gap-2.5">
                {getIcon(msg.type)}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-700 leading-relaxed">{msg.message}</div>
                  <div className="text-xs text-slate-400 mt-1" suppressHydrationWarning>
                    {formatTime(msg.timestamp)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

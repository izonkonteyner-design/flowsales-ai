"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { Bell, X, Check, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Notification } from '@/lib/notifications';
import { NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPE_ICONS } from '@/lib/notifications';

const TYPE_ICONS = {
  AlertTriangle: ({ className }: { className?: string }) => <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'/><line x1='12' y1='9' x2='12' y2='13'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg>,
  Clock: ({ className }: { className?: string }) => <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><circle cx='12' cy='12' r='10'/><polyline points='12 6 12 12 16 14'/></svg>,
  AlertCircle: ({ className }: { className?: string }) => <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><circle cx='12' cy='12' r='10'/><line x1='12' y1='8' x2='12' y2='12'/><line x1='12' y1='16' x2='12.01' y2='16'/></svg>,
  UserCheck: ({ className }: { className?: string }) => <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><polyline points='17 11 19 13 23 9'/></svg>,
  Zap: ({ className }: { className?: string }) => <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><polygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2'/></svg>,
  Bot: ({ className }: { className?: string }) => <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><rect x='2' y='3' width='20' height='18' rx='2' ry='2'/><line x1='9' y1='9' x2='9.01' y2='9'/><line x1='15' y1='9' x2='15.01' y2='9'/><path d='M9 15h6'/></svg>,
} as const;

interface NotificationBellProps {
  initialUnreadCount?: number;
}

export function NotificationBell({ initialUnreadCount = 0 }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellButtonRef = useRef<HTMLButtonElement>(null);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/notifications?limit=20');
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unread_count);
      } else {
        setError('Failed to load notifications');
      }
    } catch {
      setError('Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'PATCH',
      });
      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch {
      console.error('Failed to mark notification as read');
    }
  };

  const markAllAsRead = async () => {
    try {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications((prev) => prev.map((n) => ({ ...n, read_at: new Date().toISOString() })));
        setUnreadCount(0);
      }
    } catch {
      console.error('Failed to mark all notifications as read');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          bellButtonRef.current && !bellButtonRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  const getIcon = (type: Notification['type']) => {
    const Icon = TYPE_ICONS[NOTIFICATION_TYPE_ICONS[type] as keyof typeof TYPE_ICONS];
    return Icon ? <Icon className='h-4 w-4' /> : <Bell className='h-4 w-4' />;
  };

  const getEntityLink = (notification: Notification) => {
    if (!notification.entity_id) return null;
    switch (notification.entity_type) {
      case 'lead': return '/leads';
      case 'quote': return '/quotes';
      case 'task': return '/tasks';
      case 'customer': return '/customers';
      default: return null;
    }
  };

  return (
    <div className='relative'>
      <button
        ref={bellButtonRef}
        type='button'
        className='relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10'
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        aria-expanded={isOpen}
        aria-haspopup='true'
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <Bell className='h-4 w-4' />
        {unreadCount > 0 && (
          <span className='absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-medium'>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className='absolute right-0 mt-2 w-80 max-w-[360px] rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900'
          role='menu'
          aria-label='Notifications'
        >
          <div className='flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10'>
            <h3 className='font-semibold text-slate-950 dark:text-white'>Notifications</h3>
            <div className='flex items-center gap-2'>
              {unreadCount > 0 && (
                <Button
                  variant='ghost'
                  size='sm'
                  className='text-xs'
                  onClick={markAllAsRead}
                >
                  <Check className='h-3 w-3 mr-1' />
                  Mark all read
                </Button>
              )}
              <button
                type='button'
                className='p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/10'
                onClick={() => setIsOpen(false)}
                aria-label='Close notifications'
              >
                <X className='h-4 w-4' />
              </button>
            </div>
          </div>

          <div className='max-h-[400px] overflow-y-auto'>
            {isLoading && (
              <div className='flex items-center justify-center py-8'>
                <Loader2 className='h-6 w-6 animate-spin text-slate-400' />
              </div>
            )}

            {error && (
              <div className='px-4 py-3 text-center text-sm text-red-600 dark:text-red-400'>
                {error}
              </div>
            )}

            {!isLoading && !error && notifications.length === 0 && (
              <div className='px-4 py-8 text-center text-slate-500 dark:text-slate-400'>
                No notifications yet
              </div>
            )}

            {!isLoading && !error && notifications.length > 0 && (
              <ul className='divide-y divide-slate-200 dark:divide-white/10' role='list'>
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <Link
                      href={getEntityLink(notification) || '#'}
                      className={cn(
                        'flex items-start gap-3 px-4 py-3 transition-colors',
                        !notification.read_at ? 'bg-slate-50 dark:bg-white/5' : 'hover:bg-slate-50 dark:hover:bg-white/5'
                      )}
                      onClick={(e) => {
                        if (!notification.read_at) {
                          e.preventDefault();
                          markAsRead(notification.id);
                          const href = getEntityLink(notification);
                          if (href) setTimeout(() => window.location.href = href, 0);
                        }
                      }}
                    >
                      <div className='flex-shrink-0 mt-0.5 text-slate-400'>
                        {getIcon(notification.type)}
                      </div>
                      <div className='flex-1 min-w-0'>
                        <p className={cn(
                          'text-sm font-medium text-slate-950 dark:text-white',
                          !notification.read_at && 'font-semibold'
                        )}>
                          {NOTIFICATION_TYPE_LABELS[notification.type]}
                        </p>
                        <p className='text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2'>
                          {notification.message}
                        </p>
                        <p className='text-xs text-slate-400 mt-1'>
                          {new Date(notification.created_at).toLocaleString()}
                        </p>
                      </div>
                      {!notification.read_at && (
                        <span className='flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-1.5' />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

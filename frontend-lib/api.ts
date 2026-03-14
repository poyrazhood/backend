// lib/api.ts — Tecrübelerim Frontend API Client

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

export const getToken  = () => typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
export const setToken  = (t: string) => localStorage.setItem('auth_token', t)
export const removeToken = () => localStorage.removeItem('auth_token')

async function api<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Sunucu hatası' }))
    throw new ApiError(res.status, err.error || err.message || 'Hata')
  }
  return res.json()
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message); this.name = 'ApiError'
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const auth = {
  register: (d: { email: string; username: string; password: string; fullName?: string }) =>
    api<{ token: string; user: User }>('/auth/register', { method: 'POST', body: JSON.stringify(d) }),
  login: (d: { identifier: string; password: string }) =>
    api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(d) }),
  me: () => api<{ user: User }>('/auth/me'),
  changePassword: (d: { currentPassword: string; newPassword: string }) =>
    api('/auth/password', { method: 'PATCH', body: JSON.stringify(d) }),
}

// ── Businesses ────────────────────────────────────────────────────────────────
export const businesses = {
  list: (p?: Record<string, string | number>) => {
    const qs = p ? '?' + new URLSearchParams(p as Record<string, string>).toString() : ''
    return api<{ data: Business[]; pagination: Pagination }>(`/businesses${qs}`)
  },
  get:     (slug: string) => api<Business>(`/businesses/${slug}`),
  reviews: (id: string, p?: Record<string, string | number>) => {
    const qs = p ? '?' + new URLSearchParams(p as Record<string, string>).toString() : ''
    return api<{ data: Review[]; pagination: Pagination }>(`/businesses/${id}/reviews${qs}`)
  },
  claim: (id: string, d?: { documents?: string[]; notes?: string }) =>
    api(`/businesses/${id}/claim`, { method: 'POST', body: JSON.stringify(d || {}) }),
}

// ── Reviews ───────────────────────────────────────────────────────────────────
export const reviews = {
  create: (d: { businessId: string; rating: number; content: string; title?: string; photoUrls?: string[] }) =>
    api<Review>('/reviews', { method: 'POST', body: JSON.stringify(d) }),
  update: (id: string, d: { rating?: number; title?: string; content?: string }) =>
    api<Review>(`/reviews/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  delete: (id: string) => api(`/reviews/${id}`, { method: 'DELETE' }),
  vote:   (id: string, isHelpful: boolean) =>
    api(`/reviews/${id}/vote`, { method: 'POST', body: JSON.stringify({ isHelpful }) }),
  report: (id: string, d: { reason: string; description?: string }) =>
    api(`/reviews/${id}/report`, { method: 'POST', body: JSON.stringify(d) }),
  mine: (page = 1) => api<{ data: Review[]; pagination: Pagination }>(`/reviews/my-reviews?page=${page}`),
}

// ── Users ─────────────────────────────────────────────────────────────────────
export const users = {
  get:       (username: string) => api<UserProfile>(`/users/${username}`),
  updateMe:  (d: { fullName?: string; avatarUrl?: string; phoneNumber?: string }) =>
    api<{ user: User }>('/users/me', { method: 'PATCH', body: JSON.stringify(d) }),
  follow:    (username: string) => api(`/users/${username}/follow`, { method: 'POST' }),
  followers: (username: string, page = 1) =>
    api<{ data: User[]; pagination: Pagination }>(`/users/${username}/followers?page=${page}`),
  muhtarlar: (p?: { city?: string; limit?: number }) => {
    const qs = p ? '?' + new URLSearchParams(p as Record<string, string>).toString() : ''
    return api<{ data: User[] }>(`/users/leaderboard/muhtarlar${qs}`)
  },
}

// ── Search ────────────────────────────────────────────────────────────────────
export const search = {
  query: (p: { q: string; type?: string; city?: string; page?: number }) => {
    const qs = new URLSearchParams(p as Record<string, string>).toString()
    return api<SearchResults>(`/search?${qs}`)
  },
  suggestions: (q: string) =>
    api<{ suggestions: Suggestion[] }>(`/search/suggestions?q=${encodeURIComponent(q)}`),
  trending: () => api<{ trending: Category[] }>('/search/trending'),
}

// ── Notifications ─────────────────────────────────────────────────────────────
export const notifications = {
  list:        (p?: { page?: number; unreadOnly?: boolean }) => {
    const qs = p ? '?' + new URLSearchParams(p as Record<string, string>).toString() : ''
    return api<NotifResponse>(`/notifications${qs}`)
  },
  unreadCount: () => api<{ count: number }>('/notifications/unread-count'),
  markRead:    (id: string) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => api('/notifications/read-all', { method: 'PATCH' }),
  delete:      (id: string) => api(`/notifications/${id}`, { method: 'DELETE' }),
}

// ── Categories ────────────────────────────────────────────────────────────────
export const categories = {
  list: () => api<{ data: Category[] }>('/categories'),
  get:  (slug: string) => api<Category>(`/categories/${slug}`),
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string; email: string; username: string; fullName?: string; avatarUrl?: string
  trustScore: number; trustLevel: string; badgeLevel: string
  totalReviews: number; helpfulVotes: number; followersCount: number; followingCount: number
  createdAt: string
}
export interface UserProfile extends User {
  reviews: Review[]; isFollowing: boolean
  stats: { helpfulPercentage: string; isVerified: boolean }
}
export interface Business {
  id: string; name: string; slug: string; description?: string
  address: string; city: string; district?: string
  averageRating: number; totalReviews: number
  claimStatus: string; isVerified: boolean; attributes: Record<string, unknown>
  category: Category; reviews?: Review[]; ratingDistribution?: Record<number, number>
}
export interface Review {
  id: string; rating: number; title?: string; content: string
  helpfulCount: number; notHelpfulCount: number; isVerified: boolean; createdAt: string
  user: User; business?: Pick<Business, 'id' | 'name' | 'slug'>
  photos: { url: string }[]
}
export interface Category { id: string; name: string; slug: string; icon?: string; children?: Category[] }
export interface Notification {
  id: string; type: string; title: string; content: string
  isRead: boolean; metadata?: Record<string, unknown>; createdAt: string
}
export interface Pagination { page: number; limit: number; total: number; totalPages: number }
export interface NotifResponse { data: Notification[]; unreadCount: number; pagination: Pagination }
export interface SearchResults {
  query: string
  businesses?: Business[]; businessTotal?: number
  users?: User[];          userTotal?: number
  reviews?: Review[];      reviewTotal?: number
}
export interface Suggestion { type: string; id: string; label: string; sublabel?: string; href: string }

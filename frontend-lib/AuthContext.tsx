'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { auth, getToken, setToken, removeToken, type User } from './api'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (identifier: string, password: string) => Promise<void>
  register: (d: { email: string; username: string; password: string; fullName?: string }) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (getToken()) {
      auth.me()
        .then(res => setUser(res.user))
        .catch(() => removeToken())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (identifier: string, password: string) => {
    const res = await auth.login({ identifier, password })
    setToken(res.token)
    setUser(res.user)
  }

  const register = async (d: Parameters<typeof auth.register>[0]) => {
    const res = await auth.register(d)
    setToken(res.token)
    setUser(res.user)
  }

  const logout = () => { removeToken(); setUser(null) }

  const refreshUser = async () => {
    const res = await auth.me()
    setUser(res.user)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalıdır.')
  return ctx
}

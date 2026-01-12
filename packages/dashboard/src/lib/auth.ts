import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import type { NextAuthConfig } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

// JWT Payload interface for type-safe token handling
interface JWTPayload extends JWT {
  id?: string;
  accountId?: string;
  accountName?: string;
  accountPlan?: 'free' | 'pro' | 'enterprise';
  accountRole?: 'owner' | 'admin' | 'editor' | 'viewer';
  accessToken?: string;
  selectedAppId?: string;
}

// Extended session types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string;
    };
    account?: {
      id: string;
      name: string;
      plan: 'free' | 'pro' | 'enterprise';
      role: 'owner' | 'admin' | 'editor' | 'viewer';
    };
    selectedAppId?: string;
    accessToken?: string;
  }

  interface User {
    id: string;
    email: string;
    name: string;
    image?: string;
    accountId?: string;
    accountName?: string;
    accountPlan?: 'free' | 'pro' | 'enterprise';
    accountRole?: 'owner' | 'admin' | 'editor' | 'viewer';
    accessToken?: string;
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          // Call our API to validate credentials
          const response = await fetch(`${API_URL}/v1/saas/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!response.ok) {
            return null;
          }

          const data = await response.json();

          if (!data.success || !data.data) {
            return null;
          }

          const { user, account, token } = data.data;

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.avatarUrl,
            accountId: account?.id,
            accountName: account?.name,
            accountPlan: account?.plan,
            accountRole: account?.role,
            accessToken: token,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Handle OAuth sign-in (Google)
      if (account?.provider === 'google') {
        try {
          // Call our API to handle OAuth user
          const response = await fetch(`${API_URL}/v1/saas/oauth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              googleId: account.providerAccountId,
              email: user.email,
              name: user.name,
              image: user.image,
            }),
          });

          if (!response.ok) {
            return false;
          }

          const data = await response.json();
          if (data.success && data.data) {
            // Attach account info and token to user for jwt callback
            user.accountId = data.data.account?.id;
            user.accountName = data.data.account?.name;
            user.accountPlan = data.data.account?.plan;
            user.accountRole = data.data.account?.role;
            user.accessToken = data.data.token;
          }
        } catch {
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      const t = token as JWTPayload;
      // Initial sign in
      if (user) {
        t.id = user.id;
        t.accountId = user.accountId;
        t.accountName = user.accountName;
        t.accountPlan = user.accountPlan;
        t.accountRole = user.accountRole;
        t.accessToken = user.accessToken;
      }

      // Handle session update (e.g., app selection)
      if (trigger === 'update' && session) {
        if (session.selectedAppId !== undefined) {
          t.selectedAppId = session.selectedAppId;
        }
      }

      return token;
    },
    async session({ session, token }) {
      const t = token as JWTPayload;
      session.user.id = t.id ?? '';

      if (t.accountId) {
        session.account = {
          id: t.accountId,
          name: t.accountName ?? '',
          plan: t.accountPlan ?? 'free',
          role: t.accountRole ?? 'viewer',
        };
      }

      if (t.selectedAppId) {
        session.selectedAppId = t.selectedAppId;
      }

      // Expose access token to client
      if (t.accessToken) {
        session.accessToken = t.accessToken;
      }

      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  trustHost: true,
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);

# PROMPT — Construction complète d'une plateforme SaaS de gestion d'entreprise
## Document d'ingénierie pour assistant IA — Niveau senior / Production-ready

---

> **INSTRUCTIONS POUR L'IA**
> Ce document est un brief d'ingénierie complet. Tu dois construire **intégralement**
> l'application décrite ci-dessous, fichier par fichier, en suivant rigoureusement les
> spécifications techniques et fonctionnelles. Aucune fonctionnalité ne doit être laissée
> en placeholder ou "TODO". Chaque module, chaque composant, chaque route doit être
> **100% fonctionnel, typé, testé et prêt pour la production**.

---

## Table des matières

1. [Vision & Objectif](#1-vision--objectif)
2. [Stack Technique](#2-stack-technique)
3. [Architecture Système](#3-architecture-système)
4. [Structure du Projet](#4-structure-du-projet)
5. [Base de Données — Schéma Drizzle](#5-base-de-données--schéma-drizzle)
6. [Authentification & RBAC](#6-authentification--rbac)
7. [API — tRPC Routers](#7-api--trpc-routers)
8. [Modules Fonctionnels](#8-modules-fonctionnels)
9. [Panneau Admin Distance](#9-panneau-admin-distance)
10. [Temps Réel — WebSocket](#10-temps-réel--websocket)
11. [Gestion Fichiers](#11-gestion-fichiers)
12. [UI/UX — Design System](#12-uiux--design-system)
13. [Drag & Drop](#13-drag--drop)
14. [Notifications & Alertes](#14-notifications--alertes)
15. [Assistant IA Intégré](#15-assistant-ia-intégré)
16. [Tests](#16-tests)
17. [Déploiement & DevOps](#17-déploiement--devops)
18. [Standards de Code](#18-standards-de-code)
19. [Checklist de livraison](#19-checklist-de-livraison)

---

## 1. Vision & Objectif

### Nom du produit
**NexaDesk** — Plateforme SaaS de gestion d'entreprise multi-tenant

### Objectif
Construire une plateforme SaaS **B2B multi-tenant** de gestion d'entreprise intégrée,
inspirée des meilleures pratiques des outils comme Notion, Linear, Monday.com et Salesforce,
mais conçue spécifiquement pour les cabinets de conseil, PME et organisations africaines
(conformité OHADA, droit gabonais, FCFA).

### Principes fondamentaux
- **Multi-tenant** : chaque organisation (tenant) a ses données totalement isolées
- **Multi-rôle** : contrôle d'accès granulaire par processus, niveau et habilitation
- **Temps réel** : synchronisation instantanée entre tous les postes connectés
- **100% CRUD** : aucune donnée en lecture seule — tout est éditable, supprimable
- **Modulaire** : chaque module peut être activé/désactivé par tenant
- **Admin distant** : panneau de super-administration accessible hors réseau client
- **Production-ready** : sécurité, performance, observabilité, déploiement Docker

---

## 2. Stack Technique

### Frontend
```
Framework      : Next.js 15 (App Router, Server Components, Server Actions)
Langage        : TypeScript 5.5 — strict mode, zéro `any`
Styles         : Tailwind CSS v4 + CSS Variables
Composants     : shadcn/ui (Radix UI primitives) + composants custom
State global   : Zustand 5 (slices pattern)
Server state   : TanStack Query v5 (React Query)
Formulaires    : React Hook Form v7 + Zod resolvers
Drag & Drop    : @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities
Graphiques     : Recharts 2 + Tremor (dashboards)
Tables         : TanStack Table v8 (virtualisée)
Éditeur texte  : Tiptap 2 (ProseMirror)
Éditeur code   : Monaco Editor
Animations     : Framer Motion 11
Icônes         : Lucide React + Radix Icons
Date/Heure     : date-fns v3
PDF            : @react-pdf/renderer
QR Code        : react-qr-code
Uploads        : UploadThing v7
```

### Backend
```
Runtime        : Node.js 22 LTS
API            : tRPC v11 (type-safe, zod-validated)
HTTP Adapter   : Next.js API routes (App Router) + Hono.js pour WebSocket server
ORM            : Drizzle ORM (PostgreSQL dialect)
Base de données: PostgreSQL 16 (Neon / Supabase / Railway)
Cache          : Redis (Upstash) — sessions, rate limiting, pub/sub
Auth           : Better Auth v1 (JWT + sessions + 2FA + OAuth)
Fichiers       : UploadThing (S3-compatible) + local fallback
Emails         : Resend + React Email templates
Queue          : BullMQ + Redis (jobs asynchrones)
Temps réel     : Socket.io v4 (via Hono server séparé)
Validation     : Zod v3 (shared frontend/backend)
Logging        : Pino + pino-pretty
Monitoring     : OpenTelemetry + Sentry
```

### Outils Dev
```
Monorepo       : Turborepo
Qualité code   : ESLint 9 + Prettier 3 + TypeScript strict
Tests          : Vitest (unit) + Playwright (E2E) + MSW (mocks)
Git hooks      : Husky + lint-staged + commitlint
CI/CD          : GitHub Actions
Conteneurisation: Docker + Docker Compose
```

---

## 3. Architecture Système

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NEXADESK SAAS                                │
│                                                                     │
│  ┌──────────────────────┐      ┌──────────────────────────────┐    │
│  │   Web App (Next.js)  │      │  Admin Dashboard (Next.js)   │    │
│  │   :3000              │      │  :3001 (super-admin distant) │    │
│  └──────────┬───────────┘      └──────────────┬───────────────┘    │
│             │                                  │                    │
│  ┌──────────▼──────────────────────────────────▼───────────────┐   │
│  │                    tRPC API Layer                            │   │
│  │        /api/trpc/* — type-safe, zod-validated               │   │
│  └──────────────────────────────┬──────────────────────────────┘   │
│                                 │                                   │
│  ┌──────────────────────────────▼──────────────────────────────┐   │
│  │              Hono.js Server (WebSocket + Jobs)               │   │
│  │              Socket.io :3002 — Temps réel                   │   │
│  └──────────────────────────────┬──────────────────────────────┘   │
│                                 │                                   │
│  ┌──────────┬──────────┬────────▼──────────┬──────────────────┐   │
│  │PostgreSQL│  Redis   │  BullMQ Queues    │  UploadThing/S3  │   │
│  │(données) │(cache)   │  (async jobs)     │  (fichiers)      │   │
│  └──────────┴──────────┴───────────────────┴──────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Pattern multi-tenant
```typescript
// Chaque requête est scoped par tenantId
// Row-Level Security PostgreSQL activé
// Middleware Next.js extrait tenantId depuis:
//   - Subdomain: acme.nexadesk.app
//   - Header: X-Tenant-ID
//   - Session JWT claim: tenantId
```

---

## 4. Structure du Projet

```
nexadesk/
├── apps/
│   ├── web/                          # App principale (Next.js 15)
│   │   ├── app/
│   │   │   ├── (auth)/               # Routes auth (login, register, 2fa)
│   │   │   ├── (dashboard)/          # Routes dashboard (layout avec sidebar)
│   │   │   │   ├── layout.tsx        # Shell principal (sidebar + header)
│   │   │   │   ├── page.tsx          # Dashboard home
│   │   │   │   ├── dossiers/         # Module dossiers
│   │   │   │   ├── taches/           # Module tâches
│   │   │   │   ├── finance/          # Module finance
│   │   │   │   ├── juridique/        # Module juridique
│   │   │   │   ├── sirh/             # Module SIRH
│   │   │   │   ├── audit/            # Module audit
│   │   │   │   ├── conformite/       # Module conformité
│   │   │   │   ├── conseil/          # Module conseil
│   │   │   │   ├── communication/    # Module communication
│   │   │   │   ├── logistique/       # Module logistique
│   │   │   │   ├── messagerie/       # Module messagerie
│   │   │   │   ├── agenda/           # Module agenda
│   │   │   │   ├── bureau/           # Suite bureautique
│   │   │   │   └── settings/         # Paramètres tenant
│   │   │   ├── api/
│   │   │   │   └── trpc/[trpc]/      # tRPC handler
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn/ui components
│   │   │   ├── layout/               # Sidebar, Header, Shell
│   │   │   ├── modules/              # Composants par module
│   │   │   ├── shared/               # Composants partagés
│   │   │   └── providers/            # Providers React
│   │   ├── lib/
│   │   │   ├── trpc/                 # Client tRPC
│   │   │   ├── auth/                 # Better Auth client
│   │   │   ├── store/                # Zustand stores
│   │   │   ├── hooks/                # React hooks
│   │   │   └── utils/                # Utilitaires
│   │   └── public/
│   │
│   └── admin/                        # Super-admin distant (Next.js 15)
│       ├── app/
│       │   ├── (auth)/
│       │   └── (admin)/
│       │       ├── tenants/          # Gestion organisations
│       │       ├── users/            # Gestion utilisateurs globaux
│       │       ├── monitoring/       # Métriques système
│       │       ├── logs/             # Logs audit globaux
│       │       ├── billing/          # Facturation SaaS
│       │       └── config/           # Config globale plateforme
│       └── ...
│
├── packages/
│   ├── db/                           # Drizzle schema + migrations
│   │   ├── schema/                   # Tables Drizzle
│   │   ├── migrations/               # SQL migrations
│   │   └── seed/                     # Données initiales
│   ├── api/                          # tRPC routers (partagé)
│   │   ├── routers/                  # Un router par module
│   │   ├── middleware/               # Auth, tenant, rate limit
│   │   └── context.ts                # tRPC context
│   ├── auth/                         # Better Auth config
│   ├── validators/                   # Zod schemas partagés
│   ├── types/                        # Types TypeScript partagés
│   ├── ui/                           # Design system partagé
│   ├── email/                        # Templates React Email
│   └── config/                       # Config partagée (eslint, ts, tailwind)
│
├── docker-compose.yml
├── docker-compose.prod.yml
├── turbo.json
└── package.json
```

---

## 5. Base de Données — Schéma Drizzle

### Instructions
Crée tous les fichiers dans `packages/db/schema/`. Utilise Drizzle ORM avec PostgreSQL.
Active Row-Level Security sur toutes les tables métier. Toutes les tables ont :
- `id` : UUID v7 (ulid ou uuid_generate_v7)
- `tenantId` : FK vers organizations
- `createdAt`, `updatedAt` : timestamps auto
- `createdById` : FK vers users
- `deletedAt` : soft delete (null = actif)

```typescript
// packages/db/schema/organizations.ts
import { pgTable, text, timestamp, boolean, jsonb, integer } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  domain: text('domain'),                    // Pour subdomain routing
  logoUrl: text('logo_url'),
  plan: text('plan', { enum: ['free','pro','enterprise'] }).default('free').notNull(),
  maxUsers: integer('max_users').default(5).notNull(),
  settings: jsonb('settings').$type<OrgSettings>().default({}).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Définir OrgSettings type :
type OrgSettings = {
  timezone: string            // 'Africa/Libreville'
  currency: string            // 'XAF' (FCFA)
  language: string            // 'fr'
  modules: string[]           // modules activés
  theme: 'dark' | 'light' | 'system'
  primaryColor: string        // hex
  companyInfo: CompanyInfo
  fiscalYear: { startMonth: number }
  notifications: NotificationSettings
}
```

```typescript
// packages/db/schema/users.ts
export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  tenantId: text('tenant_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  phone: text('phone'),
  level: integer('level').default(1).notNull(),   // 1-6
  processes: text('processes').array().default([]).notNull(),  // ['P01','S03',...]
  fonction: text('fonction'),
  departement: text('departement'),
  isActive: boolean('is_active').default(true).notNull(),
  isSuperAdmin: boolean('is_super_admin').default(false).notNull(),
  lastLoginAt: timestamp('last_login_at'),
  preferences: jsonb('preferences').$type<UserPreferences>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})
// Index unique sur (tenantId, email)
```

```typescript
// packages/db/schema/dossiers.ts
export const dossiers = pgTable('dossiers', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  tenantId: text('tenant_id').notNull().references(() => organizations.id),
  reference: text('reference').notNull(),          // GC-DOS-2026-001
  objet: text('objet').notNull(),
  category: text('category', {
    enum: ['contrat','kyc','mandat','convention','rapport','autre']
  }).notNull(),
  status: text('status', {
    enum: ['brouillon','en_cours','attente_validation','valide','archive','rejete']
  }).default('brouillon').notNull(),
  priority: text('priority', {
    enum: ['basse','normale','haute','urgente']
  }).default('normale').notNull(),
  process: text('process').notNull(),              // P01, O02, S01...
  assignedToId: text('assigned_to_id').references(() => users.id),
  createdById: text('created_by_id').notNull().references(() => users.id),
  clientId: text('client_id').references(() => partners.id),
  dueDate: timestamp('due_date'),
  tags: text('tags').array().default([]).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  position: integer('position').default(0),        // Pour drag & drop
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

// Tables associées obligatoires :
// dossier_files       — fichiers attachés
// dossier_comments    — commentaires/notes
// dossier_history     — historique modifications
// dossier_validations — workflow validation
// dossier_collaborators — accès partagé
```

```typescript
// packages/db/schema/tasks.ts
export const tasks = pgTable('tasks', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  tenantId: text('tenant_id').notNull().references(() => organizations.id),
  title: text('title').notNull(),
  description: text('description'),               // Tiptap JSON
  status: text('status', {
    enum: ['todo','in_progress','review','done','cancelled']
  }).default('todo').notNull(),
  priority: text('priority', {
    enum: ['low','normal','high','critical']
  }).default('normal').notNull(),
  process: text('process'),
  assigneeId: text('assignee_id').references(() => users.id),
  createdById: text('created_by_id').notNull().references(() => users.id),
  dossierId: text('dossier_id').references(() => dossiers.id),
  dueDate: timestamp('due_date'),
  estimatedHours: integer('estimated_hours'),
  actualHours: integer('actual_hours'),
  tags: text('tags').array().default([]).notNull(),
  position: integer('position').default(0),        // Kanban position
  boardColumn: text('board_column').default('todo').notNull(),
  parentId: text('parent_id'),                     // Sous-tâches
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})
```

```typescript
// packages/db/schema/finance.ts

export const invoices = pgTable('invoices', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  tenantId: text('tenant_id').notNull().references(() => organizations.id),
  reference: text('reference').notNull(),          // FAC-2026-0001
  type: text('type', { enum: ['facture','devis','avoir','proforma'] }).notNull(),
  status: text('status', {
    enum: ['brouillon','envoye','paye','en_retard','annule']
  }).default('brouillon').notNull(),
  clientId: text('client_id').references(() => partners.id),
  clientSnapshot: jsonb('client_snapshot'),        // Données client au moment de la facture
  lines: jsonb('lines').$type<InvoiceLine[]>().notNull(),
  subtotal: integer('subtotal').notNull(),          // En centimes XAF
  taxRate: integer('tax_rate').default(0),          // TVA %
  taxAmount: integer('tax_amount').default(0),
  total: integer('total').notNull(),
  currency: text('currency').default('XAF').notNull(),
  dueDate: timestamp('due_date'),
  paidAt: timestamp('paid_at'),
  notes: text('notes'),
  terms: text('terms'),
  createdById: text('created_by_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

export const accounts = pgTable('accounts', {  // OHADA Plan comptable
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  tenantId: text('tenant_id').notNull().references(() => organizations.id),
  code: text('code').notNull(),                    // 411000, 512000...
  label: text('label').notNull(),
  type: text('type', { enum: ['actif','passif','charge','produit'] }).notNull(),
  class: integer('class').notNull(),               // 1-9 OHADA
  parentCode: text('parent_code'),
  isActive: boolean('is_active').default(true),
})

export const journalEntries = pgTable('journal_entries', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  tenantId: text('tenant_id').notNull().references(() => organizations.id),
  reference: text('reference').notNull(),
  date: timestamp('date').notNull(),
  description: text('description').notNull(),
  debitAccountCode: text('debit_account_code').notNull(),
  creditAccountCode: text('credit_account_code').notNull(),
  amount: integer('amount').notNull(),             // Centimes
  invoiceId: text('invoice_id').references(() => invoices.id),
  createdById: text('created_by_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

```typescript
// Autres tables à créer OBLIGATOIREMENT :
// packages/db/schema/partners.ts    — Clients, fournisseurs, partenaires
// packages/db/schema/documents.ts   — Documents standalone
// packages/db/schema/files.ts       — Fichiers uploadés
// packages/db/schema/messages.ts    — Messagerie interne + courriers
// packages/db/schema/events.ts      — Agenda, RDVs, événements
// packages/db/schema/employees.ts   — SIRH : employés, contrats
// packages/db/schema/leaves.ts      — SIRH : congés, absences
// packages/db/schema/presences.ts   — SIRH : pointages
// packages/db/schema/payroll.ts     — SIRH : fiches de paie
// packages/db/schema/audit_logs.ts  — Logs audit immuables
// packages/db/schema/notifications.ts
// packages/db/schema/permissions.ts — Habilitations + codes accès
// packages/db/schema/conventions.ts — Lettres de mission
// packages/db/schema/kanban_boards.ts
// packages/db/schema/ai_sessions.ts
// packages/db/schema/reports.ts
```

### Migrations
```bash
# Après chaque modification schema :
pnpm db:generate   # drizzle-kit generate
pnpm db:migrate    # drizzle-kit migrate
pnpm db:push       # dev only
pnpm db:studio     # Drizzle Studio UI
```

---

## 6. Authentification & RBAC

### Better Auth Configuration

```typescript
// packages/auth/index.ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { twoFactor, organization, apiKey, admin } from 'better-auth/plugins'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: true, requireEmailVerification: true },
  session: {
    expiresIn: 60 * 60 * 24 * 7,    // 7 jours
    updateAge: 60 * 60 * 24,          // Refresh quotidien
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  plugins: [
    twoFactor({ issuer: 'NexaDesk', totpOptions: { digits: 6, period: 30 } }),
    organization({ allowUserToCreateOrganization: false }),
    apiKey(),
    admin(),
  ],
  socialProviders: {
    google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! },
  },
  trustedOrigins: [process.env.NEXT_PUBLIC_APP_URL!],
})
```

### RBAC — Niveaux et Processus

```typescript
// packages/types/rbac.ts

export const LEVELS = {
  1: 'Employé',
  2: 'Collaborateur',
  3: 'Senior',
  4: 'Responsable',
  5: 'Direction Générale',
  6: 'Administrateur SI',
} as const

export type Level = keyof typeof LEVELS

export const PROCESSES = [
  'P01','P02','P03','P04',    // Pilotage
  'O01','O02','O03',           // Opérationnel
  'S01','S02','S03','S04','S05','S06',  // Support
] as const

export type Process = typeof PROCESSES[number]

// Matrice processus → modules autorisés
export const PROCESS_MODULE_MATRIX: Record<Process, string[]> = {
  P01: ['dossiers','finance','juridique','sirh','audit','conformite','logistique','communication','indicateurs','conseil','agenda','messagerie'],
  P02: ['audit','conformite','indicateurs','conseil','agenda','messagerie'],
  P03: ['finance','logistique','indicateurs','conseil','agenda','messagerie'],
  P04: ['communication','indicateurs','conseil','dossiers','agenda','messagerie'],
  O01: ['indicateurs','dossiers','agenda','messagerie'],
  O02: ['juridique','indicateurs','dossiers','agenda','messagerie'],
  O03: ['audit','indicateurs','agenda','messagerie'],
  S01: ['finance','logistique','indicateurs','agenda','messagerie'],
  S02: ['audit','conformite','indicateurs','agenda','messagerie'],
  S03: ['sirh','indicateurs','agenda','messagerie'],
  S04: ['communication','indicateurs','agenda','messagerie'],
  S05: ['logistique','indicateurs','agenda','messagerie'],
  S06: ['indicateurs','agenda','messagerie'],
}

// Modules à accès strictement restreint (pas de bypass possible)
export const STRICT_MODULES = ['finance', 'sirh'] as const

// Vérification d'accès
export function canAccessModule(
  user: { level: number; processes: string[]; isAdmin: boolean },
  moduleId: string,
  tenantMatrix?: Record<string, string[]>  // Override admin tenant
): boolean {
  if (user.isAdmin || user.level >= 6) return true
  if (user.level >= 5) return true

  const matrix = tenantMatrix ?? PROCESS_MODULE_MATRIX
  const allowedForUser = new Set(
    user.processes.flatMap(p => matrix[p as Process] ?? [])
  )
  return allowedForUser.has(moduleId)
}
```

### Middleware Next.js

```typescript
// apps/web/middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

export async function middleware(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl

  // Extraction tenantId depuis subdomain
  const subdomain = hostname.split('.')[0]
  const tenantSlug = subdomain !== 'www' && subdomain !== 'app' ? subdomain : null

  // Vérification session
  const sessionCookie = getSessionCookie(request)
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register')
  const isDashboardRoute = pathname.startsWith('/dashboard') || pathname === '/'

  if (isDashboardRoute && !sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Injection tenantId dans headers
  const response = NextResponse.next()
  if (tenantSlug) response.headers.set('x-tenant-slug', tenantSlug)
  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

---

## 7. API — tRPC Routers

### Setup tRPC

```typescript
// packages/api/trpc.ts
import { initTRPC, TRPCError } from '@trpc/server'
import { ZodError } from 'zod'
import superjson from 'superjson'

type Context = {
  session: Session | null
  user: User | null
  tenantId: string | null
  db: DrizzleDb
  redis: Redis
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

// Middlewares
const isAuthenticated = t.middleware(({ ctx, next }) => {
  if (!ctx.session || !ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, session: ctx.session, user: ctx.user } })
})

const hasTenant = t.middleware(({ ctx, next }) => {
  if (!ctx.tenantId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No tenant' })
  return next({ ctx: { ...ctx, tenantId: ctx.tenantId } })
})

const rateLimited = t.middleware(async ({ ctx, next }) => {
  // Rate limit via Redis : 100 req/min par user
  const key = `rate:${ctx.user?.id}:${Math.floor(Date.now() / 60000)}`
  const count = await ctx.redis.incr(key)
  if (count === 1) await ctx.redis.expire(key, 60)
  if (count > 100) throw new TRPCError({ code: 'TOO_MANY_REQUESTS' })
  return next()
})

export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(isAuthenticated).use(hasTenant).use(rateLimited)
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.level < 5 && !ctx.user.isAdmin)
    throw new TRPCError({ code: 'FORBIDDEN' })
  return next()
})
```

### Routers obligatoires (créer un fichier par module)

```typescript
// packages/api/routers/dossiers.ts — EXEMPLE COMPLET À REPRODUIRE POUR CHAQUE MODULE

export const dossiersRouter = router({
  // ── LIST ──────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      search: z.string().optional(),
      status: z.enum(['brouillon','en_cours','attente_validation','valide','archive','rejete']).optional(),
      process: z.string().optional(),
      priority: z.enum(['basse','normale','haute','urgente']).optional(),
      assignedToId: z.string().optional(),
      clientId: z.string().optional(),
      sortBy: z.enum(['createdAt','updatedAt','dueDate','reference','objet']).default('updatedAt'),
      sortDir: z.enum(['asc','desc']).default('desc'),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Vérifier accès module
      if (!canAccessModule(ctx.user, 'dossiers')) throw new TRPCError({ code: 'FORBIDDEN' })

      const { page, pageSize, search, status, process, ...rest } = input
      const offset = (page - 1) * pageSize

      // Query Drizzle avec filtres dynamiques
      const conditions = [
        eq(dossiers.tenantId, ctx.tenantId),
        isNull(dossiers.deletedAt),
        ...(search ? [or(
          ilike(dossiers.objet, `%${search}%`),
          ilike(dossiers.reference, `%${search}%`)
        )] : []),
        ...(status ? [eq(dossiers.status, status)] : []),
        ...(process ? [eq(dossiers.process, process)] : []),
      ]

      const [items, [{ count }]] = await Promise.all([
        ctx.db.select().from(dossiers)
          .where(and(...conditions))
          .orderBy(desc(dossiers.updatedAt))
          .limit(pageSize)
          .offset(offset),
        ctx.db.select({ count: sql<number>`count(*)` })
          .from(dossiers).where(and(...conditions))
      ])

      return {
        items,
        pagination: { page, pageSize, total: Number(count), totalPages: Math.ceil(Number(count) / pageSize) }
      }
    }),

  // ── GET BY ID ────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const dossier = await ctx.db.query.dossiers.findFirst({
        where: and(eq(dossiers.id, input.id), eq(dossiers.tenantId, ctx.tenantId), isNull(dossiers.deletedAt)),
        with: {
          files: { where: isNull(dossierFiles.deletedAt) },
          comments: { orderBy: desc(dossierComments.createdAt), with: { author: true } },
          history: { orderBy: desc(dossierHistory.createdAt), limit: 50, with: { actor: true } },
          validations: { with: { validator: true } },
          assignedTo: true,
          createdBy: true,
          client: true,
        }
      })
      if (!dossier) throw new TRPCError({ code: 'NOT_FOUND' })
      return dossier
    }),

  // ── CREATE ──────────────────────────────────────────────
  create: protectedProcedure
    .input(createDossierSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.level < 2) throw new TRPCError({ code: 'FORBIDDEN' })

      const reference = await generateReference(ctx.db, ctx.tenantId, 'DOS')

      const [dossier] = await ctx.db.insert(dossiers).values({
        ...input,
        tenantId: ctx.tenantId,
        reference,
        createdById: ctx.user.id,
      }).returning()

      // Log audit
      await logAudit(ctx, { action: 'CREATE', resource: 'dossier', resourceId: dossier.id, after: dossier })

      // Notification temps réel
      await emitToTenant(ctx.tenantId, 'dossier:created', dossier)

      return dossier
    }),

  // ── UPDATE ──────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({ id: z.string(), data: updateDossierSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getDossierOrThrow(ctx, input.id)
      if (!canEditDossier(ctx.user, existing)) throw new TRPCError({ code: 'FORBIDDEN' })

      const [updated] = await ctx.db.update(dossiers)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(dossiers.id, input.id))
        .returning()

      await logAudit(ctx, { action: 'UPDATE', resource: 'dossier', resourceId: input.id, before: existing, after: updated })
      await emitToTenant(ctx.tenantId, 'dossier:updated', updated)

      return updated
    }),

  // ── DELETE (soft) ────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getDossierOrThrow(ctx, input.id)
      if (!canDeleteDossier(ctx.user, existing)) throw new TRPCError({ code: 'FORBIDDEN' })

      await ctx.db.update(dossiers).set({ deletedAt: new Date() }).where(eq(dossiers.id, input.id))
      await logAudit(ctx, { action: 'DELETE', resource: 'dossier', resourceId: input.id, before: existing })
      await emitToTenant(ctx.tenantId, 'dossier:deleted', { id: input.id })

      return { success: true }
    }),

  // ── BULK DELETE ──────────────────────────────────────────
  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.level < 4) throw new TRPCError({ code: 'FORBIDDEN' })
      await ctx.db.update(dossiers)
        .set({ deletedAt: new Date() })
        .where(and(inArray(dossiers.id, input.ids), eq(dossiers.tenantId, ctx.tenantId)))
      return { deleted: input.ids.length }
    }),

  // ── REORDER (drag & drop) ────────────────────────────────
  reorder: protectedProcedure
    .input(z.object({ items: z.array(z.object({ id: z.string(), position: z.number() })) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        for (const item of input.items) {
          await tx.update(dossiers).set({ position: item.position }).where(
            and(eq(dossiers.id, item.id), eq(dossiers.tenantId, ctx.tenantId))
          )
        }
      })
      return { success: true }
    }),

  // ── AJOUTER COMMENTAIRE ──────────────────────────────────
  addComment: protectedProcedure
    .input(z.object({ dossierId: z.string(), content: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      await getDossierOrThrow(ctx, input.dossierId)
      const [comment] = await ctx.db.insert(dossierComments).values({
        dossierId: input.dossierId,
        tenantId: ctx.tenantId,
        content: input.content,
        authorId: ctx.user.id,
      }).returning()
      await emitToTenant(ctx.tenantId, 'dossier:comment_added', { dossierId: input.dossierId, comment })
      return comment
    }),

  // ── STATISTIQUES ─────────────────────────────────────────
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [byStatus, byProcess, recentActivity] = await Promise.all([
      ctx.db.select({ status: dossiers.status, count: sql<number>`count(*)` })
        .from(dossiers).where(and(eq(dossiers.tenantId, ctx.tenantId), isNull(dossiers.deletedAt)))
        .groupBy(dossiers.status),
      ctx.db.select({ process: dossiers.process, count: sql<number>`count(*)` })
        .from(dossiers).where(and(eq(dossiers.tenantId, ctx.tenantId), isNull(dossiers.deletedAt)))
        .groupBy(dossiers.process),
      ctx.db.select().from(dossiers)
        .where(and(eq(dossiers.tenantId, ctx.tenantId), isNull(dossiers.deletedAt)))
        .orderBy(desc(dossiers.updatedAt)).limit(5),
    ])
    return { byStatus, byProcess, recentActivity }
  }),
})

// Reproduire ce pattern pour TOUS les modules :
// tasksRouter, financeRouter, juridiqueRouter, sirhRouter,
// auditRouter, conformiteRouter, conseilRouter,
// communicationRouter, logistiqueRouter, messagerieRouter,
// agendaRouter, documentsRouter, partnersRouter,
// notificationsRouter, usersRouter, permissionsRouter
```

### Root Router
```typescript
// packages/api/root.ts
export const appRouter = router({
  dossiers: dossiersRouter,
  tasks: tasksRouter,
  finance: financeRouter,
  juridique: juridiqueRouter,
  sirh: sirhRouter,
  audit: auditRouter,
  conformite: conformiteRouter,
  conseil: conseilRouter,
  communication: communicationRouter,
  logistique: logistiqueRouter,
  messagerie: messagerieRouter,
  agenda: agendaRouter,
  documents: documentsRouter,
  partners: partnersRouter,
  users: usersRouter,
  permissions: permissionsRouter,
  notifications: notificationsRouter,
  admin: adminRouter,          // Super-admin seulement
  tenant: tenantRouter,        // Config tenant
  ai: aiRouter,                // Assistant IA
  files: filesRouter,
})

export type AppRouter = typeof appRouter
```

---

## 8. Modules Fonctionnels

### Instructions générales pour chaque module

Pour **chaque module**, créer :
1. La page Next.js (`app/(dashboard)/[module]/page.tsx`)
2. Le layout spécifique si nécessaire
3. Tous les composants dans `components/modules/[module]/`
4. Le store Zustand dans `lib/store/[module].store.ts`
5. Les hooks React Query dans `lib/hooks/use-[module].ts`
6. Les Zod validators dans `packages/validators/[module].ts`

### 8.1 Dashboard & Indicateurs

**Page principale** — KPIs temps réel personnalisés par rôle

```typescript
// Composants obligatoires :

// KpiCard — carte métrique avec tendance
type KpiCardProps = {
  title: string
  value: number | string
  change?: number          // % évolution vs période précédente
  trend?: 'up' | 'down' | 'neutral'
  icon: LucideIcon
  color?: string
  format?: 'number' | 'currency' | 'percent' | 'duration'
  currency?: string
  onClick?: () => void
  loading?: boolean
}

// MetricGrid — grille drag-droppable de KpiCards (layout personnalisable par user)
// ActivityFeed — flux activité temps réel (WebSocket)
// ProcessMap — cartographie interactive processus (SVG + click navigation)
// QuickActions — raccourcis actions fréquentes configurables
// RecentDossiers — 5 derniers dossiers modifiés
// UpcomingEvents — prochains RDVs agenda
// AlertsBanner — alertes & échéances critiques
// BarChart, LineChart, PieChart (Recharts) pour métriques
```

**Fonctionnalités dashboard :**
- Grille de widgets **drag & droppable** (chaque user peut réorganiser son dashboard)
- KPIs filtrables par période (7j, 30j, 90j, YTD, custom)
- Export PDF du dashboard
- Mode plein écran pour présentation
- Thème adaptatif selon le processus de l'utilisateur

### 8.2 Gestion Dossiers & Documents

**Vues disponibles :**
- **Liste** : TanStack Table avec tri multi-colonnes, filtres, pagination, sélection multiple
- **Kanban** : colonnes par statut, drag & drop entre colonnes et pour réordonnancement
- **Grille** : cards visuelles avec aperçu
- **Calendrier** : dossiers par date d'échéance

```typescript
// Composants obligatoires :

// DossierList — vue liste avec filtres avancés
// DossierKanban — vue kanban avec @dnd-kit
// DossierCard — carte dossier avec actions contextuelles
// DossierDetail — panneau latéral ou modal détail complet
// DossierForm — formulaire création/édition (React Hook Form + Zod)
// DossierFilters — panneau filtres (statut, processus, dates, tags)
// DossierTimeline — historique chronologique des modifications
// DossierComments — section commentaires avec mentions @user
// DossierFiles — liste fichiers attachés avec upload drag-drop
// DossierValidationFlow — workflow validation multi-niveaux
// BulkActions — barre d'actions groupées (supprimer, archiver, assigner)
// CodificationBadge — badge référence codifiée
// StatusBadge — badge statut coloré
// PriorityBadge — badge priorité avec couleur
```

**Fonctionnalités complètes :**
- Création de dossier avec codification automatique (GC-DOS-2026-001)
- Upload de fichiers par drag & drop (PDF, Word, Excel, images)
- Workflow de validation configurable (brouillon → en cours → validation → validé)
- Historique complet de toutes les modifications
- Commentaires avec mentions @collaborateur
- Tags et catégorisation libres
- Partage de dossier avec contrôle d'accès granulaire
- Recherche full-text en temps réel
- Export Excel/PDF de la liste filtrée
- Actions en masse (sélection multiple + action groupée)
- Sous-dossiers / arborescence
- Archivage avec politique de rétention configurable

### 8.3 Tâches & Kanban

```typescript
// Vues : Liste | Kanban | Calendrier | Gantt (simplifié)
// Composants :
// TaskBoard — board Kanban avec colonnes configurables
// TaskCard — carte tâche draggable (@dnd-kit)
// TaskColumn — colonne kanban droppable avec compteur
// TaskDetail — modal détail tâche complète
// TaskForm — formulaire création/édition
// TaskFilters — filtres par assigné, priorité, processus, tags
// TaskComments — commentaires sur tâche
// SubTaskList — liste sous-tâches avec progression
// TimeTracker — chronomètre + saisie heures
// TaskDependencies — dépendances entre tâches
// BurndownChart — graphique avancement sprint
```

### 8.4 Finance & Comptabilité

```typescript
// Accès STRICTEMENT restreint : P01, P03, S01 (strictBlock)

// Composants :
// InvoiceList — liste factures/devis/avoirs
// InvoiceBuilder — créateur de facture (lignes, TVA, remises, totaux)
// InvoicePDF — rendu PDF @react-pdf/renderer aux couleurs du cabinet
// AccountingJournal — journal comptable OHADA
// ChartOfAccounts — plan comptable OHADA avec hiérarchie
// BudgetPlanner — planification budgétaire annuelle
// CashflowChart — graphique trésorerie
// BalanceSheet — bilan comptable
// IncomeStatement — compte de résultat
// TaxDashboard — tableau de bord TVA/IS
// PaymentTracker — suivi paiements & relances
// FinancialReports — générateur rapports financiers
// BankReconciliation — rapprochement bancaire
```

### 8.5 SIRH — Ressources Humaines

```typescript
// Accès STRICTEMENT restreint : P01, S03

// Composants :
// EmployeeDirectory — annuaire collaborateurs avec organigramme
// EmployeeProfile — profil complet avec historique
// AttendanceTracker — pointage présences/absences
// LeaveManager — demandes et validation congés
// PayrollModule — calcul et édition fiches de paie
// RecruitmentBoard — kanban recrutements
// PerformanceReview — évaluations annuelles
// ContractManager — gestion contrats de travail
// OrgChart — organigramme interactif (drag & drop)
// HRDashboard — KPIs RH (turnover, absences, masse salariale)
```

### 8.6 Modules restants à implémenter

Pour chacun, appliquer le même niveau de détail que les modules précédents :

**Audit & Contrôle** — Matrices risques ISA/COSO, checklists, constats, plans d'action corrective, recommandations, ratings maturité

**Conformité** — Obligations réglementaires, KYC workflow (onboarding clients, vérification documents, scoring), veille juridique, politiques internes, signalements

**Conseil & Stratégie** — Outils SWOT/PESTEL/BCG, suivi missions, recommandations, plans d'action stratégiques, scoring clients, feuilles de route

**Communication** — Gestion campagnes, création contenus, planning éditorial (calendrier drag & droppable), médiathèque, tracking engagement

**Juridique** — Gestion contrats (lifecycle complet), bibliothèque clauses, modèles, litiges, veille réglementaire (OHADA + droit gabonais)

**Logistique** — Achats (workflow approbation), gestion stock (alertes seuil), suivi équipements, planning maintenance, fournisseurs

**Messagerie** — Chat temps réel (Socket.io), courrier entrant/sortant, pièces jointes, groupes de discussion, archivage, marqué lu/non-lu

**Agenda** — Calendrier (jour/semaine/mois), RDVs avec invitations, détection conflits, rappels, intégration Google Calendar (optionnel), récurrence

---

## 9. Panneau Admin Distant

L'application `apps/admin/` est une **application Next.js distincte** déployée séparément,
accessible uniquement par les super-administrateurs depuis n'importe quel endroit.

```typescript
// Routes admin :

// /admin                       — Dashboard super-admin (métriques globales)
// /admin/tenants               — Liste toutes les organisations
// /admin/tenants/[id]          — Détail tenant : users, modules, usage, limites
// /admin/tenants/[id]/config   — Config modules, matrice accès, paramètres
// /admin/tenants/[id]/users    — Gestion utilisateurs du tenant
// /admin/tenants/[id]/impersonate — Connexion en tant que user (audit tracé)
// /admin/users                 — Tous les utilisateurs toutes organisations
// /admin/monitoring            — CPU, mémoire, requêtes/sec, latence DB
// /admin/logs                  — Logs audit globaux avec filtres avancés
// /admin/logs/[tenantId]       — Logs d'un tenant spécifique
// /admin/billing               — Plans, abonnements, usage quotas
// /admin/features              — Feature flags (activer/désactiver fonctionnalités)
// /admin/announcements         — Messages système à diffuser aux tenants
// /admin/backups               — Gestion sauvegardes (déclencher, restaurer)
// /admin/maintenance           — Mode maintenance, migrations, jobs
// /admin/security              — IP blocklist, suspicious activity, 2FA enforce
```

```typescript
// Fonctionnalités admin distantes obligatoires :

// 1. Impersonation sécurisée
async function impersonateUser(adminId: string, targetUserId: string, tenantId: string) {
  // Crée session temporaire (max 1h) pour l'admin
  // Log audit immuable de l'impersonation
  // Banner visible sur l'UI : "Vous êtes connecté en tant que [User] — Admin session"
  // Retour possible à tout moment
}

// 2. Toggle modules par tenant
// L'admin peut activer/désactiver n'importe quel module pour un tenant
// La modification est effective immédiatement (via Redis pub/sub → invalidation cache)

// 3. Override matrice accès
// L'admin distant peut modifier la PROCESS_MODULE_MATRIX d'un tenant
// Avec audit trail de qui a modifié quoi et quand

// 4. Quotas et limites
type TenantLimits = {
  maxUsers: number
  maxStorageGB: number
  maxDocuments: number
  maxAPICallsPerDay: number
  enabledModules: string[]
  features: Record<string, boolean>  // Feature flags
}

// 5. Health monitoring par tenant
// Dernière activité, utilisateurs actifs, erreurs récentes, performances

// 6. Communication push
// L'admin peut envoyer un message système qui s'affiche en banner
// à tous les utilisateurs d'un tenant ou de tous les tenants
```

---

## 10. Temps Réel — WebSocket

### Architecture Socket.io

```typescript
// packages/realtime/server.ts
import { createServer } from 'http'
import { Server } from 'socket.io'
import { Hono } from 'hono'

const app = new Hono()
const httpServer = createServer()
const io = new Server(httpServer, {
  cors: { origin: process.env.ALLOWED_ORIGINS?.split(','), credentials: true },
  transports: ['websocket', 'polling'],
})

// Namespaces par fonctionnalité
const tenantNs = io.of(/^\/tenant\/[\w-]+$/)

tenantNs.use(async (socket, next) => {
  // Vérifier JWT token
  const token = socket.handshake.auth.token
  const session = await verifyJWT(token)
  if (!session) return next(new Error('Unauthorized'))
  socket.data.userId = session.userId
  socket.data.tenantId = session.tenantId
  next()
})

tenantNs.on('connection', (socket) => {
  const { userId, tenantId } = socket.data

  // Rejoindre rooms
  socket.join(`tenant:${tenantId}`)
  socket.join(`user:${userId}`)

  // Présence
  io.to(`tenant:${tenantId}`).emit('user:online', { userId, timestamp: new Date() })

  socket.on('disconnect', () => {
    io.to(`tenant:${tenantId}`).emit('user:offline', { userId, timestamp: new Date() })
  })

  // Typing indicators pour messagerie
  socket.on('typing:start', ({ conversationId }) => {
    socket.to(`conversation:${conversationId}`).emit('typing:start', { userId })
  })
  socket.on('typing:stop', ({ conversationId }) => {
    socket.to(`conversation:${conversationId}`).emit('typing:stop', { userId })
  })
})

// Événements émis depuis le backend (via Redis pub/sub) :
// dossier:created, dossier:updated, dossier:deleted
// task:created, task:updated, task:deleted, task:moved
// message:new, message:read
// notification:new
// user:online, user:offline
// document:updated (collaborative editing)
// announcement:new (super-admin broadcast)
```

### Hook React côté client

```typescript
// apps/web/lib/hooks/use-realtime.ts
import { useEffect, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'

let socket: Socket | null = null

export function useRealtime(tenantId: string, token: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    socket = io(`${process.env.NEXT_PUBLIC_WS_URL}/tenant/${tenantId}`, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socket.on('dossier:updated', ({ id }) => {
      queryClient.invalidateQueries({ queryKey: ['dossiers'] })
      queryClient.invalidateQueries({ queryKey: ['dossier', id] })
    })

    socket.on('task:moved', ({ id, column }) => {
      queryClient.setQueryData(['task', id], (old: Task) => ({ ...old, boardColumn: column }))
    })

    socket.on('notification:new', (notification) => {
      queryClient.setQueryData(['notifications'], (old: Notification[]) => [notification, ...(old ?? [])])
      // Toast notification
      toast.info(notification.title)
    })

    return () => { socket?.disconnect() }
  }, [tenantId, token])

  const emit = useCallback((event: string, data: unknown) => {
    socket?.emit(event, data)
  }, [])

  return { emit, connected: socket?.connected ?? false }
}
```

---

## 11. Gestion Fichiers

```typescript
// Configuration UploadThing
// packages/files/uploadthing.ts
import { createUploadthing } from 'uploadthing/next'

const f = createUploadthing()

export const ourFileRouter = {
  // Upload documents dossiers
  dossierFile: f({
    pdf: { maxFileSize: '32MB', maxFileCount: 10 },
    'application/msword': { maxFileSize: '16MB', maxFileCount: 10 },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { maxFileSize: '16MB', maxFileCount: 10 },
    'application/vnd.ms-excel': { maxFileSize: '16MB', maxFileCount: 10 },
    image: { maxFileSize: '8MB', maxFileCount: 20 },
  })
    .middleware(async ({ req }) => {
      const session = await getSession(req)
      if (!session) throw new UploadThingError('Unauthorized')
      return { userId: session.user.id, tenantId: session.user.tenantId }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await db.insert(files).values({
        tenantId: metadata.tenantId,
        uploadedById: metadata.userId,
        name: file.name,
        url: file.url,
        key: file.key,
        size: file.size,
        mimeType: file.type,
      })
    }),

  // Avatar utilisateur
  avatar: f({ image: { maxFileSize: '2MB', maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      const session = await getSession(req)
      if (!session) throw new UploadThingError('Unauthorized')
      return { userId: session.user.id }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await db.update(users).set({ avatarUrl: file.url }).where(eq(users.id, metadata.userId))
    }),
}
```

```typescript
// Composant upload réutilisable
// components/shared/file-uploader.tsx

type FileUploaderProps = {
  onUpload: (files: UploadedFile[]) => void
  accept?: string[]
  maxFiles?: number
  maxSize?: string
  disabled?: boolean
  className?: string
}

// Fonctionnalités :
// - Drag & drop sur la zone entière + bouton click
// - Barre de progression par fichier
// - Preview thumbnail pour images
// - Validation type/taille avant upload
// - Retry automatique en cas d'erreur réseau
// - Annulation upload en cours
// - Liste des fichiers uploadés avec suppression individuelle
```

---

## 12. UI/UX — Design System

### Configuration Tailwind

```typescript
// packages/config/tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Couleurs sémantiques (CSS variables pour thèmes)
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        // Couleurs métier
        sidebar: { DEFAULT: 'hsl(var(--sidebar-background))', border: 'hsl(var(--sidebar-border))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'bounce-subtle': 'bounceSubtle 0.5s ease-in-out',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms'),
  ],
} satisfies Config
```

### Variables CSS (thèmes)

```css
/* apps/web/app/globals.css */

/* Thème Sombre (défaut) */
:root[data-theme="dark"] {
  --background: 224 71% 4%;
  --foreground: 213 31% 91%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 1.2%;
  --secondary: 222.2 47.4% 11.2%;
  --secondary-foreground: 210 40% 98%;
  --muted: 223 47% 11%;
  --muted-foreground: 215.4 16.3% 56.9%;
  --accent: 216 34% 17%;
  --accent-foreground: 210 40% 98%;
  --destructive: 0 63% 31%;
  --destructive-foreground: 210 40% 98%;
  --border: 216 34% 17%;
  --input: 216 34% 17%;
  --ring: 263.4 70% 50.4%;
  --sidebar-background: 222 47% 6%;
  --sidebar-border: 216 34% 12%;
  --radius: 0.75rem;
}

/* Thème Clair */
:root[data-theme="light"] {
  --background: 0 0% 100%;
  --foreground: 222.2 47.4% 11.2%;
  /* ... toutes les variables */
}

/* Thème Marine GC */
:root[data-theme="gc-navy"] {
  --background: 220 100% 5%;
  --primary: 43 75% 55%;   /* Or GC */
  --sidebar-background: 220 100% 4%;
  /* ... */
}
```

### Layout principal

```typescript
// apps/web/app/(dashboard)/layout.tsx
// Structure complète :
// ┌─────────────────────────────────────────────────┐
// │  HEADER (fixe, 56px)                            │
// │  Logo | Breadcrumb | Search | Notif | User      │
// ├──────────┬──────────────────────────────────────┤
// │ SIDEBAR  │  MAIN CONTENT                        │
// │ (240px,  │  (scroll vertical)                   │
// │  collaps │                                      │
// │  ible)   │                                      │
// │          │                                      │
// │ Nav items│                                      │
// │ filtered │                                      │
// │ by RBAC  │                                      │
// └──────────┴──────────────────────────────────────┘

// Sidebar doit supporter :
// - Collapse/expand (icones seulement en mode collapsé)
// - Groupes de navigation avec séparateurs
// - Badges compteurs (tâches en retard, messages non lus)
// - Drag & drop pour réorganiser les favoris
// - Mode mobile : drawer/sheet
// - Highlight route active
// - Tooltips en mode collapsé
```

### Composants UI à créer (au-delà de shadcn)

```typescript
// Tous dans packages/ui/components/

// DataTable — TanStack Table avec :
//   - Tri multi-colonnes
//   - Filtres colonne
//   - Pagination côté serveur
//   - Sélection multiple + actions bulk
//   - Export CSV/Excel
//   - Colonnes redimensionnables
//   - Virtualisation (react-virtual)
//   - Sticky colonnes
//   - Dense/comfortable/spacious modes

// KpiCard — métrique avec sparkline, tendance, actions

// StatusBadge — badge configurable par statut/couleur

// UserAvatar — avatar avec fallback initiales, ring présence en ligne

// CommandPalette — Ctrl+K search global (cmdk)

// RichTextEditor — Tiptap avec toolbar complète (Headings, Bold, Italic,
//   Lists, Links, Images, Tables, Code, Mentions @user, Emojis)

// DateRangePicker — sélecteur période avec presets (7j, 30j, ce mois, etc.)

// MultiSelect — select avec recherche, badges, drag pour réordonner

// ColorPicker — palette + hex input

// FilePreview — prévisualisation PDF/image inline

// EmptyState — composant état vide avec illustration + CTA

// LoadingSkeleton — squelettes de chargement par type de contenu

// ConfirmDialog — modal confirmation avec message danger

// BreadcrumbNav — fil d'Ariane dynamique

// QuickSearch — recherche globale avec résultats catégorisés temps réel

// NotificationDropdown — dropdown notifications avec groupement

// OnlineIndicator — indicateur présence en ligne (vert/jaune/rouge)

// ProgressRing — cercle de progression SVG animé

// DragHandle — poignée drag & drop

// SortableList — liste réordonnables (@dnd-kit)

// InfiniteScroll — scroll infini avec TanStack Query

// VirtualList — liste virtualisée pour grandes listes

// Tooltip — tooltip riche avec contenu React

// Popover — popover positionné avec contenu React

// SlideOver — panneau latéral slide-in pour détails

// Sheet — bottom sheet mobile
```

---

## 13. Drag & Drop

### Configuration @dnd-kit

```typescript
// Installer : pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @dnd-kit/modifiers

// Pattern Kanban complet
// components/modules/tasks/task-board.tsx

import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCorners, DragOverlay
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  sortableKeyboardCoordinates, arrayMove
} from '@dnd-kit/sortable'
import { restrictToWindowEdges } from '@dnd-kit/modifiers'

export function TaskBoard({ tasks, columns, onTaskMove, onReorder }) {
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [localTasks, setLocalTasks] = useState(tasks)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveTask(localTasks.find(t => t.id === active.id) ?? null)
  }

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    const activeColumn = getColumn(active.id, localTasks)
    const overColumn = getColumn(over.id, localTasks)
    if (activeColumn === overColumn) return

    // Déplacer tâche vers nouvelle colonne (optimistic update)
    setLocalTasks(prev => prev.map(t =>
      t.id === active.id ? { ...t, boardColumn: overColumn } : t
    ))
  }

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveTask(null)
    if (!over || active.id === over.id) return

    // Appel API pour persister
    await onTaskMove({ taskId: active.id as string, column: getColumn(over.id, localTasks) })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToWindowEdges]}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map(column => (
          <TaskColumn
            key={column.id}
            column={column}
            tasks={localTasks.filter(t => t.boardColumn === column.id)}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}

// Appliquer ce même pattern pour :
// - Dashboard widgets (réorganisation KPI cards)
// - Dossiers en vue Kanban
// - Navigation sidebar (favoris)
// - Étapes de workflow
// - Colonnes de tableau configurables
// - Organigramme (déplacement nœuds)
```

---

## 14. Notifications & Alertes

```typescript
// packages/db/schema/notifications.ts
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  tenantId: text('tenant_id').notNull().references(() => organizations.id),
  userId: text('user_id').notNull().references(() => users.id),
  type: text('type', {
    enum: ['task_assigned','dossier_updated','mention','message_new','approval_needed',
           'deadline_approaching','system','announcement','file_shared']
  }).notNull(),
  title: text('title').notNull(),
  body: text('body'),
  actionUrl: text('action_url'),
  isRead: boolean('is_read').default(false).notNull(),
  readAt: timestamp('read_at'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Service de notification
// packages/api/services/notification.service.ts
export async function createNotification(params: CreateNotificationParams) {
  // 1. Insérer en DB
  const [notif] = await db.insert(notifications).values(params).returning()

  // 2. Diffuser WebSocket temps réel
  await emitToUser(params.userId, 'notification:new', notif)

  // 3. Optionnel : envoyer email si user hors ligne
  if (params.sendEmail) {
    await emailQueue.add('send-notification-email', { notifId: notif.id })
  }

  return notif
}

// Toast system (Sonner)
// import { toast } from 'sonner'
// Utiliser dans toute l'app :
// toast.success('Dossier créé avec succès')
// toast.error('Erreur lors de la sauvegarde')
// toast.warning('Délai dépassé')
// toast.info('3 nouvelles notifications')
// toast.promise(promise, { loading: '...', success: 'OK', error: 'Erreur' })
```

---

## 15. Assistant IA Intégré

```typescript
// packages/api/routers/ai.ts
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const aiRouter = router({
  chat: protectedProcedure
    .input(z.object({
      messages: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })),
      context: z.object({
        module: z.string().optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
      }).optional(),
      sessionId: z.string(),
    }))
    .mutation(async function* ({ ctx, input }) {
      // Construire system prompt selon contexte
      const systemPrompt = buildSystemPrompt(ctx.user, input.context)

      // Streaming avec Server-Sent Events
      const stream = await anthropic.messages.stream({
        model: 'claude-opus-4-5',
        max_tokens: 4096,
        system: systemPrompt,
        messages: input.messages,
      })

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta') {
          yield chunk.delta.text
        }
      }

      // Sauvegarder session
      const finalMessage = await stream.finalMessage()
      await saveAISession(ctx, input.sessionId, input.messages, finalMessage)
    }),
})

// Fonctionnalités IA :
// - Chat contextuel (conscient du module actif et des données visibles)
// - Résumé automatique de dossier
// - Rédaction de documents (contrats, rapports, emails)
// - Analyse financière avec suggestions
// - Recherche sémantique dans les documents
// - Traduction (FR/EN/autres)
// - Extraction d'informations clés depuis documents uploadés
```

---

## 16. Tests

### Tests unitaires (Vitest)

```typescript
// Créer des tests pour :
// - Toutes les fonctions utilitaires (helpers, validators, RBAC)
// - Tous les tRPC routers (avec mock DB)
// - Tous les Zod schemas
// - Les stores Zustand
// - Les hooks React (React Testing Library)

// Exemple :
// packages/api/__tests__/dossiers.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createCallerFactory } from '@trpc/server'
import { appRouter } from '../root'

const createCaller = createCallerFactory(appRouter)

describe('dossiersRouter', () => {
  it('should create a dossier with proper reference', async () => { /* ... */ })
  it('should reject creation if user level < 2', async () => { /* ... */ })
  it('should soft delete instead of hard delete', async () => { /* ... */ })
  it('should emit realtime event on update', async () => { /* ... */ })
})
```

### Tests E2E (Playwright)

```typescript
// Créer des specs pour chaque module et flux critique :
// tests/e2e/auth.spec.ts         — Login, 2FA, logout
// tests/e2e/dossiers.spec.ts     — CRUD complet + drag & drop kanban
// tests/e2e/tasks.spec.ts        — CRUD + kanban + sous-tâches
// tests/e2e/finance.spec.ts      — Facture complète + export PDF
// tests/e2e/permissions.spec.ts  — Accès refusé selon processus
// tests/e2e/admin.spec.ts        — Panel admin distant
// tests/e2e/realtime.spec.ts     — Sync entre 2 onglets/navigateurs
// tests/e2e/upload.spec.ts       — Upload fichier + visualisation

// Coverage cible : > 80% lignes de code
```

---

## 17. Déploiement & DevOps

### Docker Compose (développement)

```yaml
# docker-compose.yml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: nexadesk
      POSTGRES_USER: nexadesk
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports: ['5432:5432']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U nexadesk']
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports: ['6379:6379']
    volumes: [redis_data:/data]

  web:
    build: { context: ., dockerfile: apps/web/Dockerfile }
    ports: ['3000:3000']
    environment:
      DATABASE_URL: postgresql://nexadesk:${POSTGRES_PASSWORD}@postgres:5432/nexadesk
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      NEXTAUTH_URL: http://localhost:3000
    depends_on: [postgres, redis]
    volumes: ['./apps/web:/app/apps/web']
    command: pnpm dev

  realtime:
    build: { context: ., dockerfile: packages/realtime/Dockerfile }
    ports: ['3002:3002']
    environment:
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
    depends_on: [redis]

  admin:
    build: { context: ., dockerfile: apps/admin/Dockerfile }
    ports: ['3001:3001']
    environment:
      DATABASE_URL: postgresql://nexadesk:${POSTGRES_PASSWORD}@postgres:5432/nexadesk
    depends_on: [postgres]

volumes:
  postgres_data:
  redis_data:
```

### Dockerfile Production

```dockerfile
# apps/web/Dockerfile
FROM node:22-alpine AS base
RUN corepack enable pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/*/package.json ./packages/*/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build --filter=web

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/web/server.js"]
```

### Variables d'environnement

```bash
# .env.example — à créer à la racine

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/nexadesk"

# Redis
REDIS_URL="redis://:password@localhost:6379"

# Auth
BETTER_AUTH_SECRET="your-secret-32-chars-minimum"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Google OAuth
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# UploadThing
UPLOADTHING_SECRET="sk_live_..."
UPLOADTHING_APP_ID="..."

# Resend (email)
RESEND_API_KEY="re_..."
EMAIL_FROM="noreply@nexadesk.app"

# AI
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-..."

# Sentry
SENTRY_DSN="https://..."
NEXT_PUBLIC_SENTRY_DSN="https://..."

# Admin app (distinct)
ADMIN_SECRET_KEY="..."
ADMIN_JWT_SECRET="..."

# WebSocket
NEXT_PUBLIC_WS_URL="ws://localhost:3002"
```

### GitHub Actions CI/CD

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_PASSWORD: test, POSTGRES_DB: nexadesk_test }
        options: --health-cmd pg_isready
      redis:
        image: redis:7-alpine

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test:unit
      - run: pnpm db:migrate
        env: { DATABASE_URL: postgresql://postgres:test@localhost:5432/nexadesk_test }
      - run: pnpm build
      - name: E2E Tests
        run: pnpm test:e2e
        env: { DATABASE_URL: postgresql://postgres:test@localhost:5432/nexadesk_test }

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Railway
        run: railway up --service nexadesk-web
        env: { RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }} }
```

---

## 18. Standards de Code

### TypeScript — Règles strictes

```typescript
// tsconfig.json — OBLIGATOIRE
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "paths": {
      "@/*": ["./src/*"],
      "@nexadesk/db": ["../../packages/db/src"],
      "@nexadesk/api": ["../../packages/api/src"],
      "@nexadesk/validators": ["../../packages/validators/src"],
    }
  }
}

// INTERDIT :
// ❌ any, as any, @ts-ignore
// ❌ TODO sans ticket référencé
// ❌ console.log en production
// ❌ Mutations directes de state
// ❌ useEffect pour dériver du state
// ❌ Fetch direct sans tRPC/React Query
// ❌ Strings magiques (utiliser const enums)
// ❌ Fonctions > 50 lignes sans extraction
// ❌ Fichiers > 300 lignes sans split
```

### Conventions de nommage

```
Fichiers        : kebab-case         (user-profile.tsx)
Composants      : PascalCase         (UserProfile)
Hooks           : camelCase, préfixe use- (useUserProfile)
Stores Zustand  : camelCase, suffixe Store (userStore)
Types/Interfaces: PascalCase         (UserProfile, IUserProfile)
Constants       : SCREAMING_SNAKE    (MAX_FILE_SIZE)
Variables/funcs : camelCase          (getUserById)
CSS classes     : Tailwind uniquement (pas de CSS modules sauf exceptions)
Routes tRPC     : camelCase          (users.getById, dossiers.create)
Événements WS   : kebab:action       (dossier:created, task:moved)
Clés DB         : snake_case         (tenant_id, created_at)
```

### Architecture des composants React

```typescript
// Structure standard d'un composant :
// 1. Imports (React, librairies, internes)
// 2. Types/Interfaces locaux
// 3. Constantes locales
// 4. Composant principal (export default ou named export)
//    a. Hooks (useState, useQuery, useMutation, custom hooks)
//    b. Derived state (useMemo, useCallback)
//    c. Handlers (handle*)
//    d. Early returns (loading, error, empty)
//    e. Render JSX
// 5. Sous-composants locaux (si courts < 40 lignes)

// TOUJOURS séparer logique et présentation :
// use-dossiers.ts  → logique métier, queries, mutations
// dossier-list.tsx → présentation pure, props typées
// dossier-list.stories.tsx → Storybook si applicable
```

---

## 19. Checklist de livraison

### Obligatoire avant de déclarer terminé

#### Infrastructure
- [ ] Docker Compose fonctionnel (`docker compose up` → app opérationnelle)
- [ ] Migrations DB créées et testées
- [ ] Variables d'environnement documentées (`.env.example` complet)
- [ ] Health checks sur tous les services
- [ ] CI/CD GitHub Actions vert sur `main`

#### Sécurité
- [ ] Authentification JWT + refresh tokens
- [ ] 2FA configurable par utilisateur
- [ ] Rate limiting sur toutes les routes API
- [ ] Row-Level Security PostgreSQL activé
- [ ] Validation Zod sur tous les inputs API
- [ ] Logs audit immuables pour toutes les actions sensibles
- [ ] Sanitisation des inputs (XSS, injection)
- [ ] CORS configuré correctement
- [ ] Headers de sécurité (helmet)
- [ ] Fichiers uploadés : validation type + taille + scan nom

#### Fonctionnel
- [ ] Authentification complète (login, register, 2FA, logout, reset password)
- [ ] Multi-tenant isolé (un tenant ne voit pas les données d'un autre)
- [ ] RBAC fonctionnel (processus + niveaux + habilitations)
- [ ] Tous les modules CRUD complets (pas de bouton désactivé ou placeholder)
- [ ] Drag & drop fonctionnel (Kanban tasks + Kanban dossiers + Dashboard)
- [ ] Temps réel WebSocket (modification visible sur 2 onglets simultanément)
- [ ] Upload fichiers avec prévisualisation
- [ ] Export PDF (factures, rapports)
- [ ] Notifications push temps réel
- [ ] Recherche globale fonctionnelle
- [ ] Panneau admin distant opérationnel
- [ ] Assistant IA avec streaming
- [ ] Mode sombre/clair fonctionnel
- [ ] Responsive mobile (sidebar en drawer)

#### Qualité
- [ ] TypeScript strict — zéro erreur `tsc --noEmit`
- [ ] ESLint — zéro warning
- [ ] Prettier — code formaté
- [ ] Tests unitaires > 80% coverage
- [ ] Tests E2E : tous les flux critiques couverts
- [ ] Performance : Lighthouse score > 90 (Performance, Accessibility, SEO)
- [ ] Aucun `console.log` en production
- [ ] Aucun `TODO` sans référence
- [ ] Bundle size analysé (< 200KB initial JS)
- [ ] Images optimisées (next/image)
- [ ] Fonts auto-hébergées (next/font)

#### Documentation
- [ ] README complet (installation, variables d'env, commandes)
- [ ] Commentaires JSDoc sur fonctions publiques complexes
- [ ] Schéma DB documenté (Drizzle Studio ou ERD)
- [ ] Collection d'API documentée (tRPC panel ou OpenAPI)

---

## Commandes de démarrage

```bash
# Installation
git clone https://github.com/[org]/nexadesk
cd nexadesk
pnpm install

# Développement
docker compose up -d postgres redis       # Démarrer DB + Redis
pnpm db:migrate                           # Appliquer migrations
pnpm db:seed                              # Données initiales
pnpm dev                                  # Démarrer tout (Turborepo)

# Build production
pnpm build                                # Build tous les packages
docker compose -f docker-compose.prod.yml up --build

# Tests
pnpm test:unit                            # Vitest unit tests
pnpm test:e2e                             # Playwright E2E
pnpm typecheck                            # TypeScript check
pnpm lint                                 # ESLint

# DB
pnpm db:generate                          # Générer migration
pnpm db:migrate                           # Appliquer migration
pnpm db:studio                            # Drizzle Studio UI
pnpm db:seed                              # Seed données test
```

---

> **Note finale pour l'IA**
>
> Ce document est **exhaustif et complet**. Tu dois implémenter **chaque élément**
> décrit sans exception ni raccourci. Si une décision d'implémentation n'est pas
> spécifiée, applique les meilleures pratiques de l'industrie pour une application
> SaaS B2B de niveau production. Priorise la **robustesse**, la **sécurité** et
> l'**expérience utilisateur** sur la rapidité d'implémentation.
>
> Commence par : `packages/db/schema/` → `packages/validators/` → `packages/api/` →
> `apps/web/app/(auth)/` → `apps/web/app/(dashboard)/layout.tsx` → modules un par un.
>
> **Livraison attendue : une application 100% fonctionnelle, typée, testée et
> déployable immédiatement en production.**

---

*Rédigé le 03 juin 2026 — Document d'ingénierie NexaDesk SaaS*

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
6. [Authentification & RBAC Avancé](#6-authentification--rbac-avancé)
7. [API — tRPC Routers](#7-api--trpc-routers)
8. [Modules Fonctionnels](#8-modules-fonctionnels)
9. [Système de Modules Dynamiques](#9-système-de-modules-dynamiques)
10. [Wizard d'Onboarding](#10-wizard-donboarding)
11. [Personnalisation — Admin Panel](#11-personnalisation--admin-panel)
12. [Panneau Super-Admin Distant](#12-panneau-super-admin-distant)
13. [Temps Réel — WebSocket](#13-temps-réel--websocket)
14. [Gestion Fichiers](#14-gestion-fichiers)
15. [UI/UX — Design System](#15-uiux--design-system)
16. [Drag & Drop](#16-drag--drop)
17. [Notifications & Alertes](#17-notifications--alertes)
18. [Assistant IA Intégré](#18-assistant-ia-intégré)
19. [Tests](#19-tests)
20. [Déploiement & DevOps](#20-déploiement--devops)
21. [React 19 — Patterns Modernes](#21-react-19--patterns-modernes-obligatoires)
22. [Accessibilité](#22-patterns-daccessibilité-a11y--obligatoires)
23. [Standards de Code](#23-standards-de-code)
24. [Checklist de livraison](#24-checklist-de-livraison)

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
- **Entièrement personnalisable** : modules, champs, workflows, UI, RBAC — tout est configurable sans toucher au code
- **Wizard first-run** : à la première connexion, un assistant interactif configure l'organisation (modules choisis, branding, utilisateurs, processus)
- **Système de modules dynamiques** : chaque module est un plugin activable/désactivable/renommable/fusionnable depuis les paramètres admin
- **Champs personnalisés** : chaque entité (dossier, tâche, contact...) accepte des champs additionnels définis par l'admin (texte, nombre, date, liste, relation)
- **RBAC granulaire** : rôles entièrement configurables — pas de niveaux rigides codés en dur ; héritage, surcharge et permissions par ressource
- **Multi-rôle** : contrôle d'accès par rôle, par processus, par habilitation individuelle et par ressource
- **Temps réel** : synchronisation instantanée — toute modification config (activation module, changement thème, nouveau rôle) se propage sans rechargement
- **100% CRUD** : aucune donnée en lecture seule — tout est éditable, supprimable, archivable
- **Admin distant** : panneau de super-administration accessible hors réseau client
- **Production-ready** : sécurité, performance, observabilité, déploiement Docker

---

## 2. Stack Technique

### Frontend
```
Framework      : Next.js 15.3+ (App Router, PPR, Server Components, Server Actions)
React          : React 19 — use(), useOptimistic, useFormStatus, useActionState,
                 Streaming SSR, Parallel Routes, Intercepting Routes, Metadata API
Langage        : TypeScript 5.5 — strict mode, zéro `any`, noUncheckedIndexedAccess
Styles         : Tailwind CSS v4 + CSS Variables pour thèmes (zéro px hardcodé)
Composants     : shadcn/ui v2 (Radix UI primitives + Tailwind) + design system custom
State global   : Zustand 5 — slices pattern, persist middleware, devtools
Server state   : TanStack Query v5 — prefetch SSR, optimistic updates, infinite queries
Formulaires    : React Hook Form v7 + Zod resolvers + useActionState (Server Actions)
Drag & Drop    : @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities + @dnd-kit/modifiers
Graphiques     : Recharts 2 + Tremor v3 (KPI cards, sparklines, dashboards)
Tables         : TanStack Table v8 — virtual rows, column pinning, multi-sort
Éditeur texte  : Tiptap 2 (ProseMirror) — mentions, tables, images, markdown import/export
Éditeur code   : Monaco Editor — pour templates, formules, config avancée
Animations     : Framer Motion 11 — layout animations, shared element transitions
Icônes         : Lucide React v0.469+ (primaire, strokeWidth uniforme 1.75)
                 @radix-ui/react-icons (secondaire, Radix UI composants natifs)
                 SVG inline optimisé SVGO (illustrations, états vides, logos)
                 INTERDIT : emojis Unicode, images PNG/JPG pour icônes
Date/Heure     : date-fns v3 + date-fns-tz (fuseaux horaires Afrique)
PDF            : @react-pdf/renderer v3 (factures, rapports, exports)
QR Code        : react-qr-code (badges, accès rapide)
Uploads        : UploadThing v7 (S3-compatible, chunked, resumable)
Virtual scroll : @tanstack/react-virtual v3 (listes > 500 items)
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
Monorepo       : Turborepo 2 (caching, parallel pipelines)
Qualité code   : ESLint 9 (flat config) + Prettier 3 + TypeScript strict
                 eslint-plugin-jsx-a11y (accessibilité obligatoire)
                 eslint-plugin-unicorn (bonnes pratiques Node/TS)
                 @typescript-eslint/eslint-plugin (règles TS avancées)
Tests          : Vitest 2 (unit + integration) + Playwright 1.45 (E2E)
                 MSW 2 (API mocking) + @testing-library/react (composants)
Storybook      : Storybook 8 (composants UI isolés — obligatoire pour packages/ui)
Git hooks      : Husky 9 + lint-staged + commitlint (conventional commits)
Analyse bundle : @next/bundle-analyzer + webpack-bundle-analyzer
Perf profiling : React DevTools Profiler + Lighthouse CI
CI/CD          : GitHub Actions (test → build → deploy)
Conteneurisation: Docker 26 + Docker Compose v2
Secrets        : Doppler (dev/staging/prod) ou .env validé par Zod au démarrage
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

## 6. Authentification & RBAC Avancé

### RBAC Complet — Architecture

Le système d'accès est **entièrement configurable par tenant** depuis le panneau admin.
Il n'existe pas de niveaux rigides codés en dur dans le frontend. Tout est piloté
par la base de données et invalidé en temps réel via Redis.

#### Modèle de données RBAC

```typescript
// packages/db/schema/rbac.ts

// Un "rôle" est une collection nommée de permissions, créé par l'admin tenant
export const roles = pgTable('roles', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  tenantId: text('tenant_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),             // 'Directeur', 'Juriste', 'Comptable', 'Stagiaire'...
  description: text('description'),
  color: text('color').default('#6366F1'),  // Couleur affichée dans l'UI
  icon: text('icon').default('Shield'),     // Nom icône Lucide
  level: integer('level').default(1),       // 1-6 (ordre hiérarchique interne, non rigide)
  parentRoleId: text('parent_role_id'),     // Héritage : hérite de toutes les perms du parent
  isDefault: boolean('is_default').default(false),  // Rôle attribué aux nouveaux users
  isSystem: boolean('is_system').default(false),     // Rôle système non supprimable (Admin, Owner)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Les permissions sont des triplets : action sur ressource dans module
// Granularité totale : create/read/read_own/update/update_own/delete/delete_own/archive/export/admin
export const permissions = pgTable('permissions', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  tenantId: text('tenant_id').notNull().references(() => organizations.id),
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  moduleId: text('module_id').notNull(),      // 'dossiers', 'finance', 'sirh', 'juridique'...
  resource: text('resource').notNull(),        // 'dossier', 'invoice', 'employee', '*'
  action: text('action', {
    enum: [
      'create',       // Créer une nouvelle entrée
      'read',         // Lire toutes les entrées du module
      'read_own',     // Lire uniquement ses propres entrées
      'update',       // Modifier toutes les entrées
      'update_own',   // Modifier uniquement ses propres entrées
      'delete',       // Supprimer toutes les entrées
      'delete_own',   // Supprimer uniquement ses propres entrées
      'archive',      // Archiver des entrées
      'export',       // Exporter (CSV, PDF)
      'share',        // Partager avec d'autres utilisateurs
      'approve',      // Valider/approuver (workflows)
      'admin',        // Toutes les actions + configuration du module
    ]
  }).notNull(),
  conditions: jsonb('conditions').$type<PermissionConditions>().default({}).notNull(),
  // conditions = { onlyOwnProcess: true, maxAmount: 1000000, onlyStatus: ['brouillon'] }
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Attribution de rôles aux utilisateurs (N rôles par user, hors modules)
export const userRoles = pgTable('user_roles', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  tenantId: text('tenant_id').notNull().references(() => organizations.id),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  grantedById: text('granted_by_id').references(() => users.id),
  expiresAt: timestamp('expires_at'),         // Rôle temporaire (ex: remplacement)
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Habilitations individuelles sur un module ou une ressource spécifique
// Surcharge ou affine les permissions du rôle pour un user donné
export const userHabilitations = pgTable('user_habilitations', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  tenantId: text('tenant_id').notNull().references(() => organizations.id),
  userId: text('user_id').notNull().references(() => users.id),
  moduleId: text('module_id').notNull(),
  resource: text('resource').notNull(),
  action: text('action').notNull(),
  effect: text('effect', { enum: ['allow', 'deny'] }).notNull(),  // deny = surcharge bloquante
  resourceId: text('resource_id'),           // Sur une ressource spécifique (ex: dossier XYZ)
  grantedById: text('granted_by_id').references(() => users.id),
  expiresAt: timestamp('expires_at'),
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Codes d'accès provisoires (accès temporaire à un module sans rôle permanent)
export const accessCodes = pgTable('access_codes', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  tenantId: text('tenant_id').notNull().references(() => organizations.id),
  code: text('code').notNull(),              // Code unique alphanumérique
  moduleId: text('module_id').notNull(),
  maxUses: integer('max_uses').default(1),
  usedCount: integer('used_count').default(0),
  expiresAt: timestamp('expires_at').notNull(),
  createdById: text('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

type PermissionConditions = {
  onlyOwnProcess?: boolean        // Ne voit que les ressources de son processus
  onlyOwnEntries?: boolean        // Ne voit que ce qu'il a créé
  maxAmount?: number              // Finance : montant max qu'il peut valider
  allowedStatuses?: string[]      // Seulement les ressources dans ces statuts
  requireApproval?: boolean       // Ses actions nécessitent une validation
  ipWhitelist?: string[]          // Restreindre à certaines IP LAN
}
```

#### Moteur de vérification d'accès — checkPermission()

```typescript
// packages/api/lib/rbac.ts
// TOUTES les mutations et queries passent par cette fonction.
// Ne jamais vérifier manuellement user.level dans les routers.

import { cache } from 'react'
import type { User, Permission } from '@nexadesk/db'

export type PermissionAction =
  | 'create' | 'read' | 'read_own' | 'update' | 'update_own'
  | 'delete' | 'delete_own' | 'archive' | 'export' | 'share'
  | 'approve' | 'admin'

export interface AccessContext {
  userId: string
  tenantId: string
  moduleId: string
  action: PermissionAction
  resource?: string
  resourceId?: string           // Pour vérifier la propriété (own vs all)
  resourceOwnerId?: string      // createdById de la ressource cible
  resourceData?: Record<string, unknown>  // Pour vérifier les conditions
}

export async function checkPermission(
  ctx: AccessContext,
  db: DrizzleDb,
  redis: Redis
): Promise<{ allowed: boolean; reason?: string }> {
  const cacheKey = `rbac:${ctx.tenantId}:${ctx.userId}:${ctx.moduleId}:${ctx.action}`

  // 1. Cache Redis (TTL 30s) pour éviter N+1 queries sur chaque requête
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  // 2. Vérifier si le tenant a ce module activé
  const tenantModules = await getTenantModules(ctx.tenantId, db, redis)
  if (!tenantModules.includes(ctx.moduleId)) {
    return cache_and_return(redis, cacheKey, { allowed: false, reason: 'module_disabled' })
  }

  // 3. Récupérer tous les rôles + permissions de l'utilisateur
  const userRoles = await getUserRolesWithPermissions(ctx.userId, ctx.tenantId, db)

  // 4. Construire l'ensemble des permissions effectives (avec héritage de rôles)
  const effectivePerms = await resolveEffectivePermissions(userRoles, ctx.moduleId)

  // 5. Vérifier les habilitations individuelles (surcharge DENY en priorité max)
  const habilitations = await getUserHabilitations(ctx.userId, ctx.tenantId, ctx.moduleId, db)
  const denyHab = habilitations.find(h =>
    h.effect === 'deny' &&
    (h.action === ctx.action || h.action === '*') &&
    (!h.resourceId || h.resourceId === ctx.resourceId)
  )
  if (denyHab) {
    return cache_and_return(redis, cacheKey, { allowed: false, reason: 'explicit_deny' })
  }

  const allowHab = habilitations.find(h =>
    h.effect === 'allow' &&
    (h.action === ctx.action || h.action === '*')
  )
  if (allowHab) {
    return cache_and_return(redis, cacheKey, { allowed: true, reason: 'habilitation' })
  }

  // 6. Chercher une permission directe ou via action 'own' + propriété
  const directPerm = effectivePerms.find(p =>
    p.action === ctx.action || p.action === 'admin'
  )
  if (directPerm) {
    const condOk = evaluateConditions(directPerm.conditions, ctx)
    return cache_and_return(redis, cacheKey, { allowed: condOk, reason: condOk ? 'role_perm' : 'condition_failed' })
  }

  // 7. Tenter la variante 'own' (ex: demande update mais n'a que update_own)
  const ownVariant = `${ctx.action}_own` as PermissionAction
  const ownPerm = effectivePerms.find(p => p.action === ownVariant)
  if (ownPerm && ctx.resourceOwnerId === ctx.userId) {
    const condOk = evaluateConditions(ownPerm.conditions, ctx)
    return cache_and_return(redis, cacheKey, { allowed: condOk, reason: 'own_perm' })
  }

  return cache_and_return(redis, cacheKey, { allowed: false, reason: 'no_permission' })
}

// Invalider le cache RBAC d'un user quand ses rôles changent
export async function invalidateUserRbacCache(userId: string, tenantId: string, redis: Redis) {
  const keys = await redis.keys(`rbac:${tenantId}:${userId}:*`)
  if (keys.length > 0) await redis.del(...keys)
}

// Invalider tout le cache RBAC d'un tenant (ex: modification d'un rôle)
export async function invalidateTenantRbacCache(tenantId: string, redis: Redis) {
  const keys = await redis.keys(`rbac:${tenantId}:*`)
  if (keys.length > 0) await redis.del(...keys)
}
```

#### Utilisation dans les tRPC routers

```typescript
// Middleware tRPC réutilisable
const requirePermission = (moduleId: string, action: PermissionAction) =>
  t.middleware(async ({ ctx, next, input }) => {
    const { allowed, reason } = await checkPermission(
      {
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
        moduleId,
        action,
        resourceId: (input as { id?: string })?.id,
        resourceOwnerId: (input as { createdById?: string })?.createdById,
      },
      ctx.db,
      ctx.redis
    )
    if (!allowed) throw new TRPCError({ code: 'FORBIDDEN', message: reason })
    return next()
  })

// Usage dans un router :
export const dossiersRouter = router({
  list:   protectedProcedure.use(requirePermission('dossiers', 'read')).query(...),
  create: protectedProcedure.use(requirePermission('dossiers', 'create')).mutation(...),
  update: protectedProcedure.use(requirePermission('dossiers', 'update')).mutation(...),
  delete: protectedProcedure.use(requirePermission('dossiers', 'delete')).mutation(...),
  export: protectedProcedure.use(requirePermission('dossiers', 'export')).mutation(...),
  approve:protectedProcedure.use(requirePermission('dossiers', 'approve')).mutation(...),
})
```

#### Rôles système par défaut (seed initial)

```typescript
// packages/db/seed/rbac.ts
// Ces rôles sont créés automatiquement à l'onboarding — modifiables ensuite

export const DEFAULT_ROLES = [
  {
    name: 'Propriétaire',
    level: 6,
    isSystem: true,
    description: 'Accès total — propriétaire de l\'organisation',
    permissions: [{ moduleId: '*', resource: '*', action: 'admin' }],
  },
  {
    name: 'Administrateur',
    level: 5,
    isSystem: true,
    description: 'Administration SI — gestion comptes, modules, configuration',
    permissions: [{ moduleId: '*', resource: '*', action: 'admin' }],
  },
  {
    name: 'Direction',
    level: 4,
    description: 'Vision globale — lecture tous modules, validation finale',
    permissions: [
      { moduleId: '*', resource: '*', action: 'read' },
      { moduleId: '*', resource: '*', action: 'approve' },
      { moduleId: '*', resource: '*', action: 'export' },
    ],
  },
  {
    name: 'Responsable',
    level: 3,
    description: 'Gestion complète de son département',
    permissions: [
      { moduleId: '*', resource: '*', action: 'read' },
      { moduleId: '*', resource: '*', action: 'create' },
      { moduleId: '*', resource: '*', action: 'update' },
      { moduleId: '*', resource: '*', action: 'delete_own' },
      { moduleId: '*', resource: '*', action: 'archive' },
    ],
  },
  {
    name: 'Collaborateur',
    level: 2,
    isDefault: true,
    description: 'Accès à son processus — création et modification propres entrées',
    permissions: [
      { moduleId: '*', resource: '*', action: 'read_own' },
      { moduleId: '*', resource: '*', action: 'create' },
      { moduleId: '*', resource: '*', action: 'update_own' },
    ],
  },
  {
    name: 'Observateur',
    level: 1,
    description: 'Lecture seule sur les modules autorisés',
    permissions: [
      { moduleId: '*', resource: '*', action: 'read_own' },
    ],
  },
] as const
// L'admin peut créer des rôles additionnels : 'Juriste', 'Comptable', 'Auditeur', etc.
// avec des permissions exactement calibrées pour son organisation
```

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
// Règle icône : toujours LucideIcon, jamais emoji
type KpiCardProps = {
  title: string
  value: number | string
  change?: number               // % évolution vs période précédente
  trend?: 'up' | 'down' | 'neutral'
  icon: LucideIcon              // Ex: DollarSign, FolderKanban, Users, CheckSquare
  iconColor?: string            // Ex: 'text-emerald-500' (Tailwind class)
  format?: 'number' | 'currency' | 'percent' | 'duration'
  currency?: 'XAF' | 'EUR' | 'USD'
  sparkline?: number[]          // 7 dernières valeurs pour mini-graphique
  onClick?: () => void
  loading?: boolean
  description?: string          // Sous-titre contextuel
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

## 9. Système de Modules Dynamiques

### Principe

Chaque module de l'application est un **plugin enregistré**, jamais hardcodé dans la
navigation ou le routing. L'admin peut activer, désactiver, renommer, réordonner,
fusionner ou même créer de nouveaux modules sans modifier le code source.
Un module désactivé n'apparaît nulle part dans l'UI — ni dans la sidebar, ni dans
les permissions, ni dans les rapports. Sa désactivation est propagée en temps réel
à tous les postes via Redis pub/sub + WebSocket.

### Schéma DB — Registre des modules

```typescript
// packages/db/schema/modules.ts

// Catalogue de tous les modules disponibles sur la plateforme
export const moduleRegistry = pgTable('module_registry', {
  id: text('id').primaryKey(),               // Identifiant stable : 'dossiers', 'finance'...
  slug: text('slug').notNull().unique(),      // URL-safe : 'dossiers', 'finance', 'legal'
  defaultLabel: text('default_label').notNull(),   // Label par défaut (FR)
  defaultIcon: text('default_icon').notNull(),     // Nom icône Lucide : 'FolderKanban'
  defaultColor: text('default_color').notNull(),   // '#6366F1'
  category: text('category', {
    enum: ['core', 'metier', 'support', 'admin', 'custom']
  }).notNull(),
  description: text('description'),
  dependencies: text('dependencies').array().default([]),  // Modules requis avant activation
  incompatible: text('incompatible').array().default([]),  // Modules mutuellement exclusifs
  isMergeable: boolean('is_mergeable').default(true),      // Peut être fusionné avec un autre
  isRemovable: boolean('is_removable').default(true),      // Peut être désactivé
  version: text('version').default('1.0.0').notNull(),
  componentPath: text('component_path').notNull(),         // Import dynamique React
  routerPath: text('router_path').notNull(),               // tRPC router à monter
})

// Configuration du module par tenant (personnalisation complète)
export const tenantModules = pgTable('tenant_modules', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  tenantId: text('tenant_id').notNull().references(() => organizations.id),
  moduleId: text('module_id').notNull().references(() => moduleRegistry.id),

  // Personnalisation affichage
  label: text('label'),             // Surcharge du label : 'Juridique' → 'Pôle Legal'
  icon: text('icon'),               // Surcharge icône Lucide
  color: text('color'),             // Surcharge couleur
  description: text('description'), // Texte affiché dans le menu et les accès refusés

  // État
  isEnabled: boolean('is_enabled').default(true).notNull(),
  position: integer('position').default(0).notNull(),  // Ordre sidebar (drag & drop)

  // Fusion de modules : juridique + conformite → 'Legal & Compliance'
  mergedInto: text('merged_into'),        // moduleId cible si ce module est fusionné
  isMergeTarget: boolean('is_merge_target').default(false), // Ce module accueille la fusion

  // Config spécifique au module (features flags internes)
  config: jsonb('config').$type<ModuleConfig>().default({}).notNull(),
  /*
  ModuleConfig exemples :
  - dossiers  : { enableKanban: true, enableGantt: false, maxAttachmentMB: 50 }
  - finance   : { currency: 'XAF', taxRate: 18, enableOHADA: true, enableDevis: true }
  - sirh      : { enablePayroll: true, enableLeaves: true, leaveApprovalLevels: 2 }
  - juridique : { enableOHADA: true, enableContracts: true, enableLitiges: false }
  */

  // Qui peut accéder : liste de roleIds OU processus OU '*' (tous avec rôle)
  allowedRoles: text('allowed_roles').array().default([]).notNull(),
  allowedProcesses: text('allowed_processes').array().default([]).notNull(),
  isStrictAccess: boolean('is_strict_access').default(false), // Bloque codes provisoires

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  uniq: unique().on(t.tenantId, t.moduleId),
}))

// Champs personnalisés ajoutés à une entité par le tenant
export const customFields = pgTable('custom_fields', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  tenantId: text('tenant_id').notNull().references(() => organizations.id),
  moduleId: text('module_id').notNull(),
  entityType: text('entity_type').notNull(),  // 'dossier', 'task', 'employee', 'invoice'...
  name: text('name').notNull(),               // Slug interne : 'numero_tribunal'
  label: text('label').notNull(),             // Affiché : 'N° Tribunal'
  type: text('type', {
    enum: ['text','textarea','number','currency','date','datetime','boolean',
           'select','multiselect','relation','file','url','email','phone','richtext']
  }).notNull(),
  options: jsonb('options').$type<CustomFieldOptions>().default({}).notNull(),
  /*
  options selon type :
  - select/multiselect : { choices: [{value, label, color}] }
  - relation           : { targetModule: 'partners', displayField: 'name' }
  - number/currency    : { min, max, decimals, prefix, suffix }
  - text               : { maxLength, pattern, placeholder }
  */
  isRequired: boolean('is_required').default(false),
  isSearchable: boolean('is_searchable').default(false),
  isFilterable: boolean('is_filterable').default(false),
  showInList: boolean('show_in_list').default(false),  // Colonne visible dans la liste
  showInCard: boolean('show_in_card').default(false),  // Visible sur les cards
  position: integer('position').default(0),
  section: text('section').default('Informations complémentaires'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Valeurs des champs personnalisés
export const customFieldValues = pgTable('custom_field_values', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  tenantId: text('tenant_id').notNull().references(() => organizations.id),
  fieldId: text('field_id').notNull().references(() => customFields.id, { onDelete: 'cascade' }),
  entityId: text('entity_id').notNull(),  // ID de la ressource (dossier, tâche, etc.)
  value: jsonb('value'),                  // Valeur sérialisée (string|number|string[]|...)
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  uniq: unique().on(t.fieldId, t.entityId),
}))
```

### Routing dynamique des modules

```typescript
// apps/web/lib/modules/module-loader.ts
// Chaque module est chargé dynamiquement — seuls les modules activés sont bundlés

import { lazy } from 'react'
import type { TenantModule } from '@nexadesk/db'

// Registre statique des composants disponibles
const MODULE_COMPONENTS: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  dossiers:       () => import('@/components/modules/dossiers'),
  tasks:          () => import('@/components/modules/tasks'),
  finance:        () => import('@/components/modules/finance'),
  juridique:      () => import('@/components/modules/juridique'),
  sirh:           () => import('@/components/modules/sirh'),
  audit:          () => import('@/components/modules/audit'),
  conformite:     () => import('@/components/modules/conformite'),
  conseil:        () => import('@/components/modules/conseil'),
  communication:  () => import('@/components/modules/communication'),
  logistique:     () => import('@/components/modules/logistique'),
  messagerie:     () => import('@/components/modules/messagerie'),
  agenda:         () => import('@/components/modules/agenda'),
  rapports:       () => import('@/components/modules/rapports'),
  // Modules fusionnés (combinaisons fréquentes)
  'juridique+conformite': () => import('@/components/modules/legal-compliance'),
  'audit+conformite':     () => import('@/components/modules/audit-compliance'),
}

export function getModuleComponent(moduleId: string) {
  // Gère les fusions : si juridique est fusionné dans un target, charger le composant combiné
  const loader = MODULE_COMPONENTS[moduleId]
  if (!loader) throw new Error(`Module '${moduleId}' not found in registry`)
  return lazy(loader)
}

// Hook côté client pour accéder aux modules actifs du tenant
// apps/web/lib/hooks/use-modules.ts
export function useEnabledModules() {
  const { data: modules } = trpc.tenant.getEnabledModules.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,   // 5 min — rarement change
  })
  return modules ?? []
}

// Navigation sidebar générée dynamiquement
export function useSidebarNavigation() {
  const modules = useEnabledModules()
  const { data: permissions } = trpc.permissions.myPermissions.useQuery()

  return useMemo(() =>
    modules
      .filter(m => permissions?.canAccessModule(m.moduleId))
      .sort((a, b) => a.position - b.position)
      .map(m => ({
        href:   `/dashboard/${m.slug}`,
        label:  m.label ?? m.defaultLabel,
        icon:   m.icon  ?? m.defaultIcon,   // Nom icône Lucide résolu dynamiquement
        color:  m.color ?? m.defaultColor,
        badge:  getBadgeCount(m.moduleId),
      })),
    [modules, permissions]
  )
}
```

### Module fusion — "Legal & Compliance"

```typescript
// Quand l'admin fusionne juridique + conformite :
// 1. tenantModules.juridique  → mergedInto = 'legal_compliance'
// 2. tenantModules.conformite → mergedInto = 'legal_compliance'
// 3. tenantModules crée une entrée  { moduleId: 'legal_compliance', isMergeTarget: true }
// 4. Le routing /dashboard/legal_compliance charge le composant combiné
// 5. Les permissions RBAC existantes sont préservées (les deux modules comptent)
// 6. Dans la sidebar, une seule entrée "Legal & Compliance" apparaît
// 7. L'URL /dashboard/juridique redirige vers /dashboard/legal_compliance

// Le composant fusionné est un layout avec onglets :
// <Tabs>
//   <TabsList>
//     <TabsTrigger value="juridique">Juridique</TabsTrigger>
//     <TabsTrigger value="conformite">Conformité</TabsTrigger>
//   </TabsList>
//   <TabsContent value="juridique"><JuridiqueModule /></TabsContent>
//   <TabsContent value="conformite"><ConformiteModule /></TabsContent>
// </Tabs>
```

---

## 10. Wizard d'Onboarding

### Principe

À la **première connexion** d'un nouveau tenant (après création du compte), un wizard
interactif en plusieurs étapes guide l'administrateur pour configurer son organisation.
Le wizard ne peut pas être skippé. Une fois terminé, il ne se réaffiche pas (sauf reset
depuis les paramètres admin). Chaque réponse est sauvegardée en DB dès validation de l'étape.

### Schéma DB

```typescript
// packages/db/schema/onboarding.ts
export const onboardingState = pgTable('onboarding_state', {
  tenantId: text('tenant_id').primaryKey().references(() => organizations.id),
  completed: boolean('completed').default(false).notNull(),
  currentStep: integer('current_step').default(1).notNull(),
  completedSteps: integer('completed_steps').array().default([]).notNull(),
  responses: jsonb('responses').$type<OnboardingResponses>().default({}).notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
})

type OnboardingResponses = {
  organization?:  OrganizationSetup
  modules?:       ModulesSetup
  branding?:      BrandingSetup
  processes?:     ProcessesSetup
  users?:         UsersSetup
  roles?:         RolesSetup
}
```

### Étapes du wizard (7 étapes)

```typescript
// apps/web/app/onboarding/page.tsx — SERVER COMPONENT
// apps/web/components/onboarding/wizard.tsx — CLIENT COMPONENT

const ONBOARDING_STEPS: OnboardingStep[] = [
  // ── ÉTAPE 1 : Informations organisation ─────────────────────────
  {
    id: 1,
    title: 'Votre organisation',
    description: 'Ces informations apparaîtront sur vos documents officiels',
    icon: 'Building2',   // Lucide
    fields: [
      { name: 'name',           label: 'Nom de l\'organisation',   type: 'text',     required: true },
      { name: 'legalName',      label: 'Raison sociale',           type: 'text',     required: false },
      { name: 'type',           label: 'Type d\'organisation',     type: 'select',
        options: [
          { value: 'cabinet_conseil',  label: 'Cabinet de conseil' },
          { value: 'pme',              label: 'PME / Entreprise' },
          { value: 'ngo',              label: 'ONG / Association' },
          { value: 'administration',   label: 'Administration publique' },
          { value: 'autre',            label: 'Autre' },
        ]
      },
      { name: 'country',        label: 'Pays',                     type: 'country-select', default: 'GA' },
      { name: 'city',           label: 'Ville',                    type: 'text' },
      { name: 'address',        label: 'Adresse',                  type: 'textarea' },
      { name: 'phone',          label: 'Téléphone',                type: 'phone' },
      { name: 'email',          label: 'Email',                    type: 'email' },
      { name: 'website',        label: 'Site web',                 type: 'url',      required: false },
      { name: 'taxId',          label: 'Numéro fiscal / RCCM',     type: 'text',     required: false },
      { name: 'currency',       label: 'Devise principale',        type: 'select',
        options: [
          { value: 'XAF', label: 'Franc CFA (XAF)' },
          { value: 'EUR', label: 'Euro (EUR)' },
          { value: 'USD', label: 'Dollar US (USD)' },
          { value: 'GNF', label: 'Franc Guinéen (GNF)' },
          { value: 'XOF', label: 'Franc CFA UEMOA (XOF)' },
        ],
        default: 'XAF'
      },
      { name: 'timezone',       label: 'Fuseau horaire',           type: 'timezone-select', default: 'Africa/Libreville' },
      { name: 'language',       label: 'Langue de l\'interface',   type: 'select',
        options: [{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }],
        default: 'fr'
      },
      { name: 'logo',           label: 'Logo (facultatif)',        type: 'file-upload', accept: 'image/*' },
    ],
  },

  // ── ÉTAPE 2 : Sélection des modules ─────────────────────────────
  {
    id: 2,
    title: 'Vos modules métier',
    description: 'Sélectionnez les modules dont vous avez besoin. Vous pourrez en ajouter ou en retirer à tout moment.',
    icon: 'LayoutGrid',
    // Affichage en grille de cards avec icône Lucide, description et toggle
    // Groupés par catégorie : Pilotage, Opérationnel, Support
    // Certains modules sont liés (ex: activer Finance suggère d'activer Logistique)
    moduleGroups: [
      {
        label: 'Pilotage & Stratégie',
        modules: [
          { id: 'conseil',        label: 'Conseil & Stratégie',        icon: 'Target',       default: true },
          { id: 'audit',          label: 'Audit & Contrôle',           icon: 'ShieldCheck',  default: false },
          { id: 'conformite',     label: 'Conformité',                  icon: 'ShieldAlert',  default: false },
          { id: 'rapports',       label: 'Rapports d\'activité',        icon: 'BarChart3',    default: true },
        ]
      },
      {
        label: 'Gestion Opérationnelle',
        modules: [
          { id: 'dossiers',       label: 'Dossiers & Documents',       icon: 'FolderKanban', default: true },
          { id: 'tasks',          label: 'Tâches & Projets',           icon: 'CheckSquare',  default: true },
          { id: 'juridique',      label: 'Juridique & OHADA',          icon: 'Scale',        default: false },
          { id: 'agenda',         label: 'Agenda & Planification',     icon: 'CalendarDays', default: true },
        ]
      },
      {
        label: 'Support & Ressources',
        modules: [
          { id: 'finance',        label: 'Finance & Comptabilité',     icon: 'DollarSign',   default: false },
          { id: 'sirh',           label: 'Ressources Humaines (SIRH)', icon: 'Users',        default: false },
          { id: 'logistique',     label: 'Logistique & Achats',        icon: 'Truck',        default: false },
          { id: 'communication',  label: 'Communication & Marketing',  icon: 'Megaphone',    default: false },
          { id: 'messagerie',     label: 'Messagerie Interne',         icon: 'MessageSquare',default: true },
        ]
      },
    ],
    // Option de fusion suggérée
    mergeSuggestions: [
      {
        modules: ['juridique', 'conformite'],
        label: 'Fusionner en "Legal & Compliance"',
        description: 'Regroupe Juridique et Conformité dans un seul espace',
      },
      {
        modules: ['audit', 'conformite'],
        label: 'Fusionner en "Audit & Conformité"',
        description: 'Pour les cabinets axés audit réglementaire',
      },
    ],
  },

  // ── ÉTAPE 3 : Branding & Thème ──────────────────────────────────
  {
    id: 3,
    title: 'Apparence & Branding',
    description: 'Personnalisez l\'interface aux couleurs de votre organisation',
    icon: 'Palette',
    fields: [
      {
        name: 'primaryColor',
        label: 'Couleur principale',
        type: 'color-picker',
        default: '#0A1E4A',
        description: 'Utilisée pour la sidebar, les boutons principaux et les en-têtes'
      },
      {
        name: 'accentColor',
        label: 'Couleur d\'accent',
        type: 'color-picker',
        default: '#C9A84C',
        description: 'Pour les badges, highlights et éléments de focus'
      },
      {
        name: 'theme',
        label: 'Thème de base',
        type: 'theme-selector',
        options: [
          { value: 'dark',   label: 'Sombre',         preview: 'bg-slate-950' },
          { value: 'light',  label: 'Clair',          preview: 'bg-white' },
          { value: 'system', label: 'Selon le système', preview: 'bg-gradient-to-r from-slate-950 to-white' },
        ],
        default: 'dark'
      },
      {
        name: 'borderRadius',
        label: 'Style des composants',
        type: 'select',
        options: [
          { value: '0',    label: 'Angulaire (0px)' },
          { value: '4px',  label: 'Légèrement arrondi (4px)' },
          { value: '8px',  label: 'Arrondi (8px) — recommandé' },
          { value: '12px', label: 'Très arrondi (12px)' },
        ],
        default: '8px'
      },
      {
        name: 'fontFamily',
        label: 'Police de caractères',
        type: 'select',
        options: [
          { value: 'Inter',        label: 'Inter — Moderne, lisible' },
          { value: 'DM Sans',      label: 'DM Sans — Épuré, professionnel' },
          { value: 'Plus Jakarta', label: 'Plus Jakarta Sans — Élégant' },
          { value: 'Geist',        label: 'Geist — Tech, contemporain' },
        ],
        default: 'Inter'
      },
      { name: 'appName', label: 'Nom de l\'application (affiché)', type: 'text', default: '' },
      { name: 'favicon', label: 'Favicon (optionnel)', type: 'file-upload', accept: '.ico,.png,.svg' },
    ],
    // Prévisualisation live en temps réel à droite du formulaire
    livePreview: true,
  },

  // ── ÉTAPE 4 : Structure organisationnelle ────────────────────────
  {
    id: 4,
    title: 'Processus & Départements',
    description: 'Définissez la structure de votre organisation. Vous pourrez la modifier ensuite.',
    icon: 'Network',
    // Affichage dynamique : soit utiliser les processus GC prédéfinis,
    // soit créer une structure personnalisée
    mode: 'choice',
    choices: [
      {
        value: 'gc_standard',
        label: 'Structure Génie Consultant (recommandée)',
        description: 'P01–P04 Pilotage, O01–O03 Opérationnel, S01–S06 Support',
        presets: 'GC_PROCESS_PRESETS',
      },
      {
        value: 'custom',
        label: 'Structure personnalisée',
        description: 'Créez vos propres départements et processus',
      },
    ],
    // En mode custom : interface drag & drop pour créer des processus/départements
    // avec nom, couleur, modules associés
  },

  // ── ÉTAPE 5 : Premier utilisateur admin ─────────────────────────
  {
    id: 5,
    title: 'Votre compte administrateur',
    description: 'Configurez le compte principal de l\'administrateur SI',
    icon: 'UserCog',
    autoFilled: true,  // Pré-remplit avec le compte de création
    fields: [
      { name: 'adminName',     label: 'Nom complet',    type: 'text',  required: true },
      { name: 'adminEmail',    label: 'Email',          type: 'email', required: true, readonly: true },
      { name: 'adminPhone',    label: 'Téléphone',      type: 'phone' },
      { name: 'adminFonction', label: 'Fonction',       type: 'text' },
    ],
  },

  // ── ÉTAPE 6 : Inviter des collaborateurs ────────────────────────
  {
    id: 6,
    title: 'Inviter votre équipe',
    description: 'Vous pouvez inviter des collaborateurs maintenant ou le faire plus tard',
    icon: 'UserPlus',
    optional: true,  // Peut être skippée
    // Interface d'invitation par email en masse :
    // - Saisie emails (un par ligne ou CSV)
    // - Attribution rôle par défaut
    // - Attribution processus
    // - Envoi email d'invitation avec lien d'activation
    // Message : "Vous pourrez gérer les accès en détail depuis les Paramètres"
  },

  // ── ÉTAPE 7 : Récapitulatif & Lancement ─────────────────────────
  {
    id: 7,
    title: 'Votre espace est prêt',
    description: 'Récapitulatif de la configuration',
    icon: 'CheckCircle2',
    // Affiche un résumé de tous les choix + CTA "Accéder à mon tableau de bord"
    // Animation de célébration (Framer Motion — pas d'emoji, animation SVG)
    // Option "Visiter la documentation" et "Voir la vidéo de démarrage"
  },
]
```

### tRPC Router onboarding

```typescript
// packages/api/routers/onboarding.ts
export const onboardingRouter = router({
  getState: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.onboardingState.findFirst({
      where: eq(onboardingState.tenantId, ctx.tenantId),
    })
  }),

  saveStep: protectedProcedure
    .input(z.object({
      step: z.number().min(1).max(7),
      data: z.record(z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdmin(ctx.user)) throw new TRPCError({ code: 'FORBIDDEN' })

      // Sauvegarder les réponses et appliquer les effets de l'étape
      await applyOnboardingStep(ctx, input.step, input.data)

      await ctx.db.insert(onboardingState)
        .values({ tenantId: ctx.tenantId, currentStep: input.step + 1, completedSteps: [input.step] })
        .onConflictDoUpdate({
          target: onboardingState.tenantId,
          set: {
            currentStep: input.step + 1,
            completedSteps: sql`array_append(completed_steps, ${input.step})`,
            responses: sql`responses || ${JSON.stringify({ [`step${input.step}`]: input.data })}::jsonb`,
          }
        })
    }),

  complete: protectedProcedure.mutation(async ({ ctx }) => {
    if (!isAdmin(ctx.user)) throw new TRPCError({ code: 'FORBIDDEN' })
    await ctx.db.update(onboardingState)
      .set({ completed: true, completedAt: new Date() })
      .where(eq(onboardingState.tenantId, ctx.tenantId))

    // Broadcaster aux autres onglets ouverts
    await emitToTenant(ctx.tenantId, 'onboarding:complete', {})
    revalidatePath('/')
  }),
})
```

---

## 11. Personnalisation — Admin Panel

### Vue d'ensemble

Le panneau d'administration du **tenant** (pas le super-admin) est accessible depuis
`/dashboard/settings`. Il est distinct du super-admin distant. Il permet à l'administrateur
de l'organisation de personnaliser **intégralement** l'application sans toucher au code.
Toute modification est **immédiatement propagée** à tous les postes via WebSocket.

### Sections du panneau admin tenant

```
/settings/
├── general/              Infos organisation, branding, thème
├── modules/              Activer/désactiver/renommer/fusionner/réordonner les modules
├── custom-fields/        Champs personnalisés par module et entité
├── workflows/            Workflows de validation configurables
├── roles/                Gestion des rôles RBAC
├── permissions/          Permissions granulaires par rôle et module
├── users/                Gestion des utilisateurs, rôles, invitation
├── processes/            Départements et processus métier
├── notifications/        Règles de notification par événement
├── email-templates/      Templates emails transactionnels (Tiptap editor)
├── integrations/         Webhooks, API keys, intégrations tierces
├── audit-log/            Journal d'audit (lecture seule)
└── danger-zone/          Reset onboarding, export data, supprimer organisation
```

### 11.1 Gestionnaire de Modules

```typescript
// apps/web/components/settings/modules/module-manager.tsx
// Interface complète de gestion des modules

// Fonctionnalités :
// - Liste des modules disponibles avec état (actif/inactif)
// - Drag & drop pour réordonner la sidebar
// - Toggle rapide (switch) avec confirmation si désactivation a un impact
// - Édition inline : renommer le label, changer l'icône (picker Lucide), changer la couleur
// - Bouton "Configurer" : ouvre un panneau de config spécifique au module
// - Bouton "Fusionner" : sélectionner un autre module et créer l'entrée fusionnée
// - Section "Créer un module personnalisé" pour les cas avancés

// Composant IconPicker — sélectionne une icône Lucide
// Affiche une grille searchable de toutes les icônes Lucide disponibles
// Input de recherche par nom : "folder", "shield", "chart"...
// Prévisualisation en temps réel sur le module card

type ModuleManagerProps = {
  modules: TenantModule[]
  onToggle: (moduleId: string, enabled: boolean) => Promise<void>
  onRename: (moduleId: string, label: string) => Promise<void>
  onReorder: (orderedIds: string[]) => Promise<void>
  onChangeIcon: (moduleId: string, icon: string) => Promise<void>
  onMerge: (sourceId: string, targetId: string, mergedLabel: string) => Promise<void>
  onConfigure: (moduleId: string) => void
}
```

### 11.2 Gestionnaire de Champs Personnalisés

```typescript
// apps/web/components/settings/custom-fields/field-builder.tsx
// Interface drag & drop pour créer et ordonner des champs personnalisés

// Pour chaque module activé, l'admin peut :
// - Ajouter des champs à n'importe quelle entité (dossier, tâche, facture, employé...)
// - Définir le type (texte, nombre, date, liste déroulante, multi-sélection, relation, fichier)
// - Définir les options (pour les listes : valeurs, couleurs, icônes par choix)
// - Définir les validations (required, min, max, pattern regex)
// - Choisir où le champ apparaît (liste, card, formulaire, détail, export)
// - Ordonner par drag & drop
// - Grouper dans des sections

// Les champs personnalisés sont automatiquement :
// - Intégrés dans les formulaires de création/édition (React Hook Form dynamic fields)
// - Filtrables dans les listes (si isFilterable: true)
// - Exportables (CSV, PDF)
// - Indexés pour la recherche (si isSearchable: true)

// Composant dynamique pour rendre les champs custom dans les formulaires :
function CustomFieldsSection({ entityType, entityId, moduleId, mode }: CustomFieldSectionProps) {
  const { data: fields } = trpc.customFields.list.useQuery({ entityType, moduleId })
  const { data: values } = trpc.customFieldValues.get.useQuery({ entityId })

  return (
    <div className="space-y-4">
      {fields?.sections.map(section => (
        <fieldset key={section.name} className="rounded-lg border p-4">
          <legend className="px-2 text-sm font-semibold text-muted-foreground">
            {section.name}
          </legend>
          <div className="grid gap-3">
            {section.fields.map(field => (
              <DynamicField
                key={field.id}
                field={field}
                value={values?.[field.id]}
                mode={mode}   // 'edit' | 'view' | 'filter'
              />
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  )
}
```

### 11.3 Configurateur de Workflows

```typescript
// apps/web/components/settings/workflows/workflow-builder.tsx
// Builder drag & drop d'étapes de validation

// L'admin peut configurer pour chaque module/entité un workflow de validation :
// - Nombre d'étapes (1 à N)
// - Pour chaque étape : rôle requis, processus requis, conditions (ex: si montant > 1M)
// - Notifications automatiques lors des transitions
// - Délais et relances automatiques
// - Actions bloquantes vs informatives

type WorkflowStep = {
  id: string
  label: string              // 'Validation Responsable', 'Approbation DG'
  order: number
  approverType: 'role' | 'process' | 'specific_user' | 'any'
  approverValue: string      // roleId | processId | userId | '*'
  conditions: WorkflowCondition[]
  /*
  WorkflowCondition exemples :
  { field: 'amount', operator: '>', value: 1000000 }  → étape requise seulement si montant > 1M XAF
  { field: 'priority', operator: '=', value: 'critical' }
  { field: 'category', operator: 'in', value: ['contrat', 'mandat'] }
  */
  isMandatory: boolean
  timeoutHours?: number      // Relance auto si pas de validation après N heures
  timeoutAction?: 'escalate' | 'auto_approve' | 'auto_reject'
  notifyOnEnter?: string[]   // roleIds à notifier quand l'étape devient active
  requiredDocuments?: string[] // Documents à joindre obligatoirement
}

// Affichage visuel : pipeline horizontal avec flèches entre les étapes
// Chaque étape est une card draggable (réordonner = changer l'ordre de validation)
```

### 11.4 Gestionnaire de Rôles & Permissions

```typescript
// apps/web/components/settings/roles/role-manager.tsx
// Interface complète RBAC visuelle

// Structure de l'interface :
// Panneau gauche : liste des rôles (drag pour réordonner hiérarchie)
// Panneau droit : permissions du rôle sélectionné

// Tableau des permissions par module :
// ┌──────────────┬────────┬──────────┬────────┬────────┬─────────┬────────┬─────────┐
// │  Module      │ Créer  │ Lire     │Modifier│Supprimer│Archiver │Exporter│Approuver│
// ├──────────────┼────────┼──────────┼────────┼─────────┼─────────┼────────┼─────────┤
// │ Dossiers     │ [x]    │ Tous[x]  │ Prop[x]│   [ ]   │   [x]   │  [ ]   │   [ ]   │
// │ Finance      │ [ ]    │ Prop[x]  │ Prop[x]│   [ ]   │   [ ]   │  [ ]   │   [ ]   │
// │ ...          │        │          │        │         │         │        │         │
// └──────────────┴────────┴──────────┴────────┴─────────┴─────────┴────────┴─────────┘
// Chaque cellule peut être : [ ] refusé | [O] propres entrées seulement | [X] toutes les entrées
// Survol cellule = tooltip expliquant l'effet
// Bouton "Conditions avancées" par cellule pour ajouter des conditions (montant, statut...)

// Héritage de rôle : sélecteur "Ce rôle hérite de" → visualisation des permissions héritées vs ajoutées
```

### 11.5 Thème & Branding Live

```typescript
// apps/web/components/settings/appearance/theme-editor.tsx
// Éditeur de thème avec prévisualisation live côté droit

// Couleurs configurables via color picker :
// - primaryColor    → sidebar bg, boutons principaux, liens actifs
// - accentColor     → badges, highlights, progress bars
// - successColor    → statuts "validé", "payé", "terminé"
// - warningColor    → statuts "en attente", "en retard"
// - dangerColor     → statuts "rejeté", "critique", boutons destructifs

// La modification est appliquée en live sur la prévisualisation :
// - CSS custom properties injectées dans :root
// - Propagée via WebSocket à tous les postes connectés
// - Sauvegardée en DB dans organizations.settings.theme

// Import/export de thème (JSON) pour réutilisation entre tenants

// Variables CSS propagées dynamiquement
function applyTenantTheme(settings: OrgSettings) {
  const root = document.documentElement
  root.style.setProperty('--primary-h',      extractHSL(settings.primaryColor).h.toString())
  root.style.setProperty('--primary-s',      extractHSL(settings.primaryColor).s + '%')
  root.style.setProperty('--primary-l',      extractHSL(settings.primaryColor).l + '%')
  root.style.setProperty('--accent-h',       extractHSL(settings.accentColor).h.toString())
  // ... toutes les variables
  root.setAttribute('data-theme', settings.theme)
  root.setAttribute('data-radius', settings.borderRadius)
  root.style.setProperty('--font-sans', `'${settings.fontFamily}', system-ui, sans-serif`)
}
```

### 11.6 Propagation temps réel des modifications admin

```typescript
// Toute modification dans les paramètres admin est broadcastée immédiatement
// à tous les utilisateurs connectés du tenant

// packages/api/services/settings.service.ts
export async function updateTenantSetting(
  tenantId: string,
  key: string,
  value: unknown,
  io: Server
) {
  await db.update(organizations)
    .set({ settings: sql`settings || ${JSON.stringify({ [key]: value })}::jsonb`, updatedAt: new Date() })
    .where(eq(organizations.id, tenantId))

  // Invalider le cache
  await redis.del(`tenant:settings:${tenantId}`)

  // Propager à tous les clients connectés du tenant
  io.to(`tenant:${tenantId}`).emit('settings:updated', { key, value })
}

// Côté client — écouter les changements settings
socket.on('settings:updated', ({ key, value }) => {
  queryClient.setQueryData(['tenant', 'settings'], (old) => ({ ...old, [key]: value }))

  // Appliquer immédiatement si c'est un changement visuel
  if (key === 'theme' || key === 'primaryColor' || key === 'accentColor') {
    applyTenantTheme({ ...currentSettings, [key]: value })
  }
  if (key === 'enabledModules') {
    // Invalider la navigation pour masquer/afficher les modules
    queryClient.invalidateQueries({ queryKey: ['tenant', 'modules'] })
  }
})
```

---

## 12. Panneau Super-Admin Distant

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

### Système d'icônes — Règle absolue : zéro emoji dans l'UI

L'intégralité des icônes de l'application est rendue avec **Lucide React** comme
bibliothèque principale, SVG inline optimisé comme complément, et **jamais** avec des
caractères emoji Unicode. Cette règle s'applique à chaque bouton, label, badge,
notification, menu, état vide et en-tête de module.

#### Stratégie icônes par contexte

```typescript
// packages/ui/components/icon.tsx
// Wrapper standard — taille, couleur et accessibilité uniformisés

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const sizes: Record<IconSize, string> = {
  xs: 'size-3',    // 12px — badges, tags inline
  sm: 'size-4',    // 16px — boutons, menus, tables
  md: 'size-5',    // 20px — actions principales, sidebar
  lg: 'size-6',    // 24px — headers de section, KPI cards
  xl: 'size-8',    // 32px — états vides, onboarding
}

interface IconProps {
  icon: LucideIcon
  size?: IconSize
  className?: string
  'aria-label'?: string
  'aria-hidden'?: boolean
}

export function Icon({ icon: LucideIcon, size = 'md', className, ...props }: IconProps) {
  return (
    <LucideIcon
      className={cn(sizes[size], 'shrink-0', className)}
      strokeWidth={1.75}   // Épaisseur uniforme — look moderne et lisible
      {...props}
    />
  )
}
```

#### Mapping modules → icônes Lucide (exhaustif, obligatoire)

```typescript
// packages/ui/lib/module-icons.ts
// Chaque module, chaque action, chaque statut a son icône dédiée.
// Ne jamais utiliser un emoji à la place.

import {
  LayoutDashboard, FolderOpen, FolderKanban, CheckSquare,
  DollarSign, Scale, Users, ShieldCheck, Target, Megaphone,
  Truck, MessageSquare, CalendarDays, BarChart3, FileText,
  Settings, Bell, Search, Menu, ChevronRight, ChevronDown,
  Plus, Pencil, Trash2, Archive, Eye, Download, Upload,
  RefreshCw, Filter, SortAsc, SortDesc, Columns3, List,
  Grid3x3, Calendar, Kanban, GanttChartSquare,
  AlertCircle, AlertTriangle, CheckCircle2, XCircle, Info,
  Clock, Timer, Hourglass, CalendarClock,
  User, UserPlus, UserX, UserCheck, UserCog, UsersRound,
  Building2, Briefcase, Globe, MapPin, Phone, Mail, Link,
  Lock, Unlock, Key, ShieldAlert, Eye as EyeIcon, EyeOff,
  LogIn, LogOut, Fingerprint, QrCode,
  FileUp, FilePlus, FileDown, FileSearch, FileCheck,
  FileX, FilePen, FileStack, FolderPlus, FolderX,
  Paperclip, Image, FileImage, FileVideo, FileAudio,
  Cpu, Server, Database, Wifi, WifiOff, Activity,
  TrendingUp, TrendingDown, PieChart, LineChart, BarChart2,
  ChevronLeft, ChevronUp, ArrowLeft, ArrowRight, ArrowUp, ArrowDown,
  MoreHorizontal, MoreVertical, Grip, GripVertical,
  Star, Bookmark, Tag, Tags, Hash, Flag, Zap, Flame,
  Sun, Moon, Monitor, Palette, Type, Bold, Italic,
  AlignLeft, AlignCenter, AlignRight, List as ListIcon,
  Table, Columns, Rows, Maximize2, Minimize2, RotateCcw,
  Copy, Clipboard, ClipboardCheck, Share2, ExternalLink,
  ThumbsUp, ThumbsDown, Heart, Send, Reply, Forward,
  Printer, Scissors, Sliders, SlidersHorizontal,
  LogIn as SignIn, Sparkles, Wand2, BrainCircuit,
} from 'lucide-react'

// Navigation principale
export const NAV_ICONS = {
  dashboard:      LayoutDashboard,
  dossiers:       FolderKanban,
  tasks:          CheckSquare,
  finance:        DollarSign,
  juridique:      Scale,
  sirh:           Users,
  audit:          ShieldCheck,
  conformite:     ShieldCheck,
  conseil:        Target,
  communication:  Megaphone,
  logistique:     Truck,
  messagerie:     MessageSquare,
  agenda:         CalendarDays,
  rapports:       BarChart3,
  documents:      FileText,
  settings:       Settings,
} as const satisfies Record<string, LucideIcon>

// Actions CRUD — utilisées dans boutons et menus contextuels
export const ACTION_ICONS = {
  create:         Plus,
  edit:           Pencil,
  delete:         Trash2,
  archive:        Archive,
  view:           Eye,
  download:       Download,
  upload:         Upload,
  refresh:        RefreshCw,
  filter:         Filter,
  search:         Search,
  share:          Share2,
  copy:           Copy,
  print:          Printer,
  export:         Download,
  import:         Upload,
} as const satisfies Record<string, LucideIcon>

// Statuts dossiers / tâches
export const STATUS_ICONS = {
  draft:          Pencil,
  in_progress:    Clock,
  review:         Eye,
  done:           CheckCircle2,
  cancelled:      XCircle,
  archived:       Archive,
  overdue:        AlertTriangle,
  blocked:        AlertCircle,
} as const satisfies Record<string, LucideIcon>

// Priorités
export const PRIORITY_ICONS = {
  low:            ChevronDown,
  normal:         ChevronRight,
  high:           ChevronUp,
  critical:       Flame,
} as const satisfies Record<string, LucideIcon>

// États vides (Empty States) — taille xl uniquement
export const EMPTY_STATE_ICONS = {
  no_dossiers:    FolderOpen,
  no_tasks:       CheckSquare,
  no_messages:    MessageSquare,
  no_results:     Search,
  no_files:       FileStack,
  no_events:      CalendarDays,
  no_users:       UsersRound,
  no_data:        BarChart3,
} as const satisfies Record<string, LucideIcon>
```

#### SVG custom — Illustrations & états vides

Pour les **illustrations** d'états vides, erreurs 404, onboarding et pages marketing,
utiliser des SVG inline optimisés (SVGO). Ne jamais utiliser d'image PNG/JPG pour
ces contextes. Créer un composant `<Illustration />` pour chaque cas.

```typescript
// packages/ui/components/illustrations/empty-dossiers.tsx
// SVG monochrome (1 seule couleur = currentColor) pour compatibilité thèmes

export function EmptyDossiersIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* SVG paths — style "ligne fine" cohérent avec Lucide */}
      {/* Palette : currentColor pour le trait, opacity-10 pour les fonds */}
      <rect x="40" y="60" width="160" height="100" rx="8"
        stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.04" />
      <path d="M40 80 H200" stroke="currentColor" strokeWidth="1.5" />
      <rect x="60" y="95" width="80" height="8" rx="4"
        fill="currentColor" fillOpacity="0.15" />
      <rect x="60" y="110" width="120" height="8" rx="4"
        fill="currentColor" fillOpacity="0.10" />
      <rect x="60" y="125" width="60" height="8" rx="4"
        fill="currentColor" fillOpacity="0.07" />
      {/* Dossier ouvert en avant-plan */}
      <path d="M90 60 L90 30 Q90 24 96 24 L120 24 L126 30 H170 Q176 30 176 36 V60"
        stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.06" />
    </svg>
  )
}
// Créer une illustration par état vide : dossiers, tâches, messages, erreur, succès, onboarding
```

#### Règles d'implémentation icônes — Obligatoire

```typescript
// 1. Toujours wrapper avec le composant <Icon /> — jamais l'import direct brut
//    dans le JSX final (garantit taille et strokeWidth uniformes)

// Bien :
import { Icon } from '@nexadesk/ui'
import { Plus } from 'lucide-react'
<Icon icon={Plus} size="sm" aria-hidden />

// Interdit :
<Plus className="w-4 h-4" />          // strokeWidth non contrôlé
<span>+</span>                           // emoji — INTERDIT
<img src="plus.png" />                 // bitmap

// 2. Boutons avec icône : toujours text + icône, jamais icône seule sans aria-label
<Button>
  <Icon icon={Plus} size="sm" aria-hidden />
  Nouveau dossier
</Button>

// Bouton icône-seule (compact) : aria-label obligatoire
<Button variant="ghost" size="icon" aria-label="Créer un dossier">
  <Icon icon={Plus} size="sm" />
</Button>

// 3. StatusBadge — icône + texte + couleur sémantique
function StatusBadge({ status }: { status: TaskStatus }) {
  const config = {
    todo:        { icon: Circle,       label: 'À faire',    color: 'text-muted-foreground' },
    in_progress: { icon: Clock,        label: 'En cours',   color: 'text-blue-500' },
    review:      { icon: Eye,          label: 'En revue',   color: 'text-amber-500' },
    done:        { icon: CheckCircle2, label: 'Terminé',    color: 'text-emerald-500' },
    cancelled:   { icon: XCircle,      label: 'Annulé',     color: 'text-rose-500' },
  } satisfies Record<TaskStatus, { icon: LucideIcon; label: string; color: string }>

  const { icon, label, color } = config[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', color)}>
      <Icon icon={icon} size="xs" aria-hidden />
      {label}
    </span>
  )
}

// 4. PriorityIndicator — barre colorée + icône + label
function PriorityIndicator({ priority }: { priority: Priority }) {
  const config = {
    low:      { icon: ChevronDown,  label: 'Basse',    bar: 'bg-slate-300',   text: 'text-slate-500' },
    normal:   { icon: Minus,        label: 'Normale',  bar: 'bg-blue-400',    text: 'text-blue-600' },
    high:     { icon: ChevronUp,    label: 'Haute',    bar: 'bg-amber-400',   text: 'text-amber-600' },
    critical: { icon: Flame,        label: 'Critique', bar: 'bg-rose-500',    text: 'text-rose-600' },
  } satisfies Record<Priority, { icon: LucideIcon; label: string; bar: string; text: string }>
  // ...render
}

// 5. Navigation sidebar — icône + label + badge compteur
// Jamais d'emoji comme préfixe de section
function NavItem({ href, icon: NavIcon, label, count }: NavItemProps) {
  return (
    <Link href={href} className="flex items-center gap-3 px-3 py-2 rounded-md ...">
      <Icon icon={NavIcon} size="sm" aria-hidden />
      <span className="flex-1 text-sm font-medium">{label}</span>
      {count != null && count > 0 && (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
```

---

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

## 18. React 19 — Patterns Modernes Obligatoires

### Server Components (RSC) — Architecture critique

```typescript
// RÈGLE : par défaut, tout composant est un Server Component (pas de 'use client')
// N'ajouter 'use client' que si le composant a besoin de :
// - Hooks React (useState, useEffect, useCallback...)
// - Événements DOM (onClick, onChange...)
// - Web APIs (localStorage, window...)
// - Animations Framer Motion
// - Bibliothèques client-only (chart, dnd-kit...)

// Exemple pattern correct : données chargées côté serveur, interactivité côté client
// app/(dashboard)/dossiers/page.tsx — SERVER COMPONENT (pas de 'use client')
import { Suspense } from 'react'
import { DossierList } from '@/components/modules/dossiers/dossier-list'
import { DossierFilters } from '@/components/modules/dossiers/dossier-filters'
import { DossierListSkeleton } from '@/components/modules/dossiers/dossier-list-skeleton'
import { caller } from '@/lib/trpc/server'  // tRPC server-side caller
import type { SearchParams } from '@/types'

interface PageProps { searchParams: Promise<SearchParams> }

export default async function DossiersPage({ searchParams }: PageProps) {
  // Lecture searchParams avec await (React 19 pattern)
  const params = await searchParams

  // Données initiales chargées côté serveur (zéro waterfall)
  const initialData = await caller.dossiers.list({
    page: Number(params.page ?? 1),
    status: params.status as string | undefined,
    process: params.process as string | undefined,
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      <DossierFilters defaultValues={params} />
      <Suspense fallback={<DossierListSkeleton />}>
        <DossierList initialData={initialData} />
      </Suspense>
    </div>
  )
}
```

### Server Actions — Mutations sans API route

```typescript
// app/(dashboard)/dossiers/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth/server'
import { createDossierSchema } from '@nexadesk/validators'

export async function createDossierAction(formData: FormData) {
  const session = await getServerSession()
  if (!session) redirect('/login')

  const raw = Object.fromEntries(formData)
  const validated = createDossierSchema.safeParse(raw)

  if (!validated.success) {
    return { error: validated.error.flatten().fieldErrors }
  }

  const dossier = await caller.dossiers.create(validated.data)

  revalidatePath('/dossiers')
  return { success: true, id: dossier.id }
}

// Utilisation dans un Client Component :
// const [state, action, isPending] = useActionState(createDossierAction, null)
// <form action={action}>...</form>
```

### use() hook — Suspense-native data fetching

```typescript
// 'use client'
import { use, Suspense } from 'react'

// Composant qui consomme une Promise directement (React 19)
function DossierStats({ statsPromise }: { statsPromise: Promise<DossierStats> }) {
  const stats = use(statsPromise)   // Suspend le composant jusqu'à résolution
  return <StatsDisplay stats={stats} />
}

// Usage depuis un Server Component parent :
function DossierPage() {
  const statsPromise = caller.dossiers.stats()  // Promise non-awaited

  return (
    <Suspense fallback={<StatsSkeleton />}>
      <DossierStats statsPromise={statsPromise} />
    </Suspense>
  )
}
```

### useOptimistic — UX instantanée sans attendre le serveur

```typescript
// 'use client'
import { useOptimistic, useTransition } from 'react'

function TaskKanbanCard({ task, onMove }: TaskCardProps) {
  const [optimisticTask, updateOptimisticTask] = useOptimistic(
    task,
    (state, newColumn: string) => ({ ...state, boardColumn: newColumn })
  )
  const [isPending, startTransition] = useTransition()

  const handleMove = (newColumn: string) => {
    startTransition(async () => {
      updateOptimisticTask(newColumn)  // Mise à jour immédiate UI
      await onMove(task.id, newColumn) // Appel API en arrière-plan
    })
  }

  return (
    <div style={{ opacity: isPending ? 0.7 : 1 }}>
      {/* La carte affiche déjà la nouvelle colonne pendant la requête */}
      <TaskCard task={optimisticTask} onMove={handleMove} />
    </div>
  )
}
```

### useFormStatus — Feedback de formulaire natif

```typescript
// 'use client'
import { useFormStatus } from 'react-dom'

function SubmitButton({ label = 'Enregistrer' }: { label?: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Icon icon={Loader2} size="sm" className="animate-spin" aria-hidden />
          Enregistrement...
        </>
      ) : (
        <>
          <Icon icon={Save} size="sm" aria-hidden />
          {label}
        </>
      )}
    </Button>
  )
}
// Ce composant fonctionne à l'intérieur de tout <form action={serverAction}>
```

### Suspense granulaire + Error Boundaries

```typescript
// Chaque section de page critique est isolée dans son propre Suspense
// pour un chargement progressif sans blocage global

// app/(dashboard)/layout.tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <ErrorBoundary fallback={<ErrorState />}>
          <Suspense fallback={<PageSkeleton />}>
            {children}
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Notifications panel — chargement indépendant */}
      <Suspense fallback={null}>
        <NotificationsPanel />
      </Suspense>
    </div>
  )
}
```

### Streaming SSR avec loading.tsx

```typescript
// app/(dashboard)/dossiers/loading.tsx
// Affiché automatiquement pendant le chargement du Server Component parent
export default function DossiersLoading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="h-10 w-80 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  )
}
// Créer un loading.tsx par route de module pour un feedback immédiat
```

### Parallel Routes & Interception — Modals URL-addressables

```typescript
// app/(dashboard)/dossiers/@modal/(..)dossiers/[id]/page.tsx
// Ouvre le détail dossier dans une modal sans quitter la liste
// L'URL change (partageable), la liste reste visible derrière

// app/(dashboard)/layout.tsx
export default function Layout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <>
      {children}
      {modal}
    </>
  )
}
// Utiliser ce pattern pour : détail dossier, détail tâche, prévisualisation fichier
// → l'utilisateur peut copier l'URL et l'ouvrir directement en page complète
```

### Metadata dynamique — SEO et onglets navigateur

```typescript
// app/(dashboard)/dossiers/[id]/page.tsx
import type { Metadata } from 'next'

export async function generateMetadata({ params }): Promise<Metadata> {
  const { id } = await params
  const dossier = await caller.dossiers.getById({ id })

  return {
    title: `${dossier.reference} — ${dossier.objet} | NexaDesk`,
    description: `Dossier ${dossier.category} — Statut: ${dossier.status}`,
  }
}
```

---

## 18b. Patterns d'Accessibilité (a11y) — Obligatoires

```typescript
// Toutes les interactions non-textuelles doivent être accessibles au clavier
// et aux lecteurs d'écran. WCAG AA minimum.

// 1. Focus visible — ne jamais désactiver outline
// Dans globals.css : *:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }

// 2. Skip navigation
function SkipNav() {
  return (
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 ...">
      Aller au contenu principal
    </a>
  )
}

// 3. Annonces live pour les actions asynchrones (screen readers)
function LiveAnnouncer() {
  const { announcement } = useLiveAnnouncer()
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {announcement}
    </div>
  )
}
// Usage : announce('Dossier GC-DOS-2026-001 créé avec succès')

// 4. Keyboard shortcuts documentés
// Ctrl+K → Command palette
// Ctrl+N → Nouvelle entrée dans le module actif
// Escape → Fermer modal/panel
// ? → Afficher les raccourcis disponibles

// 5. Contrastes — tous les textes min. 4.5:1 sur fond (WCAG AA)
// Vérifier avec : npx @accessibility/eslint-plugin

// 6. aria-labels sur tous les boutons icône-seule (voir section icônes)

// 7. Tableaux : thead + scope="col", zebra striping, sortable avec aria-sort
```

---

## 19. Standards de Code

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

// INTERDIT — violations bloquantes (lint + CI échoue) :
// [NO] any, as any, @ts-ignore sans explication
// [NO] TODO sans numéro de ticket (ex: // TODO(#123): ...)
// [NO] console.log / console.error en production (utiliser pino logger)
// [NO] Mutations directes de state (immer ou spread systématique)
// [NO] useEffect pour dériver du state (utiliser useMemo)
// [NO] Fetch direct sans tRPC/React Query
// [NO] Strings magiques (utiliser const enums ou satisfies)
// [NO] Fonctions > 50 lignes sans extraction dans helper
// [NO] Fichiers > 300 lignes sans split en sous-composants
// [NO] Emojis dans l'interface — utiliser exclusivement Lucide React ou SVG
// [NO] Images bitmap pour les icônes — SVG uniquement (scalable, thémable)
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

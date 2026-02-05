-- ============================================
-- DiStock Database Schema Export
-- Part 2: Core Tables (Venues, Profiles, Roles)
-- ============================================

-- ============================================
-- VENUES (Multi-tenant base table)
-- ============================================
CREATE TABLE public.venues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_demo BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  plan_type TEXT DEFAULT 'starter',
  max_pos INTEGER DEFAULT 3,
  max_bars INTEGER DEFAULT 2,
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- PROFILES (User profiles linked to auth.users)
-- ============================================
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY, -- References auth.users(id)
  email TEXT NOT NULL,
  full_name TEXT,
  venue_id UUID REFERENCES public.venues(id),
  rut_code TEXT,
  worker_pin TEXT,
  point_of_sale TEXT,
  notification_email TEXT,
  internal_email TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- USER_ROLES (Legacy role table)
-- ============================================
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  venue_id UUID REFERENCES public.venues(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

-- ============================================
-- WORKER_ROLES (Current role assignment table)
-- ============================================
CREATE TABLE public.worker_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  venue_id UUID REFERENCES public.venues(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(worker_id, role, venue_id)
);

-- ============================================
-- FEATURE FLAGS
-- ============================================
CREATE TABLE public.feature_flags_master (
  key TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  default_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.feature_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  feature_key TEXT NOT NULL,
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(venue_id, feature_key)
);

CREATE TABLE public.developer_feature_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  key TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID,
  UNIQUE(venue_id, key)
);

CREATE TABLE public.developer_flag_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  key TEXT NOT NULL,
  from_enabled BOOLEAN,
  to_enabled BOOLEAN NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- SIDEBAR CONFIG
-- ============================================
CREATE TABLE public.sidebar_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  role TEXT NOT NULL,
  menu_key TEXT NOT NULL,
  menu_label TEXT NOT NULL,
  icon_name TEXT DEFAULT 'Wine',
  view_type TEXT,
  feature_flag TEXT,
  external_path TEXT,
  sort_order INTEGER DEFAULT 0,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(venue_id, role, menu_key)
);

-- ============================================
-- RESETTABLE TABLES CONFIG (Developer tools)
-- ============================================
CREATE TABLE public.resettable_tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  table_name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE public.developer_reset_audit (
  id BIGSERIAL PRIMARY KEY,
  developer_user_id UUID NOT NULL,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  table_key TEXT NOT NULL,
  table_name TEXT NOT NULL,
  deleted_rows BIGINT NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

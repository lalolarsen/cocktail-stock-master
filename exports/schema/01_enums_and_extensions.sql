-- ============================================
-- DiStock Database Schema Export
-- Part 1: Extensions and ENUM Types
-- Generated: 2026-02-05
-- ============================================

-- Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE public.app_role AS ENUM (
  'admin',
  'vendedor',
  'gerencia',
  'bar',
  'ticket_seller',
  'developer'
);

CREATE TYPE public.document_status AS ENUM (
  'pending',
  'issued',
  'failed',
  'cancelled'
);

CREATE TYPE public.document_type AS ENUM (
  'boleta',
  'factura'
);

CREATE TYPE public.location_type AS ENUM (
  'warehouse',
  'bar'
);

CREATE TYPE public.movement_type AS ENUM (
  'entrada',
  'salida',
  'ajuste',
  'compra'
);

CREATE TYPE public.payment_method AS ENUM (
  'cash',
  'debit',
  'credit',
  'transfer',
  'card'
);

CREATE TYPE public.pickup_token_status AS ENUM (
  'issued',
  'redeemed',
  'expired',
  'cancelled',
  'pending'
);

CREATE TYPE public.product_category AS ENUM (
  'ml',
  'gramos',
  'unidades'
);

CREATE TYPE public.redemption_result AS ENUM (
  'success',
  'already_redeemed',
  'expired',
  'invalid',
  'unpaid',
  'cancelled',
  'not_found',
  'stock_error',
  'timeout'
);

CREATE TYPE public.replenishment_plan_status AS ENUM (
  'draft',
  'applied',
  'cancelled'
);

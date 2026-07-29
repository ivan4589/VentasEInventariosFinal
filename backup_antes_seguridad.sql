--
-- PostgreSQL database dump
--

\restrict bn4sOyUFAlTrdbNjulfHnQgEk3wpFgcXtOQZV3MXLuPv0L2FOR94XmaUoGHSFoi

-- Dumped from database version 15.18 (Debian 15.18-1.pgdg13+1)
-- Dumped by pg_dump version 15.18 (Debian 15.18-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO postgres;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA public IS '';


--
-- Name: ClientType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ClientType" AS ENUM (
    'NORMAL',
    'ESPECIAL',
    'CAMINO'
);


ALTER TYPE public."ClientType" OWNER TO postgres;

--
-- Name: InventoryMovementType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."InventoryMovementType" AS ENUM (
    'INITIAL_STOCK',
    'PURCHASE_IN',
    'SALE_OUT',
    'SALE_RETURN_IN',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'TRANSFER_CANCEL_IN',
    'TRANSFER_CANCEL_OUT',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'PURCHASE_CANCEL_OUT'
);


ALTER TYPE public."InventoryMovementType" OWNER TO postgres;

--
-- Name: PaymentMethod; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."PaymentMethod" AS ENUM (
    'CASH',
    'QR',
    'BANK_TRANSFER'
);


ALTER TYPE public."PaymentMethod" OWNER TO postgres;

--
-- Name: PaymentStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."PaymentStatus" AS ENUM (
    'PENDING',
    'PARTIALLY_PAID',
    'PAID'
);


ALTER TYPE public."PaymentStatus" OWNER TO postgres;

--
-- Name: PurchaseProviderStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."PurchaseProviderStatus" AS ENUM (
    'PENDING',
    'RECEIVED',
    'CANCELLED'
);


ALTER TYPE public."PurchaseProviderStatus" OWNER TO postgres;

--
-- Name: PurchaseStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."PurchaseStatus" AS ENUM (
    'PENDING',
    'RECEIVED',
    'CANCELLED'
);


ALTER TYPE public."PurchaseStatus" OWNER TO postgres;

--
-- Name: ReportType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ReportType" AS ENUM (
    'INVENTORY_GENERAL',
    'INVENTORY_DETAILED',
    'SALES_REPORT',
    'COLLECTION_REPORT'
);


ALTER TYPE public."ReportType" OWNER TO postgres;

--
-- Name: Role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."Role" AS ENUM (
    'ADMIN',
    'VENDEDOR',
    'COBRADOR'
);


ALTER TYPE public."Role" OWNER TO postgres;

--
-- Name: SaleStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."SaleStatus" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'CANCELLED'
);


ALTER TYPE public."SaleStatus" OWNER TO postgres;

--
-- Name: SaleType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."SaleType" AS ENUM (
    'CASH',
    'CREDIT'
);


ALTER TYPE public."SaleType" OWNER TO postgres;

--
-- Name: UserAdministrationAction; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."UserAdministrationAction" AS ENUM (
    'USER_CREATED',
    'USER_UPDATED',
    'ROLE_CHANGED',
    'STATUS_CHANGED',
    'PASSWORD_RESET'
);


ALTER TYPE public."UserAdministrationAction" OWNER TO postgres;

--
-- Name: WarehouseTransferStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."WarehouseTransferStatus" AS ENUM (
    'COMPLETED',
    'CANCELLED'
);


ALTER TYPE public."WarehouseTransferStatus" OWNER TO postgres;

--
-- Name: WhatsAppSendStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."WhatsAppSendStatus" AS ENUM (
    'SENT',
    'FAILED'
);


ALTER TYPE public."WhatsAppSendStatus" OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Location; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Location" (
    id text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Location" OWNER TO postgres;

--
-- Name: Product; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Product" (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    "providerId" text NOT NULL,
    "categoryId" text NOT NULL,
    "subCategoryId" text,
    weight text,
    "purchasePrice" double precision NOT NULL,
    "priceNormal" double precision NOT NULL,
    "priceCamino" double precision NOT NULL,
    "priceEspecial" double precision NOT NULL,
    "priceMayorista" double precision,
    "markupNormal" double precision DEFAULT 10 NOT NULL,
    "markupCamino" double precision DEFAULT 10 NOT NULL,
    "markupEspecial" double precision DEFAULT 10 NOT NULL,
    "markupMayorista" double precision DEFAULT 10 NOT NULL,
    stock double precision DEFAULT 0 NOT NULL,
    "minStock" double precision DEFAULT 0 NOT NULL,
    unit text DEFAULT 'UNIDAD'::text NOT NULL,
    "reserveQuantity" double precision DEFAULT 0 NOT NULL,
    "additionalInfo" text,
    "imageUrl" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "minQuantityWholesale" integer,
    "reservedStock" double precision DEFAULT 0 NOT NULL
);


ALTER TABLE public."Product" OWNER TO postgres;

--
-- Name: User; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."User" (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    role public."Role" DEFAULT 'VENDEDOR'::public."Role" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "lastLoginAt" timestamp(3) without time zone
);


ALTER TABLE public."User" OWNER TO postgres;

--
-- Name: User_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."User_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public."User_id_seq" OWNER TO postgres;

--
-- Name: User_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."User_id_seq" OWNED BY public."User".id;


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO postgres;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- Name: clients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clients (
    id text NOT NULL,
    "fullName" text NOT NULL,
    alias text,
    type public."ClientType" DEFAULT 'NORMAL'::public."ClientType" NOT NULL,
    "locationId" text NOT NULL,
    phone text,
    "additionalInfo" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "whatsappConsent" boolean DEFAULT false NOT NULL
);


ALTER TABLE public.clients OWNER TO postgres;

--
-- Name: collection_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.collection_assignments (
    id text NOT NULL,
    "saleId" text NOT NULL,
    "assignedToId" integer NOT NULL,
    "assignedById" integer NOT NULL,
    "assignedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.collection_assignments OWNER TO postgres;

--
-- Name: inventory_movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_movements (
    id text NOT NULL,
    "warehouseId" text NOT NULL,
    "productId" text NOT NULL,
    "userId" integer,
    type public."InventoryMovementType" NOT NULL,
    quantity double precision NOT NULL,
    "previousStock" double precision NOT NULL,
    "newStock" double precision NOT NULL,
    "referenceId" text,
    observations text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.inventory_movements OWNER TO postgres;

--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id text NOT NULL,
    "saleId" text NOT NULL,
    "clientId" text NOT NULL,
    "userId" integer NOT NULL,
    amount double precision NOT NULL,
    method public."PaymentMethod" NOT NULL,
    reference text,
    "receivedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    observations text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- Name: providers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.providers (
    id text NOT NULL,
    "companyName" text NOT NULL,
    "contactName" text,
    phone text,
    email text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.providers OWNER TO postgres;

--
-- Name: purchase_detail_warehouses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.purchase_detail_warehouses (
    id text NOT NULL,
    "purchaseDetailId" text NOT NULL,
    "warehouseId" text NOT NULL,
    quantity double precision NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.purchase_detail_warehouses OWNER TO postgres;

--
-- Name: purchase_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.purchase_details (
    id text NOT NULL,
    "productId" text NOT NULL,
    quantity double precision NOT NULL,
    "unitPrice" double precision NOT NULL,
    subtotal double precision NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "categoryId" text NOT NULL,
    "purchaseProviderId" text NOT NULL,
    "pricingConfigured" boolean DEFAULT false NOT NULL,
    "priceNormal" double precision,
    "priceCamino" double precision,
    "priceEspecial" double precision,
    "priceMayorista" double precision,
    "minQuantityWholesale" integer
);


ALTER TABLE public.purchase_details OWNER TO postgres;

--
-- Name: purchase_providers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.purchase_providers (
    id text NOT NULL,
    "purchaseId" text NOT NULL,
    "providerId" text NOT NULL,
    status public."PurchaseProviderStatus" DEFAULT 'PENDING'::public."PurchaseProviderStatus" NOT NULL,
    total double precision DEFAULT 0 NOT NULL,
    "receivedAt" timestamp(3) without time zone,
    "cancelledAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.purchase_providers OWNER TO postgres;

--
-- Name: purchases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.purchases (
    id text NOT NULL,
    "userId" integer NOT NULL,
    date timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status public."PurchaseStatus" DEFAULT 'PENDING'::public."PurchaseStatus" NOT NULL,
    total double precision DEFAULT 0 NOT NULL,
    observations text,
    "pdfUrl" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.purchases OWNER TO postgres;

--
-- Name: report_histories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_histories (
    id text NOT NULL,
    type public."ReportType" NOT NULL,
    title text NOT NULL,
    parameters text,
    "fileUrl" text NOT NULL,
    "userId" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.report_histories OWNER TO postgres;

--
-- Name: sale_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sale_details (
    id text NOT NULL,
    "saleId" text NOT NULL,
    "productId" text NOT NULL,
    quantity integer NOT NULL,
    "unitPrice" double precision NOT NULL,
    subtotal double precision NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "returnedQuantity" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.sale_details OWNER TO postgres;

--
-- Name: sale_return_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sale_return_details (
    id text NOT NULL,
    "saleReturnId" text NOT NULL,
    "saleDetailId" text NOT NULL,
    "productId" text NOT NULL,
    quantity integer NOT NULL,
    "unitPrice" double precision NOT NULL,
    subtotal double precision NOT NULL
);


ALTER TABLE public.sale_return_details OWNER TO postgres;

--
-- Name: sale_returns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sale_returns (
    id text NOT NULL,
    "saleId" text NOT NULL,
    "userId" integer NOT NULL,
    amount double precision NOT NULL,
    observations text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.sale_returns OWNER TO postgres;

--
-- Name: sale_whatsapp_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sale_whatsapp_logs (
    id text NOT NULL,
    "saleId" text NOT NULL,
    "userId" integer NOT NULL,
    "phoneNumber" text NOT NULL,
    status public."WhatsAppSendStatus" NOT NULL,
    "metaMessageId" text,
    "errorMessage" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.sale_whatsapp_logs OWNER TO postgres;

--
-- Name: sales; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sales (
    id text NOT NULL,
    "saleNumber" text NOT NULL,
    "clientId" text NOT NULL,
    "userId" integer NOT NULL,
    date timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status public."SaleStatus" DEFAULT 'PENDING'::public."SaleStatus" NOT NULL,
    "paymentStatus" public."PaymentStatus" DEFAULT 'PENDING'::public."PaymentStatus" NOT NULL,
    total double precision NOT NULL,
    discount double precision DEFAULT 0 NOT NULL,
    observations text,
    "pdfUrl" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "cancelledPdfUrl" text,
    "dueDate" timestamp(3) without time zone,
    "saleType" public."SaleType" DEFAULT 'CASH'::public."SaleType" NOT NULL,
    subtotal double precision DEFAULT 0 NOT NULL,
    "confirmedAt" timestamp(3) without time zone,
    "cancelledAt" timestamp(3) without time zone
);


ALTER TABLE public.sales OWNER TO postgres;

--
-- Name: sub_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sub_categories (
    id text NOT NULL,
    name text NOT NULL,
    "categoryId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.sub_categories OWNER TO postgres;

--
-- Name: user_administration_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_administration_logs (
    id text NOT NULL,
    "actorId" integer NOT NULL,
    "targetUserId" integer,
    action public."UserAdministrationAction" NOT NULL,
    details jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.user_administration_logs OWNER TO postgres;

--
-- Name: warehouse_stocks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.warehouse_stocks (
    id text NOT NULL,
    "warehouseId" text NOT NULL,
    "productId" text NOT NULL,
    stock double precision DEFAULT 0 NOT NULL,
    "reservedStock" double precision DEFAULT 0 NOT NULL,
    "minStock" double precision DEFAULT 0 NOT NULL,
    "reserveQuantity" double precision DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.warehouse_stocks OWNER TO postgres;

--
-- Name: warehouse_transfer_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.warehouse_transfer_details (
    id text NOT NULL,
    "transferId" text NOT NULL,
    "productId" text NOT NULL,
    quantity double precision NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.warehouse_transfer_details OWNER TO postgres;

--
-- Name: warehouse_transfers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.warehouse_transfers (
    id text NOT NULL,
    "transferNumber" text NOT NULL,
    "originWarehouseId" text NOT NULL,
    "destinationWarehouseId" text NOT NULL,
    "userId" integer NOT NULL,
    status public."WarehouseTransferStatus" DEFAULT 'COMPLETED'::public."WarehouseTransferStatus" NOT NULL,
    observations text,
    "transferredAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "cancelledAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.warehouse_transfers OWNER TO postgres;

--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.warehouses (
    id text NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    "isActive" boolean DEFAULT true NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.warehouses OWNER TO postgres;

--
-- Name: User id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."User" ALTER COLUMN id SET DEFAULT nextval('public."User_id_seq"'::regclass);


--
-- Data for Name: Location; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Location" (id, name, "createdAt", "updatedAt") FROM stdin;
cmrqofylz0007m4vcjmf8kjif	Chuspi Pata	2026-07-18 18:05:09.239	2026-07-18 18:05:09.239
cmrqoga900008m4vctjzyp875	Yolosita	2026-07-18 18:05:24.324	2026-07-18 18:05:24.324
cmrqogosh0009m4vcobjri2x1	Santa Barbara	2026-07-18 18:05:43.169	2026-07-18 18:05:43.169
cmrqogy30000am4vcv76w75yo	Challa	2026-07-18 18:05:55.212	2026-07-18 18:05:55.212
cmrqoh6d7000bm4vchrp39nj5	Choro Bajo	2026-07-18 18:06:05.947	2026-07-18 18:06:05.947
cmrqohfoh000cm4vcrhnwp7vg	Caranavi	2026-07-18 18:06:18.017	2026-07-18 18:06:18.017
cmrqohm9k000dm4vcixop8rnu	Palos Blancos	2026-07-18 18:06:26.552	2026-07-18 18:06:26.552
cmrqohqjm000em4vcp0oxuzvl	Guanay	2026-07-18 18:06:32.098	2026-07-18 18:06:32.098
\.


--
-- Data for Name: Product; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Product" (id, name, description, "providerId", "categoryId", "subCategoryId", weight, "purchasePrice", "priceNormal", "priceCamino", "priceEspecial", "priceMayorista", "markupNormal", "markupCamino", "markupEspecial", "markupMayorista", stock, "minStock", unit, "reserveQuantity", "additionalInfo", "imageUrl", "createdAt", "updatedAt", "minQuantityWholesale", "reservedStock") FROM stdin;
cmrqlxwd80008owvcc6i9w0en	Fideo @	\N	cmrqlrlb50000owvcyi7aiyav	cmrqluh2x0002owvcv5cpbupg	cmrqlurwx0003owvcih2h21gx	\N	10.5	11.55	11.55	11.55	11.55	10	10	10	10	153	5	UNIDAD	9	\N	/uploads/products/1784393707205-198451048-logo-yungas.jpeg	2026-07-18 16:55:07.293	2026-07-24 02:46:46.113	5	0
cmrqlzq5q0009owvcxz3bjjhu	Paquete x10 ud	\N	cmrqlrlb50000owvcyi7aiyav	cmrqluh2x0002owvcv5cpbupg	cmrqlurwx0003owvcih2h21gx	\N	11	12.1	12.1	12.1	12.1	10	10	10	10	108	2	UNIDAD	3	\N	/uploads/products/1784393792480-741887216-iconoRecibo__1_.png	2026-07-18 16:56:32.558	2026-07-24 02:30:37.481	5	0
cmrqm17i2000aowvc8hn4y1ht	Higenico	\N	cmrqlsmgx0001owvcrhszqsoy	cmrqlv13a0004owvc357d8vnq	cmrqlv9ld0005owvcr2x8cblm	\N	20	22	22	22	22	10	10	10	10	29	5	UNIDAD	11	\N	/uploads/products/1784393861460-942388003-ChatGPT_Image_15_may_2026__10_42_24.png	2026-07-18 16:57:41.69	2026-07-24 02:30:37.481	7	0
cmrqm2so8000bowvc4fsrfxiz	Nacional Azul	\N	cmrqlsmgx0001owvcrhszqsoy	cmrqlv13a0004owvc357d8vnq	cmrqlv9ld0005owvcr2x8cblm	\N	32.5	90.1	90.1	90.1	90.1	6	6	6	6	32	5	UNIDAD	1	\N	/uploads/products/1784393935638-412921030-young-woman-cashier-front-machine-600nw-2645078001.webp	2026-07-18 16:58:55.784	2026-07-24 02:30:37.481	5	0
cmrvk67sk0000hwvchpp7f4og	Prueba2	\N	cmrqlsmgx0001owvcrhszqsoy	cmrqlv13a0004owvc357d8vnq	cmrqlv9ld0005owvcr2x8cblm	\N	100	118	118	118	118	18	18	18	18	1	10	UNIDAD	15	\N	\N	2026-07-22 04:04:26.996	2026-07-24 02:30:37.481	9	0
cmrutk1ww00008cvc5rfp5lmc	Producto de Prueba	\N	cmrqlsmgx0001owvcrhszqsoy	cmrqlvjbe0006owvc4g09g4x8	cmrqlvxl10007owvc68hm2nyr	\N	10.5	15.5	17.5	14.5	15	47.62	66.67	38.1	42.86	0	5	UNIDAD	8	\N	/uploads/products/1784648362582-835005354-1.jpg	2026-07-21 15:39:22.929	2026-07-24 02:30:37.481	5	0
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."User" (id, name, email, password, role, "createdAt", "updatedAt", "isActive", "lastLoginAt") FROM stdin;
2	Vendedor	vendedor@gmail.com	$2b$10$yNxYLjstg6f0j0pFFTpdfOdDDDnlQZbSrIbdeg2sm4mPy0hPY5CTm	VENDEDOR	2026-07-18 17:09:41.366	2026-07-18 17:09:41.366	t	\N
3	Cobrador	cobrador@gmail.com	$2b$10$FLLjg5ppYVQ4kJmV6LrD4OgiW7VO.TEzntS3t3QejJ8jbw2QiTFMm	COBRADOR	2026-07-18 17:10:16.128	2026-07-25 00:53:56.884	t	\N
4	Jose Julian	vendedor2@gmail.com	$2b$10$c65cPAzSXkYcb5O7c1sGb.Bx4CcBHh7BIhKktAvSsYcBQb/arTJaa	VENDEDOR	2026-07-25 00:50:05.849	2026-07-25 00:55:42.217	t	2026-07-25 00:55:42.216
1	Administrador	admin2@gmail.com	$2b$10$t3rYsIwsSjE4ey8ePXxSluPSMnWmfxE9pMhYahD6miWIdXG0F1H0C	ADMIN	2026-07-18 15:26:29.076	2026-07-26 04:01:39.484	t	2026-07-26 04:01:39.428
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
863601ec-dcb4-46ca-8e16-c51bd5a8d245	13102828e89556fc19308de49c4b7647019457ce9def831c446ff520f354990c	2026-07-18 04:29:45.448094+00	20260714014609_init	\N	\N	2026-07-18 04:29:44.422256+00	1
d7b5496a-cbe7-40e6-9286-0e160fa6c52a	65987d2a0406319a7b95aa62c0063defe31ad5bcb4fb11556903fc76e0886ba4	2026-07-18 04:29:46.155074+00	20260714020454_add_location_model	\N	\N	2026-07-18 04:29:45.491449+00	1
f987b731-d8cf-48ee-9c21-20ea1a029220	128ddafa2f803775b48cfbb188c59564257897774dece84ccb15e0d0501a00d8	2026-07-18 23:47:04.375118+00	20260718234659_actualizar_modulo_ventas	\N	\N	2026-07-18 23:46:59.266794+00	1
9f08b4c6-5992-4433-b876-34bb0b0803a5	b3fbef00812f2abd32bab54b7cdfd89a51d7b085d099564d1ad95f3cf8fe2b16	2026-07-18 04:29:46.992428+00	20260714125320_add_location_and_client	\N	\N	2026-07-18 04:29:46.284585+00	1
9036bf0a-1c22-4220-a783-07b380d259c6	d5ee007c0b3316a001eae7a4e8f45731de3032db00b9f1327d9de31164834516	2026-07-18 04:29:47.236585+00	20260714131457_add_client_model	\N	\N	2026-07-18 04:29:47.036134+00	1
457b0c0c-b07a-423f-ae97-84a6f7820347	93b6e45ae2b8ed25df131bdd3b25aa4ff283d9e545461d84abb9d2f7fbb868a2	2026-07-24 04:35:32.938751+00	20260724043000_report_dates_and_weighted_cost	\N	\N	2026-07-24 04:35:32.161805+00	1
f55ba8f2-7517-4a7e-8b44-2de2096fb2b3	fa71f32463eada35fbd73a82805f14f14fa026531bda69d8c8b7df2df24a3514	2026-07-18 04:29:47.827032+00	20260715043016_add_provider	\N	\N	2026-07-18 04:29:47.280674+00	1
241f46d6-c5f1-4b84-aa5a-45d0223b8f10	81105fcf0441067ebfcdde3cf47cef8a2bd1a3f2a7e17a849f83aa6e7d1d657a	2026-07-21 04:41:39.097167+00	20260721090000_add_purchase_sale_prices	\N	\N	2026-07-21 04:41:38.206781+00	1
977638bf-a689-49a8-b861-7d59b8b1071e	591cb81cf43064841aa586a2982b243a4ed3e480a564a8fce4797bd2567e2255	2026-07-18 04:29:49.015802+00	20260715053312_add_category_and_subcategory	\N	\N	2026-07-18 04:29:47.881658+00	1
823a063f-f9f6-434e-a69a-43ac46c3144b	5b15eb05085fb585c00906db18566fb8e019b3d06cbdcd9f5bebe9931fb249a1	2026-07-18 04:29:49.680726+00	20260715132854_add_product_model	\N	\N	2026-07-18 04:29:49.073188+00	1
a89b039f-c8ef-4a5d-83a7-1693046564ae	794ffa47a22fa4a424c3c5739c59585012f00a2e6788ba1e0d184d157a73afda	2026-07-18 04:29:51.825206+00	20260715152648_add_purchase_and_update_product	\N	\N	2026-07-18 04:29:49.73621+00	1
4432de18-9df7-45ff-82f2-1fbd20147357	ed8893c82c8527ac5475bdfddc15e12608b3810faf3df8edfb731a40eac14ae7	2026-07-23 02:41:15.319579+00	20260722120000_add_warehouses_and_stock	\N	\N	2026-07-23 02:41:08.137327+00	1
1ac47c63-40bb-4766-8c6a-d491b6ead125	814b950640026cfc779937073ee1fa11443af91aa60891851aeb1d077181a312	2026-07-18 04:29:52.013759+00	20260715174528_add_min_quantity_wholesale	\N	\N	2026-07-18 04:29:51.870446+00	1
bde944b1-bffd-4732-8810-b983697df188	801337c5d9372434dcb36eecb07b647ad9fbbc19e3609f9c0aa4a97113464002	2026-07-18 04:29:53.403564+00	20260715224223_add_sale_models	\N	\N	2026-07-18 04:29:52.058765+00	1
724174aa-81f8-4bde-8939-fdae7eac5b7d	8f254ad9e948addb9da3edc56cd5b77da4cb3c98583736dbb75c8adfd9b88ab5	2026-07-18 04:29:54.070417+00	20260716004048_add_payment_and_update_sale	\N	\N	2026-07-18 04:29:53.45895+00	1
e5dc698b-5670-4efe-9e41-f8310e43dd6c	f19e2df22b5ad0b9a3cca6ceb1d771acafe3aa1b2fd8a5b82d84c59a3ff550b5	2026-07-23 02:41:53.994422+00	20260723024153	\N	\N	2026-07-23 02:41:53.742528+00	1
7c93f238-5d2f-4871-bc08-6ca1eb2b2f0c	299ec0c72aaf9e385c9691787566c7493a92dbf063462e3153d7ed925e974d9a	2026-07-18 04:29:54.791718+00	20260716033009_add_report_history	\N	\N	2026-07-18 04:29:54.114023+00	1
f24afb23-b3f1-48fc-a07c-b58339582d74	ca13271ec68a947f9daca6aa13026b3cfabe4859937a474d2a3b3393fd322c8f	2026-07-18 14:01:09.064615+00	20260718140105_actualizar_modulo_compras	\N	\N	2026-07-18 14:01:05.816357+00	1
58f3ddc8-a0b8-45a0-90f2-ed5745d87820	8b87c74cab2330dbc1d67191158c23a3e8c58356ac72f395a659d197cc19efd6	2026-07-25 00:23:40.373488+00	20260724120000_user_administration	\N	\N	2026-07-25 00:23:38.630792+00	1
2836e429-7d0c-4e7a-bb60-21a483826881	88dfa5a6e5027ec16576e404cf34ad1ce62addc8270e959af0d56bf29908f15a	2026-07-23 03:10:59.234685+00	20260723040000_restore_purchase_detail_prices	\N	\N	2026-07-23 03:10:59.089548+00	1
bfe245a8-e014-40d0-8105-047065004ae6	edd0fbda731e8129031d8c1506bb2c107a9ecde5033380a6095d173fb07f1979	2026-07-23 03:50:19.40024+00	20260723060000_purchase_warehouse_distributions	\N	\N	2026-07-23 03:50:19.05222+00	1
b61cbb9c-32d9-489f-9067-df7eb1753d08	5f6e8dda33875d1bcdc91ed45759455743bd81f1eaf51692ba6d0d710a7ae27d	2026-07-23 04:51:46.980176+00	20260723120000_add_collection_assignments	\N	\N	2026-07-23 04:51:45.657824+00	1
256f6e52-7ba2-4baf-8636-872e99d8e156	a3d6ae1a37c09ba51880b42f370e375d34dcd91648411ad3951a13bceb75c062	2026-07-26 00:34:20.586802+00	20260725190000_sale_whatsapp_delivery	\N	\N	2026-07-26 00:34:19.014913+00	1
1ef48f55-55ce-4faf-8691-a7d3cae95552	ce369e17a50949a30e2a364db793aaeaf9617ef998a2ba47f1463e88a10ddd5b	2026-07-24 02:30:37.64201+00	20260723190000_sync_central_sale_reservations	\N	\N	2026-07-24 02:30:37.020684+00	1
c008b5d5-c971-4846-be31-a2004c9867c0	2030370e4afae8ab9eab44d1222382587191103f1ecb88cacc59b55bfd62703c	2026-07-28 14:54:10.833907+00	20260728090000_security_authentication_foundation	\N	\N	2026-07-28 14:54:03.56013+00	1
1e66d275-9adc-4725-924f-66a083d68f0f	f4696c4b1bb4e6b502b0350639987816a8a475fc63352caaa369e5b9e9e88edb	2026-07-28 14:55:58.587003+00	20260728145556_seguridad	\N	\N	2026-07-28 14:55:56.936667+00	1
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categories (id, name, "createdAt", "updatedAt") FROM stdin;
cmrqluh2x0002owvcv5cpbupg	Fideo	2026-07-18 16:52:27.513	2026-07-18 16:52:27.513
cmrqlv13a0004owvc357d8vnq	Higenico	2026-07-18 16:52:53.446	2026-07-18 16:52:53.446
cmrqlvjbe0006owvc4g09g4x8	Galletas	2026-07-18 16:53:17.066	2026-07-18 16:53:17.066
\.


--
-- Data for Name: clients; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.clients (id, "fullName", alias, type, "locationId", phone, "additionalInfo", "createdAt", "updatedAt", "whatsappConsent") FROM stdin;
cmrqoigdv000fm4vc5zes7nmg	Mario	Mario	ESPECIAL	cmrqohfoh000cm4vcrhnwp7vg	71234567	\N	2026-07-18 18:07:05.587	2026-07-18 18:07:05.587	f
cmrqoj5b0000gm4vc22y5czus	Rosa	Rosa	CAMINO	cmrqoh6d7000bm4vchrp39nj5	67108535	\N	2026-07-18 18:07:37.884	2026-07-18 18:07:37.884	f
cmrqojr3g000hm4vcplnj42t3	Ana	Ana	NORMAL	cmrqohfoh000cm4vcrhnwp7vg	67108535	\N	2026-07-18 18:08:06.124	2026-07-18 18:08:06.124	f
cmruua3h200048cvcjrzkz08p	Cliente Prueba	abc	CAMINO	cmrqohqjm000em4vcp0oxuzvl	67108535	\N	2026-07-21 15:59:38.006	2026-07-21 15:59:38.006	f
\.


--
-- Data for Name: collection_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.collection_assignments (id, "saleId", "assignedToId", "assignedById", "assignedAt", "updatedAt") FROM stdin;
cmrx3q7z000007svcpkc2jh2a	cmrr91chr0003ckvcvw8loji6	2	1	2026-07-23 05:59:39.229	2026-07-23 05:59:39.229
cmrx3qi2100017svc48ey3q5g	cmru2qtod0000wkvc11l1ylc8	1	1	2026-07-23 05:59:52.297	2026-07-23 05:59:52.297
cmrx3up3r00057svc838579bc	cmrx3s7m200027svc9irs89xc	2	1	2026-07-23 06:03:08.055	2026-07-23 06:03:08.055
cmrznmazd0002zgvcocjqmrdy	cmryc9s8k0000movcs86d7rjb	4	1	2026-07-25 00:52:01.177	2026-07-25 00:52:01.177
\.


--
-- Data for Name: inventory_movements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inventory_movements (id, "warehouseId", "productId", "userId", type, quantity, "previousStock", "newStock", "referenceId", observations, "createdAt") FROM stdin;
im_initial_cmrqm17i2000aowvc8hn4y1ht	warehouse_central	cmrqm17i2000aowvc8hn4y1ht	\N	INITIAL_STOCK	29	0	29	\N	Migración del stock existente al Almacén Central	2026-07-23 02:41:15.217
im_initial_cmrqlxwd80008owvcc6i9w0en	warehouse_central	cmrqlxwd80008owvcc6i9w0en	\N	INITIAL_STOCK	9	0	9	\N	Migración del stock existente al Almacén Central	2026-07-23 02:41:15.217
im_initial_cmrqlzq5q0009owvcxz3bjjhu	warehouse_central	cmrqlzq5q0009owvcxz3bjjhu	\N	INITIAL_STOCK	7	0	7	\N	Migración del stock existente al Almacén Central	2026-07-23 02:41:15.217
im_initial_cmrqm2so8000bowvc4fsrfxiz	warehouse_central	cmrqm2so8000bowvc4fsrfxiz	\N	INITIAL_STOCK	32	0	32	\N	Migración del stock existente al Almacén Central	2026-07-23 02:41:15.217
im_initial_cmrutk1ww00008cvc5rfp5lmc	warehouse_central	cmrutk1ww00008cvc5rfp5lmc	\N	INITIAL_STOCK	1	0	1	\N	Migración del stock existente al Almacén Central	2026-07-23 02:41:15.217
im_initial_cmrvk67sk0000hwvchpp7f4og	warehouse_central	cmrvk67sk0000hwvchpp7f4og	\N	INITIAL_STOCK	1	0	1	\N	Migración del stock existente al Almacén Central	2026-07-23 02:41:15.217
cmrwzdd750008ygvc1smfcccz	warehouse_central	cmrqlzq5q0009owvcxz3bjjhu	1	PURCHASE_IN	1	7	8	cmrwzcwb70001ygvc31z86cya	Recepción de compra cmrwzcwaw0000ygvc7nnx8kn1 del proveedor cmrqlrlb50000owvcyi7aiyav	2026-07-23 03:57:41.009
cmrwzddan000aygvc4dmq83k2	warehouse_central	cmrqlxwd80008owvcc6i9w0en	1	PURCHASE_IN	50	9	59	cmrwzcwb70001ygvc31z86cya	Recepción de compra cmrwzcwaw0000ygvc7nnx8kn1 del proveedor cmrqlrlb50000owvcyi7aiyav	2026-07-23 03:57:41.136
cmrwzddb5000cygvcr24fuf4y	warehouse_deposito	cmrqlxwd80008owvcc6i9w0en	1	PURCHASE_IN	50	0	50	cmrwzcwb70001ygvc31z86cya	Recepción de compra cmrwzcwaw0000ygvc7nnx8kn1 del proveedor cmrqlrlb50000owvcyi7aiyav	2026-07-23 03:57:41.153
cmrxov63300032gvc0rt7sgno	warehouse_deposito	cmrqlxwd80008owvcc6i9w0en	1	TRANSFER_OUT	25	50	25	cmrxov5q100002gvc763cm9ye	Transferencia TR-20260723-A4DE062A: Depósito → Almacén Central	2026-07-23 15:51:21.999
cmrxov63300042gvc4sjptncc	warehouse_central	cmrqlxwd80008owvcc6i9w0en	1	TRANSFER_IN	25	59	84	cmrxov5q100002gvc763cm9ye	Transferencia TR-20260723-A4DE062A: Depósito → Almacén Central	2026-07-23 15:51:21.999
cmrxpfrvi000e2gvctrbi5113	warehouse_central	cmrqlxwd80008owvcc6i9w0en	1	PURCHASE_IN	50	84	134	cmrxpfj1500062gvcd0kl0bx7	Recepción de compra cmrxpfj0v00052gvc3kg0fqoo del proveedor cmrqlrlb50000owvcyi7aiyav	2026-07-23 16:07:23.358
cmrxpfrw1000g2gvc18hzvjio	warehouse_deposito	cmrqlxwd80008owvcc6i9w0en	1	PURCHASE_IN	50	25	75	cmrxpfj1500062gvcd0kl0bx7	Recepción de compra cmrxpfj0v00052gvc3kg0fqoo del proveedor cmrqlrlb50000owvcyi7aiyav	2026-07-23 16:07:23.377
cmrxpfrzz000i2gvcpkbkkrmo	warehouse_central	cmrqlzq5q0009owvcxz3bjjhu	1	PURCHASE_IN	50	8	58	cmrxpfj1500062gvcd0kl0bx7	Recepción de compra cmrxpfj0v00052gvc3kg0fqoo del proveedor cmrqlrlb50000owvcyi7aiyav	2026-07-23 16:07:23.519
cmrxpfs0h000k2gvch8anxmaw	warehouse_deposito	cmrqlzq5q0009owvcxz3bjjhu	1	PURCHASE_IN	50	0	50	cmrxpfj1500062gvcd0kl0bx7	Recepción de compra cmrxpfj0v00052gvc3kg0fqoo del proveedor cmrqlrlb50000owvcyi7aiyav	2026-07-23 16:07:23.537
cmrxph9bi000p2gvcjhkyfdrv	warehouse_deposito	cmrqlxwd80008owvcc6i9w0en	1	TRANSFER_OUT	5	75	70	cmrxph99y000l2gvcvqswpe6h	Transferencia TR-20260723-51805C2F: Depósito → Almacén Central	2026-07-23 16:08:32.622
cmrxph9bi000q2gvcb1l2b9bf	warehouse_central	cmrqlxwd80008owvcc6i9w0en	1	TRANSFER_IN	5	134	139	cmrxph99y000l2gvcvqswpe6h	Transferencia TR-20260723-51805C2F: Depósito → Almacén Central	2026-07-23 16:08:32.622
cmrxph9cm000s2gvc85vng0pn	warehouse_deposito	cmrqlzq5q0009owvcxz3bjjhu	1	TRANSFER_OUT	10	50	40	cmrxph99y000l2gvcvqswpe6h	Transferencia TR-20260723-51805C2F: Depósito → Almacén Central	2026-07-23 16:08:32.662
cmrxph9cm000t2gvchiy78j6h	warehouse_central	cmrqlzq5q0009owvcxz3bjjhu	1	TRANSFER_IN	10	58	68	cmrxph99y000l2gvcvqswpe6h	Transferencia TR-20260723-51805C2F: Depósito → Almacén Central	2026-07-23 16:08:32.662
cmrxpit85000v2gvcc6ua6h3s	warehouse_central	cmrqlxwd80008owvcc6i9w0en	1	TRANSFER_CANCEL_OUT	5	139	134	cmrxph99y000l2gvcvqswpe6h	Anulación TR-20260723-51805C2F: Almacén Central → Depósito	2026-07-23 16:09:45.078
cmrxpit86000w2gvcp164brx3	warehouse_deposito	cmrqlxwd80008owvcc6i9w0en	1	TRANSFER_CANCEL_IN	5	70	75	cmrxph99y000l2gvcvqswpe6h	Anulación TR-20260723-51805C2F: Almacén Central → Depósito	2026-07-23 16:09:45.078
cmrxpit9a000y2gvchyqn96yw	warehouse_central	cmrqlzq5q0009owvcxz3bjjhu	1	TRANSFER_CANCEL_OUT	10	68	58	cmrxph99y000l2gvcvqswpe6h	Anulación TR-20260723-51805C2F: Almacén Central → Depósito	2026-07-23 16:09:45.118
cmrxpit9a000z2gvca7pna9ae	warehouse_deposito	cmrqlzq5q0009owvcxz3bjjhu	1	TRANSFER_CANCEL_IN	10	40	50	cmrxph99y000l2gvcvqswpe6h	Anulación TR-20260723-51805C2F: Almacén Central → Depósito	2026-07-23 16:09:45.118
cmryca0ry0002movc1h4lw5tq	warehouse_central	cmrqlxwd80008owvcc6i9w0en	1	SALE_OUT	55	134	79	cmryc9s8k0000movcs86d7rjb	Venta 20260723-005 confirmada	2026-07-24 02:46:46.126
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payments (id, "saleId", "clientId", "userId", amount, method, reference, "receivedAt", observations, "createdAt", "updatedAt") FROM stdin;
cmrr5n8j90002ckvcly1cfda2	cmrr5n84i0000ckvcy8tfwqyl	cmrqoj5b0000gm4vc22y5czus	1	12.1	CASH	\N	2026-07-19 02:06:42.165	Pago inicial registrado con la venta	2026-07-19 02:06:42.165	2026-07-19 02:06:42.165
cmrx3vwka00077svcekf4njvr	cmrr91chr0003ckvcvw8loji6	cmrqojr3g000hm4vcplnj42t3	1	69.3	CASH	\N	2026-07-23 06:04:04.378	\N	2026-07-23 06:04:04.378	2026-07-23 06:04:04.378
cmrx3w2m500087svcewp8begf	cmru2qtod0000wkvc11l1ylc8	cmrqoigdv000fm4vc5zes7nmg	1	34.1	CASH	\N	2026-07-23 06:04:12.221	\N	2026-07-23 06:04:12.221	2026-07-23 06:04:12.221
cmrx3w7o400097svcfqmpz7se	cmrx3s7m200027svc9irs89xc	cmrqoj5b0000gm4vc22y5czus	1	29.05	CASH	\N	2026-07-23 06:04:18.772	\N	2026-07-23 06:04:18.772	2026-07-23 06:04:18.772
cmrzns3df0005zgvc7f3vdvry	cmryc9s8k0000movcs86d7rjb	cmrqoj5b0000gm4vc22y5czus	4	635.25	QR	\N	2026-07-25 00:56:31.251	\N	2026-07-25 00:56:31.251	2026-07-25 00:56:31.251
\.


--
-- Data for Name: providers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.providers (id, "companyName", "contactName", phone, email, "createdAt", "updatedAt") FROM stdin;
cmrqlsmgx0001owvcrhszqsoy	Copelme	Eriverto Condori	71234567	fuenteseddy85@gmail.com	2026-07-18 16:51:01.186	2026-07-18 16:51:19.546
cmrqlrlb50000owvcyi7aiyav	Molino Andino	Eriverto Condori	67108535	fuenteseddy85@gmail.com	2026-07-18 16:50:13.025	2026-07-18 16:51:34.88
\.


--
-- Data for Name: purchase_detail_warehouses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.purchase_detail_warehouses (id, "purchaseDetailId", "warehouseId", quantity, "createdAt", "updatedAt") FROM stdin;
pdw_default_cmrqm5srb000eowvcupei1u26	cmrqm5srb000eowvcupei1u26	warehouse_central	10	2026-07-23 03:50:19.198	2026-07-23 03:50:19.198
pdw_default_cmrqm5srb000fowvc5opy0yqb	cmrqm5srb000fowvc5opy0yqb	warehouse_central	10	2026-07-23 03:50:19.198	2026-07-23 03:50:19.198
pdw_default_cmrqm5ssr000howvc3256nn3v	cmrqm5ssr000howvc3256nn3v	warehouse_central	20	2026-07-23 03:50:19.198	2026-07-23 03:50:19.198
pdw_default_cmrqm5ssr000iowvcsg0mc1ml	cmrqm5ssr000iowvcsg0mc1ml	warehouse_central	20	2026-07-23 03:50:19.198	2026-07-23 03:50:19.198
pdw_default_cmrqmc8zr0002m4vc4utl25wn	cmrqmc8zr0002m4vc4utl25wn	warehouse_central	1	2026-07-23 03:50:19.198	2026-07-23 03:50:19.198
pdw_default_cmrqmc8zr0003m4vccppcspqm	cmrqmc8zr0003m4vccppcspqm	warehouse_central	1	2026-07-23 03:50:19.198	2026-07-23 03:50:19.198
pdw_default_cmrqmc90e0005m4vciijhsspl	cmrqmc90e0005m4vciijhsspl	warehouse_central	1	2026-07-23 03:50:19.198	2026-07-23 03:50:19.198
pdw_default_cmrqmc90e0006m4vcon92reps	cmrqmc90e0006m4vcon92reps	warehouse_central	1	2026-07-23 03:50:19.198	2026-07-23 03:50:19.198
pdw_default_cmrutce1o0002icvc2y3d4rx3	cmrutce1o0002icvc2y3d4rx3	warehouse_central	1	2026-07-23 03:50:19.198	2026-07-23 03:50:19.198
pdw_default_cmrutlf8w00038cvcr1svmftk	cmrutlf8w00038cvcr1svmftk	warehouse_central	1	2026-07-23 03:50:19.198	2026-07-23 03:50:19.198
pdw_default_cmrvk6xfe0003hwvcrdzuu66h	cmrvk6xfe0003hwvcrdzuu66h	warehouse_central	1	2026-07-23 03:50:19.198	2026-07-23 03:50:19.198
cmrwzcwek0003ygvce07hptht	cmrwzcwcv0002ygvckpgieljs	warehouse_central	1	2026-07-23 03:57:19.113	2026-07-23 03:57:19.113
cmrwzcwfo0005ygvcxm63ry83	cmrwzcwey0004ygvcpsx5vrst	warehouse_central	50	2026-07-23 03:57:19.113	2026-07-23 03:57:19.113
cmrwzcwfp0006ygvcphi0z8yu	cmrwzcwey0004ygvcpsx5vrst	warehouse_deposito	50	2026-07-23 03:57:19.113	2026-07-23 03:57:19.113
cmrxpfj2300082gvcedo2hhvl	cmrxpfj1n00072gvcs900enrs	warehouse_central	50	2026-07-23 16:07:11.887	2026-07-23 16:07:11.887
cmrxpfj2300092gvcnci0r35k	cmrxpfj1n00072gvcs900enrs	warehouse_deposito	50	2026-07-23 16:07:11.887	2026-07-23 16:07:11.887
cmrxpfj3a000b2gvc6h8x87eh	cmrxpfj2j000a2gvcwg99rnjy	warehouse_central	50	2026-07-23 16:07:11.887	2026-07-23 16:07:11.887
cmrxpfj3a000c2gvc84px9ydm	cmrxpfj2j000a2gvcwg99rnjy	warehouse_deposito	50	2026-07-23 16:07:11.887	2026-07-23 16:07:11.887
\.


--
-- Data for Name: purchase_details; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.purchase_details (id, "productId", quantity, "unitPrice", subtotal, "createdAt", "updatedAt", "categoryId", "purchaseProviderId", "pricingConfigured", "priceNormal", "priceCamino", "priceEspecial", "priceMayorista", "minQuantityWholesale") FROM stdin;
cmrqm5srb000eowvcupei1u26	cmrqlxwd80008owvcc6i9w0en	10	10.5	105	2026-07-18 17:01:15.828	2026-07-18 17:01:15.828	cmrqluh2x0002owvcv5cpbupg	cmrqm5sqo000dowvcngykg8we	f	\N	\N	\N	\N	\N
cmrqm5srb000fowvc5opy0yqb	cmrqlzq5q0009owvcxz3bjjhu	10	11	110	2026-07-18 17:01:15.828	2026-07-18 17:01:15.828	cmrqluh2x0002owvcv5cpbupg	cmrqm5sqo000dowvcngykg8we	f	\N	\N	\N	\N	\N
cmrqm5ssr000howvc3256nn3v	cmrqm17i2000aowvc8hn4y1ht	20	20	400	2026-07-18 17:01:15.828	2026-07-18 17:01:15.828	cmrqlv13a0004owvc357d8vnq	cmrqm5ssm000gowvc2dx2lkqa	f	\N	\N	\N	\N	\N
cmrqm5ssr000iowvcsg0mc1ml	cmrqm2so8000bowvc4fsrfxiz	20	30	600	2026-07-18 17:01:15.828	2026-07-18 17:01:15.828	cmrqlv13a0004owvc357d8vnq	cmrqm5ssm000gowvc2dx2lkqa	f	\N	\N	\N	\N	\N
cmrqmc8zr0002m4vc4utl25wn	cmrqm17i2000aowvc8hn4y1ht	1	20	20	2026-07-18 17:06:16.811	2026-07-18 17:06:16.811	cmrqlv13a0004owvc357d8vnq	cmrqmc8zc0001m4vceoopj0kd	f	\N	\N	\N	\N	\N
cmrqmc8zr0003m4vccppcspqm	cmrqm2so8000bowvc4fsrfxiz	1	30	30	2026-07-18 17:06:16.811	2026-07-18 17:06:16.811	cmrqlv13a0004owvc357d8vnq	cmrqmc8zc0001m4vceoopj0kd	f	\N	\N	\N	\N	\N
cmrqmc90e0005m4vciijhsspl	cmrqlxwd80008owvcc6i9w0en	1	10.5	10.5	2026-07-18 17:06:16.811	2026-07-18 17:06:16.811	cmrqluh2x0002owvcv5cpbupg	cmrqmc9080004m4vclgu5f9fv	f	\N	\N	\N	\N	\N
cmrqmc90e0006m4vcon92reps	cmrqlzq5q0009owvcxz3bjjhu	1	11	11	2026-07-18 17:06:16.811	2026-07-18 17:06:16.811	cmrqluh2x0002owvcv5cpbupg	cmrqmc9080004m4vclgu5f9fv	f	\N	\N	\N	\N	\N
cmrutce1o0002icvc2y3d4rx3	cmrqm2so8000bowvc4fsrfxiz	1	85	85	2026-07-21 15:33:24.703	2026-07-21 15:33:24.703	cmrqlv13a0004owvc357d8vnq	cmrutcdzp0001icvcoixxl2bs	f	\N	\N	\N	\N	\N
cmrutlf8w00038cvcr1svmftk	cmrutk1ww00008cvc5rfp5lmc	1	10.5	10.5	2026-07-21 15:40:26.844	2026-07-21 15:40:26.844	cmrqlvjbe0006owvc4g09g4x8	cmrutlf8l00028cvcn4qxfw17	f	\N	\N	\N	\N	\N
cmrvk6xfe0003hwvcrdzuu66h	cmrvk67sk0000hwvchpp7f4og	1	100	100	2026-07-22 04:05:00.181	2026-07-22 04:05:00.181	cmrqlv13a0004owvc357d8vnq	cmrvk6xew0002hwvcim8x79ln	f	\N	\N	\N	\N	\N
cmrwzcwcv0002ygvckpgieljs	cmrqlzq5q0009owvcxz3bjjhu	1	11	11	2026-07-23 03:57:19.113	2026-07-23 03:57:19.113	cmrqluh2x0002owvcv5cpbupg	cmrwzcwb70001ygvc31z86cya	t	12.1	12.1	12.1	12.1	5
cmrwzcwey0004ygvcpsx5vrst	cmrqlxwd80008owvcc6i9w0en	100	10.5	1050	2026-07-23 03:57:19.113	2026-07-23 03:57:19.113	cmrqluh2x0002owvcv5cpbupg	cmrwzcwb70001ygvc31z86cya	t	11.55	11.55	11.55	11.55	5
cmrxpfj1n00072gvcs900enrs	cmrqlxwd80008owvcc6i9w0en	100	10.5	1050	2026-07-23 16:07:11.887	2026-07-23 16:07:11.887	cmrqluh2x0002owvcv5cpbupg	cmrxpfj1500062gvcd0kl0bx7	t	11.55	11.55	11.55	11.55	5
cmrxpfj2j000a2gvcwg99rnjy	cmrqlzq5q0009owvcxz3bjjhu	100	11	1100	2026-07-23 16:07:11.887	2026-07-23 16:07:11.887	cmrqluh2x0002owvcv5cpbupg	cmrxpfj1500062gvcd0kl0bx7	t	12.1	12.1	12.1	12.1	5
\.


--
-- Data for Name: purchase_providers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.purchase_providers (id, "purchaseId", "providerId", status, total, "receivedAt", "cancelledAt", "createdAt", "updatedAt") FROM stdin;
cmrqm5ssm000gowvc2dx2lkqa	cmrqm5sqc000cowvcu72jhcv9	cmrqlsmgx0001owvcrhszqsoy	RECEIVED	1000	2026-07-18 17:02:13.905	\N	2026-07-18 17:01:15.828	2026-07-18 17:02:13.91
cmrqm5sqo000dowvcngykg8we	cmrqm5sqc000cowvcu72jhcv9	cmrqlrlb50000owvcyi7aiyav	CANCELLED	215	2026-07-18 17:02:18.635	2026-07-18 17:04:17.364	2026-07-18 17:01:15.828	2026-07-18 17:04:17.371
cmrqmc9080004m4vclgu5f9fv	cmrqmc8yy0000m4vcfw559s3z	cmrqlrlb50000owvcyi7aiyav	RECEIVED	21.5	2026-07-18 17:06:34.099	\N	2026-07-18 17:06:16.811	2026-07-18 17:06:34.104
cmrqmc8zc0001m4vceoopj0kd	cmrqmc8yy0000m4vcfw559s3z	cmrqlsmgx0001owvcrhszqsoy	RECEIVED	50	2026-07-18 17:06:38.703	\N	2026-07-18 17:06:16.811	2026-07-18 17:06:38.704
cmrutcdzp0001icvcoixxl2bs	cmrutcdi60000icvcoc1jexzw	cmrqlsmgx0001owvcrhszqsoy	RECEIVED	85	2026-07-21 15:34:01.799	\N	2026-07-21 15:33:24.703	2026-07-21 15:34:01.807
cmrutlf8l00028cvcn4qxfw17	cmrutlf8b00018cvcr9i1p7tr	cmrqlsmgx0001owvcrhszqsoy	RECEIVED	10.5	2026-07-21 15:40:43.218	\N	2026-07-21 15:40:26.844	2026-07-21 15:40:43.224
cmrvk6xew0002hwvcim8x79ln	cmrvk6xec0001hwvclxnon91g	cmrqlsmgx0001owvcrhszqsoy	RECEIVED	100	2026-07-22 04:05:13.617	\N	2026-07-22 04:05:00.181	2026-07-22 04:05:13.622
cmrwzcwb70001ygvc31z86cya	cmrwzcwaw0000ygvc7nnx8kn1	cmrqlrlb50000owvcyi7aiyav	RECEIVED	1061	2026-07-23 03:57:41.173	\N	2026-07-23 03:57:19.113	2026-07-23 03:57:41.178
cmrxpfj1500062gvcd0kl0bx7	cmrxpfj0v00052gvc3kg0fqoo	cmrqlrlb50000owvcyi7aiyav	RECEIVED	2150	2026-07-23 16:07:23.555	\N	2026-07-23 16:07:11.887	2026-07-23 16:07:23.56
\.


--
-- Data for Name: purchases; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.purchases (id, "userId", date, status, total, observations, "pdfUrl", "createdAt", "updatedAt") FROM stdin;
cmrqm5sqc000cowvcu72jhcv9	1	2026-07-18 17:01:15.828	RECEIVED	1000	\N	/uploads/purchases/comprobante-compra-cmrqm5sqc000cowvcu72jhcv9.pdf	2026-07-18 17:01:15.828	2026-07-18 17:04:34.547
cmrqmc8yy0000m4vcfw559s3z	1	2026-07-18 17:06:16.811	RECEIVED	71.5	\N	/uploads/purchases/comprobante-compra-cmrqmc8yy0000m4vcfw559s3z.pdf	2026-07-18 17:06:16.811	2026-07-18 17:06:48.286
cmrutcdi60000icvcoc1jexzw	1	2026-07-21 15:33:24.703	RECEIVED	85	\N	\N	2026-07-21 15:33:24.703	2026-07-21 15:34:01.829
cmrutlf8b00018cvcr9i1p7tr	1	2026-07-21 15:40:26.844	RECEIVED	10.5	\N	/uploads/purchases/comprobante-compra-cmrutlf8b00018cvcr9i1p7tr.pdf	2026-07-21 15:40:26.844	2026-07-21 15:41:08.911
cmrvk6xec0001hwvclxnon91g	1	2026-07-22 04:05:00.181	RECEIVED	100	\N	/uploads/purchases/comprobante-compra-cmrvk6xec0001hwvclxnon91g.pdf	2026-07-22 04:05:00.181	2026-07-22 04:05:38.772
cmrwzcwaw0000ygvc7nnx8kn1	1	2026-07-23 03:57:19.113	RECEIVED	1061	\N	/uploads/purchases/comprobante-compra-cmrwzcwaw0000ygvc7nnx8kn1.pdf	2026-07-23 03:57:19.113	2026-07-23 03:58:10.541
cmrxpfj0v00052gvc3kg0fqoo	1	2026-07-23 16:07:11.887	RECEIVED	2150	\N	/uploads/purchases/comprobante-compra-cmrxpfj0v00052gvc3kg0fqoo.pdf	2026-07-23 16:07:11.887	2026-07-23 16:07:57.771
\.


--
-- Data for Name: report_histories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.report_histories (id, type, title, parameters, "fileUrl", "userId", "createdAt") FROM stdin;
cmrx22zn70000oovc06nhzdko	COLLECTION_REPORT	Asignaciones de Cobranza	{"kind":"ASSIGNMENTS_GENERAL"}	/uploads/collections/asignaciones-cobranza-2026-07-23.pdf	1	2026-07-23 05:13:35.731
cmrx23b8p0001oovcw32cig2h	COLLECTION_REPORT	Cuentas por Cobrar - General	{"kind":"GENERAL_DEBT"}	/uploads/collections/cuentas-por-cobrar-general-2026-07-23.pdf	1	2026-07-23 05:13:50.761
cmrx2k1h50000egvc94500jsr	COLLECTION_REPORT	Cuentas por Cobrar - General	{"kind":"GENERAL_DEBT"}	/uploads/collections/cuentas-por-cobrar-general-2026-07-23.pdf	1	2026-07-23 05:26:51.257
cmrx2khl20001egvc3xehharq	COLLECTION_REPORT	Cuentas por Cobrar - General	{"kind":"GENERAL_DEBT"}	/uploads/collections/cuentas-por-cobrar-general-2026-07-23.pdf	1	2026-07-23 05:27:12.134
cmrx3v12p00067svc4atvfesz	COLLECTION_REPORT	Asignaciones de Cobranza - Vendedor	{"kind":"ASSIGNMENTS_USER","assignedToId":2}	/uploads/collections/cobranza-Vendedor-2026-07-23.pdf	1	2026-07-23 06:03:23.569
cmrx3wpv1000a7svcqqyqjeb2	COLLECTION_REPORT	Cuentas por Cobrar - General	{"kind":"GENERAL_DEBT"}	/uploads/collections/cuentas-por-cobrar-general-2026-07-23.pdf	1	2026-07-23 06:04:42.349
cmrycb5zh0003movce2rs9xy1	INVENTORY_GENERAL	Inventario del Almacén Central	{"warehouseId":"warehouse_central","onlyPositiveStock":true,"includesPrices":false}	/uploads/reports/inventario-almacen-central-2026-07-24T02-47-39.pdf	1	2026-07-24 02:47:39.533
\.


--
-- Data for Name: sale_details; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sale_details (id, "saleId", "productId", quantity, "unitPrice", subtotal, "createdAt", "updatedAt", "returnedQuantity") FROM stdin;
cmrr5n8h20001ckvcws3lkkme	cmrr5n84i0000ckvcy8tfwqyl	cmrqlzq5q0009owvcxz3bjjhu	1	12.1	12.1	2026-07-19 02:06:41.634	2026-07-19 02:06:41.634	0
cmrr928yz0006ckvc2q8jtjx1	cmrr91chr0003ckvcvw8loji6	cmrqlxwd80008owvcc6i9w0en	2	11.55	23.1	2026-07-19 03:42:21.419	2026-07-19 03:42:21.419	0
cmrr928yz0008ckvcliggdv34	cmrr91chr0003ckvcvw8loji6	cmrqm17i2000aowvc8hn4y1ht	1	22	22	2026-07-19 03:42:21.419	2026-07-19 03:42:21.419	0
cmrr928yz0007ckvcp28boraw	cmrr91chr0003ckvcvw8loji6	cmrqlzq5q0009owvcxz3bjjhu	4	12.1	48.4	2026-07-19 03:42:21.419	2026-07-19 03:53:11.862	2
cmru2rrmm0004wkvc4b2vc0uj	cmru2qtod0000wkvc11l1ylc8	cmrqm17i2000aowvc8hn4y1ht	1	22	22	2026-07-21 03:09:33.214	2026-07-21 03:09:33.214	0
cmru2rrmm0005wkvcwz4wkhor	cmru2qtod0000wkvc11l1ylc8	cmrqlzq5q0009owvcxz3bjjhu	1	12.1	12.1	2026-07-21 03:09:33.214	2026-07-21 03:09:33.214	0
cmrx3s7mi00037svc5cw88lfq	cmrx3s7m200027svc9irs89xc	cmrutk1ww00008cvc5rfp5lmc	1	17.5	17.5	2026-07-23 06:01:12.074	2026-07-23 06:01:12.074	0
cmrx3s7mi00047svcu47nmzg1	cmrx3s7m200027svc9irs89xc	cmrqlxwd80008owvcc6i9w0en	1	11.55	11.55	2026-07-23 06:01:12.074	2026-07-23 06:01:12.074	0
cmryc9sho0001movcxtlpgyx0	cmryc9s8k0000movcs86d7rjb	cmrqlxwd80008owvcc6i9w0en	55	11.55	635.25	2026-07-24 02:46:35.06	2026-07-24 02:46:35.06	0
\.


--
-- Data for Name: sale_return_details; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sale_return_details (id, "saleReturnId", "saleDetailId", "productId", quantity, "unitPrice", subtotal) FROM stdin;
cmrr9g6qm0001l8vcvwbjsc7r	cmrr9g6n70000l8vcxqr6puvu	cmrr928yz0007ckvcp28boraw	cmrqlzq5q0009owvcxz3bjjhu	2	12.1	24.2
\.


--
-- Data for Name: sale_returns; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sale_returns (id, "saleId", "userId", amount, observations, "createdAt") FROM stdin;
cmrr9g6n70000l8vcxqr6puvu	cmrr91chr0003ckvcvw8loji6	1	24.2	\N	2026-07-19 03:53:11.588
\.


--
-- Data for Name: sale_whatsapp_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sale_whatsapp_logs (id, "saleId", "userId", "phoneNumber", status, "metaMessageId", "errorMessage", "createdAt") FROM stdin;
\.


--
-- Data for Name: sales; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sales (id, "saleNumber", "clientId", "userId", date, status, "paymentStatus", total, discount, observations, "pdfUrl", "createdAt", "updatedAt", "cancelledPdfUrl", "dueDate", "saleType", subtotal, "confirmedAt", "cancelledAt") FROM stdin;
cmrr5n84i0000ckvcy8tfwqyl	20260718-001	cmrqoj5b0000gm4vc22y5czus	1	2026-07-19 02:06:41.634	CONFIRMED	PAID	12.1	0	\N	/uploads/sales/venta-20260718-001.pdf	2026-07-19 02:06:41.634	2026-07-19 02:07:16.213	\N	\N	CASH	12.1	2026-07-19 02:06:41.634	\N
cmrr91chr0003ckvcvw8loji6	20260718-002	cmrqojr3g000hm4vcplnj42t3	1	2026-07-19 03:41:39.327	CONFIRMED	PAID	69.3	0	\N	/uploads/sales/venta-20260718-002.pdf	2026-07-19 03:41:39.327	2026-07-23 06:04:04.434	\N	\N	CASH	69.3	2026-07-19 03:41:39.327	\N
cmru2qtod0000wkvc11l1ylc8	20260720-003	cmrqoigdv000fm4vc5zes7nmg	1	2026-07-21 03:08:49.213	CONFIRMED	PAID	34.1	0	\N	/uploads/sales/venta-20260720-003.pdf	2026-07-21 03:08:49.213	2026-07-23 06:04:12.245	\N	\N	CASH	34.1	2026-07-21 03:08:49.213	\N
cmrx3s7m200027svc9irs89xc	20260723-004	cmrqoj5b0000gm4vc22y5czus	1	2026-07-23 06:01:12.074	CONFIRMED	PAID	29.05	0	\N	/uploads/sales/venta-20260723-004.pdf	2026-07-23 06:01:12.074	2026-07-23 06:04:18.791	\N	\N	CASH	29.05	2026-07-23 06:01:12.074	\N
cmryc9s8k0000movcs86d7rjb	20260723-005	cmrqoj5b0000gm4vc22y5czus	1	2026-07-24 02:46:35.06	CONFIRMED	PAID	635.25	0	\N	/uploads/sales/venta-20260723-005.pdf	2026-07-24 02:46:35.06	2026-07-25 00:56:31.28	\N	\N	CASH	635.25	2026-07-24 02:46:46.126	\N
\.


--
-- Data for Name: sub_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sub_categories (id, name, "categoryId", "createdAt", "updatedAt") FROM stdin;
cmrqlurwx0003owvcih2h21gx	Fideo @	cmrqluh2x0002owvcv5cpbupg	2026-07-18 16:52:41.553	2026-07-18 16:52:41.553
cmrqlv9ld0005owvcr2x8cblm	Planchas	cmrqlv13a0004owvc357d8vnq	2026-07-18 16:53:04.465	2026-07-18 16:53:04.465
cmrqlvxl10007owvc68hm2nyr	wafs	cmrqlvjbe0006owvc4g09g4x8	2026-07-18 16:53:35.558	2026-07-18 16:53:35.558
\.


--
-- Data for Name: user_administration_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_administration_logs (id, "actorId", "targetUserId", action, details, "createdAt") FROM stdin;
cmrznju1z0000zgvcfb3hqotz	1	4	USER_CREATED	{"name": "Jose Julian", "role": "VENDEDOR", "email": "vendedor2@gmail.com"}	2026-07-25 00:50:05.928
cmrznkeqi0001zgvck5m0vhkc	1	3	STATUS_CHANGED	{"currentStatus": "INACTIVE", "previousStatus": "ACTIVE"}	2026-07-25 00:50:32.73
cmrznos9o0003zgvcuiyw24ko	1	3	STATUS_CHANGED	{"currentStatus": "ACTIVE", "previousStatus": "INACTIVE"}	2026-07-25 00:53:56.892
cmrznpgoo0004zgvcak7qga07	1	4	PASSWORD_RESET	\N	2026-07-25 00:54:28.537
\.


--
-- Data for Name: warehouse_stocks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.warehouse_stocks (id, "warehouseId", "productId", stock, "reservedStock", "minStock", "reserveQuantity", "createdAt", "updatedAt") FROM stdin;
ws_deposito_cmrqm17i2000aowvc8hn4y1ht	warehouse_deposito	cmrqm17i2000aowvc8hn4y1ht	0	0	0	0	2026-07-23 02:41:15.173	2026-07-23 02:41:15.173
ws_deposito_cmrqm2so8000bowvc4fsrfxiz	warehouse_deposito	cmrqm2so8000bowvc4fsrfxiz	0	0	0	0	2026-07-23 02:41:15.173	2026-07-23 02:41:15.173
ws_deposito_cmrutk1ww00008cvc5rfp5lmc	warehouse_deposito	cmrutk1ww00008cvc5rfp5lmc	0	0	0	0	2026-07-23 02:41:15.173	2026-07-23 02:41:15.173
ws_deposito_cmrvk67sk0000hwvchpp7f4og	warehouse_deposito	cmrvk67sk0000hwvchpp7f4og	0	0	0	0	2026-07-23 02:41:15.173	2026-07-23 02:41:15.173
ws_deposito_cmrqlxwd80008owvcc6i9w0en	warehouse_deposito	cmrqlxwd80008owvcc6i9w0en	75	0	0	0	2026-07-23 02:41:15.173	2026-07-23 16:09:45.067
ws_deposito_cmrqlzq5q0009owvcxz3bjjhu	warehouse_deposito	cmrqlzq5q0009owvcxz3bjjhu	50	0	0	0	2026-07-23 02:41:15.173	2026-07-23 16:09:45.109
ws_central_cmrqm17i2000aowvc8hn4y1ht	warehouse_central	cmrqm17i2000aowvc8hn4y1ht	29	0	5	11	2026-07-23 02:41:15.128	2026-07-24 02:30:37.159
ws_central_cmrqlzq5q0009owvcxz3bjjhu	warehouse_central	cmrqlzq5q0009owvcxz3bjjhu	58	0	2	3	2026-07-23 02:41:15.128	2026-07-24 02:30:37.159
ws_central_cmrqm2so8000bowvc4fsrfxiz	warehouse_central	cmrqm2so8000bowvc4fsrfxiz	32	0	5	1	2026-07-23 02:41:15.128	2026-07-24 02:30:37.159
ws_central_cmrutk1ww00008cvc5rfp5lmc	warehouse_central	cmrutk1ww00008cvc5rfp5lmc	1	0	5	8	2026-07-23 02:41:15.128	2026-07-24 02:30:37.159
ws_central_cmrvk67sk0000hwvchpp7f4og	warehouse_central	cmrvk67sk0000hwvchpp7f4og	1	0	10	15	2026-07-23 02:41:15.128	2026-07-24 02:30:37.159
ws_central_cmrqlxwd80008owvcc6i9w0en	warehouse_central	cmrqlxwd80008owvcc6i9w0en	79	0	5	9	2026-07-23 02:41:15.128	2026-07-24 02:46:46.101
\.


--
-- Data for Name: warehouse_transfer_details; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.warehouse_transfer_details (id, "transferId", "productId", quantity, "createdAt", "updatedAt") FROM stdin;
cmrxov5w100012gvc8t7wot21	cmrxov5q100002gvc763cm9ye	cmrqlxwd80008owvcc6i9w0en	25	2026-07-23 15:51:21.529	2026-07-23 15:51:21.529
cmrxph9a7000m2gvc1je937af	cmrxph99y000l2gvcvqswpe6h	cmrqlxwd80008owvcc6i9w0en	5	2026-07-23 16:08:32.566	2026-07-23 16:08:32.566
cmrxph9a7000n2gvcsf3hcs6w	cmrxph99y000l2gvcvqswpe6h	cmrqlzq5q0009owvcxz3bjjhu	10	2026-07-23 16:08:32.566	2026-07-23 16:08:32.566
\.


--
-- Data for Name: warehouse_transfers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.warehouse_transfers (id, "transferNumber", "originWarehouseId", "destinationWarehouseId", "userId", status, observations, "transferredAt", "cancelledAt", "createdAt", "updatedAt") FROM stdin;
cmrxov5q100002gvc763cm9ye	TR-20260723-A4DE062A	warehouse_deposito	warehouse_central	1	COMPLETED	\N	2026-07-23 15:51:21.529	\N	2026-07-23 15:51:21.529	2026-07-23 15:51:21.529
cmrxph99y000l2gvcvqswpe6h	TR-20260723-51805C2F	warehouse_deposito	warehouse_central	1	CANCELLED	\N	2026-07-23 16:08:32.566	2026-07-23 16:09:45.03	2026-07-23 16:08:32.566	2026-07-23 16:09:45.033
\.


--
-- Data for Name: warehouses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.warehouses (id, name, code, description, "isActive", "isDefault", "createdAt", "updatedAt") FROM stdin;
warehouse_central	Almacén Central	CENTRAL	Almacén utilizado para las ventas	t	t	2026-07-23 02:41:15.084	2026-07-23 02:41:15.084
warehouse_deposito	Depósito	DEPOSITO	Depósito para acopio de productos	t	f	2026-07-23 02:41:15.084	2026-07-23 02:41:15.084
\.


--
-- Name: User_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."User_id_seq"', 4, true);


--
-- Name: Location Location_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Location"
    ADD CONSTRAINT "Location_pkey" PRIMARY KEY (id);


--
-- Name: Product Product_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: collection_assignments collection_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.collection_assignments
    ADD CONSTRAINT collection_assignments_pkey PRIMARY KEY (id);


--
-- Name: inventory_movements inventory_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: providers providers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.providers
    ADD CONSTRAINT providers_pkey PRIMARY KEY (id);


--
-- Name: purchase_detail_warehouses purchase_detail_warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_detail_warehouses
    ADD CONSTRAINT purchase_detail_warehouses_pkey PRIMARY KEY (id);


--
-- Name: purchase_details purchase_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_details
    ADD CONSTRAINT purchase_details_pkey PRIMARY KEY (id);


--
-- Name: purchase_providers purchase_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_providers
    ADD CONSTRAINT purchase_providers_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: report_histories report_histories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_histories
    ADD CONSTRAINT report_histories_pkey PRIMARY KEY (id);


--
-- Name: sale_details sale_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_details
    ADD CONSTRAINT sale_details_pkey PRIMARY KEY (id);


--
-- Name: sale_return_details sale_return_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_return_details
    ADD CONSTRAINT sale_return_details_pkey PRIMARY KEY (id);


--
-- Name: sale_returns sale_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_pkey PRIMARY KEY (id);


--
-- Name: sale_whatsapp_logs sale_whatsapp_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_whatsapp_logs
    ADD CONSTRAINT sale_whatsapp_logs_pkey PRIMARY KEY (id);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: sub_categories sub_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sub_categories
    ADD CONSTRAINT sub_categories_pkey PRIMARY KEY (id);


--
-- Name: user_administration_logs user_administration_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_administration_logs
    ADD CONSTRAINT user_administration_logs_pkey PRIMARY KEY (id);


--
-- Name: warehouse_stocks warehouse_stocks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouse_stocks
    ADD CONSTRAINT warehouse_stocks_pkey PRIMARY KEY (id);


--
-- Name: warehouse_transfer_details warehouse_transfer_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouse_transfer_details
    ADD CONSTRAINT warehouse_transfer_details_pkey PRIMARY KEY (id);


--
-- Name: warehouse_transfers warehouse_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_pkey PRIMARY KEY (id);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: Location_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Location_name_key" ON public."Location" USING btree (name);


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: categories_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX categories_name_key ON public.categories USING btree (name);


--
-- Name: collection_assignments_assignedAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "collection_assignments_assignedAt_idx" ON public.collection_assignments USING btree ("assignedAt");


--
-- Name: collection_assignments_assignedById_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "collection_assignments_assignedById_idx" ON public.collection_assignments USING btree ("assignedById");


--
-- Name: collection_assignments_assignedToId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "collection_assignments_assignedToId_idx" ON public.collection_assignments USING btree ("assignedToId");


--
-- Name: collection_assignments_saleId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "collection_assignments_saleId_key" ON public.collection_assignments USING btree ("saleId");


--
-- Name: inventory_movements_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "inventory_movements_createdAt_idx" ON public.inventory_movements USING btree ("createdAt");


--
-- Name: inventory_movements_productId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "inventory_movements_productId_idx" ON public.inventory_movements USING btree ("productId");


--
-- Name: inventory_movements_userId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "inventory_movements_userId_idx" ON public.inventory_movements USING btree ("userId");


--
-- Name: inventory_movements_warehouseId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "inventory_movements_warehouseId_idx" ON public.inventory_movements USING btree ("warehouseId");


--
-- Name: providers_companyName_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "providers_companyName_key" ON public.providers USING btree ("companyName");


--
-- Name: purchase_detail_warehouses_purchaseDetailId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "purchase_detail_warehouses_purchaseDetailId_idx" ON public.purchase_detail_warehouses USING btree ("purchaseDetailId");


--
-- Name: purchase_detail_warehouses_purchaseDetailId_warehouseId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "purchase_detail_warehouses_purchaseDetailId_warehouseId_key" ON public.purchase_detail_warehouses USING btree ("purchaseDetailId", "warehouseId");


--
-- Name: purchase_detail_warehouses_warehouseId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "purchase_detail_warehouses_warehouseId_idx" ON public.purchase_detail_warehouses USING btree ("warehouseId");


--
-- Name: purchase_details_categoryId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "purchase_details_categoryId_idx" ON public.purchase_details USING btree ("categoryId");


--
-- Name: purchase_details_productId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "purchase_details_productId_idx" ON public.purchase_details USING btree ("productId");


--
-- Name: purchase_details_purchaseProviderId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "purchase_details_purchaseProviderId_idx" ON public.purchase_details USING btree ("purchaseProviderId");


--
-- Name: purchase_providers_providerId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "purchase_providers_providerId_idx" ON public.purchase_providers USING btree ("providerId");


--
-- Name: purchase_providers_purchaseId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "purchase_providers_purchaseId_idx" ON public.purchase_providers USING btree ("purchaseId");


--
-- Name: purchase_providers_purchaseId_providerId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "purchase_providers_purchaseId_providerId_key" ON public.purchase_providers USING btree ("purchaseId", "providerId");


--
-- Name: sale_details_productId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sale_details_productId_idx" ON public.sale_details USING btree ("productId");


--
-- Name: sale_details_saleId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sale_details_saleId_idx" ON public.sale_details USING btree ("saleId");


--
-- Name: sale_return_details_productId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sale_return_details_productId_idx" ON public.sale_return_details USING btree ("productId");


--
-- Name: sale_return_details_saleDetailId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sale_return_details_saleDetailId_idx" ON public.sale_return_details USING btree ("saleDetailId");


--
-- Name: sale_return_details_saleReturnId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sale_return_details_saleReturnId_idx" ON public.sale_return_details USING btree ("saleReturnId");


--
-- Name: sale_returns_saleId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sale_returns_saleId_idx" ON public.sale_returns USING btree ("saleId");


--
-- Name: sale_returns_userId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sale_returns_userId_idx" ON public.sale_returns USING btree ("userId");


--
-- Name: sale_whatsapp_logs_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sale_whatsapp_logs_createdAt_idx" ON public.sale_whatsapp_logs USING btree ("createdAt");


--
-- Name: sale_whatsapp_logs_saleId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sale_whatsapp_logs_saleId_idx" ON public.sale_whatsapp_logs USING btree ("saleId");


--
-- Name: sale_whatsapp_logs_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sale_whatsapp_logs_status_idx ON public.sale_whatsapp_logs USING btree (status);


--
-- Name: sale_whatsapp_logs_userId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sale_whatsapp_logs_userId_idx" ON public.sale_whatsapp_logs USING btree ("userId");


--
-- Name: sales_cancelledAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sales_cancelledAt_idx" ON public.sales USING btree ("cancelledAt");


--
-- Name: sales_clientId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sales_clientId_idx" ON public.sales USING btree ("clientId");


--
-- Name: sales_confirmedAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sales_confirmedAt_idx" ON public.sales USING btree ("confirmedAt");


--
-- Name: sales_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sales_date_idx ON public.sales USING btree (date);


--
-- Name: sales_paymentStatus_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sales_paymentStatus_idx" ON public.sales USING btree ("paymentStatus");


--
-- Name: sales_saleNumber_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "sales_saleNumber_key" ON public.sales USING btree ("saleNumber");


--
-- Name: sales_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sales_status_idx ON public.sales USING btree (status);


--
-- Name: sales_userId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sales_userId_idx" ON public.sales USING btree ("userId");


--
-- Name: sub_categories_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX sub_categories_name_key ON public.sub_categories USING btree (name);


--
-- Name: user_administration_logs_actorId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "user_administration_logs_actorId_idx" ON public.user_administration_logs USING btree ("actorId");


--
-- Name: user_administration_logs_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "user_administration_logs_createdAt_idx" ON public.user_administration_logs USING btree ("createdAt");


--
-- Name: user_administration_logs_targetUserId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "user_administration_logs_targetUserId_idx" ON public.user_administration_logs USING btree ("targetUserId");


--
-- Name: warehouse_stocks_productId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "warehouse_stocks_productId_idx" ON public.warehouse_stocks USING btree ("productId");


--
-- Name: warehouse_stocks_warehouseId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "warehouse_stocks_warehouseId_idx" ON public.warehouse_stocks USING btree ("warehouseId");


--
-- Name: warehouse_stocks_warehouseId_productId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "warehouse_stocks_warehouseId_productId_key" ON public.warehouse_stocks USING btree ("warehouseId", "productId");


--
-- Name: warehouse_transfer_details_productId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "warehouse_transfer_details_productId_idx" ON public.warehouse_transfer_details USING btree ("productId");


--
-- Name: warehouse_transfer_details_transferId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "warehouse_transfer_details_transferId_idx" ON public.warehouse_transfer_details USING btree ("transferId");


--
-- Name: warehouse_transfer_details_transferId_productId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "warehouse_transfer_details_transferId_productId_key" ON public.warehouse_transfer_details USING btree ("transferId", "productId");


--
-- Name: warehouse_transfers_destinationWarehouseId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "warehouse_transfers_destinationWarehouseId_idx" ON public.warehouse_transfers USING btree ("destinationWarehouseId");


--
-- Name: warehouse_transfers_originWarehouseId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "warehouse_transfers_originWarehouseId_idx" ON public.warehouse_transfers USING btree ("originWarehouseId");


--
-- Name: warehouse_transfers_transferNumber_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "warehouse_transfers_transferNumber_key" ON public.warehouse_transfers USING btree ("transferNumber");


--
-- Name: warehouse_transfers_transferredAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "warehouse_transfers_transferredAt_idx" ON public.warehouse_transfers USING btree ("transferredAt");


--
-- Name: warehouse_transfers_userId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "warehouse_transfers_userId_idx" ON public.warehouse_transfers USING btree ("userId");


--
-- Name: warehouses_code_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX warehouses_code_key ON public.warehouses USING btree (code);


--
-- Name: warehouses_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX warehouses_name_key ON public.warehouses USING btree (name);


--
-- Name: Product Product_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public.categories(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Product Product_providerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES public.providers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Product Product_subCategoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES public.sub_categories(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: clients clients_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT "clients_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: collection_assignments collection_assignments_assignedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.collection_assignments
    ADD CONSTRAINT "collection_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: collection_assignments collection_assignments_assignedToId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.collection_assignments
    ADD CONSTRAINT "collection_assignments_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: collection_assignments collection_assignments_saleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.collection_assignments
    ADD CONSTRAINT "collection_assignments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES public.sales(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: inventory_movements inventory_movements_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT "inventory_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inventory_movements inventory_movements_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT "inventory_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: inventory_movements inventory_movements_warehouseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT "inventory_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES public.warehouses(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payments payments_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payments payments_saleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES public.sales(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: payments payments_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: purchase_detail_warehouses purchase_detail_warehouses_purchaseDetailId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_detail_warehouses
    ADD CONSTRAINT "purchase_detail_warehouses_purchaseDetailId_fkey" FOREIGN KEY ("purchaseDetailId") REFERENCES public.purchase_details(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: purchase_detail_warehouses purchase_detail_warehouses_warehouseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_detail_warehouses
    ADD CONSTRAINT "purchase_detail_warehouses_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES public.warehouses(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: purchase_details purchase_details_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_details
    ADD CONSTRAINT "purchase_details_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public.categories(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: purchase_details purchase_details_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_details
    ADD CONSTRAINT "purchase_details_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: purchase_details purchase_details_purchaseProviderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_details
    ADD CONSTRAINT "purchase_details_purchaseProviderId_fkey" FOREIGN KEY ("purchaseProviderId") REFERENCES public.purchase_providers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: purchase_providers purchase_providers_providerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_providers
    ADD CONSTRAINT "purchase_providers_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES public.providers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: purchase_providers purchase_providers_purchaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_providers
    ADD CONSTRAINT "purchase_providers_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES public.purchases(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: purchases purchases_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT "purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: report_histories report_histories_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_histories
    ADD CONSTRAINT "report_histories_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sale_details sale_details_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_details
    ADD CONSTRAINT "sale_details_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sale_details sale_details_saleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_details
    ADD CONSTRAINT "sale_details_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES public.sales(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sale_return_details sale_return_details_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_return_details
    ADD CONSTRAINT "sale_return_details_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sale_return_details sale_return_details_saleDetailId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_return_details
    ADD CONSTRAINT "sale_return_details_saleDetailId_fkey" FOREIGN KEY ("saleDetailId") REFERENCES public.sale_details(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sale_return_details sale_return_details_saleReturnId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_return_details
    ADD CONSTRAINT "sale_return_details_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES public.sale_returns(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sale_returns sale_returns_saleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT "sale_returns_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES public.sales(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sale_returns sale_returns_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT "sale_returns_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sale_whatsapp_logs sale_whatsapp_logs_saleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_whatsapp_logs
    ADD CONSTRAINT "sale_whatsapp_logs_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES public.sales(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sale_whatsapp_logs sale_whatsapp_logs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_whatsapp_logs
    ADD CONSTRAINT "sale_whatsapp_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sales sales_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT "sales_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sales sales_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT "sales_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sub_categories sub_categories_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sub_categories
    ADD CONSTRAINT "sub_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public.categories(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_administration_logs user_administration_logs_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_administration_logs
    ADD CONSTRAINT "user_administration_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_administration_logs user_administration_logs_targetUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_administration_logs
    ADD CONSTRAINT "user_administration_logs_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: warehouse_stocks warehouse_stocks_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouse_stocks
    ADD CONSTRAINT "warehouse_stocks_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: warehouse_stocks warehouse_stocks_warehouseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouse_stocks
    ADD CONSTRAINT "warehouse_stocks_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES public.warehouses(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: warehouse_transfer_details warehouse_transfer_details_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouse_transfer_details
    ADD CONSTRAINT "warehouse_transfer_details_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: warehouse_transfer_details warehouse_transfer_details_transferId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouse_transfer_details
    ADD CONSTRAINT "warehouse_transfer_details_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES public.warehouse_transfers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: warehouse_transfers warehouse_transfers_destinationWarehouseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT "warehouse_transfers_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES public.warehouses(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: warehouse_transfers warehouse_transfers_originWarehouseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT "warehouse_transfers_originWarehouseId_fkey" FOREIGN KEY ("originWarehouseId") REFERENCES public.warehouses(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: warehouse_transfers warehouse_transfers_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT "warehouse_transfers_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict bn4sOyUFAlTrdbNjulfHnQgEk3wpFgcXtOQZV3MXLuPv0L2FOR94XmaUoGHSFoi


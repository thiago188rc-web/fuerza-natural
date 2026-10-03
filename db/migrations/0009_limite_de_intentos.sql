CREATE TABLE "app"."access_attempts" (
	"clave" text PRIMARY KEY NOT NULL,
	"ventana_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"fallos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_attempts_clave_check" CHECK ("app"."access_attempts"."clave" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "access_attempts_fallos_check" CHECK ("app"."access_attempts"."fallos" >= 0)
);

ALTER TABLE "app"."plans" DROP CONSTRAINT "plans_precio_check";--> statement-breakpoint
ALTER TABLE "app"."plans" ALTER COLUMN "precio_actual" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."payment_periods" ADD COLUMN "cubre_desde" date NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."payment_periods" ADD COLUMN "cubre_hasta" date NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD COLUMN "modalidad" text DEFAULT 'MES_COMPLETO' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD COLUMN "acceso" text DEFAULT 'DIAS_FIJOS' NOT NULL;--> statement-breakpoint
CREATE INDEX "payment_periods_gym_student_cobertura_idx" ON "app"."payment_periods" USING btree ("gym_id","student_id","cubre_desde");--> statement-breakpoint
ALTER TABLE "app"."payment_periods" ADD CONSTRAINT "payment_periods_rango_check" CHECK ("app"."payment_periods"."cubre_hasta" >= "app"."payment_periods"."cubre_desde");--> statement-breakpoint
ALTER TABLE "app"."payment_periods" ADD CONSTRAINT "payment_periods_periodo_coherente_check" CHECK ("app"."payment_periods"."periodo" = date_trunc('month', "app"."payment_periods"."cubre_desde")::date);--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_modalidad_check" CHECK ("app"."payments"."modalidad" in ('MES_COMPLETO','MEDIO_MES'));--> statement-breakpoint
ALTER TABLE "app"."plans" ADD CONSTRAINT "plans_acceso_check" CHECK ("app"."plans"."acceso" in ('DIAS_FIJOS','LIBRE'));--> statement-breakpoint
ALTER TABLE "app"."plans" ADD CONSTRAINT "plans_precio_check" CHECK ("app"."plans"."precio_actual" is null or "app"."plans"."precio_actual" >= 0);
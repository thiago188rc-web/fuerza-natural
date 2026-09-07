CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TABLE "app"."activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_email_snapshot" text NOT NULL,
	"actor_rol_snapshot" text NOT NULL,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" uuid,
	"resumen" text NOT NULL,
	"cambios" jsonb,
	"ip" "inet",
	"user_agent" text,
	"ocurrido_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"rol" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"ultimo_acceso" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_users_rol_check" CHECK ("app"."app_users"."rol" in ('DUENO','STAFF')),
	CONSTRAINT "app_users_email_lower_check" CHECK ("app"."app_users"."email" = lower("app"."app_users"."email"))
);
--> statement-breakpoint
CREATE TABLE "app"."attention_dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"tipo_senal" text NOT NULL,
	"contexto" text NOT NULL,
	"silenciar_hasta" date,
	"nota" text,
	"creado_por" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attention_dismissals_tipo_check" CHECK ("app"."attention_dismissals"."tipo_senal" in ('PAGO_PENDIENTE','NUEVO_SIN_PAGO','PAUSA_VENCIDA','POSIBLE_DUPLICADO','INACTIVIDAD')),
	CONSTRAINT "attention_dismissals_nota_len_check" CHECK ("app"."attention_dismissals"."nota" is null or length("app"."attention_dismissals"."nota") <= 200)
);
--> statement-breakpoint
CREATE TABLE "app"."gym_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"ciclo_modo" text DEFAULT 'MES_CALENDARIO' NOT NULL,
	"primer_periodo_modo" text DEFAULT 'MES_DE_INGRESO' NOT NULL,
	"ventana_pago_desde" smallint DEFAULT 1 NOT NULL,
	"ventana_pago_hasta" smallint DEFAULT 10 NOT NULL,
	"dias_gracia" smallint DEFAULT 5 NOT NULL,
	"dias_nuevo_sin_pago" smallint DEFAULT 7 NOT NULL,
	"motivos_baja" jsonb DEFAULT '[
        {"codigo":"ECONOMICO","etiqueta":"Económico","orden":1,"activo":true},
        {"codigo":"FALTA_TIEMPO","etiqueta":"Falta de tiempo","orden":2,"activo":true},
        {"codigo":"HORARIOS","etiqueta":"Horarios","orden":3,"activo":true},
        {"codigo":"MUDANZA","etiqueta":"Mudanza / distancia","orden":4,"activo":true},
        {"codigo":"CAMBIO_GIMNASIO","etiqueta":"Cambió de gimnasio","orden":5,"activo":true},
        {"codigo":"DEJO_DE_ASISTIR","etiqueta":"Dejó de asistir","orden":6,"activo":true},
        {"codigo":"AVISO_RETIRO","etiqueta":"Avisó que se retira","orden":7,"activo":true},
        {"codigo":"OTRO","etiqueta":"Otro","orden":8,"activo":true}
      ]'::jsonb NOT NULL,
	"alertas_desde" date DEFAULT now() NOT NULL,
	"inactividad_dias" smallint DEFAULT 10 NOT NULL,
	"inactividad_cobertura_min" numeric(3, 2) DEFAULT '0.50' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gym_settings_ciclo_modo_check" CHECK ("app"."gym_settings"."ciclo_modo" in ('MES_CALENDARIO','DESDE_ALTA')),
	CONSTRAINT "gym_settings_primer_periodo_modo_check" CHECK ("app"."gym_settings"."primer_periodo_modo" in ('MES_DE_INGRESO','MES_SIGUIENTE')),
	CONSTRAINT "gym_settings_ventana_desde_check" CHECK ("app"."gym_settings"."ventana_pago_desde" between 1 and 28),
	CONSTRAINT "gym_settings_ventana_hasta_check" CHECK ("app"."gym_settings"."ventana_pago_hasta" between 1 and 28),
	CONSTRAINT "gym_settings_gracia_check" CHECK ("app"."gym_settings"."dias_gracia" between 0 and 20),
	CONSTRAINT "gym_settings_nuevo_sin_pago_check" CHECK ("app"."gym_settings"."dias_nuevo_sin_pago" between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "app"."gyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"timezone" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"moneda" text DEFAULT 'ARS' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."payment_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"periodo" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_periods_periodo_dia1_check" CHECK (extract(day from "app"."payment_periods"."periodo") = 1)
);
--> statement-breakpoint
CREATE TABLE "app"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"fecha_pago" date NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_dias_snapshot" smallint NOT NULL,
	"plan_nombre_snapshot" text NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"metodo" text DEFAULT 'EFECTIVO' NOT NULL,
	"nota" text,
	"anulado_en" timestamp with time zone,
	"anulado_por" uuid,
	"anulado_motivo" text,
	"registrado_por" uuid NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_monto_check" CHECK ("app"."payments"."monto" >= 0),
	CONSTRAINT "payments_metodo_check" CHECK ("app"."payments"."metodo" in ('EFECTIVO','TRANSFERENCIA','BILLETERA','OTRO')),
	CONSTRAINT "payments_anulacion_coherencia_check" CHECK (("app"."payments"."anulado_en" is null) = ("app"."payments"."anulado_motivo" is null)),
	CONSTRAINT "payments_fecha_no_futura_check" CHECK ("app"."payments"."fecha_pago" <= current_date + 1)
);
--> statement-breakpoint
CREATE TABLE "app"."plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"dias_semana" smallint NOT NULL,
	"precio_actual" numeric(12, 2) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_dias_semana_check" CHECK ("app"."plans"."dias_semana" between 1 and 7),
	CONSTRAINT "plans_precio_check" CHECK ("app"."plans"."precio_actual" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."student_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"ocurrido_el" date NOT NULL,
	"datos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_por" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_events_tipo_check" CHECK ("app"."student_events"."tipo" in ('ALTA','BAJA','REACTIVACION','PAUSA','REANUDACION','CAMBIO_PLAN','CONTACTO','NOTA'))
);
--> statement-breakpoint
CREATE TABLE "app"."students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text NOT NULL,
	"nombre_busqueda" text GENERATED ALWAYS AS (public.immutable_unaccent(lower(nombre || ' ' || apellido))) STORED,
	"telefono" text NOT NULL,
	"email" text,
	"documento" text,
	"fecha_nacimiento" date,
	"vinculo" text DEFAULT 'ACTIVO' NOT NULL,
	"plan_id" uuid NOT NULL,
	"fecha_alta_original" date NOT NULL,
	"vinculo_desde" date NOT NULL,
	"pausa_hasta" date,
	"pausa_nota" text,
	"baja_fecha" date,
	"baja_motivo_codigo" text,
	"baja_motivo_etiqueta" text,
	"baja_observacion" text,
	"notas" text,
	"origen" text DEFAULT 'MANUAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_telefono_check" CHECK ("app"."students"."telefono" ~ '^\+[1-9]\d{7,14}$'),
	CONSTRAINT "students_nombre_len_check" CHECK (length("app"."students"."nombre") between 1 and 80),
	CONSTRAINT "students_apellido_len_check" CHECK (length("app"."students"."apellido") between 1 and 80),
	CONSTRAINT "students_pausa_nota_len_check" CHECK ("app"."students"."pausa_nota" is null or length("app"."students"."pausa_nota") <= 300),
	CONSTRAINT "students_baja_obs_len_check" CHECK ("app"."students"."baja_observacion" is null or length("app"."students"."baja_observacion") <= 500),
	CONSTRAINT "students_notas_len_check" CHECK ("app"."students"."notas" is null or length("app"."students"."notas") <= 1000),
	CONSTRAINT "students_vinculo_check" CHECK ("app"."students"."vinculo" in ('ACTIVO','PAUSADO','BAJA')),
	CONSTRAINT "students_origen_check" CHECK ("app"."students"."origen" in ('MANUAL','IMPORTACION')),
	CONSTRAINT "students_baja_coherencia_check" CHECK ("app"."students"."vinculo" <> 'BAJA' or ("app"."students"."baja_fecha" is not null and "app"."students"."baja_motivo_codigo" is not null)),
	CONSTRAINT "students_pausa_coherencia_check" CHECK ("app"."students"."vinculo" <> 'PAUSADO' or ("app"."students"."pausa_hasta" is not null or "app"."students"."pausa_nota" is not null)),
	CONSTRAINT "students_vinculo_desde_check" CHECK ("app"."students"."vinculo_desde" >= "app"."students"."fecha_alta_original")
);
--> statement-breakpoint
ALTER TABLE "app"."activity_log" ADD CONSTRAINT "activity_log_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "app"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."activity_log" ADD CONSTRAINT "activity_log_actor_user_id_app_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "app"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."app_users" ADD CONSTRAINT "app_users_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "app"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."attention_dismissals" ADD CONSTRAINT "attention_dismissals_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "app"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."attention_dismissals" ADD CONSTRAINT "attention_dismissals_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "app"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."attention_dismissals" ADD CONSTRAINT "attention_dismissals_creado_por_app_users_id_fk" FOREIGN KEY ("creado_por") REFERENCES "app"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."gym_settings" ADD CONSTRAINT "gym_settings_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "app"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payment_periods" ADD CONSTRAINT "payment_periods_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "app"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payment_periods" ADD CONSTRAINT "payment_periods_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "app"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payment_periods" ADD CONSTRAINT "payment_periods_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "app"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "app"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "app"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "app"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_anulado_por_app_users_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "app"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_registrado_por_app_users_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "app"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD CONSTRAINT "plans_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "app"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."student_events" ADD CONSTRAINT "student_events_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "app"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."student_events" ADD CONSTRAINT "student_events_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "app"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."student_events" ADD CONSTRAINT "student_events_creado_por_app_users_id_fk" FOREIGN KEY ("creado_por") REFERENCES "app"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."students" ADD CONSTRAINT "students_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "app"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."students" ADD CONSTRAINT "students_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "app"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_gym_fecha_idx" ON "app"."activity_log" USING btree ("gym_id","ocurrido_en");--> statement-breakpoint
CREATE INDEX "activity_log_gym_entidad_idx" ON "app"."activity_log" USING btree ("gym_id","entidad","entidad_id","ocurrido_en");--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_auth_user_id_key" ON "app"."app_users" USING btree ("auth_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_gym_id_email_key" ON "app"."app_users" USING btree ("gym_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "attention_dismissals_unq" ON "app"."attention_dismissals" USING btree ("gym_id","student_id","tipo_senal","contexto");--> statement-breakpoint
CREATE UNIQUE INDEX "gym_settings_gym_id_key" ON "app"."gym_settings" USING btree ("gym_id");--> statement-breakpoint
CREATE INDEX "payment_periods_gym_periodo_idx" ON "app"."payment_periods" USING btree ("gym_id","periodo");--> statement-breakpoint
CREATE INDEX "payment_periods_gym_student_periodo_idx" ON "app"."payment_periods" USING btree ("gym_id","student_id","periodo");--> statement-breakpoint
CREATE INDEX "payments_gym_student_fecha_idx" ON "app"."payments" USING btree ("gym_id","student_id","fecha_pago");--> statement-breakpoint
CREATE INDEX "payments_gym_fecha_idx" ON "app"."payments" USING btree ("gym_id","fecha_pago");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gym_idempotency_key" ON "app"."payments" USING btree ("gym_id","idempotency_key") WHERE "app"."payments"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "plans_gym_id_nombre_key" ON "app"."plans" USING btree ("gym_id","nombre");--> statement-breakpoint
CREATE INDEX "student_events_gym_student_fecha_idx" ON "app"."student_events" USING btree ("gym_id","student_id","ocurrido_el");--> statement-breakpoint
CREATE INDEX "students_gym_id_vinculo_idx" ON "app"."students" USING btree ("gym_id","vinculo");--> statement-breakpoint
CREATE INDEX "students_nombre_busqueda_trgm_idx" ON "app"."students" USING gin ("nombre_busqueda" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "students_gym_id_documento_key" ON "app"."students" USING btree ("gym_id","documento") WHERE "app"."students"."documento" is not null;
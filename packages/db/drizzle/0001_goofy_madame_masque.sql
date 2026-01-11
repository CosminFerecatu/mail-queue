CREATE TYPE "public"."subscription_plan" AS ENUM('free', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."gdpr_request_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."gdpr_request_type" AS ENUM('export', 'delete', 'rectify', 'access');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" "subscription_plan" DEFAULT 'free' NOT NULL,
	"max_apps" integer DEFAULT 1 NOT NULL,
	"max_queues_per_app" integer DEFAULT 1 NOT NULL,
	"max_team_members" integer DEFAULT 0,
	"billing_email" text,
	"billing_address" jsonb,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password_hash" text,
	"name" text NOT NULL,
	"avatar_url" text,
	"google_id" text,
	"github_id" text,
	"owned_account_id" uuid,
	"verification_token" text,
	"verification_token_expires_at" timestamp with time zone,
	"password_reset_token" text,
	"password_reset_expires_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"last_login_ip" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "team_role" DEFAULT 'viewer' NOT NULL,
	"token" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "team_role" DEFAULT 'viewer' NOT NULL,
	"app_permissions" jsonb,
	"invited_by" uuid,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_processing_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"purpose" text NOT NULL,
	"legal_basis" text NOT NULL,
	"data_subject_categories" jsonb,
	"personal_data_categories" jsonb,
	"recipients" jsonb,
	"third_country_transfers" jsonb,
	"retention_period" text,
	"security_measures" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gdpr_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid,
	"email_address" text NOT NULL,
	"request_type" "gdpr_request_type" NOT NULL,
	"status" "gdpr_request_status" DEFAULT 'pending' NOT NULL,
	"requested_by" text NOT NULL,
	"metadata" jsonb,
	"result" jsonb,
	"processed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "saas_users" ADD CONSTRAINT "saas_users_owned_account_id_accounts_id_fk" FOREIGN KEY ("owned_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invited_by_saas_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."saas_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_user_id_saas_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."saas_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_invited_by_saas_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."saas_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_processing_records" ADD CONSTRAINT "data_processing_records_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gdpr_requests" ADD CONSTRAINT "gdpr_requests_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_plan_idx" ON "accounts" USING btree ("plan");--> statement-breakpoint
CREATE INDEX "accounts_is_active_idx" ON "accounts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "accounts_stripe_customer_id_idx" ON "accounts" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_users_email_idx" ON "saas_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_users_google_id_idx" ON "saas_users" USING btree ("google_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_users_github_id_idx" ON "saas_users" USING btree ("github_id");--> statement-breakpoint
CREATE INDEX "saas_users_owned_account_id_idx" ON "saas_users" USING btree ("owned_account_id");--> statement-breakpoint
CREATE INDEX "saas_users_verification_token_idx" ON "saas_users" USING btree ("verification_token");--> statement-breakpoint
CREATE INDEX "saas_users_password_reset_token_idx" ON "saas_users" USING btree ("password_reset_token");--> statement-breakpoint
CREATE UNIQUE INDEX "team_invitations_token_idx" ON "team_invitations" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "team_invitations_account_email_idx" ON "team_invitations" USING btree ("account_id","email");--> statement-breakpoint
CREATE INDEX "team_invitations_account_id_idx" ON "team_invitations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "team_invitations_email_idx" ON "team_invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "team_memberships_account_user_idx" ON "team_memberships" USING btree ("account_id","user_id");--> statement-breakpoint
CREATE INDEX "team_memberships_account_id_idx" ON "team_memberships" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "team_memberships_user_id_idx" ON "team_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "data_processing_records_app_id_idx" ON "data_processing_records" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "gdpr_requests_app_id_idx" ON "gdpr_requests" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "gdpr_requests_email_idx" ON "gdpr_requests" USING btree ("email_address");--> statement-breakpoint
CREATE INDEX "gdpr_requests_status_idx" ON "gdpr_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gdpr_requests_type_idx" ON "gdpr_requests" USING btree ("request_type");--> statement-breakpoint
CREATE INDEX "gdpr_requests_created_at_idx" ON "gdpr_requests" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apps_account_id_idx" ON "apps" USING btree ("account_id");
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('UNVERIFIED', 'COMMUNITY', 'TRUSTED_SOURCE', 'OFFICIAL', 'ADMIN_VERIFIED');--> statement-breakpoint
CREATE TYPE "public"."dedup_match_status" AS ENUM('AUTO_MERGED', 'PENDING_REVIEW', 'MANUAL_MERGED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('DRAFT', 'PUBLISHED', 'CANCELLED', 'POSTPONED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('EVENT_TOMORROW', 'EVENT_CANCELLED', 'EVENT_RESCHEDULED', 'ARTIST_NEW_EVENT', 'SUBMISSION_APPROVED', 'SUBMISSION_REJECTED');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('TICKETMASTER', 'SEATGEEK', 'COMMUNITY', 'ADMIN', 'SPOTIFY', 'LASTFM', 'MUSICBRAINZ');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'MERGED');--> statement-breakpoint
CREATE TYPE "public"."user_event_state" AS ENUM('DISCOVERED', 'INTERESTED', 'GOING', 'HAVE_TICKET', 'ATTENDED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'PROMOTER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."vendor_classification" AS ENUM('OFFICIAL', 'VERIFIED_RESALE');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"preferred_city" text,
	"preferred_state" text,
	"travel_radius_km" integer DEFAULT 80,
	"price_min" integer,
	"price_max" integer,
	"google_id" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "genres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "genres_name_unique" UNIQUE("name"),
	CONSTRAINT "genres_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "artist_genres" (
	"artist_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	CONSTRAINT "artist_genres_artist_id_genre_id_pk" PRIMARY KEY("artist_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"image_url" text,
	"bio" text,
	"spotify_id" text,
	"lastfm_id" text,
	"musicbrainz_id" uuid,
	"spotify_url" text,
	"soundcloud_url" text,
	"apple_music_url" text,
	"primary_source" "source_type" DEFAULT 'ADMIN' NOT NULL,
	"source_url" text,
	"last_verified_at" timestamp with time zone,
	"confidence" "confidence_level" DEFAULT 'UNVERIFIED' NOT NULL,
	"field_provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_vector" "tsvector",
	"follower_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artists_slug_unique" UNIQUE("slug"),
	CONSTRAINT "artists_spotify_id_unique" UNIQUE("spotify_id"),
	CONSTRAINT "artists_musicbrainz_id_unique" UNIQUE("musicbrainz_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"address" text,
	"city" text NOT NULL,
	"state" text,
	"country" text DEFAULT 'US' NOT NULL,
	"postal_code" text,
	"latitude" double precision,
	"longitude" double precision,
	"timezone" text,
	"capacity" integer,
	"venue_type" text,
	"image_url" text,
	"typical_age_restriction" text,
	"typical_bag_policy" text,
	"ticketmaster_id" text,
	"seatgeek_id" text,
	"primary_source" "source_type" DEFAULT 'ADMIN' NOT NULL,
	"source_url" text,
	"last_verified_at" timestamp with time zone,
	"confidence" "confidence_level" DEFAULT 'UNVERIFIED' NOT NULL,
	"field_provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_vector" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venues_slug_unique" UNIQUE("slug"),
	CONSTRAINT "venues_ticketmaster_id_unique" UNIQUE("ticketmaster_id"),
	CONSTRAINT "venues_seatgeek_id_unique" UNIQUE("seatgeek_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_artists" (
	"event_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"is_headliner" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "event_artists_event_id_artist_id_pk" PRIMARY KEY("event_id","artist_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_genres" (
	"event_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	CONSTRAINT "event_genres_event_id_genre_id_pk" PRIMARY KEY("event_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"image_url" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"venue_id" uuid,
	"status" "event_status" DEFAULT 'PUBLISHED' NOT NULL,
	"age_restriction" text,
	"door_time" time,
	"reentry_policy" text,
	"bag_policy" text,
	"prohibited_items" text,
	"dress_code" text,
	"primary_source" "source_type" DEFAULT 'ADMIN' NOT NULL,
	"source_url" text,
	"last_verified_at" timestamp with time zone,
	"confidence" "confidence_level" DEFAULT 'UNVERIFIED' NOT NULL,
	"field_provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_vector" "tsvector",
	"min_price_cents" integer,
	"artist_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_external_ids" (
	"event_id" uuid NOT NULL,
	"source_type" "source_type" NOT NULL,
	"external_id" text NOT NULL,
	CONSTRAINT "event_external_ids_source_type_external_id_pk" PRIMARY KEY("source_type","external_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"source_type" "source_type" NOT NULL,
	"external_id" text,
	"source_url" text,
	"raw_data" jsonb,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_event_source" UNIQUE("source_type","external_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incoming_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" "source_type" NOT NULL,
	"external_id" text,
	"raw_data" jsonb NOT NULL,
	"normalized_data" jsonb,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"matched_event_id" uuid,
	"match_score" real,
	"match_decision" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_match_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incoming_event_id" uuid,
	"incoming_title" text NOT NULL,
	"incoming_date" timestamp with time zone NOT NULL,
	"incoming_venue_name" text,
	"incoming_artists" text[],
	"candidate_event_id" uuid NOT NULL,
	"score" real NOT NULL,
	"venue_score" real,
	"date_score" real,
	"title_score" real,
	"artist_score" real,
	"match_details" jsonb,
	"status" "dedup_match_status" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"vendor_name" text NOT NULL,
	"vendor_classification" "vendor_classification" DEFAULT 'OFFICIAL' NOT NULL,
	"url" text NOT NULL,
	"affiliate_url" text,
	"price_min_cents" integer,
	"price_max_cents" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"ticket_type" text,
	"fees_known" boolean DEFAULT false NOT NULL,
	"last_checked_at" timestamp with time zone,
	"source_type" "source_type",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_artist_follows" (
	"user_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_artist_follows_user_id_artist_id_pk" PRIMARY KEY("user_id","artist_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_event_states" (
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"state" "user_event_state" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_event_states_user_id_event_id_pk" PRIMARY KEY("user_id","event_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_genre_preferences" (
	"user_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	CONSTRAINT "user_genre_preferences_user_id_genre_id_pk" PRIMARY KEY("user_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submitter_id" uuid NOT NULL,
	"event_title" text NOT NULL,
	"event_starts_at" timestamp with time zone NOT NULL,
	"venue_id" uuid,
	"venue_name_raw" text,
	"venue_address_raw" text,
	"artist_names" text[] DEFAULT '{}' NOT NULL,
	"description" text,
	"poster_image_url" text,
	"ticket_url" text,
	"source_url" text,
	"age_restriction" text,
	"status" "submission_status" DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"merged_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"event_tomorrow" boolean DEFAULT true NOT NULL,
	"event_cancelled" boolean DEFAULT true NOT NULL,
	"event_rescheduled" boolean DEFAULT true NOT NULL,
	"artist_new_event" boolean DEFAULT true NOT NULL,
	"submission_updates" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"data" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_status" (
	"source_type" "source_type" PRIMARY KEY NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_error" text,
	"events_synced" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "genres" ADD CONSTRAINT "genres_parent_id_genres_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."genres"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "artist_genres" ADD CONSTRAINT "artist_genres_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "artist_genres" ADD CONSTRAINT "artist_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_artists" ADD CONSTRAINT "event_artists_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_artists" ADD CONSTRAINT "event_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_genres" ADD CONSTRAINT "event_genres_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_genres" ADD CONSTRAINT "event_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_external_ids" ADD CONSTRAINT "event_external_ids_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incoming_events" ADD CONSTRAINT "incoming_events_matched_event_id_events_id_fk" FOREIGN KEY ("matched_event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_match_candidates" ADD CONSTRAINT "event_match_candidates_incoming_event_id_incoming_events_id_fk" FOREIGN KEY ("incoming_event_id") REFERENCES "public"."incoming_events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_match_candidates" ADD CONSTRAINT "event_match_candidates_candidate_event_id_events_id_fk" FOREIGN KEY ("candidate_event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_match_candidates" ADD CONSTRAINT "event_match_candidates_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_artist_follows" ADD CONSTRAINT "user_artist_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_artist_follows" ADD CONSTRAINT "user_artist_follows_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_event_states" ADD CONSTRAINT "user_event_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_event_states" ADD CONSTRAINT "user_event_states_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_genre_preferences" ADD CONSTRAINT "user_genre_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_genre_preferences" ADD CONSTRAINT "user_genre_preferences_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "community_submissions" ADD CONSTRAINT "community_submissions_submitter_id_users_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "community_submissions" ADD CONSTRAINT "community_submissions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "community_submissions" ADD CONSTRAINT "community_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "community_submissions" ADD CONSTRAINT "community_submissions_merged_event_id_events_id_fk" FOREIGN KEY ("merged_event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_google_id" ON "users" USING btree ("google_id") WHERE "users"."google_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_user" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_expires" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_genres_parent" ON "genres" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_genres_slug" ON "genres" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_artist_genres_genre" ON "artist_genres" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_artists_slug" ON "artists" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_artists_spotify" ON "artists" USING btree ("spotify_id") WHERE "artists"."spotify_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_artists_musicbrainz" ON "artists" USING btree ("musicbrainz_id") WHERE "artists"."musicbrainz_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_artists_search" ON "artists" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_artists_name_trgm" ON "artists" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_venues_slug" ON "venues" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_venues_city" ON "venues" USING btree ("city");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_venues_tm" ON "venues" USING btree ("ticketmaster_id") WHERE "venues"."ticketmaster_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_venues_sg" ON "venues" USING btree ("seatgeek_id") WHERE "venues"."seatgeek_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_venues_search" ON "venues" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_venues_name_trgm" ON "venues" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_venues_coords" ON "venues" USING btree ("latitude","longitude") WHERE "venues"."latitude" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_artists_artist" ON "event_artists" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_genres_genre" ON "event_genres" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_events_slug" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_events_starts_at" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_events_status" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_events_venue" ON "events" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_events_search" ON "events" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_events_title_trgm" ON "events" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_events_discovery" ON "events" USING btree ("starts_at","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_external_ids_event" ON "event_external_ids" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_sources_event" ON "event_sources" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_sources_external" ON "event_sources" USING btree ("source_type","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_incoming_status" ON "incoming_events" USING btree ("status") WHERE "incoming_events"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_match_candidates_status" ON "event_match_candidates" USING btree ("status") WHERE "event_match_candidates"."status" = 'PENDING_REVIEW';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_match_candidates_event" ON "event_match_candidates" USING btree ("candidate_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ticket_links_event" ON "ticket_links" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_artist_follows_artist" ON "user_artist_follows" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_event_states_user" ON "user_event_states" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_event_states_event" ON "user_event_states" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_event_states_active" ON "user_event_states" USING btree ("user_id","state") WHERE "user_event_states"."state" in ('INTERESTED', 'GOING', 'HAVE_TICKET');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_submissions_status" ON "community_submissions" USING btree ("status") WHERE "community_submissions"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_submissions_submitter" ON "community_submissions" USING btree ("submitter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_user" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_unread" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_admin" ON "admin_audit_log" USING btree ("admin_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_target" ON "admin_audit_log" USING btree ("target_type","target_id");
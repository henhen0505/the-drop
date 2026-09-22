-- Hand-written migration: trigger functions, triggers, and seed data from
-- architecture/schema.sql that drizzle-kit's schema-diff generator cannot
-- express declaratively (it only introspects tables/columns/indexes/enums,
-- not functions or triggers). Mirrors schema.sql exactly.
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Full-text search vector triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION artists_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
                       setweight(to_tsvector('english', COALESCE(NEW.bio, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_artists_search_vector
  BEFORE INSERT OR UPDATE OF name, bio ON artists
  FOR EACH ROW EXECUTE FUNCTION artists_search_vector_update();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION venues_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
                       setweight(to_tsvector('english', COALESCE(NEW.city, '')), 'B') ||
                       setweight(to_tsvector('english', COALESCE(NEW.address, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_venues_search_vector
  BEFORE INSERT OR UPDATE OF name, city, address ON venues
  FOR EACH ROW EXECUTE FUNCTION venues_search_vector_update();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION events_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
                       setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_events_search_vector
  BEFORE INSERT OR UPDATE OF title, description ON events
  FOR EACH ROW EXECUTE FUNCTION events_search_vector_update();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Denormalized artist follower_count maintenance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_artist_follower_count() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE artists SET follower_count = follower_count + 1 WHERE id = NEW.artist_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE artists SET follower_count = follower_count - 1 WHERE id = OLD.artist_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_follower_count
  AFTER INSERT OR DELETE ON user_artist_follows
  FOR EACH ROW EXECUTE FUNCTION update_artist_follower_count();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- updated_at auto-trigger (applied to all tables with updated_at)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_artists_updated_at BEFORE UPDATE ON artists FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_venues_updated_at BEFORE UPDATE ON venues FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_ticket_links_updated_at BEFORE UPDATE ON ticket_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_user_event_states_updated_at BEFORE UPDATE ON user_event_states FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_submissions_updated_at BEFORE UPDATE ON community_submissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_notification_prefs_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_sync_status_updated_at BEFORE UPDATE ON sync_status FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Seed data: initial sync_status rows
-- ---------------------------------------------------------------------------

INSERT INTO sync_status (source_type) VALUES
  ('TICKETMASTER'),
  ('SEATGEEK'),
  ('SPOTIFY'),
  ('LASTFM'),
  ('MUSICBRAINZ');

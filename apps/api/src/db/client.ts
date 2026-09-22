import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { config } from '../config/index';
import * as schema from './schema/index';

/**
 * Shared pg connection pool + Drizzle client. Lazily connects on first
 * query (pg's Pool does not open a connection until used), so importing
 * this module doesn't require a live database at process startup.
 */
export const pool = new Pool({ connectionString: config.database.url });

export const db = drizzle(pool, { schema });

export type Database = typeof db;

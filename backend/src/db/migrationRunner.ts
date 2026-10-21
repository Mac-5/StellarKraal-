/**
 * Database migration runner
 * Handles automatic migration execution in development and manual control in production
 */

import { exec } from "child_process";
import { promisify } from "util";
import logger from "../utils/logger";
import path from "path";
import { activeDriver, pgQuery } from "./database";

const execAsync = promisify(exec);

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = process.env.NODE_ENV === "development" || !process.env.NODE_ENV;

/**
 * Run pending database migrations
 * - In development: runs automatically on startup
 * - In production: requires manual execution via npm run migrate:prod
 */
export async function runMigrations(): Promise<void> {
  if (isProduction) {
    logger.info("Production mode: Skipping automatic migrations. Run 'npm run migrate:prod' manually.");
    return;
  }

  if (!isDevelopment) {
    logger.info("Non-development mode: Skipping automatic migrations.");
    return;
  }

  try {
    logger.info("Running database migrations...");
    
    const configPath = path.join(__dirname, "../../database.json");
    const { stdout, stderr } = await execAsync(
      `npx db-migrate up --config ${configPath} --env dev`,
      { cwd: path.join(__dirname, "../..") }
    );

    if (stdout) {
      logger.info("Migration output:", { output: stdout.trim() });
    }
    if (stderr) {
      logger.warn("Migration warnings:", { warnings: stderr.trim() });
    }

    logger.info("Database migrations completed successfully");
  } catch (error) {
    logger.error("Migration failed:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(`Database migration failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get migration status
 * Shows which migrations have been applied and which are pending
 * @returns A string describing the current migration status.
 */
export async function getMigrationStatus(): Promise<string> {
  try {
    const configPath = path.join(__dirname, "../../database.json");
    const { stdout } = await execAsync(
      `npx db-migrate check --config ${configPath} --env ${isProduction ? "production" : "dev"}`,
      { cwd: path.join(__dirname, "../..") }
    );
    return stdout.trim();
  } catch (error) {
    throw new Error(`Failed to get migration status: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Check database connectivity by running SELECT 1 against the configured driver.
 * Returns true if the DB is reachable, false otherwise.
 * @returns A promise that resolves to true if the database is healthy, false otherwise.
 */
export async function checkDbHealth(): Promise<boolean> {
  try {
    if (activeDriver === 'pg') {
      await pgQuery('SELECT 1', []);
      return true;
    }
    const dbFile = process.env.DB_FILE ?? path.join(__dirname, "../../dev.sqlite3");
    await execAsync(`sqlite3 "${dbFile}" "SELECT 1;"`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Rollback the last migration
 * Use with caution - only for development or emergency rollbacks
 */
export async function rollbackMigration(): Promise<void> {
  if (isProduction) {
    throw new Error("Rollback in production requires manual execution via npm run migrate:down");
  }

  try {
    logger.warn("Rolling back last migration...");
    
    const configPath = path.join(__dirname, "../../database.json");
    const { stdout, stderr } = await execAsync(
      `npx db-migrate down --config ${configPath} --env dev`,
      { cwd: path.join(__dirname, "../..") }
    );

    if (stdout) {
      logger.info("Rollback output:", { output: stdout.trim() });
    }
    if (stderr) {
      logger.warn("Rollback warnings:", { warnings: stderr.trim() });
    }

    logger.info("Migration rollback completed");
  } catch (error) {
    logger.error("Rollback failed:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Migration rollback failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

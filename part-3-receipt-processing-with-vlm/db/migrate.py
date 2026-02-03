"""
PostgreSQL Migration Runner

A lightweight migration system that executes SQL files in dependency order,
tracking applied migrations in an `applied_migrations` table.

Features:
- Automatic dependency resolution via REFERENCES detection
- Transaction safety with rollback on failure
- Support for autocommit statements (CREATE DATABASE, etc.)
"""

import os
import sys
import re
import logging
from pathlib import Path
from contextlib import contextmanager

import psycopg2

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Environment configuration
MIGRATIONS_DIR = os.getenv('MIGRATIONS_DIR', '/usr/src/app/migrations')

# SQL statements that require autocommit mode (cannot run inside a transaction)
AUTOCOMMIT_STATEMENTS = frozenset([
    'CREATE DATABASE',
    'DROP DATABASE',
    'CREATE TABLESPACE',
    'DROP TABLESPACE',
    'ALTER SYSTEM',
])


@contextmanager
def database_connection():
    """
    Context manager for database connections with automatic cleanup.

    Reads DATABASE_URL from environment and yields an active connection.
    Connection is automatically closed when the context exits.

    Raises:
        SystemExit: If DATABASE_URL is not set or connection fails
    """
    connection_string = os.getenv("DATABASE_URL")
    if not connection_string:
        logger.error("DATABASE_URL environment variable is not set")
        sys.exit(1)

    conn = None
    try:
        conn = psycopg2.connect(connection_string)
        yield conn
    except psycopg2.Error as e:
        logger.error(f"Database connection error: {e}")
        sys.exit(1)
    finally:
        if conn:
            conn.close()


def create_applied_migrations_table(cursor):
    """Create the migration tracking table if it doesn't exist."""
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS applied_migrations (
            filename VARCHAR PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """)
    cursor.connection.commit()


def get_applied_migrations(cursor):
    """Retrieve the set of already-applied migration filenames."""
    cursor.execute("SELECT filename FROM applied_migrations;")
    return {row[0] for row in cursor.fetchall()}


def get_table_references(sql_content):
    """
    Extract table names referenced via FOREIGN KEY REFERENCES.

    Args:
        sql_content: SQL file contents

    Returns:
        Set of referenced table names
    """
    references = set()
    for line in sql_content.split('\n'):
        if 'REFERENCES' in line:
            match = re.search(r'REFERENCES\s+(\w+)', line)
            if match:
                references.add(match.group(1))
    return references


def has_transaction_block(sql_content):
    """Check if the SQL already contains transaction control statements."""
    sql_upper = sql_content.upper().strip()
    return (
        sql_upper.startswith('BEGIN') or
        'BEGIN;' in sql_upper or
        sql_upper.startswith('START TRANSACTION')
    )


def requires_autocommit(sql_content):
    """Check if SQL contains statements that cannot run inside a transaction."""
    sql_upper = sql_content.upper()
    return any(stmt in sql_upper for stmt in AUTOCOMMIT_STATEMENTS)


def topological_sort(migration_files):
    """
    Sort migrations respecting table dependencies (REFERENCES).

    Files are first sorted alphabetically, then reordered so that
    tables referenced by FOREIGN KEYs are created first.

    Args:
        migration_files: List of Path objects pointing to SQL files

    Returns:
        List of Path objects in dependency-resolved order
    """
    migration_files = sorted(migration_files, key=lambda f: f.name)

    # Build dependency graph
    dependencies = {}
    for file in migration_files:
        content = file.read_text()
        dependencies[file.name] = get_table_references(content)

    result = []
    visited = set()

    def visit(filename):
        if filename in visited:
            return
        visited.add(filename)

        for dep_table in dependencies.get(filename, []):
            dep_file = next(
                (f for f in migration_files if f.name.startswith(dep_table)),
                None
            )
            if dep_file:
                visit(dep_file.name)

        result.append(next(f for f in migration_files if f.name == filename))

    for file in migration_files:
        visit(file.name)

    return result


def apply_migration(cursor, migration_file):
    """
    Apply a single migration file.

    Handles three transaction modes:
    1. Autocommit mode for statements like CREATE DATABASE
    2. Self-managed transactions (migration has BEGIN/COMMIT)
    3. Wrapped transactions for standard SQL

    Args:
        cursor: Database cursor
        migration_file: Path to the SQL migration file
    """
    sql = migration_file.read_text()

    if requires_autocommit(sql):
        logger.debug(f"Executing in autocommit mode: {migration_file.name}")
        conn = cursor.connection
        old_isolation = conn.isolation_level
        conn.set_isolation_level(0)  # AUTOCOMMIT

        try:
            for statement in sql.split(';'):
                statement = statement.strip()
                if statement:
                    cursor.execute(statement)
        finally:
            conn.set_isolation_level(old_isolation)

    elif has_transaction_block(sql):
        logger.debug(f"Migration has own transaction control: {migration_file.name}")
        cursor.execute(sql)

    else:
        logger.debug(f"Wrapping in transaction: {migration_file.name}")
        cursor.execute("BEGIN;")
        cursor.execute(sql)
        cursor.execute("COMMIT;")


def record_migration(cursor, filename):
    """Record a successfully applied migration in the tracking table."""
    cursor.execute("BEGIN;")
    cursor.execute(
        "INSERT INTO applied_migrations (filename) VALUES (%s);",
        (filename,)
    )
    cursor.execute("COMMIT;")


def process_migration_files(cursor, migration_files, applied_migrations):
    """
    Process a list of migration files, skipping already-applied ones.

    Args:
        cursor: Database cursor
        migration_files: List of Path objects in execution order
        applied_migrations: Set of filenames already applied
    """
    for migration_file in migration_files:
        filename = migration_file.name

        if filename in applied_migrations:
            logger.info(f"Skipping (already applied): {filename}")
            continue

        logger.info(f"Applying: {filename}")

        try:
            apply_migration(cursor, migration_file)
            record_migration(cursor, filename)
            logger.info(f"Applied successfully: {filename}")

        except Exception as e:
            logger.error(f"Failed to apply {filename}: {e}")

            try:
                cursor.execute("ROLLBACK;")
                logger.info(f"Rolled back: {filename}")
            except Exception as rollback_error:
                logger.error(f"Rollback failed: {rollback_error}")

            logger.error("Stopping migrations due to failure")
            sys.exit(1)


def run_migrations(cursor, applied_migrations):
    """
    Execute migrations from the migrations directory.

    Args:
        cursor: Database cursor
        applied_migrations: Set of already-applied migration filenames
    """
    migrations_dir = Path(MIGRATIONS_DIR)

    if not migrations_dir.exists():
        logger.warning(f"Directory not found: {migrations_dir}")
        return

    migration_files = list(migrations_dir.glob("*.sql"))
    if not migration_files:
        logger.info("No migrations found")
        return

    logger.info(f"Processing {len(migration_files)} migration(s)")
    sorted_files = topological_sort(migration_files)
    process_migration_files(cursor, sorted_files, applied_migrations)


def main():
    """Main entry point for the migration runner."""
    logger.info("Starting migration process...")

    with database_connection() as conn:
        cursor = conn.cursor()
        try:
            create_applied_migrations_table(cursor)
            applied_migrations = get_applied_migrations(cursor)
            run_migrations(cursor, applied_migrations)
            logger.info("Migration process completed.")
        finally:
            cursor.close()


if __name__ == "__main__":
    main()

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { defaultLogger } = require('../logging/logger');

class DatabaseManager {
    constructor(options = {}) {
        this.logger = options.logger || defaultLogger;
        this.dbPath = options.dbPath || path.join(process.cwd(), 'tmp', 'cpq-toolset.db');
        this.connection = null;
        
        // Ensure database directory exists
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.connection = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
                if (err) {
                    this.logger.error('Database connection failed', { error: err.message, dbPath: this.dbPath });
                    reject(err);
                } else {
                    this.logger.info('Database connected', { dbPath: this.dbPath });
                    this.connection.run("PRAGMA foreign_keys = ON");
                    this.connection.run("PRAGMA journal_mode = WAL");
                    resolve();
                }
            });
        });
    }

    async disconnect() {
        return new Promise((resolve, reject) => {
            if (this.connection) {
                this.connection.close((err) => {
                    if (err) {
                        this.logger.error('Database disconnect failed', { error: err.message });
                        reject(err);
                    } else {
                        this.logger.info('Database disconnected');
                        this.connection = null;
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.connection.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.connection.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.connection.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Dynamic table creation for apps
    async createTableForObject(objectName, appName = 'default') {
        const tableName = `${appName}_${objectName}`.toLowerCase();
        
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS ${tableName} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_id TEXT NOT NULL,
                org_id TEXT NOT NULL,
                object_name TEXT NOT NULL,
                record_data TEXT NOT NULL,
                created_date TEXT,
                modified_date TEXT,
                created_by TEXT,
                processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(record_id, org_id)
            )
        `;

        const indexSQL = `
            CREATE INDEX IF NOT EXISTS idx_${tableName}_record_id ON ${tableName}(record_id);
            CREATE INDEX IF NOT EXISTS idx_${tableName}_org_id ON ${tableName}(org_id);
        `;

        try {
            await this.run(createTableSQL);
            await this.run(indexSQL);
            this.logger.info('Table created successfully', { tableName, objectName, appName });
            return tableName;
        } catch (error) {
            this.logger.error('Table creation failed', { error: error.message, tableName });
            throw error;
        }
    }

    async cleanup(appName = null, objectName = null) {
        try {
            if (appName && objectName) {
                // Clean specific table
                const tableName = `${appName}_${objectName}`.toLowerCase();
                await this.run(`DROP TABLE IF EXISTS ${tableName}`);
                this.logger.info('Table cleaned', { tableName });
            } else if (appName) {
                // Clean all tables for app
                const tables = await this.all(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?",
                    [`${appName}_%`]
                );
                
                for (const table of tables) {
                    await this.run(`DROP TABLE IF EXISTS ${table.name}`);
                }
                this.logger.info('App tables cleaned', { appName, count: tables.length });
            } else {
                // Clean all non-system tables
                const tables = await this.all(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                );
                
                for (const table of tables) {
                    await this.run(`DROP TABLE IF EXISTS ${table.name}`);
                }
                this.logger.info('All tables cleaned', { count: tables.length });
            }
        } catch (error) {
            this.logger.error('Cleanup failed', { error: error.message, appName, objectName });
            throw error;
        }
    }
}

// Singleton instance
let dbInstance = null;

function getDatabase(options = {}) {
    if (!dbInstance) {
        dbInstance = new DatabaseManager(options);
    }
    return dbInstance;
}

module.exports = {
    DatabaseManager,
    getDatabase
};
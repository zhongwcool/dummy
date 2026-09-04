/**
 * 统一的 SQLite 连接（data/app.db）。
 *
 * - 账号、应用版本、客户端统计共用一个库，便于关联查询、事务与备份。
 * - 首次启动时自动把旧的 data/stats.db 改名为 app.db，并把 users.json / appVersions.json 导入。
 * - 各业务模块只依赖这里的 getDb / withTransaction，不自行打开文件。
 */
const fs = require('fs');
const path = require('path');

let DatabaseSync;
try {
    ({DatabaseSync} = require('node:sqlite'));
} catch (error) {
    throw new Error(`需要 Node.js 22.13+ 的内置 sqlite，当前版本是 ${process.version}`);
}

// 可用环境变量 DATA_DIR 覆盖数据目录（便于测试或把数据放在项目目录之外）
const DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'app.db');
const LEGACY_STATS_DB_PATH = path.join(DATA_DIR, 'stats.db');
const LEGACY_USERS_JSON = path.join(DATA_DIR, 'users.json');
const LEGACY_APP_VERSIONS_JSON = path.join(DATA_DIR, 'appVersions.json');

let db;

function nowIso() {
    return new Date().toISOString();
}

function todayDate() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function withTransaction(conn, fn) {
    conn.exec('BEGIN IMMEDIATE');
    try {
        const result = fn();
        conn.exec('COMMIT');
        return result;
    } catch (error) {
        try {
            conn.exec('ROLLBACK');
        } catch (_) {
            // 连接已中断时 rollback 可能再次失败
        }
        throw error;
    }
}

function ensureColumn(conn, table, column, definition) {
    const columns = conn.prepare(`PRAGMA table_info(${table})`).all();
    if (columns.some((col) => col.name === column)) {
        return;
    }
    conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function countRows(conn, table) {
    return Number(conn.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n) || 0;
}

function removeIfExists(filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

function markMigrated(filePath) {
    const target = `${filePath}.migrated`;
    removeIfExists(target);
    fs.renameSync(filePath, target);
}

/**
 * 旧版 data/stats.db → data/app.db。
 * WAL 模式下不能只重命名主文件，先 checkpoint 把 -wal 合并回主文件再改名。
 */
function migrateLegacyStatsDbFile() {
    if (fs.existsSync(DB_PATH) || !fs.existsSync(LEGACY_STATS_DB_PATH)) {
        return;
    }
    const legacy = new DatabaseSync(LEGACY_STATS_DB_PATH, {timeout: 5000});
    try {
        legacy.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        legacy.exec('PRAGMA journal_mode = DELETE');
    } finally {
        legacy.close();
    }
    fs.renameSync(LEGACY_STATS_DB_PATH, DB_PATH);
    removeIfExists(`${LEGACY_STATS_DB_PATH}-wal`);
    removeIfExists(`${LEGACY_STATS_DB_PATH}-shm`);
    console.log('[db] 已将 data/stats.db 迁移为 data/app.db');
}

function createSchema(conn) {
    conn.exec(`
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            email TEXT NOT NULL DEFAULT '',
            display_name TEXT NOT NULL DEFAULT '',
            role TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL,
            last_login TEXT
        );

        CREATE TABLE IF NOT EXISTS apps (
            app_id TEXT PRIMARY KEY,
            app_name TEXT,
            logo TEXT NOT NULL DEFAULT '',
            banner TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS products (
            app_id TEXT PRIMARY KEY,
            app_name TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_versions (
            app_id TEXT NOT NULL,
            version_code INTEGER NOT NULL,
            version_name TEXT NOT NULL,
            update_description TEXT NOT NULL DEFAULT '',
            download_url TEXT NOT NULL DEFAULT '',
            force_update INTEGER NOT NULL DEFAULT 0,
            file_size INTEGER,
            md5 TEXT,
            upload_date TEXT,
            created_at TEXT NOT NULL,
            PRIMARY KEY (app_id, version_code)
        );

        CREATE TABLE IF NOT EXISTS devices (
            app_id TEXT NOT NULL,
            device_id TEXT NOT NULL,
            platform TEXT NOT NULL,
            account TEXT,
            version_name TEXT,
            version_code INTEGER,
            os_version TEXT,
            device_model TEXT,
            arch TEXT,
            locale TEXT,
            channel TEXT,
            ip TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            report_count INTEGER DEFAULT 1,
            counted_date TEXT,
            PRIMARY KEY (app_id, device_id)
        );
        CREATE INDEX IF NOT EXISTS idx_devices_seen ON devices(app_id, last_seen);
        CREATE INDEX IF NOT EXISTS idx_devices_account ON devices(app_id, account);

        CREATE TABLE IF NOT EXISTS daily_stats (
            app_id TEXT NOT NULL,
            date TEXT NOT NULL,
            platform TEXT NOT NULL,
            version_name TEXT NOT NULL,
            active_devices INTEGER NOT NULL,
            launches INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (app_id, date, platform, version_name)
        );

        CREATE TABLE IF NOT EXISTS device_daily (
            app_id TEXT NOT NULL,
            device_id TEXT NOT NULL,
            date TEXT NOT NULL,
            launches INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (app_id, device_id, date)
        );
        CREATE INDEX IF NOT EXISTS idx_device_daily_date ON device_daily(app_id, date);

        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);
    ensureColumn(conn, 'daily_stats', 'launches', 'INTEGER NOT NULL DEFAULT 0');
}

/**
 * 修正曾把统计 products 合并进 apps 的中间版本：
 * 有上报数据的应用补回 products；没有任何版本的 apps 行只属于统计，从 apps 移除。
 * 只跑一次，用 meta 标记。
 */
function splitStatsProductsFromApps(conn) {
    const done = conn.prepare("SELECT value FROM meta WHERE key = 'stats_products_split'").get();
    if (done) {
        return;
    }
    let moved = 0;
    let removedOrphans = 0;
    withTransaction(conn, () => {
        const info = conn.prepare(`
            INSERT INTO products (app_id, app_name, created_at)
            SELECT a.app_id, a.app_name, a.created_at
            FROM apps a
            WHERE (
                      EXISTS (SELECT 1 FROM devices d WHERE d.app_id = a.app_id)
                          OR EXISTS (SELECT 1 FROM daily_stats s WHERE s.app_id = a.app_id)
                          OR EXISTS (SELECT 1 FROM device_daily x WHERE x.app_id = a.app_id)
                      ) ON CONFLICT(app_id) DO NOTHING
        `).run();
        moved = Number(info.changes) || 0;
        const removed = conn.prepare(`
            DELETE
            FROM apps
            WHERE NOT EXISTS (SELECT 1 FROM app_versions v WHERE v.app_id = apps.app_id)
        `).run();
        removedOrphans = Number(removed.changes) || 0;
        conn.prepare("INSERT INTO meta (key, value) VALUES ('stats_products_split', ?)").run(nowIso());
    });
    if (moved || removedOrphans) {
        console.log(`[db] 已把 ${moved} 个统计产品从 apps 拆回 products，并从商店移除 ${removedOrphans} 个无版本应用`);
    }
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        console.error(`[db] 读取 ${path.basename(filePath)} 失败，跳过导入:`, error.message);
        return null;
    }
}

function importLegacyUsers(conn) {
    if (!fs.existsSync(LEGACY_USERS_JSON) || countRows(conn, 'users') > 0) {
        return;
    }
    const raw = readJson(LEGACY_USERS_JSON);
    if (!raw || typeof raw !== 'object') {
        return;
    }
    const insert = conn.prepare(`
        INSERT INTO users (username, password, email, display_name, role, created_at, last_login)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(username) DO NOTHING
    `);
    let count = 0;
    withTransaction(conn, () => {
        for (const [username, user] of Object.entries(raw)) {
            if (!user || typeof user !== 'object' || !user.password) {
                continue;
            }
            insert.run(
                String(username).trim(),
                user.password,
                user.email || '',
                user.displayName || username,
                user.role || 'user',
                user.created_at || nowIso(),
                user.last_login || null
            );
            count++;
        }
    });
    markMigrated(LEGACY_USERS_JSON);
    console.log(`[db] 已从 users.json 导入 ${count} 个账号`);
}

/** users 表为空时创建默认管理员。已有账号（含 JSON 导入）一律不插入。 */
function ensureBootstrapAdmin(conn) {
    if (countRows(conn, 'users') > 0) {
        return;
    }
    const bcrypt = require('bcryptjs');
    conn.prepare(`
        INSERT INTO users (username, password, email, display_name, role, created_at, last_login)
        VALUES (?, ?, '', ?, 'admin', ?, NULL)
    `).run('admin', bcrypt.hashSync('admin', 10), 'admin', nowIso());
    console.log('[db] 已创建默认管理员 admin / admin，请尽快修改密码');
}

function normalizeLegacyAppStore(raw) {
    if (raw && raw.apps && typeof raw.apps === 'object' && !Array.isArray(raw.apps)) {
        return raw.apps;
    }
    if (raw && raw.android && raw.android.latest && raw.android.latest.packageName) {
        const packageName = raw.android.latest.packageName;
        return {
            [packageName]: {
                packageName,
                latest: raw.android.latest,
                history: raw.android.history || []
            }
        };
    }
    return {};
}

function hasVersion(version) {
    return Boolean(version && typeof version === 'object' && version.versionCode != null);
}

function importLegacyAppVersions(conn) {
    if (!fs.existsSync(LEGACY_APP_VERSIONS_JSON) || countRows(conn, 'app_versions') > 0) {
        return;
    }
    const raw = readJson(LEGACY_APP_VERSIONS_JSON);
    if (!raw) {
        return;
    }
    const apps = normalizeLegacyAppStore(raw);
    const now = nowIso();
    const today = todayDate();

    const upsertApp = conn.prepare(`
        INSERT INTO apps (app_id, app_name, logo, banner, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(app_id) DO UPDATE SET
            app_name = COALESCE(NULLIF(excluded.app_name, ''), apps.app_name),
            logo = excluded.logo,
            banner = excluded.banner
    `);
    const insertVersion = conn.prepare(`
        INSERT INTO app_versions (
            app_id, version_code, version_name, update_description, download_url,
            force_update, file_size, md5, upload_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(app_id, version_code) DO NOTHING
    `);

    let appCount = 0;
    let versionCount = 0;
    withTransaction(conn, () => {
        for (const [key, app] of Object.entries(apps)) {
            if (!app || typeof app !== 'object') {
                continue;
            }
            const packageName = app.packageName || key;
            const assets = app.assets && typeof app.assets === 'object' ? app.assets : {};
            upsertApp.run(
                packageName,
                app.appName || packageName.split('.').pop() || packageName,
                typeof assets.logo === 'string' ? assets.logo : '',
                typeof assets.banner === 'string' ? assets.banner : '',
                now
            );
            appCount++;

            const versions = [];
            if (hasVersion(app.latest)) {
                versions.push(app.latest);
            }
            for (const item of app.history || []) {
                if (hasVersion(item)) {
                    versions.push(item);
                }
            }
            for (const v of versions) {
                const versionCode = parseInt(v.versionCode, 10);
                if (!Number.isFinite(versionCode)) {
                    continue;
                }
                insertVersion.run(
                    packageName,
                    versionCode,
                    String(v.versionName || ''),
                    String(v.updateDescription || ''),
                    String(v.downloadUrl || ''),
                    v.forceUpdate === true || v.forceUpdate === 'true' ? 1 : 0,
                    v.fileSize != null ? Number(v.fileSize) : null,
                    v.md5 || null,
                    v.uploadDate || v.releaseDate || today,
                    now
                );
                versionCount++;
            }
        }
    });
    markMigrated(LEGACY_APP_VERSIONS_JSON);
    console.log(`[db] 已从 appVersions.json 导入 ${appCount} 个应用 / ${versionCount} 个版本`);
}

function getDb() {
    if (db) {
        return db;
    }

    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, {recursive: true});
    }

    migrateLegacyStatsDbFile();

    const conn = new DatabaseSync(DB_PATH, {timeout: 5000});
    conn.exec('PRAGMA journal_mode = WAL');
    conn.exec('PRAGMA busy_timeout = 5000');

    createSchema(conn);
    importLegacyUsers(conn);
    ensureBootstrapAdmin(conn);
    importLegacyAppVersions(conn);
    splitStatsProductsFromApps(conn);

    db = conn;
    return db;
}

module.exports = {
    DB_PATH,
    getDb,
    withTransaction,
    ensureColumn,
    nowIso,
    todayDate
};

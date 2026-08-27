const fs = require('fs');
const path = require('path');

let DatabaseSync;
try {
    ({DatabaseSync} = require('node:sqlite'));
} catch (error) {
    throw new Error(`客户端统计需要 Node.js 22.13+ 的内置 sqlite，当前版本是 ${process.version}`);
}

const DATA_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'stats.db');

const PLATFORMS = ['android', 'ios', 'windows', 'mac', 'linux'];

let db;

function nowIso() {
    return new Date().toISOString();
}

function localDate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function addDays(date, days) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
    return next;
}

function startOfLocalDayIso(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toISOString();
}

function startOfNextLocalDayIso(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day + 1).toISOString();
}

function isoDaysAgo(days) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function appNameFromId(appId) {
    const parts = String(appId || '').split('.');
    return parts[parts.length - 1] || appId;
}

function hasField(payload, key) {
    return Object.prototype.hasOwnProperty.call(payload, key);
}

function optionalValue(payload, key) {
    return hasField(payload, key) ? payload[key] : null;
}

const OPTIONAL_DEVICE_FIELDS = [
    ['account', 'account'],
    ['versionName', 'version_name'],
    ['versionCode', 'version_code'],
    ['osVersion', 'os_version'],
    ['deviceModel', 'device_model'],
    ['arch', 'arch'],
    ['locale', 'locale'],
    ['channel', 'channel']
];

function getDb() {
    if (db) {
        return db;
    }

    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, {recursive: true});
    }

    db = new DatabaseSync(DB_PATH, {timeout: 5000});
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec(`
        CREATE TABLE IF NOT EXISTS products (
            app_id TEXT PRIMARY KEY,
            app_name TEXT,
            created_at TEXT NOT NULL
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
        CREATE TABLE IF NOT EXISTS daily_stats (
            app_id TEXT NOT NULL,
            date TEXT NOT NULL,
            platform TEXT NOT NULL,
            version_name TEXT NOT NULL,
            active_devices INTEGER NOT NULL,
            PRIMARY KEY (app_id, date, platform, version_name)
        );
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);
    db.exec(`
        UPDATE devices
        SET ip = substr(ip, instr(lower(ip), '::ffff:') + 7)
        WHERE ip IS NOT NULL AND lower(ip) LIKE '%::ffff:%'
    `);

    return db;
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

function changedRows(info) {
    return Number(info && info.changes) > 0;
}

function getProduct(appId) {
    return getDb().prepare('SELECT app_id, app_name, created_at FROM products WHERE app_id = ?').get(appId) || null;
}

function upsertReport(payload) {
    const conn = getDb();
    const now = nowIso();
    const today = localDate();
    const appId = payload.appId;
    const deviceId = payload.deviceId;
    const platform = payload.platform;
    const appName = (hasField(payload, 'appName') && payload.appName) ? payload.appName : appNameFromId(appId);

    withTransaction(conn, () => {
        conn.prepare(`
            INSERT INTO products (app_id, app_name, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(app_id) DO NOTHING
        `).run(appId, appName, now);

        const existing = conn.prepare(
            'SELECT counted_date FROM devices WHERE app_id = ? AND device_id = ?'
        ).get(appId, deviceId);

        if (!existing) {
            conn.prepare(`
                INSERT INTO devices (
                    app_id, device_id, platform, account, version_name, version_code,
                    os_version, device_model, arch, locale, channel, ip,
                    first_seen, last_seen, report_count, counted_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            `).run(
                appId,
                deviceId,
                platform,
                optionalValue(payload, 'account'),
                optionalValue(payload, 'versionName'),
                optionalValue(payload, 'versionCode'),
                optionalValue(payload, 'osVersion'),
                optionalValue(payload, 'deviceModel'),
                optionalValue(payload, 'arch'),
                optionalValue(payload, 'locale'),
                optionalValue(payload, 'channel'),
                payload.ip,
                now,
                now,
                today
            );
        } else {
            const sets = [
                'platform = ?',
                'ip = ?',
                'last_seen = ?',
                'report_count = report_count + 1'
            ];
            const values = [platform, payload.ip, now];
            for (const [key, column] of OPTIONAL_DEVICE_FIELDS) {
                if (hasField(payload, key)) {
                    sets.push(`${column} = ?`);
                    values.push(payload[key]);
                }
            }
            values.push(appId, deviceId);
            conn.prepare(
                `UPDATE devices SET ${sets.join(', ')} WHERE app_id = ? AND device_id = ?`
            ).run(...values);
        }

        if (!existing || existing.counted_date !== today) {
            const current = conn.prepare(`
                SELECT platform, COALESCE(version_name, '') AS version_name
                FROM devices
                WHERE app_id = ? AND device_id = ?
            `).get(appId, deviceId);

            conn.prepare(`
                INSERT INTO daily_stats (app_id, date, platform, version_name, active_devices)
                VALUES (?, ?, ?, ?, 1)
                ON CONFLICT(app_id, date, platform, version_name)
                DO UPDATE SET active_devices = active_devices + 1
            `).run(appId, today, current.platform, current.version_name);

            conn.prepare(`
                UPDATE devices SET counted_date = ? WHERE app_id = ? AND device_id = ?
            `).run(today, appId, deviceId);
        }
    });
}

function listProducts() {
    const since7d = isoDaysAgo(7);
    return getDb().prepare(`
        SELECT
            p.app_id AS appId,
            COALESCE(NULLIF(p.app_name, ''), p.app_id) AS appName,
            p.created_at AS createdAt,
            COUNT(d.device_id) AS deviceCount,
            SUM(CASE WHEN d.last_seen >= ? THEN 1 ELSE 0 END) AS active7d,
            GROUP_CONCAT(DISTINCT d.platform) AS platforms
        FROM products p
        LEFT JOIN devices d ON d.app_id = p.app_id
        GROUP BY p.app_id
        ORDER BY active7d DESC, deviceCount DESC, p.app_id ASC
    `).all(since7d).map((row) => ({
        appId: row.appId,
        appName: row.appName,
        createdAt: row.createdAt,
        deviceCount: row.deviceCount || 0,
        active7d: row.active7d || 0,
        platforms: row.platforms ? row.platforms.split(',').filter(Boolean) : []
    }));
}

function platformFilter(platform) {
    if (platform && PLATFORMS.includes(platform)) {
        return {sql: ' AND platform = ?', params: [platform]};
    }
    return {sql: '', params: []};
}

function getSummary(appId, platform) {
    const conn = getDb();
    const product = getProduct(appId);
    if (!product) {
        return null;
    }

    const filter = platformFilter(platform);
    const baseParams = [appId, ...filter.params];
    const countStmt = (extraSql, extraParams = []) => conn.prepare(
        `SELECT COUNT(*) AS n FROM devices WHERE app_id = ?${filter.sql}${extraSql}`
    ).get(...baseParams, ...extraParams).n;

    const byPlatform = conn.prepare(`
        SELECT platform, COUNT(*) AS count
        FROM devices
        WHERE app_id = ?
        GROUP BY platform
        ORDER BY count DESC
    `).all(appId);

    const byVersion = conn.prepare(`
        SELECT COALESCE(version_name, '') AS versionName, COUNT(*) AS count
        FROM devices
        WHERE app_id = ?${filter.sql}
        GROUP BY version_name
        ORDER BY count DESC
        LIMIT 20
    `).all(...baseParams);

    const uniqueAccounts = conn.prepare(`
        SELECT COUNT(DISTINCT account) AS n
        FROM devices
        WHERE app_id = ?${filter.sql} AND account IS NOT NULL AND TRIM(account) != ''
    `).get(...baseParams).n;

    return {
        appId: product.app_id,
        appName: product.app_name || product.app_id,
        createdAt: product.created_at,
        totalDevices: countStmt(''),
        active1d: countStmt(' AND last_seen >= ?', [isoDaysAgo(1)]),
        active7d: countStmt(' AND last_seen >= ?', [isoDaysAgo(7)]),
        active30d: countStmt(' AND last_seen >= ?', [isoDaysAgo(30)]),
        uniqueAccounts,
        byPlatform,
        byVersion
    };
}

function deviceListFilter(options) {
    const where = ['app_id = ?'];
    const params = [options.appId];

    const filter = platformFilter(options.platform);
    if (filter.sql) {
        where.push('platform = ?');
        params.push(options.platform);
    }
    if (options.version) {
        where.push('version_name = ?');
        params.push(options.version);
    }
    if (options.account) {
        where.push('account LIKE ?');
        params.push(`%${options.account}%`);
    }

    return {whereSql: where.join(' AND '), params};
}

function accountGroupKeySql() {
    return `CASE WHEN account IS NOT NULL AND TRIM(account) != '' THEN 'a:' || TRIM(account) ELSE 'd:' || device_id END`;
}

function listDevices(options) {
    const conn = getDb();
    const appId = options.appId;
    if (!getProduct(appId)) {
        return null;
    }

    const groupBy = options.groupBy === 'device' ? 'device' : 'account';
    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(options.pageSize, 10) || 20));
    const {whereSql, params} = deviceListFilter(options);

    if (groupBy === 'device') {
        const total = conn.prepare(`SELECT COUNT(*) AS n FROM devices WHERE ${whereSql}`).get(...params).n;
        const devices = conn.prepare(`
            SELECT
                app_id AS appId,
                device_id AS deviceId,
                platform,
                account,
                version_name AS versionName,
                version_code AS versionCode,
                os_version AS osVersion,
                device_model AS deviceModel,
                arch,
                locale,
                channel,
                ip,
                first_seen AS firstSeen,
                last_seen AS lastSeen,
                report_count AS reportCount,
                1 AS deviceCount
            FROM devices
            WHERE ${whereSql}
            ORDER BY last_seen DESC
            LIMIT ? OFFSET ?
        `).all(...params, pageSize, (page - 1) * pageSize);

        return {total, page, pageSize, groupBy, devices};
    }

    const groupKeySql = accountGroupKeySql();
    const total = conn.prepare(`
        SELECT COUNT(*) AS n FROM (
            SELECT 1 FROM devices WHERE ${whereSql} GROUP BY ${groupKeySql}
        ) grouped_accounts
    `).get(...params).n;
    const devices = conn.prepare(`
        SELECT
            app_id AS appId,
            device_id AS deviceId,
            platform,
            account,
            version_name AS versionName,
            version_code AS versionCode,
            os_version AS osVersion,
            device_model AS deviceModel,
            arch,
            locale,
            channel,
            ip,
            firstSeen,
            lastSeen,
            report_count AS reportCount,
            deviceCount
        FROM (
            SELECT
                app_id,
                device_id,
                platform,
                account,
                version_name,
                version_code,
                os_version,
                device_model,
                arch,
                locale,
                channel,
                ip,
                report_count,
                MIN(first_seen) OVER (PARTITION BY ${groupKeySql}) AS firstSeen,
                MAX(last_seen) OVER (PARTITION BY ${groupKeySql}) AS lastSeen,
                COUNT(*) OVER (PARTITION BY ${groupKeySql}) AS deviceCount,
                ROW_NUMBER() OVER (
                    PARTITION BY ${groupKeySql}
                    ORDER BY last_seen DESC, device_id DESC
                ) AS rn
            FROM devices
            WHERE ${whereSql}
        ) grouped
        WHERE rn = 1
        ORDER BY lastSeen DESC
        LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize);

    return {total, page, pageSize, groupBy, devices};
}

function getTrend(appId, days, platform) {
    if (!getProduct(appId)) {
        return null;
    }

    const span = Math.min(365, Math.max(1, parseInt(days, 10) || 30));
    const startDate = localDate(addDays(new Date(), 1 - span));
    const filter = platformFilter(platform);
    const rows = getDb().prepare(`
        SELECT date, platform, version_name AS versionName, active_devices AS activeDevices
        FROM daily_stats
        WHERE app_id = ? AND date >= ?${filter.sql}
        ORDER BY date ASC
    `).all(appId, startDate, ...filter.params);

    const totals = {};
    for (let i = 0; i < span; i++) {
        totals[localDate(addDays(new Date(), i - (span - 1)))] = 0;
    }
    for (const row of rows) {
        if (Object.prototype.hasOwnProperty.call(totals, row.date)) {
            totals[row.date] += row.activeDevices;
        }
    }

    return {
        days: span,
        series: Object.keys(totals).sort().map((date) => ({
            date,
            activeDevices: totals[date]
        })),
        breakdown: rows
    };
}

function renameProduct(appId, appName) {
    return changedRows(getDb().prepare('UPDATE products SET app_name = ? WHERE app_id = ?').run(appName, appId));
}

function deleteProduct(appId) {
    const conn = getDb();
    return withTransaction(conn, () => {
        conn.prepare('DELETE FROM daily_stats WHERE app_id = ?').run(appId);
        conn.prepare('DELETE FROM devices WHERE app_id = ?').run(appId);
        return changedRows(conn.prepare('DELETE FROM products WHERE app_id = ?').run(appId));
    });
}

function rollupDate(dateStr) {
    const conn = getDb();
    conn.prepare(`
        INSERT INTO daily_stats (app_id, date, platform, version_name, active_devices)
        SELECT app_id, ?, COALESCE(platform, ''), COALESCE(version_name, ''), COUNT(*)
        FROM devices
        WHERE last_seen >= ? AND last_seen < ?
        GROUP BY app_id, platform, version_name
        ON CONFLICT(app_id, date, platform, version_name) DO NOTHING
    `).run(dateStr, startOfLocalDayIso(dateStr), startOfNextLocalDayIso(dateStr));
}

function rollupYesterday() {
    rollupDate(localDate(addDays(new Date(), -1)));
}

function purgeStale(deviceDays = 180, dailyDays = 365) {
    const conn = getDb();
    const deviceCutoff = isoDaysAgo(deviceDays);
    const dailyCutoff = localDate(addDays(new Date(), -dailyDays));
    const devices = conn.prepare('DELETE FROM devices WHERE last_seen < ?').run(deviceCutoff);
    const daily = conn.prepare('DELETE FROM daily_stats WHERE date < ?').run(dailyCutoff);
    return {devices: Number(devices.changes) || 0, daily: Number(daily.changes) || 0};
}

function runMaintenance() {
    const conn = getDb();
    const yesterday = localDate(addDays(new Date(), -1));
    const last = conn.prepare("SELECT value FROM meta WHERE key = 'last_rollup_date'").get();
    if (last && last.value >= yesterday) {
        return {rolledUp: false, date: last.value};
    }

    rollupDate(yesterday);
    conn.prepare(`
        INSERT INTO meta (key, value) VALUES ('last_rollup_date', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(yesterday);
    const purged = purgeStale();
    return {rolledUp: true, date: yesterday, purged};
}

module.exports = {
    PLATFORMS,
    getDb,
    getProduct,
    upsertReport,
    listProducts,
    getSummary,
    listDevices,
    getTrend,
    renameProduct,
    deleteProduct,
    rollupYesterday,
    purgeStale,
    runMaintenance
};

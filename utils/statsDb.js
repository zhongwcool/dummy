/**
 * 客户端统计（设备 / 日活 / 打开次数）。
 * 表结构由 utils/db.js 统一创建。产品档案在 products 表，按上报的 appId 自动建档，
 * 与应用商店的 apps / app_versions 互不影响。
 */
const sharedDb = require('./db');

const {withTransaction, nowIso} = sharedDb;

const PLATFORMS = ['android', 'ios', 'windows', 'mac', 'linux'];

let db;

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

/**
 * 取共享连接；首次使用时做统计域自己的历史数据修正（IP 规范化、账号去重、唯一索引）。
 */
function getDb() {
    if (db) {
        return db;
    }

    const conn = sharedDb.getDb();
    conn.exec(`
        UPDATE devices
        SET ip = substr(ip, instr(lower(ip), '::ffff:') + 7)
        WHERE ip IS NOT NULL AND lower(ip) LIKE '%::ffff:%'
    `);
    dedupeDuplicateAccounts(conn);
    conn.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_account_unique
        ON devices(app_id, account)
        WHERE account IS NOT NULL AND TRIM(account) != ''
    `);

    db = conn;
    return db;
}

function isLaunchEvent(payload) {
    return payload.event !== 'heartbeat';
}

function mergeDeviceDaily(conn, appId, fromDeviceId, toDeviceId) {
    if (!fromDeviceId || !toDeviceId || fromDeviceId === toDeviceId) {
        return;
    }
    const rows = conn.prepare(`
        SELECT date, launches FROM device_daily
        WHERE app_id = ? AND device_id = ?
    `).all(appId, fromDeviceId);
    if (!rows.length) {
        return;
    }
    const upsert = conn.prepare(`
        INSERT INTO device_daily (app_id, device_id, date, launches)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(app_id, device_id, date)
        DO UPDATE SET launches = launches + excluded.launches
    `);
    for (const row of rows) {
        upsert.run(appId, toDeviceId, row.date, row.launches);
    }
    conn.prepare('DELETE FROM device_daily WHERE app_id = ? AND device_id = ?').run(appId, fromDeviceId);
}

function incrementDeviceDaily(conn, appId, deviceId, dateStr) {
    conn.prepare(`
        INSERT INTO device_daily (app_id, device_id, date, launches)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(app_id, device_id, date)
        DO UPDATE SET launches = launches + 1
    `).run(appId, deviceId, dateStr);
}

function avgLaunches(total, days) {
    if (!days) {
        return 0;
    }
    return Math.round((Number(total) || 0) / days * 10) / 10;
}

function selectDeviceRow(conn, appId, deviceId) {
    return conn.prepare(`
        SELECT device_id AS deviceId, counted_date AS countedDate,
               first_seen AS firstSeen, report_count AS reportCount
        FROM devices
        WHERE app_id = ? AND device_id = ?
    `).get(appId, deviceId) || null;
}

function selectAccountRow(conn, appId, account) {
    return conn.prepare(`
        SELECT device_id AS deviceId, counted_date AS countedDate,
               first_seen AS firstSeen, report_count AS reportCount
        FROM devices
        WHERE app_id = ? AND account IS NOT NULL AND TRIM(account) != '' AND TRIM(account) = ?
        ORDER BY last_seen DESC, device_id DESC
        LIMIT 1
    `).get(appId, account) || null;
}

function dedupeDuplicateAccounts(conn) {
    const groups = conn.prepare(`
        SELECT app_id AS appId, TRIM(account) AS account
        FROM devices
        WHERE account IS NOT NULL AND TRIM(account) != ''
        GROUP BY app_id, TRIM(account)
        HAVING COUNT(*) > 1
    `).all();
    if (!groups.length) {
        return;
    }

    const selectRows = conn.prepare(`
        SELECT device_id AS deviceId, first_seen AS firstSeen, report_count AS reportCount
        FROM devices
        WHERE app_id = ? AND TRIM(account) = ?
        ORDER BY last_seen DESC, device_id DESC
    `);
    const deleteRow = conn.prepare('DELETE FROM devices WHERE app_id = ? AND device_id = ?');
    const updateKept = conn.prepare(`
        UPDATE devices SET first_seen = ?, report_count = ?
        WHERE app_id = ? AND device_id = ?
    `);

    withTransaction(conn, () => {
        for (const group of groups) {
            const rows = selectRows.all(group.appId, group.account);
            if (rows.length < 2) {
                continue;
            }
            const keep = rows[0];
            let minFirst = keep.firstSeen;
            let reports = 0;
            for (const row of rows) {
                reports += Number(row.reportCount) || 0;
                if (row.firstSeen && row.firstSeen < minFirst) {
                    minFirst = row.firstSeen;
                }
            }
            for (let i = 1; i < rows.length; i++) {
                mergeDeviceDaily(conn, group.appId, rows[i].deviceId, keep.deviceId);
                deleteRow.run(group.appId, rows[i].deviceId);
            }
            updateKept.run(minFirst, reports, group.appId, keep.deviceId);
        }
    });
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
    const loggedIn = hasField(payload, 'account') && payload.account != null && String(payload.account).trim() !== '';
    const launch = isLaunchEvent(payload);
    const launchInc = launch ? 1 : 0;

    withTransaction(conn, () => {
        conn.prepare(`
            INSERT INTO products (app_id, app_name, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(app_id) DO NOTHING
        `).run(appId, appName, now);

        const deviceRow = selectDeviceRow(conn, appId, deviceId);
        let keepRow = deviceRow;
        let extraRow = null;

        if (loggedIn) {
            const accountRow = selectAccountRow(conn, appId, String(payload.account).trim());
            if (accountRow && accountRow.deviceId !== deviceId) {
                keepRow = accountRow;
                extraRow = deviceRow;
                if (extraRow) {
                    mergeDeviceDaily(conn, appId, extraRow.deviceId, keepRow.deviceId);
                    conn.prepare('DELETE FROM devices WHERE app_id = ? AND device_id = ?').run(appId, deviceId);
                }
            }
        }

        if (!keepRow) {
            conn.prepare(`
                INSERT INTO devices (
                    app_id, device_id, platform, account, version_name, version_code,
                    os_version, device_model, arch, locale, channel, ip,
                    first_seen, last_seen, report_count, counted_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                launchInc,
                today
            );
        } else {
            const extraCount = extraRow ? Number(extraRow.reportCount) || 0 : 0;
            const reportCount = (Number(keepRow.reportCount) || 0) + extraCount + launchInc;
            let firstSeen = keepRow.firstSeen || now;
            if (extraRow && extraRow.firstSeen && extraRow.firstSeen < firstSeen) {
                firstSeen = extraRow.firstSeen;
            }

            const sets = [
                'device_id = ?',
                'platform = ?',
                'ip = ?',
                'last_seen = ?',
                'report_count = ?',
                'first_seen = ?'
            ];
            const values = [deviceId, platform, payload.ip, now, reportCount, firstSeen];
            for (const [key, column] of OPTIONAL_DEVICE_FIELDS) {
                if (hasField(payload, key)) {
                    sets.push(`${column} = ?`);
                    values.push(payload[key]);
                }
            }
            values.push(appId, keepRow.deviceId);
            conn.prepare(
                `UPDATE devices SET ${sets.join(', ')} WHERE app_id = ? AND device_id = ?`
            ).run(...values);
            if (keepRow.deviceId !== deviceId) {
                mergeDeviceDaily(conn, appId, keepRow.deviceId, deviceId);
            }
        }

        if (launchInc) {
            incrementDeviceDaily(conn, appId, deviceId, today);
        }

        const alreadyCounted = Boolean(
            keepRow && (
                keepRow.countedDate === today ||
                (extraRow && extraRow.countedDate === today)
            )
        );
        const activeInc = alreadyCounted ? 0 : 1;
        if (activeInc || launchInc) {
            const current = conn.prepare(`
                SELECT platform, COALESCE(version_name, '') AS version_name
                FROM devices
                WHERE app_id = ? AND device_id = ?
            `).get(appId, deviceId);

            conn.prepare(`
                INSERT INTO daily_stats (app_id, date, platform, version_name, active_devices, launches)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(app_id, date, platform, version_name)
                DO UPDATE SET
                    active_devices = active_devices + excluded.active_devices,
                    launches = launches + excluded.launches
            `).run(appId, today, current.platform, current.version_name, activeInc, launchInc);
        }
        if (!keepRow || !alreadyCounted || keepRow.countedDate !== today) {
            conn.prepare(
                'UPDATE devices SET counted_date = ? WHERE app_id = ? AND device_id = ?'
            ).run(today, appId, deviceId);
        }
    });
}

function listProducts() {
    const since7d = isoDaysAgo(7);
    const today = localDate();
    return getDb().prepare(`
        SELECT
            p.app_id AS appId,
            COALESCE(NULLIF(p.app_name, ''), p.app_id) AS appName,
            p.created_at AS createdAt,
            COUNT(d.device_id) AS deviceCount,
            SUM(CASE WHEN d.last_seen >= ? THEN 1 ELSE 0 END) AS active7d,
            COALESCE((
                SELECT SUM(s.launches)
                FROM daily_stats s
                WHERE s.app_id = p.app_id AND s.date = ?
            ), 0) AS launches1d,
            GROUP_CONCAT(DISTINCT d.platform) AS platforms
        FROM products p
        LEFT JOIN devices d ON d.app_id = p.app_id
        GROUP BY p.app_id
        ORDER BY active7d DESC, deviceCount DESC, p.app_id ASC
    `).all(since7d, today).map((row) => ({
        appId: row.appId,
        appName: row.appName,
        createdAt: row.createdAt,
        deviceCount: row.deviceCount || 0,
        active7d: row.active7d || 0,
        launches1d: row.launches1d || 0,
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

    const today = localDate();
    const sumLaunches = (sinceDate) => conn.prepare(`
        SELECT COALESCE(SUM(launches), 0) AS n
        FROM daily_stats
        WHERE app_id = ? AND date >= ?${filter.sql}
    `).get(appId, sinceDate, ...filter.params).n;
    const launches1d = sumLaunches(today);
    const launches7d = sumLaunches(localDate(addDays(new Date(), -6)));
    const launches30d = sumLaunches(localDate(addDays(new Date(), -29)));
    const active1d = countStmt(' AND last_seen >= ?', [isoDaysAgo(1)]);
    const active7d = countStmt(' AND last_seen >= ?', [isoDaysAgo(7)]);
    const active30d = countStmt(' AND last_seen >= ?', [isoDaysAgo(30)]);

    return {
        appId: product.app_id,
        appName: product.app_name || product.app_id,
        createdAt: product.created_at,
        totalDevices: countStmt(''),
        active1d,
        active7d,
        active30d,
        uniqueAccounts,
        launches1d,
        launches7d,
        launches30d,
        avgLaunches7d: avgLaunches(launches7d, active7d),
        byPlatform,
        byVersion
    };
}

function listDevices(options) {
    const conn = getDb();
    const appId = options.appId;
    if (!getProduct(appId)) {
        return null;
    }

    const where = ['d.app_id = ?'];
    const params = [appId];

    const filter = platformFilter(options.platform);
    if (filter.sql) {
        where.push('d.platform = ?');
        params.push(options.platform);
    }
    if (options.version) {
        where.push('d.version_name = ?');
        params.push(options.version);
    }
    if (options.q || options.account) {
        const keyword = options.q || options.account;
        where.push('(IFNULL(d.ip, \'\') LIKE ? OR IFNULL(d.device_model, \'\') LIKE ? OR IFNULL(d.account, \'\') LIKE ? OR d.device_id LIKE ?)');
        const like = `%${keyword}%`;
        params.push(like, like, like, like);
    }

    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(options.pageSize, 10) || 20));
    const whereSql = where.join(' AND ');
    const total = conn.prepare(`SELECT COUNT(*) AS n FROM devices d WHERE ${whereSql}`).get(...params).n;
    const devices = conn.prepare(`
        SELECT
            d.app_id AS appId,
            d.device_id AS deviceId,
            d.platform,
            d.account,
            d.version_name AS versionName,
            d.version_code AS versionCode,
            d.os_version AS osVersion,
            d.device_model AS deviceModel,
            d.arch,
            d.locale,
            d.channel,
            d.ip,
            d.first_seen AS firstSeen,
            d.last_seen AS lastSeen,
            d.report_count AS reportCount
        FROM devices d
        WHERE ${whereSql}
        ORDER BY d.last_seen DESC
        LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize);

    return {total, page, pageSize, devices};
}

function getDeviceDaily(appId, deviceId, days) {
    const conn = getDb();
    if (!getProduct(appId)) {
        return null;
    }
    const device = selectDeviceRow(conn, appId, deviceId);
    if (!device) {
        return null;
    }

    const span = Math.min(90, Math.max(1, parseInt(days, 10) || 30));
    const startDate = localDate(addDays(new Date(), 1 - span));
    const rows = conn.prepare(`
        SELECT date, launches
        FROM device_daily
        WHERE app_id = ? AND device_id = ? AND date >= ?
        ORDER BY date ASC
    `).all(appId, deviceId, startDate);

    const totals = {};
    for (let i = 0; i < span; i++) {
        totals[localDate(addDays(new Date(), i - (span - 1)))] = 0;
    }
    for (const row of rows) {
        if (Object.prototype.hasOwnProperty.call(totals, row.date)) {
            totals[row.date] = row.launches;
        }
    }

    return {
        deviceId,
        days: span,
        series: Object.keys(totals).sort().map((date) => ({
            date,
            launches: totals[date]
        }))
    };
}

function getTrend(appId, days, platform) {
    if (!getProduct(appId)) {
        return null;
    }

    const span = Math.min(365, Math.max(1, parseInt(days, 10) || 30));
    const startDate = localDate(addDays(new Date(), 1 - span));
    const filter = platformFilter(platform);
    const rows = getDb().prepare(`
        SELECT date, platform, version_name AS versionName,
               active_devices AS activeDevices, COALESCE(launches, 0) AS launches
        FROM daily_stats
        WHERE app_id = ? AND date >= ?${filter.sql}
        ORDER BY date ASC
    `).all(appId, startDate, ...filter.params);

    const totals = {};
    const launchTotals = {};
    for (let i = 0; i < span; i++) {
        const date = localDate(addDays(new Date(), i - (span - 1)));
        totals[date] = 0;
        launchTotals[date] = 0;
    }
    for (const row of rows) {
        if (Object.prototype.hasOwnProperty.call(totals, row.date)) {
            totals[row.date] += row.activeDevices;
            launchTotals[row.date] += row.launches;
        }
    }

    return {
        days: span,
        series: Object.keys(totals).sort().map((date) => ({
            date,
            activeDevices: totals[date],
            launches: launchTotals[date],
            avgLaunches: avgLaunches(launchTotals[date], totals[date])
        })),
        breakdown: rows
    };
}

function renameProduct(appId, appName) {
    return changedRows(getDb().prepare('UPDATE products SET app_name = ? WHERE app_id = ?').run(appName, appId));
}

/** 删除产品及其全部统计数据。 */
function deleteProduct(appId) {
    const conn = getDb();
    return withTransaction(conn, () => {
        conn.prepare('DELETE FROM device_daily WHERE app_id = ?').run(appId);
        conn.prepare('DELETE FROM daily_stats WHERE app_id = ?').run(appId);
        conn.prepare('DELETE FROM devices WHERE app_id = ?').run(appId);
        return changedRows(conn.prepare('DELETE FROM products WHERE app_id = ?').run(appId));
    });
}

function rollupDate(dateStr) {
    const conn = getDb();
    conn.prepare(`
        INSERT INTO daily_stats (app_id, date, platform, version_name, active_devices, launches)
        SELECT app_id, ?, COALESCE(platform, ''), COALESCE(version_name, ''), COUNT(*), 0
        FROM devices
        WHERE last_seen >= ? AND last_seen < ?
        GROUP BY app_id, platform, version_name
        ON CONFLICT(app_id, date, platform, version_name) DO NOTHING
    `).run(dateStr, startOfLocalDayIso(dateStr), startOfNextLocalDayIso(dateStr));
}

function rollupYesterday() {
    rollupDate(localDate(addDays(new Date(), -1)));
}

function purgeStale(deviceDays = 180, dailyDays = 365, deviceDailyDays = 60) {
    const conn = getDb();
    const deviceCutoff = isoDaysAgo(deviceDays);
    const dailyCutoff = localDate(addDays(new Date(), -dailyDays));
    const deviceDailyCutoff = localDate(addDays(new Date(), -deviceDailyDays));
    const deviceDaily = conn.prepare(`
        DELETE FROM device_daily
        WHERE date < ?
           OR EXISTS (
               SELECT 1 FROM devices d
               WHERE d.app_id = device_daily.app_id
                 AND d.device_id = device_daily.device_id
                 AND d.last_seen < ?
           )
    `).run(deviceDailyCutoff, deviceCutoff);
    const devices = conn.prepare('DELETE FROM devices WHERE last_seen < ?').run(deviceCutoff);
    const daily = conn.prepare('DELETE FROM daily_stats WHERE date < ?').run(dailyCutoff);
    return {
        devices: Number(devices.changes) || 0,
        daily: Number(daily.changes) || 0,
        deviceDaily: Number(deviceDaily.changes) || 0
    };
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
    getDeviceDaily,
    getTrend,
    renameProduct,
    deleteProduct,
    rollupYesterday,
    purgeStale,
    runMaintenance
};

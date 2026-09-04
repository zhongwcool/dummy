/**
 * 应用与版本数据访问（apps / app_versions 表）。
 *
 * 对外返回的对象结构与原 appVersions.json 保持一致：
 *   { appName, packageName, latest, history: [], assets: { logo, banner } }
 * latest 为 version_code 最大的版本，history 为其余版本按 version_code 倒序。
 */
const {getDb, withTransaction, nowIso, todayDate} = require('./db');

const ASSET_KINDS = ['logo', 'banner'];

const VERSION_COLUMNS = `
    app_id,
    version_code,
    version_name,
    update_description,
    download_url,
    force_update,
    file_size,
    md5,
    upload_date
`;

function appNameFromPackage(packageName, fallback) {
    if (fallback && String(fallback).trim()) {
        return String(fallback).trim();
    }
    const parts = String(packageName || '').split('.');
    return parts[parts.length - 1] || packageName || 'app';
}

function versionToJson(row, {history = false} = {}) {
    if (!row) {
        return {};
    }
    const json = {
        versionName: row.version_name,
        versionCode: row.version_code,
        packageName: row.app_id,
        updateDescription: row.update_description,
        downloadUrl: row.download_url,
        forceUpdate: Boolean(row.force_update)
    };
    if (row.file_size != null) {
        json.fileSize = row.file_size;
    }
    if (row.md5) {
        json.md5 = row.md5;
    }
    if (row.upload_date) {
        json.uploadDate = row.upload_date;
        if (history) {
            json.releaseDate = row.upload_date;
        }
    }
    return json;
}

function assetsOf(row) {
    return {
        logo: row && typeof row.logo === 'string' ? row.logo : '',
        banner: row && typeof row.banner === 'string' ? row.banner : ''
    };
}

function selectAppRow(conn, packageName) {
    return conn.prepare(
        'SELECT app_id, app_name, logo, banner, created_at FROM apps WHERE app_id = ?'
    ).get(packageName) || null;
}

function selectVersionRows(conn, packageName) {
    return conn.prepare(`
        SELECT ${VERSION_COLUMNS}
        FROM app_versions
        WHERE app_id = ?
        ORDER BY version_code DESC
    `).all(packageName);
}

function selectVersionRow(conn, packageName, versionCode) {
    return conn.prepare(`
        SELECT ${VERSION_COLUMNS}
        FROM app_versions
        WHERE app_id = ? AND version_code = ?
    `).get(packageName, versionCode) || null;
}

function buildApp(appRow, versionRows) {
    const [latest, ...history] = versionRows;
    return {
        appName: appRow.app_name || appNameFromPackage(appRow.app_id),
        packageName: appRow.app_id,
        latest: versionToJson(latest),
        history: history.map((row) => versionToJson(row, {history: true})),
        assets: assetsOf(appRow)
    };
}

/** 所有至少有一个版本的应用。 */
function listApps() {
    const conn = getDb();
    const appRows = conn.prepare(`
        SELECT a.app_id, a.app_name, a.logo, a.banner, a.created_at
        FROM apps a
        WHERE EXISTS (SELECT 1 FROM app_versions v WHERE v.app_id = a.app_id)
        ORDER BY a.created_at ASC, a.app_id ASC
    `).all();
    const versionRows = conn.prepare(`
        SELECT ${VERSION_COLUMNS}
        FROM app_versions
        ORDER BY app_id ASC, version_code DESC
    `).all();

    const grouped = new Map();
    for (const row of versionRows) {
        if (!grouped.has(row.app_id)) {
            grouped.set(row.app_id, []);
        }
        grouped.get(row.app_id).push(row);
    }
    return appRows.map((appRow) => buildApp(appRow, grouped.get(appRow.app_id) || []));
}

/** 单个应用（没有版本时 latest 为 {}、history 为 []）；不存在返回 null。 */
function getApp(packageName) {
    const conn = getDb();
    const appRow = selectAppRow(conn, packageName);
    if (!appRow) {
        return null;
    }
    return buildApp(appRow, selectVersionRows(conn, packageName));
}

/** 最新版本；应用不存在或没有版本时返回 null。 */
function getLatestVersion(packageName) {
    const row = getDb().prepare(`
        SELECT ${VERSION_COLUMNS}
        FROM app_versions
        WHERE app_id = ?
        ORDER BY version_code DESC
        LIMIT 1
    `).get(packageName);
    return row ? versionToJson(row) : null;
}

/** 所有有版本的应用的最新版本列表。 */
function listLatestVersions() {
    return getDb().prepare(`
        SELECT ${VERSION_COLUMNS}
        FROM app_versions v
        WHERE version_code = (
            SELECT MAX(version_code) FROM app_versions WHERE app_id = v.app_id
        )
        ORDER BY app_id ASC
    `).all().map((row) => versionToJson(row));
}

/**
 * 新增或覆盖一个版本（按 packageName + versionCode 唯一）。
 * @param {{packageName:string, appName?:string, version:{versionName:string, versionCode:number,
 *          updateDescription?:string, downloadUrl?:string, forceUpdate?:boolean,
 *          fileSize?:number|null, md5?:string|null, uploadDate?:string}}} input
 * @returns {{appName:string, version:object, replaced:object|null}} replaced 为被覆盖的同版本号旧记录
 */
function upsertVersion(input) {
    const conn = getDb();
    const packageName = String(input.packageName || '').trim();
    const version = input.version || {};
    const versionCode = parseInt(version.versionCode, 10);
    if (!packageName) {
        throw new Error('packageName 不能为空');
    }
    if (!Number.isFinite(versionCode)) {
        throw new Error('versionCode 必须是整数');
    }

    return withTransaction(conn, () => {
        const now = nowIso();
        const explicitName = input.appName && String(input.appName).trim() ? String(input.appName).trim() : null;
        conn.prepare(`
            INSERT INTO apps (app_id, app_name, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(app_id) DO UPDATE SET
                app_name = COALESCE(?, apps.app_name)
        `).run(packageName, explicitName || appNameFromPackage(packageName), now, explicitName);

        const previous = selectVersionRow(conn, packageName, versionCode);
        conn.prepare(`
            INSERT INTO app_versions (
                app_id, version_code, version_name, update_description, download_url,
                force_update, file_size, md5, upload_date, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(app_id, version_code) DO UPDATE SET
                version_name = excluded.version_name,
                update_description = excluded.update_description,
                download_url = excluded.download_url,
                force_update = excluded.force_update,
                file_size = excluded.file_size,
                md5 = excluded.md5,
                upload_date = excluded.upload_date
        `).run(
            packageName,
            versionCode,
            String(version.versionName || ''),
            String(version.updateDescription || ''),
            String(version.downloadUrl || ''),
            version.forceUpdate === true || version.forceUpdate === 'true' ? 1 : 0,
            version.fileSize != null ? Number(version.fileSize) : null,
            version.md5 || null,
            version.uploadDate || todayDate(),
            now
        );

        const appRow = selectAppRow(conn, packageName);
        return {
            appName: appRow.app_name || appNameFromPackage(packageName),
            version: versionToJson(selectVersionRow(conn, packageName, versionCode)),
            replaced: previous ? versionToJson(previous) : null
        };
    });
}

/**
 * 设置 logo / banner 地址（传空串表示清除）。
 * @returns 更新后的 assets，应用不存在返回 null
 */
function setAsset(packageName, kind, url) {
    if (!ASSET_KINDS.includes(kind)) {
        throw new Error(`素材类型无效: ${kind}`);
    }
    const conn = getDb();
    const info = conn.prepare(`UPDATE apps SET ${kind} = ? WHERE app_id = ?`).run(url || '', packageName);
    if (!Number(info.changes)) {
        return null;
    }
    return assetsOf(selectAppRow(conn, packageName));
}

/**
 * 删除一个版本。若删除后应用不再有任何版本，则连 apps 行一起删除，
 * 并返回待删除的素材地址（removedAssets）供调用方清理文件。
 * @returns {{version:object, appRemoved:boolean, removedAssets:{logo:string,banner:string}|null}|null}
 *          应用或版本不存在返回 null
 */
function deleteVersion(packageName, versionCode) {
    const conn = getDb();
    const code = parseInt(versionCode, 10);
    if (!Number.isFinite(code)) {
        return null;
    }

    return withTransaction(conn, () => {
        const appRow = selectAppRow(conn, packageName);
        if (!appRow) {
            return null;
        }
        const versionRow = selectVersionRow(conn, packageName, code);
        if (!versionRow) {
            return null;
        }

        conn.prepare('DELETE FROM app_versions WHERE app_id = ? AND version_code = ?').run(packageName, code);

        const remaining = conn.prepare(
            'SELECT COUNT(*) AS n FROM app_versions WHERE app_id = ?'
        ).get(packageName).n;

        let appRemoved = false;
        let removedAssets = null;
        if (!remaining) {
            removedAssets = assetsOf(appRow);
            conn.prepare('DELETE FROM apps WHERE app_id = ?').run(packageName);
            appRemoved = true;
        }

        return {
            version: versionToJson(versionRow),
            appRemoved,
            removedAssets
        };
    });
}

module.exports = {
    ASSET_KINDS,
    appNameFromPackage,
    listApps,
    getApp,
    getLatestVersion,
    listLatestVersions,
    upsertVersion,
    setAsset,
    deleteVersion
};

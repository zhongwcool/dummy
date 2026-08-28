const path = require('path');
const {execFileSync} = require('child_process');

const ROOT = path.join(__dirname, '..');

function git(args) {
    try {
        return execFileSync('git', args, {
            cwd: ROOT,
            encoding: 'utf8',
            timeout: 3000,
            stdio: ['ignore', 'pipe', 'ignore'],
            windowsHide: true
        }).trim();
    } catch (error) {
        return '';
    }
}

function isSafeTagName(tag) {
    return Boolean(tag)
        && !tag.includes('..')
        && !tag.includes('\\')
        && !tag.includes('\0')
        && !tag.startsWith('-');
}

function readGitTag() {
    return git(['describe', '--tags', '--exact-match', 'HEAD'])
        || git(['describe', '--tags', '--abbrev=0']);
}

function readTagDate(tag) {
    if (!isSafeTagName(tag)) {
        return '';
    }
    // annotated tag：打 tag 的时间；lightweight tag：所指向提交的时间
    return git(['for-each-ref', '--format=%(creatordate:short)', 'refs/tags/' + tag]);
}

function toVersionLabel(version) {
    const text = String(version || '').trim();
    if (!text) {
        return '';
    }
    return /^v/i.test(text) ? text : 'v' + text;
}

function build() {
    const gitTag = readGitTag();
    const version = process.env.APP_VERSION || gitTag;
    const versionLabel = toVersionLabel(version);
    const date = process.env.APP_BUILD_DATE || readTagDate(version) || readTagDate(gitTag);
    const commit = process.env.APP_COMMIT || git(['rev-parse', '--short', 'HEAD']);
    const commitFull = process.env.APP_COMMIT_FULL || git(['rev-parse', 'HEAD']) || commit;
    const parts = [];
    if (versionLabel) {
        parts.push('版本 ' + versionLabel);
    }
    if (date) {
        parts.push(date);
    }
    if (commit) {
        parts.push(commit);
    }

    return {
        version: versionLabel || version,
        versionLabel,
        date,
        commit,
        commitFull,
        display: parts.join(' · ')
    };
}

module.exports = build();

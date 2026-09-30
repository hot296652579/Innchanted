'use strict';

const fs = require('fs');
const path = require('path');

exports.throwError = true;

exports.onAfterBuild = async function (options, result) {
    if (!options || options.platform !== 'wechatgame') {
        return;
    }
    const dest = resolveDest(options, result);
    if (!dest) {
        console.warn('[fix-wechat-virtual-cc] skip: cannot resolve wechatgame output dir');
        return;
    }
    const summary = patchWechatgameOutput(dest);
    console.log(`[fix-wechat-virtual-cc] ${summary}`);
};

function resolveDest(options, result) {
    const candidates = [];
    if (result && result.paths) {
        if (result.paths.dir) {
            candidates.push(result.paths.dir);
        }
        if (result.paths.output) {
            candidates.push(result.paths.output);
        }
    }
    if (result && result.dest) {
        candidates.push(result.dest);
    }
    for (const dir of candidates) {
        if (dir && fs.existsSync(path.join(dir, 'game.js')) && fs.existsSync(path.join(dir, 'cocos-js'))) {
            return dir;
        }
    }
    return '';
}

function patchWechatgameOutput(dest) {
    const renamed = renameVirtualCcFiles(dest);
    const virtualNames = listVirtualCcFiles(dest);
    const kept = injectKeepRequire(dest, virtualNames);
    const settings = patchProjectConfig(dest);
    const parts = [];
    if (renamed.length) {
        parts.push(`renamed ${renamed.join(', ')}`);
    } else {
        parts.push('no _virtual_cc files to rename');
    }
    parts.push(kept ? `kept ${virtualNames.join(', ')}` : 'keep-require skipped');
    parts.push(settings ? 'disabled unused-file filtering' : 'project.config.json missing');
    return parts.join('; ');
}

function listVirtualCcFiles(dest) {
    const cocosJs = path.join(dest, 'cocos-js');
    if (!fs.existsSync(cocosJs)) {
        return [];
    }
    return fs.readdirSync(cocosJs).filter((name) => /^_?virtual_cc.*\.js$/i.test(name));
}

function injectKeepRequire(dest, virtualNames) {
    if (!virtualNames.length) {
        return false;
    }
    const gameJsPath = path.join(dest, 'game.js');
    if (!fs.existsSync(gameJsPath)) {
        return false;
    }
    let text = fs.readFileSync(gameJsPath, 'utf8');
    const mark = '/* fix-wechat-virtual-cc */';
    const requires = virtualNames.map((name) => `    require('./cocos-js/${name}');`).join('\n');
    const inject = `${mark}\nfunction __keepWechatVirtualCc() {\n${requires}\n}\n`;
    if (text.indexOf(mark) >= 0) {
        text = text.replace(/\/\* fix-wechat-virtual-cc \*\/[\s\S]*?function __keepWechatVirtualCc\(\) \{[\s\S]*?\}\n/, inject);
    } else {
        const needle = 'require("src/system.bundle.js");';
        if (text.indexOf(needle) >= 0) {
            text = text.replace(needle, `${needle}\n${inject}`);
        } else {
            text = inject + text;
        }
    }
    fs.writeFileSync(gameJsPath, text, 'utf8');
    return true;
}

function renameVirtualCcFiles(dest) {
    const cocosJs = path.join(dest, 'cocos-js');
    if (!fs.existsSync(cocosJs)) {
        return [];
    }
    const renamed = [];
    for (const name of fs.readdirSync(cocosJs)) {
        if (!name.startsWith('_virtual_cc') || !name.endsWith('.js')) {
            continue;
        }
        const nextName = name.slice(1);
        fs.renameSync(path.join(cocosJs, name), path.join(cocosJs, nextName));
        replaceTextInTree(dest, name, nextName);
        renamed.push(`${name} -> ${nextName}`);
    }
    return renamed;
}

function replaceTextInTree(root, from, to) {
    const scanRoots = [
        root,
        path.join(root, 'cocos-js'),
        path.join(root, 'src'),
    ];
    for (const scanRoot of scanRoots) {
        if (!fs.existsSync(scanRoot)) {
            continue;
        }
        replaceInDir(scanRoot, from, to, scanRoot === root);
    }
}

function replaceInDir(dir, from, to, filesOnly) {
    for (const name of fs.readdirSync(dir)) {
        const current = path.join(dir, name);
        const stat = fs.statSync(current);
        if (stat.isDirectory()) {
            if (filesOnly) {
                continue;
            }
            replaceInDir(current, from, to, false);
            continue;
        }
        if (!/\.(js|json|map)$/i.test(current)) {
            continue;
        }
        const text = fs.readFileSync(current, 'utf8');
        if (text.indexOf(from) < 0) {
            continue;
        }
        fs.writeFileSync(current, text.split(from).join(to), 'utf8');
    }
}

function patchProjectConfig(dest) {
    const configPath = path.join(dest, 'project.config.json');
    if (!fs.existsSync(configPath)) {
        return false;
    }
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    cfg.setting = cfg.setting || {};
    cfg.setting.ignoreDevUnusedFiles = false;
    cfg.setting.ignoreUploadUnusedFiles = false;
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 4), 'utf8');

    const privatePath = path.join(dest, 'project.private.config.json');
    if (fs.existsSync(privatePath)) {
        const priv = JSON.parse(fs.readFileSync(privatePath, 'utf8'));
        priv.setting = priv.setting || {};
        priv.setting.ignoreDevUnusedFiles = false;
        priv.setting.ignoreUploadUnusedFiles = false;
        fs.writeFileSync(privatePath, JSON.stringify(priv, null, 4), 'utf8');
    }
    return true;
}

exports.patchWechatgameOutput = patchWechatgameOutput;

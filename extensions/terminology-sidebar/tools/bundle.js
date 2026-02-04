const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../src');
const DIST_DIR = path.resolve(__dirname, '..');

// 简单的模块打包器
class SimpleBundler {
    constructor() {
        this.modules = new Map(); // path -> content
        this.processed = new Set();
    }

    processFile(filePath, isEntry = false) {
        if (this.processed.has(filePath)) return;
        this.processed.add(filePath);

        console.log(`Processing: ${filePath}`);
        
        // 检查文件扩展名
        const ext = path.extname(filePath);
        if (ext === '.html' || ext === '.css') {
            const content = fs.readFileSync(filePath, 'utf8');
            // 转义内容使其可以作为 JS 字符串
            const escaped = JSON.stringify(content);
            this.modules.set(filePath, `const content = ${escaped};\n`);
            return;
        }

        let content = fs.readFileSync(filePath, 'utf8');
        
        // 查找 import
        // 支持: import ... from './file.js';
        // 支持: import ... from './file.css';
        // 支持: import ... from './file.html';
        const importRegex = /import\s+(?:\{([^}]+)\}|(\* as \w+)|(\w+))\s+from\s+['"]([^'"]+)['"];?/g;
        let match;
        const dependencies = [];

        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[4];
            let absPath = path.resolve(path.dirname(filePath), importPath);
            
            // 尝试添加扩展名
            if (!fs.existsSync(absPath)) {
                if (fs.existsSync(absPath + '.js')) absPath += '.js';
            }
            
            dependencies.push({ path: absPath, original: match[0], varName: match[3] });
        }

        // 先处理依赖
        dependencies.forEach(dep => this.processFile(dep.path, false));

        // 移除 import 语句
        // 对于 HTML/CSS，如果是 import html from './sidebar.html'
        // 我们需要将其替换为: const html = ... (从模块中获取)
        // 但由于我们是简单的拼接，我们可以直接内联吗？
        // 我们的策略是：所有模块内容都在同一个作用域（或者是独立的闭包？）
        // 现在的 bundle 策略是：平铺所有代码。这意味着变量名会冲突。
        // 为了避免冲突，我们可以把非 JS 文件内容直接替换到 import 处吗？
        // 或者，我们可以保留目前的 map 结构，但是对 HTML/CSS 特殊处理。
        // 如果是 `import html from './sidebar.html'`, 我们希望变成 `const html = "<html>...";`
        
        // 重新遍历替换
        let newContent = content;
        for (const dep of dependencies) {
            const ext = path.extname(dep.path);
            if (ext === '.html' || ext === '.css') {
                const fileContent = fs.readFileSync(dep.path, 'utf8');
                const escaped = JSON.stringify(fileContent);
                // 替换 import 语句为 const 定义
                if (dep.varName) {
                    newContent = newContent.replace(dep.original, `const ${dep.varName} = ${escaped};`);
                } else {
                     // import './style.css'; -> 忽略或注入 style 标签？
                     // 目前我们只支持 import variable from file
                     newContent = newContent.replace(dep.original, '');
                }
                // 不需要将其添加到 modules map 中，因为已经内联了
                // 但如果被多个文件引用呢？内联多次也没关系，或者提取为全局变量。
                // 简单起见，内联多次。
                this.processed.delete(dep.path); // Allow re-processing if needed, or just don't add to modules
            } else {
                newContent = newContent.replace(dep.original, '');
            }
        }
        
        content = newContent;

        // 移除 export 关键字 (仅当不是 Entry 或 Entry 需要被视为普通脚本时移除，
        // 但为了简单，我们假设 Entry 的 export 如果存在，是为了 ES Module 导出。
        // 依赖文件的 export 必须移除，因为它们被内联了。)
        if (!isEntry) {
            content = content.replace(/export\s+(const|let|var|class|function|async)/g, '$1');
            content = content.replace(/export\s+\{([^}]+)\};?/g, '');
            content = content.replace(/export\s+default\s+/g, '');
        }

        this.modules.set(filePath, content);
    }

    minify(content) {
        // Simple minification: remove comments and extra whitespace
        // WARNING: Removing single-line comments is risky with simple regex because of URLs (e.g., https://)
        // We will skip single-line comment removal for safety.
        return content
            // Remove multi-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '')
            // Remove leading/trailing whitespace
            .trim()
            // Remove empty lines
            .replace(/^\s*[\r\n]/gm, '');
    }

    bundle(entryFile, outputFile, options = {}) {
        const { wrapIIFE = false, minify = false } = options;
        console.log(`Bundling ${entryFile} -> ${outputFile} (IIFE: ${wrapIIFE}, Minify: ${minify})`);
        this.modules.clear();
        this.processed.clear();

        const absEntry = path.resolve(SRC_DIR, entryFile);
        this.processFile(absEntry, true);

        let bundleContent = '// Built by tools/bundle.js\n';
        if (wrapIIFE) {
            bundleContent += '(() => {\n';
        }

        for (const [path, content] of this.modules) {
             // Skip html/css files in the final loop as they are inlined
             if (path.endsWith('.html') || path.endsWith('.css')) continue;
             bundleContent += content + '\n';
        }

        if (wrapIIFE) {
            bundleContent += '})();\n';
        }

        if (minify) {
            bundleContent = this.minify(bundleContent);
        }

        fs.writeFileSync(path.resolve(DIST_DIR, outputFile), bundleContent);
        console.log('Done.');
    }
}

const bundler = new SimpleBundler();

// Bundle Content Script
try {
    bundler.bundle('content/index.js', 'contentScript.js', { wrapIIFE: true, minify: true });
} catch (e) {
    console.error('Error bundling contentScript:', e.message);
    console.error(e.stack);
}

// Bundle Background Script
try {
    bundler.bundle('background/index.js', 'background.js', { wrapIIFE: false, minify: true });
} catch (e) {
    console.error('Error bundling background:', e.message);
}

// Bundle Worker Script
try {
    bundler.bundle('content/worker.js', 'worker.js', { wrapIIFE: false, minify: true });
} catch (e) {
    console.error('Error bundling worker:', e.message);
}

// Bundle Sidebar Script
try {
    bundler.bundle('sidebar/index.js', 'sidebar.js', { wrapIIFE: false, minify: true });
} catch (e) {
    console.error('Error bundling sidebar:', e.message);
}

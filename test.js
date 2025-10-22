const webdav = require('.');
const http = require('http');
const fs = require('fs');
const path = require('path');
const server = http.createServer();

function resolveDiskPath(rel) {
    const root = path.join(__dirname, 'files');  //ROOT_DIR
    if (!rel) return root;
    rel = rel.replace(/^\\+/g, '/');
    rel = rel.replace(/^\/+/, '');
    return path.join(root, rel);
}

if (!fs.existsSync(resolveDiskPath('/'))) {
    fs.mkdirSync(resolveDiskPath('/'));
}

server.listen(8080, () => {
    console.log('🚀 WebDAV server is running at http://localhost:8080');
});

webdav(server, {
    list: function (pathname) {
        const originalPath = pathname;
        const diskPath = resolveDiskPath(pathname);

        if (!fs.existsSync(diskPath)) return [];

        if (!fs.statSync(diskPath).isDirectory()) {
            return [{ name: originalPath, size: fs.statSync(diskPath).size, type: 'file', lastmod: fs.statSync(diskPath).mtime }];
        } else {
            const files = fs.readdirSync(diskPath);
            files.push(".");
            return files
                .filter(f => fs.existsSync(path.join(diskPath, f)))
                .map(f => {
                    const fullPath = path.join(diskPath, f);
                    const relativeName = path.posix.join(originalPath === '/' ? '/' : originalPath.replace(/\/$/, ''), f).replace(/\/+/g, '/');
                    return { name: relativeName, size: fs.statSync(fullPath).size, type: fs.statSync(fullPath).isDirectory() ? 'directory' : 'file', lastmod: fs.statSync(fullPath).mtime };
                });
        }
    },
    get: function (pathname, options = {}) {
        const diskPath = resolveDiskPath(pathname);
        if (!fs.existsSync(diskPath)) return null;

        const { start, end } = options;
        const streamOptions = {};

        if (start !== undefined) streamOptions.start = start;
        if (end !== undefined) streamOptions.end = end;

        const stream = fs.createReadStream(diskPath, streamOptions);

        stream.on('error', (err) => {
            console.error('Error reading file:', err);
        });
        return stream;
    },
    write: function (pathname, req) {
        return new Promise((resolve) => {
            const diskPath = resolveDiskPath(pathname);
            const dir = path.dirname(diskPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const stream = fs.createWriteStream(diskPath);

            req.on('data', (chunk) => {
                stream.write(chunk);
            });

            req.on('end', () => {
                stream.end();
                resolve();
            });

            req.on('error', (err) => {
                stream.destroy(err);
                resolve();
            });
        })
    },
    move: function (pathname, destinationPath, allowOverwrite) {
        const sourceDiskPath = resolveDiskPath(pathname);
        const destDiskPath = resolveDiskPath(destinationPath);

        if (!fs.existsSync(sourceDiskPath)) return;

        const destDir = path.dirname(destDiskPath);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        if (fs.existsSync(destDiskPath)) {
            if (!allowOverwrite) return;
            const destStat = fs.statSync(destDiskPath);
            if (destStat.isDirectory()) {
                fs.rmSync(destDiskPath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(destDiskPath);
            }
        }

        try {
            fs.renameSync(sourceDiskPath, destDiskPath);
        } catch (err) {
            return;
        }
    },
    delete: function (pathname) {
        const diskPath = resolveDiskPath(pathname);
        if (fs.existsSync(diskPath)) {
            if (fs.statSync(diskPath).isDirectory()) {
                fs.rmSync(diskPath, { recursive: true, force: true })
            } else {
                fs.unlinkSync(diskPath);
            }
        }
    },
    mkdir: function (pathname) {
        const diskPath = resolveDiskPath(pathname);
        if (!fs.existsSync(diskPath)) {
            fs.mkdirSync(diskPath, { recursive: true });
        }
    }
});

# WebDAV Serve 🚀

![](https://raw.githubusercontent.com/DeveloperKubilay/WebDav-serve/refs/heads/main/tests/image.png)

A simple, customizable WebDAV server for sharing your local disk as a network drive. Built with Node.js for easy integration and modification.

## Features ✨

- **Full WebDAV Protocol Support** - PROPFIND, GET, PUT, DELETE, MOVE, MKCOL, LOCK/UNLOCK
- **Range Requests** - Partial content support for large files
- **Session Management** - Lock tokens with automatic cleanup
- **Easy Customization** - Simple callback-based API

## Quick Start 🏃‍♂️

```javascript
const webdav = require('webdav-serve');
const http = require('http');
const fs = require('fs');
const path = require('path');
const server = http.createServer();

function resolveDiskPath(rel) {//FOR WINDOWS
    if (!rel) return __dirname;
    rel = rel.replace(/^\\+/g, '/');
    rel = rel.replace(/^\/+/, '');
    return path.join(__dirname, rel);
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
        if (!fs.existsSync(diskPath)) return [];
        
        const { start = 0, end } = options;
        const stream = fs.createReadStream(diskPath, { start, end });
        
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
    move: function (pathname, destinationPath) {
        const sourceDiskPath = resolveDiskPath(pathname);
        const destDiskPath = resolveDiskPath(destinationPath);

        if (!fs.existsSync(sourceDiskPath)) return;
        fs.renameSync(sourceDiskPath, destDiskPath);
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
```
## Installation 📦

```bash
npm install webdav-serve
```

## ❤️ DeveloperKubilay
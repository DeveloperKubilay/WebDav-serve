const webdav = require("./module");

const http = require('http');
const fs = require('fs');
const path = require('path');
const server = http.createServer();

server.listen(8080, () => {
    console.log('🚀 WebDAV sunucu http://localhost:8080 adresinde çalışıyor');
});

webdav(server, {
    list: function (pathname) {
        const originalPath = pathname;
        pathname = path.join(__dirname, pathname);

        if (!fs.existsSync(pathname)) return [];

        if (!fs.statSync(pathname).isDirectory()) {
            return [{ name: originalPath, size: fs.statSync(pathname).size, type: 'file', lastmod: fs.statSync(pathname).mtime }];
        } else {
            const files = fs.readdirSync(pathname)
            files.push(".");
            return files
                .filter(f => fs.existsSync(path.join(pathname, f)))
                .map(f => {
                    const fullPath = path.join(pathname, f);
                    const relativeName = path.posix.join(originalPath, f);
                    return { name: relativeName, size: fs.statSync(fullPath).size, type: fs.statSync(fullPath).isDirectory() ? 'directory' : 'file', lastmod: fs.statSync(fullPath).mtime };
                })
        }
    },
    get: function (pathname) {
        pathname = path.join(__dirname, pathname);
        if (!fs.existsSync(pathname)) return [];
        const stream = fs.createReadStream(pathname);
        stream.on('error', (err) => {
            console.error('Error reading file:', err);
        });
        return stream;
    },
    write: function (pathname, req) {
        pathname = path.join(__dirname, pathname);
        const dir = path.dirname(pathname);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const stream = fs.createWriteStream(pathname);
        req.pipe(stream);
    }

});

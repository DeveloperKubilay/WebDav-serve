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
        pathname = path.join(__dirname, pathname);
        console.log(pathname)

        if (!fs.existsSync(pathname)) return [];

        if (!fs.statSync(pathname).isDirectory()) {
            return [{ name: pathname, size: fs.statSync(pathname).size, type: 'file', lastmod: fs.statSync(pathname).mtime }];
        } else {
            const files = fs.readdirSync(pathname)
            if (files.length === 0) return [
                { name: pathname, size: 0, type: 'directory', lastmod: fs.statSync(pathname).mtime }
            ];
            return files
                .filter(f => fs.existsSync(path.join(pathname, f)))
                .map(f => {
                    const fullPath = path.join(pathname, f);
                    return { name: f, size: fs.statSync(fullPath).size, type: fs.statSync(fullPath).isDirectory() ? 'directory' : 'file', lastmod: fs.statSync(fullPath).mtime };
                });
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
    }

});

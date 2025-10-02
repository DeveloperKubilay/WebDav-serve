const webdav = require("./module");

const http = require('http');
const server = http.createServer();

server.listen(8080, () => {
    console.log('🚀 WebDAV sunucu http://localhost:8080 adresinde çalışıyor');
});

webdav(server, {
    get: function (pathname) {
        //console.log(pathname)
        if (pathname === "/test-smoke.txt") 
            return [
                { name: 'test-smoke.txt', type: 'file', size: 10, lastmod: new Date() }
            ]
        return [
            { name: '/', type: 'directory', size: 0, lastmod: new Date() },
            { name: '/test-smoke.txt', type: 'file', size: 10, lastmod: new Date() },
            { name: '/test-smoke2.txt', type: 'file', size: 10, lastmod: new Date(), writeable: false },
            { name: '/folder1/', type: 'directory', size: 0, lastmod: new Date() }
        ]
    }

});
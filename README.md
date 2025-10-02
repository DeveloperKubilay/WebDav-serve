# WebDAV Serve 🚀

![](https://raw.githubusercontent.com/DeveloperKubilay/WebDav-serve/refs/heads/main/tests/image.png)

A simple, customizable WebDAV server for sharing your local disk as a network drive. Built with Node.js for easy integration and modification.

## Features ✨

- **Full WebDAV Protocol Support** - PROPFIND, GET, PUT, DELETE, MOVE, MKCOL, LOCK/UNLOCK
- **Range Requests** - Partial content support for large files
- **CORS Enabled** - Cross-origin resource sharing
- **Session Management** - Lock tokens with automatic cleanup
- **Easy Customization** - Simple callback-based API

## Quick Start 🏃‍♂️

```javascript
const webdav = require('webdav-serve');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer();

server.listen(8080, () => {
    console.log('🚀 WebDAV server running at http://localhost:8080');
});

webdav(server, {
    list: function (pathname) {
        // Your file listing logic
        const diskPath = path.join(__dirname, pathname);
        return fs.readdirSync(diskPath).map(file => ({
            name: file,
            type: fs.statSync(path.join(diskPath, file)).isDirectory() ? 'directory' : 'file',
            size: fs.statSync(path.join(diskPath, file)).size,
            lastmod: fs.statSync(path.join(diskPath, file)).mtime
        }));
    },
    
    get: function (pathname, options = {}) {
        // File reading with range support
        const diskPath = path.join(__dirname, pathname);
        return fs.createReadStream(diskPath, options);
    },
    
    write: function (pathname, req) {
        // File writing
        const diskPath = path.join(__dirname, pathname);
        const stream = fs.createWriteStream(diskPath);
        req.pipe(stream);
    },
    
    delete: function (pathname) {
        // File/directory deletion
        const diskPath = path.join(__dirname, pathname);
        fs.rmSync(diskPath, { recursive: true, force: true });
    },
    
    move: function (pathname, destinationPath) {
        // Move/rename files
        const sourcePath = path.join(__dirname, pathname);
        const destPath = path.join(__dirname, destinationPath);
        fs.renameSync(sourcePath, destPath);
    },
    
    mkdir: function (pathname) {
        // Create directories
        const diskPath = path.join(__dirname, pathname);
        fs.mkdirSync(diskPath, { recursive: true });
    }
});
```

## Testing 🧪

```javascript
const axios = require('axios');

// Test PROPPATCH request
const testRequest = async () => {
    try {
        const response = await axios({
            method: 'PROPPATCH',
            url: 'http://localhost:8080/test-file.txt',
            headers: {
                'cache-control': 'no-cache',
                'connection': 'Keep-Alive',
                'pragma': 'no-cache',
                'content-type': 'text/xml; charset="utf-8"',
                'user-agent': 'Microsoft-WebDAV-MiniRedir/10.0.26100',
                'if': '(<5eba015d36111d43ff54378ad6621718>)',
                'translate': 'f',
                'content-length': '316',
                'host': 'localhost:8080'
            }
        });

        console.log('Status:', response.status);
        console.log('Data:', response.data);
    } catch (error) {
        console.log('Error:', error.message);
        if (error.response) {
            console.log('Response status:', error.response.status);
        }
    }
};

testRequest();

## ❤️ DeveloperKubilay
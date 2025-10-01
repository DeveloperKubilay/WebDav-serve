const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const xml2js = require('xml2js');
const crypto = require('crypto');

const PORT = 8081;
const ROOT_DIR = path.resolve(__dirname, 'files');

// Files dizinini oluştur ve izinleri kontrol et
try {
    if (!fs.existsSync(ROOT_DIR)) {
        fs.mkdirSync(ROOT_DIR, { recursive: true });
        console.log(`📁 Files dizini oluşturuldu: ${ROOT_DIR}`);
    }
    
    // Test write yaparak izinleri kontrol et
    const testFile = path.join(ROOT_DIR, '.webdav_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log(`✅ Dizin yazılabilir: ${ROOT_DIR}`);
} catch (error) {
    console.error(`❌ Dizin izin hatası: ${error.message}`);
    console.log(`Çözüm: ${ROOT_DIR} dizinine yazma izni ver`);
}

class WebDAVServer {
    constructor() {
        this.server = http.createServer(this.handleRequest.bind(this));
        this.locks = new Map();
    }

    async handleRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const pathname = decodeURIComponent(parsedUrl.pathname);
        
        // Windows path güvenliği - tehlikeli karakterleri temizle
        const safePath = pathname.replace(/[<>:"|?*]/g, '_').replace(/\.\./g, '');
        const fullPath = path.resolve(ROOT_DIR, '.' + safePath);
        
        // Path injection koruması
        if (!fullPath.startsWith(ROOT_DIR)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden: Path outside root directory');
            return;
        }

    res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Depth, Destination, Overwrite, Lock-Token, Timeout, If');
    res.setHeader('DAV', '1,2');
    res.setHeader('MS-Author-Via', 'DAV');

        console.log(`${req.method} ${pathname} -> ${fullPath}`);

        try {
            switch (req.method) {
                case 'OPTIONS':
                    res.writeHead(200, {
                        'Allow': 'OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK',
                        'DAV': '1,2',
                        'MS-Author-Via': 'DAV',
                        'Content-Length': '0'
                    });
                    res.end();
                    break;
                case 'GET':
                    await this.handleGet(req, res, fullPath);
                    break;
                case 'HEAD':
                    await this.handleHead(req, res, fullPath);
                    break;
                case 'PUT':
                    await this.handlePut(req, res, fullPath);
                    break;
                case 'PROPFIND':
                    await this.handlePropfind(req, res, fullPath, pathname);
                    break;
                case 'PROPPATCH':
                    await this.handleProppatch(req, res, fullPath, pathname);
                    break;
                case 'DELETE':
                    await this.handleDelete(req, res, fullPath);
                    break;
                case 'MKCOL':
                    await this.handleMkcol(req, res, fullPath);
                    break;
                case 'LOCK':
                    await this.handleLock(req, res, fullPath, pathname);
                    break;
                case 'UNLOCK':
                    await this.handleUnlock(req, res, fullPath);
                    break;
                case 'MOVE':
                    await this.handleMove(req, res, fullPath, pathname, req.headers.destination);
                    break;
                default:
                    res.writeHead(405, {
                        'Content-Type': 'text/plain',
                        'Content-Length': '0'
                    });
                    res.end();
            }
        } catch (error) {
            console.error(`❌ Server error: ${error.message}`);
            console.error(`   Request: ${req.method} ${pathname}`);
            console.error(`   Full path: ${fullPath}`);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`Internal Server Error: ${error.message}`);
        }
    }

    async handleGet(req, res, fullPath) {
        if (await this.isDirectory(fullPath)) {
            const files = await this.listDirectory(fullPath);
            const html = this.generateDirectoryListing(files, req.url);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
        } else if (await this.fileExists(fullPath)) {
            const content = await this.readFile(fullPath);
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            res.end(content);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    }

    async handleHead(req, res, fullPath) {
        if (await this.isDirectory(fullPath)) {
            res.writeHead(200, {
                'Content-Type': 'text/html',
                'Content-Length': '0'
            });
            res.end();
            return;
        }

        const stats = await this.getFileStats(fullPath);
        if (stats) {
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Length': String(stats.size),
                'Last-Modified': stats.mtime.toUTCString()
            });
            res.end();
        } else {
            res.writeHead(404, {
                'Content-Type': 'text/plain',
                'Content-Length': '0'
            });
            res.end();
        }
    }

    async handlePut(req, res, fullPath) {
        const chunks = [];
        const existedBefore = await this.fileExists(fullPath);

        req.on('data', chunk => chunks.push(chunk));
        req.on('end', async () => {
            try {
                const content = Buffer.concat(chunks);
                const success = await this.writeFile(fullPath, content);

                if (!success) {
                    res.writeHead(500, {
                        'Content-Type': 'text/plain',
                        'Content-Length': '0'
                    });
                    res.end();
                    return;
                }

                const statusCode = existedBefore ? 204 : 201;
                res.writeHead(statusCode, {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': '0'
                });
                res.end();
            } catch (error) {
                console.error(`❌ PUT handler error: ${error.message}`);
                res.writeHead(500, {
                    'Content-Type': 'text/plain',
                    'Content-Length': Buffer.byteLength(error.message)
                });
                res.end(error.message);
            }
        });

        req.on('error', error => {
            console.error(`❌ PUT stream error: ${error.message}`);
            res.writeHead(500, {
                'Content-Type': 'text/plain',
                'Content-Length': Buffer.byteLength(error.message)
            });
            res.end(error.message);
        });
    }

    async handlePropfind(req, res, fullPath, pathname) {
        const depth = req.headers.depth || '1';
        const isDir = await this.isDirectory(fullPath);
        
        if (!await this.fileExists(fullPath)) {
            res.writeHead(404, {
                'Content-Type': 'text/xml',
                'Content-Length': '0'
            });
            res.end();
            return;
        }

        const props = [];
        
        if (isDir) {
            props.push(this.createPropResponse(pathname, true));
            
            if (depth !== '0') {
                const files = await this.listDirectory(fullPath);
                for (const file of files) {
                    const filePath = path.posix.join(pathname, file.name);
                    props.push(this.createPropResponse(filePath, file.isDirectory, file.size, file.modified));
                }
            }
        } else {
            const stats = await this.getFileStats(fullPath);
            props.push(this.createPropResponse(pathname, false, stats.size, stats.mtime));
        }

        const xml = this.generatePropfindResponse(props);
        const xmlBuffer = Buffer.from(xml, 'utf-8');
        res.writeHead(207, {
            'Content-Type': 'text/xml; charset=utf-8',
            'Content-Length': String(xmlBuffer.length)
        });
        res.end(xmlBuffer);
    }

    async handleProppatch(req, res, fullPath, pathname) {
        if (!await this.fileExists(fullPath)) {
            res.writeHead(404, {
                'Content-Type': 'text/xml',
                'Content-Length': '0'
            });
            res.end();
            return;
        }

        await this.readRequestBody(req); // içeriği atla ama tüket

        const href = this.normalizeHref(pathname, await this.isDirectory(fullPath));
        const responseXml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>${href}</D:href>
    <D:propstat>
      <D:prop/>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

        const buffer = Buffer.from(responseXml, 'utf-8');
        res.writeHead(207, {
            'Content-Type': 'text/xml; charset=utf-8',
            'Content-Length': String(buffer.length)
        });
        res.end(buffer);
    }

    async handleDelete(req, res, fullPath) {
        if (await this.fileExists(fullPath)) {
            const isDir = await this.isDirectory(fullPath);
            if (isDir) {
                fs.rmSync(fullPath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(fullPath);
            }
            res.writeHead(204);
            res.end();
        } else {
            res.writeHead(404);
            res.end();
        }
    }

    async handleMkcol(req, res, fullPath) {
        if (await this.fileExists(fullPath)) {
            res.writeHead(405);
            res.end();
        } else {
            fs.mkdirSync(fullPath, { recursive: true });
            res.writeHead(201);
            res.end();
        }
    }

    async handleLock(req, res, fullPath, pathname) {
        if (!await this.fileExists(fullPath)) {
            res.writeHead(404, {
                'Content-Type': 'text/xml',
                'Content-Length': '0'
            });
            res.end();
            return;
        }

        await this.readRequestBody(req);

        const token = this.ensureLockToken(fullPath);
        const depth = req.headers.depth || 'Infinity';
        const timeout = req.headers.timeout || 'Second-3600';
        const href = this.normalizeHref(pathname, false);

        const lockDiscovery = `<?xml version="1.0" encoding="utf-8"?>
<D:prop xmlns:D="DAV:">
  <D:lockdiscovery>
    <D:activelock>
      <D:locktype><D:write/></D:locktype>
      <D:lockscope><D:exclusive/></D:lockscope>
      <D:depth>${depth}</D:depth>
      <D:timeout>${timeout}</D:timeout>
      <D:locktoken><D:href>${token}</D:href></D:locktoken>
      <D:lockroot><D:href>${href}</D:href></D:lockroot>
    </D:activelock>
  </D:lockdiscovery>
</D:prop>`;

        const buffer = Buffer.from(lockDiscovery, 'utf-8');
        res.writeHead(200, {
            'Content-Type': 'text/xml; charset=utf-8',
            'Content-Length': String(buffer.length),
            'Lock-Token': `<${token}>`
        });
        res.end(buffer);
    }

    async handleUnlock(req, res, fullPath) {
        const lockHeader = req.headers['lock-token'];
        if (lockHeader) {
            const token = lockHeader.replace(/[<>]/g, '').trim();
            const existing = this.locks.get(fullPath);
            if (existing && existing === token) {
                this.locks.delete(fullPath);
            }
        }

        res.writeHead(204, {
            'Content-Length': '0'
        });
        res.end();
    }

    async handleMove(req, res, sourceFullPath, _sourcePathname, destinationHeader) {
        if (!destinationHeader) {
            res.writeHead(400, {
                'Content-Type': 'text/plain',
                'Content-Length': '0'
            });
            res.end();
            return;
        }

        if (!await this.fileExists(sourceFullPath)) {
            res.writeHead(404, {
                'Content-Type': 'text/plain',
                'Content-Length': '0'
            });
            res.end();
            return;
        }

        const destinationFullPath = this.resolvePathFromHref(destinationHeader);
        if (!destinationFullPath) {
            res.writeHead(403, {
                'Content-Type': 'text/plain',
                'Content-Length': '0'
            });
            res.end();
            return;
        }

        const overwriteHeader = (req.headers.overwrite || 'T').toUpperCase();
        const allowOverwrite = overwriteHeader !== 'F';
        const destinationExists = await this.fileExists(destinationFullPath);

        if (destinationExists && !allowOverwrite) {
            res.writeHead(412, {
                'Content-Type': 'text/plain',
                'Content-Length': '0'
            });
            res.end();
            return;
        }

        const destinationDir = path.dirname(destinationFullPath);
        await fs.promises.mkdir(destinationDir, { recursive: true });

        if (destinationExists && allowOverwrite) {
            const isDir = await this.isDirectory(destinationFullPath);
            if (isDir) {
                await fs.promises.rm(destinationFullPath, { recursive: true, force: true });
            } else {
                await fs.promises.unlink(destinationFullPath);
            }
        }

        await fs.promises.rename(sourceFullPath, destinationFullPath);

        const statusCode = destinationExists ? 204 : 201;
        res.writeHead(statusCode, {
            'Content-Length': '0'
        });
        res.end();
    }

    // Dosya işlem fonksiyonları
    async fileExists(filePath) {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async isDirectory(filePath) {
        try {
            const stats = await fs.promises.stat(filePath);
            return stats.isDirectory();
        } catch {
            return false;
        }
    }

    async readFile(filePath) {
        try {
            return await fs.promises.readFile(filePath);
        } catch (error) {
            console.error('Read error:', error);
            return null;
        }
    }

    async writeFile(filePath, content) {
        try {
            // Windows path normalizasyonu
            const normalizedPath = path.normalize(filePath);
            const dir = path.dirname(normalizedPath);
            
            // Dizini güvenli şekilde oluştur
            await fs.promises.mkdir(dir, { recursive: true });
            
            // Dosyayı yaz
            await fs.promises.writeFile(normalizedPath, content);
            
            console.log(`✅ Dosya yazıldı: ${normalizedPath}`);
            return true;
        } catch (error) {
            console.error(`❌ Dosya yazma hatası: ${error.message}`);
            console.error(`   Dosya yolu: ${filePath}`);
            console.error(`   Hata kodu: ${error.code}`);
            
            // Windows özel hata kodları
            if (error.code === 'EACCES') {
                console.error('   Çözüm: Dosya izinlerini kontrol et');
            } else if (error.code === 'ENOENT') {
                console.error('   Çözüm: Dizin yolu mevcut değil');
            } else if (error.code === 'ENOTDIR') {
                console.error('   Çözüm: Path bir dosyaya işaret ediyor, dizin değil');
            }
            
            return false;
        }
    }

    async listDirectory(dirPath) {
        try {
            const files = await fs.promises.readdir(dirPath);
            const fileInfos = [];
            
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stats = await fs.promises.stat(filePath);
                fileInfos.push({
                    name: file,
                    isDirectory: stats.isDirectory(),
                    size: stats.size,
                    modified: stats.mtime
                });
            }
            
            return fileInfos;
        } catch (error) {
            console.error('List directory error:', error);
            return [];
        }
    }

    async getFileStats(filePath) {
        try {
            return await fs.promises.stat(filePath);
        } catch {
            return null;
        }
    }

    ensureLockToken(resource) {
        if (this.locks.has(resource)) {
            return this.locks.get(resource);
        }

        const token = `urn:uuid:${crypto.randomUUID ? crypto.randomUUID() : this.generateUuid()}`;
        this.locks.set(resource, token);
        return token;
    }

    generateUuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    async readRequestBody(req) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', () => resolve(Buffer.concat(chunks)));
            req.on('error', reject);
        });
    }

    createPropResponse(rawHref, isCollection, size = 0, lastModified = new Date()) {
        const href = this.normalizeHref(rawHref, isCollection);
        const resourceType = isCollection ? '<D:collection/>' : '';
        const contentLength = isCollection ? '' : `<D:getcontentlength>${size}</D:getcontentlength>`;

        return `
            <D:response>
                <D:href>${href}</D:href>
                <D:propstat>
                    <D:prop>
                        <D:resourcetype>${resourceType}</D:resourcetype>
                        <D:getlastmodified>${lastModified.toUTCString()}</D:getlastmodified>
                        ${contentLength}
                        <D:supportedlock>
                            <D:lockentry>
                                <D:lockscope><D:exclusive/></D:lockscope>
                                <D:locktype><D:write/></D:locktype>
                            </D:lockentry>
                        </D:supportedlock>
                    </D:prop>
                    <D:status>HTTP/1.1 200 OK</D:status>
                </D:propstat>
            </D:response>`;
    }

    normalizeHref(rawHref, isCollection) {
        if (!rawHref) {
            return '/';
        }

        let href = rawHref.replace(/\\/g, '/');

        if (!href.startsWith('/')) {
            href = '/' + href;
        }

        if (isCollection) {
            if (!href.endsWith('/')) {
                href += '/';
            }
        } else if (href.length > 1 && href.endsWith('/')) {
            href = href.slice(0, -1);
        }

        return encodeURI(href);
    }

    resolvePathFromHref(href) {
        try {
            const parsed = url.parse(href);
            const pathname = decodeURIComponent(parsed.pathname || '');
            const safe = pathname.replace(/[<>:"|?*]/g, '_').replace(/\.\./g, '');
            const resolved = path.resolve(ROOT_DIR, '.' + safe);
            if (!resolved.startsWith(ROOT_DIR)) {
                return null;
            }
            return resolved;
        } catch (error) {
            console.error(`❌ Destination parse error: ${error.message}`);
            return null;
        }
    }

    generatePropfindResponse(props) {
        return `<?xml version="1.0" encoding="utf-8"?>
            <D:multistatus xmlns:D="DAV:">
                ${props.join('')}
            </D:multistatus>`;
    }

    generateDirectoryListing(files, currentPath) {
        const filesList = files.map(file => {
            const icon = file.isDirectory ? '📁' : '📄';
            const href = path.posix.join(currentPath, file.name);
            return `<li><a href="${href}">${icon} ${file.name}</a> (${file.size} bytes)</li>`;
        }).join('');

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>WebDAV Directory: ${currentPath}</title>
                <meta charset="utf-8">
            </head>
            <body>
                <h1>📂 Directory: ${currentPath}</h1>
                <ul>${filesList}</ul>
            </body>
            </html>`;
    }

    start(port = PORT) {
        this.server.listen(port, () => {
            console.log(`🚀 WebDAV sunucu başlatıldı: http://localhost:${port}`);
            console.log(`📁 Root dizin: ${ROOT_DIR}`);
        });
    }
}

if (require.main === module) {
    const webdavServer = new WebDAVServer();
    webdavServer.start();
}

module.exports = { WebDAVServer };
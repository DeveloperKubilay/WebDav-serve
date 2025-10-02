const url = require('url');
const crypto = require('crypto');

const sessions = {};

setInterval(() => {
    for (let key in sessions) {
        const session = sessions[key];
        if (session.created + (2 * 60 * 60 * 1000) < Date.now()) delete sessions[key];
    }
}, 60 * 60 * 1000);


module.exports = function (server, options) {

    server.on('request', async (req, res) => {

        const path = decodeURIComponent(url.parse(req.url, true).pathname)
            .replace(/[<>:"|?*]/g, '_').replace(/\.\./g, '');

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Depth, Destination, Overwrite, Lock-Token, Timeout, If');
        res.setHeader('DAV', '1,2');
        res.setHeader('MS-Author-Via', 'DAV');

        if (true) {
            console.log(req.method, path, req.headers);
        }


        function sendXMLResponse(xml, status = 207, extraHeaders = {}) {
            const cleanXml = xml.replace(/>\s+</g, '><').replace(/\n\s*/g, '').trim();
            const xmlBuffer = Buffer.from(cleanXml, 'utf-8');
            res.writeHead(status, {
                'Content-Type': 'text/xml; charset=utf-8',
                'Content-Length': String(xmlBuffer.length),
                ...extraHeaders
            });
            res.end(xmlBuffer);
        }

        function closeConnection() {
            res.writeHead(404);
            res.end();
        }

        async function listDirectory(pathname) {
            return pathname === "/" && req.headers.depth === "0" ? [
                { name: "/", type: 'directory', size: 0, lastmod: new Date() }
            ] : (await options.list(pathname))
                .map(item => {
                    if (item.type === 'directory' && !item.name.endsWith('/')) {
                        item.name = item.name + '/';
                    }
                    return item;
                })
        }

        if (req.method === 'OPTIONS') {
            res.writeHead(200, {
                'Allow': 'OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK',
                'DAV': '1,2',
                'MS-Author-Via': 'DAV',
                'Content-Length': '0'
            });
            res.end();
        } else if (req.method === 'PROPFIND') {
            const list = await listDirectory(path);
            if (list.length === 0) return closeConnection();

            sendXMLResponse(
                `<?xml version="1.0" encoding="utf-8"?>
        <D:multistatus xmlns:D="DAV:">
            ${list.map(item => `
            <D:response>
                <D:href>${encodeURI(item.name)}</D:href>
                <D:propstat>
                    <D:prop>
                        <D:resourcetype>${item.type === 'directory' ? '<D:collection/>' : ''}</D:resourcetype>
                        <D:getlastmodified>${typeof item.lastmod == "string" ? item.lastmod : item.lastmod.toUTCString()}</D:getlastmodified>
                        ${item.type === 'file' ? `<D:getcontentlength>${item.size}</D:getcontentlength>` : ''}
                        <D:supportedlock>
                            <D:lockentry>
                                <D:lockscope><D:exclusive/></D:lockscope>
                                ${item.writeable == false ? `<D:locktype><D:read/></D:locktype>` : '<D:locktype><D:write/></D:locktype>'}
                            </D:lockentry>
                        </D:supportedlock>
                    </D:prop>
                    <D:status>HTTP/1.1 200 OK</D:status>
                </D:propstat>
            </D:response>`).join(' ')}
         </D:multistatus>`);


        } else if (req.method === 'GET') {
            const file = options.get(path);
            if (!file || (Array.isArray(file) && file.length === 0)) return closeConnection();
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
            });

            file.pipe ? file.pipe(res) : res.end(file);
        }
        else if (req.method === 'LOCK' || req.method === 'UNLOCK') {
            if (req.method === 'LOCK') {
                const lockToken = crypto.randomBytes(16).toString('hex');
                sessions[lockToken] = { path, created: Date.now(), };
                options.lock && options.lock(path, lockToken, req);

                return sendXMLResponse(`<?xml version="1.0" encoding="utf-8"?>
                <D:prop xmlns:D="DAV:">
                  <D:lockdiscovery>
                    <D:activelock>
                      <D:locktype><D:write/></D:locktype>
                      <D:lockscope><D:exclusive/></D:lockscope>
                      <D:depth>0</D:depth>
                      <D:timeout>${req.headers.timeout || 'Infinite'}</D:timeout>
                      <D:locktoken><D:href>${lockToken}</D:href></D:locktoken>
                      <D:lockroot><D:href>${path}</D:href></D:lockroot>
                    </D:activelock>
                  </D:lockdiscovery>
                </D:prop>`, 200, {
                    'Lock-Token': `<${lockToken}>`
                });
            }

            const lockHeader = req.headers['lock-token'];
            if (lockHeader) {
                const token = lockHeader.replace(/[<>]/g, '').trim();
                delete sessions[token];
            }
            options.unlock && options.unlock(path, req);

            res.writeHead(204, {
                'Content-Length': '0'
            });
            res.end();
        } else if (req.method === 'HEAD') {
            const list = await listDirectory(path);
            if (list.length === 0) return closeConnection();
            const item = list[0];
            if (item.type !== 'file') {
                res.writeHead(200, {
                    'Content-Type': 'text/html',
                    'Content-Length': '0'
                });
                return res.end();
            }
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Length': String(item.size),
                'Last-Modified': item.lastmod.toUTCString()
            });
            return res.end();
        } else if (req.method === 'PUT') {
            const list = await listDirectory(path);

            let token = null;
            if (req.headers.if) {
                const m = req.headers.if.match(/<([^>]+)>/);
                if (m) token = m[1];
            }

            if (token && !(token in sessions)) {
                res.writeHead(423);
                return res.end();
            }

            await options.write(path, req);

            if (token) delete sessions[token];
            res.writeHead(list.length === 0 ? 201 : 204, {
                'Content-Length': '0'
            });
            res.end();

        } else if (req.method === 'PROPPATCH') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                options.proppatch && options.proppatch(path, body);
                sendXMLResponse(`<?xml version="1.0" encoding="utf-8"?>
                <D:multistatus xmlns:D="DAV:">
                  <D:response>
                    <D:href>${path}</D:href>
                    <D:propstat>
                      <D:prop/>
                      <D:status>HTTP/1.1 200 OK</D:status>
                    </D:propstat>
                  </D:response>
                </D:multistatus>`, 200);
            })
        } else if (req.method === 'MKCOL') {
            options.mkdir && await options.mkdir(path, req);
            res.writeHead(201);
            res.end();
            res.end();
        } else if (req.method === 'DELETE') {
            options.delete && await options.delete(path, req);
            res.writeHead(204);
            res.end();
        } else if (req.method === 'MOVE') {
            const list = await listDirectory(path);

            const destinationUrl = new URL(req.headers['destination']);
            const destinationPath = decodeURIComponent(destinationUrl.pathname).replace(/[<>:"|?*]/g, '_').replace(/\.\./g, '');

            options.move && await options.move(path, destinationPath);
            res.writeHead(list.length === 0 ? 201 : 204, { 'Content-Length': '0' });
            res.end();
        }





    });

}
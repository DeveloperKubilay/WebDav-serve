const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const xml2js = require('xml2js');
const crypto = require('crypto');

module.exports = function (server, options) {

    server.on('request', (req, res) => {

        const path = decodeURIComponent(url.parse(req.url, true).pathname)
            .replace(/[<>:"|?*]/g, '_').replace(/\.\./g, '');

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Depth, Destination, Overwrite, Lock-Token, Timeout, If');
        res.setHeader('DAV', '1,2');
        res.setHeader('MS-Author-Via', 'DAV');

        if (true) {
            // console.log(req.method, path, req.headers,path);
        }


        function sendXMLResponse(xml, status = 207) {
            const xmlBuffer = Buffer.from(xml, 'utf-8');
            res.writeHead(status, {
                'Content-Type': 'text/xml; charset=utf-8',
                'Content-Length': String(xmlBuffer.length)
            });
            res.end(xmlBuffer);
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
            const list = req.headers.depth === "0" ? [
                { name: "/", type: 'directory', size: 0, lastmod: new Date() }
            ] : options.list(path)
                .map(item => {
                    if (!item.name.startsWith('/')) {
                        item.name = '/' + item.name;
                    }
                    if (item.type === 'directory' && !item.name.endsWith('/')) {
                        item.name = item.name + '/';
                    }
                    return item;
                })

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


        }




    });

}
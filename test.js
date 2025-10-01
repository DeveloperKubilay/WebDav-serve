const webdav = require("./index");

const http = require('http');
const server = http.createServer();

webdav.createServer(server);
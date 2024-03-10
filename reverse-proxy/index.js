require('dotenv').config();

const express = require('express');
const httpProxy = require('http-proxy');

const BASE_PATH = process.env.BASE_PATH;

const app = express();
const port = process.env.PORT || 9000;

const proxy = httpProxy.createProxy();

app.use((req, res) => {
    const subdomain = req.hostname.split('.')[0];
    const resolvesTo = `${BASE_PATH}/${subdomain}`;

    // TODO: verify with database

    proxy.web(req, res, {
        target: resolvesTo,
        changeOrigin: true,
    });
});

proxy.on('proxyReq', (proxyReq, req, res) => {
    const { url } = req;
    if (url === '/')
        proxyReq.path += 'index.html';
});

app.listen(port, () => {
    console.log(`Reverse Proxy started on ::${port}`);
});
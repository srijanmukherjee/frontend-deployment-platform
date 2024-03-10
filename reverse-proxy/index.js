require('dotenv').config();

const express = require('express');
const httpProxy = require('http-proxy');
const { PrismaClient } = require('@prisma/client');

const BASE_PATH = process.env.BASE_PATH;

const app = express();
const port = process.env.PORT || 9000;

const proxy = httpProxy.createProxy();
const prisma = new PrismaClient();

app.use(handleAync(async (req, res) => {
    const subDomain = req.hostname.split('.')[0];

    const project = await prisma.project.findFirst({
        where: { subDomain }
    });

    if (!project) {
        return res.status(404).json({ error: "Project doesn't exist" });
    }

    const resolvesTo = `${BASE_PATH}/${project.id}`;

    proxy.web(req, res, {
        target: resolvesTo,
        changeOrigin: true
    });
}));

proxy.on('proxyReq', (proxyReq, req, res) => {
    const { url } = req;
    if (url === '/')
        proxyReq.path += 'index.html';
});

proxy.on('proxyRes', (proxyRes, req, res) => {
    if (proxyRes.statusCode === 403 && !res.headersSent) {
        res.status(404).json({ error: "Not found" });
    }
})

app.listen(port, () => {
    console.log(`Reverse Proxy started on ::${port}`);
});

function handleAync(controller) {
    return async (req, res) => {
        try {
            await controller(req, res);
        } catch (error) {
            console.error(error);
            if (!res.headersSent) {
                res.status(500);
                res.json({
                    error: "something went wrong"
                });
            }
        }
    }
}
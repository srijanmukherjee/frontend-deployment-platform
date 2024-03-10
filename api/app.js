require('dotenv').config();

const express = require('express');
const { generateSlug } = require('random-word-slugs');
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs');
const { fromEnv } = require('@aws-sdk/credential-providers');
const { createNewDeploymentConfiguration } = require('./task');
const { Server } = require('socket.io');
const Redis = require('ioredis');

const ecsClient = new ECSClient({
    credentials: fromEnv(),
    region: process.env.AWS_DEFAULT_REGION
});

const port = process.env.PORT || 8000;

const app = express();
const io = new Server({ cors: '*', connectTimeout: 30000 });
const consumer = new Redis(process.env.REDIS_URI);

io.on('connection', (socket) => {
    socket.on('subscribe', channel => {
        socket.join(channel);
        socket.emit('message', `Joined log channel ${channel}`);
    });
});

app.use(express.json());

app.post('/project', handleAync(async (req, res) => {
    const { gitRepository, slug } = req.body;
    const projectSlug = slug ?? generateSlug();

    // start deployment container
    const command = new RunTaskCommand(
        createNewDeploymentConfiguration(gitRepository, projectSlug));
    
    await ecsClient.send(command);

    return res.json({
        status: 'queued',
        data: {
            slug: projectSlug,
            url: `http://${projectSlug}.localhost:9000`
        }
    });
}));

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

function initRedisConsumer() {
    console.log("Subscribed to logs:*");

    consumer.psubscribe('logs:*');
    consumer.on('pmessage', (pattern, channel, message) => {
        io.to(channel).emit('message', message);
    });
} 

const server = app.listen(port, () => {
    console.log(`api server running on ::${port}`);
});

io.listen(server);

initRedisConsumer();
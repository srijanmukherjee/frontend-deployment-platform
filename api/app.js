require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { generateSlug } = require('random-word-slugs');
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs');
const { fromEnv } = require('@aws-sdk/credential-providers');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');

const { createNewDeploymentConfiguration } = require('./task');
const { initializeKafkaLogConsumer } = require('./logConsumer');
const { client } = require('./clickhouse');

const ecsClient = new ECSClient({
    credentials: fromEnv(),
    region: process.env.AWS_DEFAULT_REGION
});

const prisma = new PrismaClient();

const app = express();
const port = process.env.PORT || 8000;

app.use(express.json());
app.use(cors());

const projectSchema = z.object({
    repositoryUrl: z.string().min(1),
    name: z.string().min(1)
});

app.post('/project', handleAync(async (req, res) => {
    const validationResult = projectSchema.safeParse(req.body);
    
    if (validationResult.error) {
        return res.status(400).json({ error: validationResult.error });
    }

    const { repositoryUrl, name } = validationResult.data;

    const project = await prisma.project.create({
        data: {
            name,
            gitURL: repositoryUrl,
            subDomain: generateSlug()
        }
    });

    return res.json({ status: 'success', data: { project } });
}));

app.post('/deploy', handleAync(async (req, res) => {
    const { projectId } = req.body;

    if (!projectId) {
        return res.status(400).json({ error: "expected projectId to deploy" });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });

    if (!project) {
        return res.status(404).json({ error: "project not found" });
    }

    // check for already running deployments
    const previousActiveDeployment = await prisma.deployment.findFirst({ 
        where: { 
            projectId, 
            status: {
                in: ['IN_PROGRESS', 'NOT_STARTED', 'QUEUED']
            } 
        } 
    });

    if (previousActiveDeployment) {
        return res.status(400).json({ error: "Cannot start new deployment when previous deployments are still running" });
    }

    const deployment = await prisma.deployment.create({
        data: {
            project: { connect: { id: project.id } },
            status: 'QUEUED',
        }
    });

    // start deployment container
    const command = new RunTaskCommand(
        createNewDeploymentConfiguration(project.gitURL, project.id, deployment.id));
    
    await ecsClient.send(command);

    return res.json({
        status: deployment.status,
        data: {
            deploymentId: deployment.id,
            url: `http://${project.subDomain}.localhost:9000`
        }
    });
}));

app.get('/deployment/:id/logs', handleAync(async (req, res) => {
    const id = req.params.id;
    const logs = await client.query({
        query: `SELECT event_id, log, timestamp FROM ${process.env.CLICKHOUSE_LOG_TABLE} WHERE deployment_id = {deploymentId:String}`,
        query_params: { deploymentId: id },
        format: 'JSONEachRow'
    });
    return res.json({ logs: await logs.json() })
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

app.listen(port, () => {
    console.log(`api server running on ::${port}`);
});

initializeKafkaLogConsumer();
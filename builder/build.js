const { exec } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const { createReadStream, readFileSync } = require('fs');
const mime = require('mime-types');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { fromContainerMetadata } = require('@aws-sdk/credential-providers');
const { Kafka } = require('kafkajs');

const SOURCE_PATH = process.env.SOURCE_PATH;
const DEPLOYMENT_DIRECTORY = process.env.S3_DEPLOYMENT_DIRECTORY;
const PROJECT_ID = process.env.PROJECT_ID;
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID;
const KAFKA_TOPIC = process.env.KAFKA_LOG_TOPIC;

const s3Client = new S3Client({
    // https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/security-iam-roles.html
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-credential-providers/#fromContainerMetadata
    credentials: fromContainerMetadata(),
    region: process.env.AWS_REGION
});

const kafka = new Kafka({
    clientId: `docker-build-server-${DEPLOYMENT_ID}`,
    brokers: [process.env.KAFKA_BROKER],
    ssl: {
        ca: [readFileSync(path.join(__dirname, 'kafka.pem'), 'utf-8')]
    },
    sasl: {
        username: process.env.KAFKA_SASL_USERNAME,
        password: process.env.KAFKA_SASL_PASSWORD,
        mechanism: 'plain'
    }
});

const producer = kafka.producer();

async function publishLog(log) {
    await producer.send({
        topic: KAFKA_TOPIC,
        messages: [
            {
                key: 'log',
                value: JSON.stringify({
                    deploymentId: DEPLOYMENT_ID,
                    projectId: PROJECT_ID,
                    log
                })
            }
        ]
    });
}

async function deploy() {
    await publishLog("deploying...");
    const buildPath = path.join(SOURCE_PATH, process.env.BUILD_DIRECTORY);
    const contents = await fs.readdir(buildPath, { withFileTypes: true, recursive: true });
    const abortController = new AbortController();

    const uploadPromises = contents.map(async (content) => {
        // ignore directories
        if (content.isDirectory()) return;
        
        const filePath = path.join(content.path, content.name);
        const uploadFilePath = path.join(DEPLOYMENT_DIRECTORY, PROJECT_ID, path.relative(buildPath, content.path), content.name);
        
        const command = new PutObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: uploadFilePath,
            Body: createReadStream(filePath),
            ContentType: mime.lookup(content.name)
        });

        await publishLog(`uploading ${filePath}`);

        return s3Client.send(command, {abortSignal: abortController.signal});
    });

    try {
        await Promise.all(uploadPromises);
    } catch (error) {
        // stop any pending or ongoing uploads on error
        abortController.abort("Some part of the deployment failed");
        throw error;
    }

    await publishLog("deployment complete");
}

async function main() {
    await producer.connect();

    await publishLog("starting build");
    console.log(`source path: ${SOURCE_PATH}`);

    const buildProcess = exec(`cd ${SOURCE_PATH} && npm install && npm run build`);

    buildProcess.stdout.on('data', async (chunk) => {
        await publishLog(chunk);
    });

    // https://nodejs.org/api/stream.html#event-error_1
    buildProcess.stdout.on('error', async (err) => {
        await publishLog(`error: something went wrong while processing stdout: ${err.message}`);
    });

    buildProcess.stderr.on('data', async (chunk) => {
        await publishLog(`stderr: ${chunk}`);
    });

    buildProcess.on('close', async (code) => {
        if (code === 0) {
            console.log("Build complete");
            await publishLog("Build complete");
            await deploy().catch(async (error) => {
                await publishLog(error.toString());
                await publishLog("deployment failed");
                exit(1);
            })
        } else {
            await publishLog(`error: build exited with code ${code}`);
        }
        
        process.exit(code);
    });
}

main()
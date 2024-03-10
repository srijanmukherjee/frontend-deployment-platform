const { exec } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const { createReadStream } = require('fs');
const mime = require('mime-types');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { fromContainerMetadata } = require('@aws-sdk/credential-providers');
const Redis = require('ioredis');

const SOURCE_PATH = process.env.SOURCE_PATH;
const DEPLOYMENT_DIRECTORY = process.env.S3_DEPLOYMENT_DIRECTORY;
const PROJECT_ID = process.env.PROJECT_ID;
const REDIS_LOG_CHANNEL = `logs:${PROJECT_ID}`

const s3Client = new S3Client({
    // https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/security-iam-roles.html
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-credential-providers/#fromContainerMetadata
    credentials: fromContainerMetadata(),
    region: process.env.AWS_REGION
});

// REDIS_URI must be provided through environment variable during launch
const producer = new Redis(process.env.REDIS_URI);

function publishLog(log) {
    producer.publish(REDIS_LOG_CHANNEL, JSON.stringify({ log }))
}

async function deploy() {
    publishLog("deploying...");
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

        publishLog(`uploading ${filePath}`);

        return s3Client.send(command, {abortSignal: abortController.signal});
    });

    try {
        await Promise.all(uploadPromises);
    } catch (error) {
        // stop any pending or ongoing uploads on error
        abortController.abort("Some part of the deployment failed");
        throw error;
    }

    publishLog("deployment complete");
}

async function main() {
    publishLog("starting build");
    console.log(`source path: ${SOURCE_PATH}`);

    const process = exec(`cd ${SOURCE_PATH} && npm install && npm run build`);

    process.stdout.on('data', (chunk) => {
        publishLog(chunk);
    });

    // https://nodejs.org/api/stream.html#event-error_1
    process.stdout.on('error', (err) => {
        publishLog(`error: something went wrong while processing stdout: ${err.message}`);
    });

    process.stderr.on('data', (chunk) => {
        publishLog(`stderr: ${chunk}`);
    });

    process.on('close', (code) => {
        console.log("Build complete");
        
        if (code !== 0) {
            publishLog(`error: build exited with code ${code}`);
            producer.disconnect();
            return;
        }

        publishLog("Build complete");
        deploy().catch((error) => {
            publishLog(error.toString());
            publishLog("deployment failed");
        })
        .finally(() => {
            producer.disconnect();
        })
    });
}

main()
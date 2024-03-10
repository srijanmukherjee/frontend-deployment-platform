const path = require('path');
const { readFileSync } = require('fs');
const { v4: uuidv4 } = require('uuid');

const { client } = require('./clickhouse');
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
    clientId: 'api-server',
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

const consumer = kafka.consumer({ groupId: 'api-server-logs-consumer' });

async function initializeKafkaLogConsumer() {
    await consumer.connect();
    await consumer.subscribe({ topics: [ process.env.KAFKA_LOG_TOPIC ] });

    console.log("Log consumer initialized");

    await consumer.run({
        autoCommit: false,
        eachBatch: async ({ batch, heartbeat, resolveOffset, commitOffsetsIfNecessary }) => {
            const messages = batch.messages;
            
            console.log(`[log consumer] recv. ${messages.length} logs`);

            for (const message of messages) {
                const messageString = message.value.toString();
                const { projectId, deploymentId, log } = JSON.parse(messageString);
                try {
                    const { query_id } =  await client.insert({
                        table: process.env.CLICKHOUSE_LOG_TABLE,
                        values: [{
                            event_id: uuidv4(),
                            deployment_id: deploymentId,
                            log
                        }],
                        format: 'JSONEachRow'
                    });
                    resolveOffset(message.offset);
                    await commitOffsetsIfNecessary(message.offset);
                    await heartbeat();
                } catch (error) {
                    console.error("Failed to save log", error);
                }
            }
        }
    })
}

module.exports = { initializeKafkaLogConsumer }
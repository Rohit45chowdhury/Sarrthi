require('dotenv').config();
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
    clientId: 'test',
    brokers: [process.env.KAFKA_BROKER],
    connectionTimeout: 10000,
    authenticationTimeout: 10000,
    requestTimeout: 30000,
    retry: { initialRetryTime: 500, retries: 8 },
    ssl: { ca: [process.env.KAFKA_CA.replace(/\\n/g, '\n')] },
    sasl: {
        mechanism: process.env.KAFKA_SASL_MECHANISM,
        username: process.env.KAFKA_USERNAME,
        password: process.env.KAFKA_PASSWORD
    }
});

(async () => {
    const admin = kafka.admin();
    await admin.connect();
    console.log('Topics:', await admin.listTopics());
    await admin.disconnect();
})().catch((e) => console.error('Kafka error:', e.message));
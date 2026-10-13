
const { Kafka, logLevel } = require('kafkajs');
const mongoose = require('mongoose');
const captainModel = require('../models/captain.model');

const TOPIC = process.env.KAFKA_LOCATION_TOPIC || 'captain-service';

const brokers = (
    process.env.KAFKA_BROKER ||
    process.env.KAFKA_BROKERS ||
    'localhost:29092'
)
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);

if (brokers.length === 0) {
    throw new Error('Kafka broker configuration is missing');
}

// Aiven Kafka: TLS + SASL.
// Local Kafka: no TLS/SASL unless configured through environment variables.
const isAiven = brokers.some((broker) =>
    broker.includes('aivencloud.com')
);

let ssl = false;

if (process.env.KAFKA_CA) {
    const ca = process.env.KAFKA_CA.replace(/\\n/g, '\n');

    ssl = {
        rejectUnauthorized: true,
        ca: [ca]
    };
} else if (isAiven) {
    ssl = {
        rejectUnauthorized: true
    };
}

let sasl;

if (process.env.KAFKA_USERNAME) {
    if (!process.env.KAFKA_PASSWORD) {
        throw new Error(
            'KAFKA_PASSWORD is required when KAFKA_USERNAME is configured'
        );
    }

    sasl = {
        mechanism: process.env.KAFKA_SASL_MECHANISM || 'scram-sha-256',
        username: process.env.KAFKA_USERNAME,
        password: process.env.KAFKA_PASSWORD
    };
}

const kafka = new Kafka({
    clientId: 'saarthi-captain-service',
    brokers,
    ssl,
    sasl,
    logLevel: logLevel.WARN,
    connectionTimeout: 10000,
    authenticationTimeout: 10000,
    requestTimeout: 30000,
    retry: {
        initialRetryTime: 500,
        retries: 8
    }
});

const producer = kafka.producer();

const consumer = kafka.consumer({
    groupId: 'captain-location-group',
    minBytes: 1,
    maxWaitTimeInMs: 1000
});

let producerReady = false;
let consumerStarted = false;
let initPromise = null;
let shutdownPromise = null;

// ---------------- PRODUCER ----------------

async function publishLocation({ captainId, ltd, lng }) {
    if (!producerReady) {
        return false;
    }

    if (
        !captainId ||
        !Number.isFinite(Number(ltd)) ||
        !Number.isFinite(Number(lng))
    ) {
        console.warn('Invalid captain location; Kafka publish skipped');
        return false;
    }

    try {
        await producer.send({
            topic: TOPIC,
            acks: -1,
            messages: [
                {
                    key: String(captainId),
                    value: JSON.stringify({
                        captainId: String(captainId),
                        ltd: Number(ltd),
                        lng: Number(lng),
                        ts: Date.now()
                    })
                }
            ]
        });

        return true;
    } catch (error) {
        console.error('Kafka location publish failed:', error.message);
        return false;
    }
}

// ---------------- CONSUMER ----------------

function buildCaptainFilter(captainId) {
    // Convert valid MongoDB ObjectId strings to ObjectIds.
    // Keep other ID formats as strings.
    if (mongoose.Types.ObjectId.isValid(captainId)) {
        const objectId = new mongoose.Types.ObjectId(captainId);

        // Avoid treating arbitrary 12-character strings as ObjectIds.
        if (objectId.toHexString() === String(captainId).toLowerCase()) {
            return objectId;
        }
    }

    return captainId;
}

async function startConsumer() {
    await consumer.connect();

    await consumer.subscribe({
        topic: TOPIC,
        fromBeginning: false
    });

    consumerStarted = true;

    await consumer.run({
        eachBatchAutoResolve: true,

        eachBatch: async ({
            batch,
            heartbeat,
            isRunning,
            isStale
        }) => {
            if (!isRunning() || isStale()) {
                return;
            }

            const latest = new Map();

            for (const message of batch.messages) {
                if (!message.value) {
                    continue;
                }

                try {
                    const data = JSON.parse(message.value.toString());

                    if (
                        data.captainId &&
                        Number.isFinite(Number(data.ltd)) &&
                        Number.isFinite(Number(data.lng))
                    ) {
                        latest.set(String(data.captainId), {
                            captainId: String(data.captainId),
                            ltd: Number(data.ltd),
                            lng: Number(data.lng)
                        });
                    }
                } catch (error) {
                    console.warn('Skipping malformed Kafka location message');
                }
            }

            if (latest.size === 0) {
                await heartbeat();
                return;
            }

            const operations = [...latest.values()].map((data) => ({
                updateOne: {
                    filter: {
                        _id: buildCaptainFilter(data.captainId)
                    },
                    update: {
                        $set: {
                            'location.ltd': data.ltd,
                            'location.lng': data.lng
                        }
                    }
                }
            }));

            // If MongoDB fails, allow KafkaJS to retry the batch.
            // Do not swallow bulkWrite errors.
            const result = await captainModel.bulkWrite(operations, {
                ordered: false
            });

            console.log(
                `Captain locations processed: ${operations.length}; ` +
                `matched: ${result.matchedCount}; ` +
                `Kafka messages: ${batch.messages.length}`
            );

            await heartbeat();
        }
    });

    console.log(`Kafka consumer started for topic: ${TOPIC}`);
}

// ---------------- INITIALIZATION ----------------

async function initLocationKafka() {
    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        try {
            // The topic already exists in Aiven.
            // Do not create it on every startup.
            await producer.connect();
            producerReady = true;

            console.log(`Kafka producer connected to ${brokers[0]}`);

            await startConsumer();

            console.log(`Kafka location pipeline ready; topic=${TOPIC}`);
            return true;
        } catch (error) {
            producerReady = false;

            console.error(
                'Kafka initialization failed:',
                error.message
            );

            // Keep the HTTP service running.
            // publishLocation() returns false until Kafka is ready.
            return false;
        }
    })();

    return initPromise;
}

// ---------------- SHUTDOWN ----------------

async function shutdownLocationKafka() {
    if (shutdownPromise) {
        return shutdownPromise;
    }

    shutdownPromise = (async () => {
        producerReady = false;

        const tasks = [];

        if (consumerStarted) {
            tasks.push(consumer.disconnect());
            consumerStarted = false;
        }

        tasks.push(producer.disconnect());

        const results = await Promise.allSettled(tasks);

        for (const result of results) {
            if (result.status === 'rejected') {
                console.warn(
                    'Kafka shutdown warning:',
                    result.reason?.message || result.reason
                );
            }
        }

        console.log('Kafka connections closed');
    })();

    return shutdownPromise;
}

module.exports = {
    initLocationKafka,
    shutdownLocationKafka,
    publishLocation
};

const { Kafka, logLevel } = require('kafkajs');
const captainModel = require('../models/captain.model');

const TOPIC = process.env.KAFKA_LOCATION_TOPIC || 'captain-location';

const kafka = new Kafka({
    clientId: 'saarthi-captain-service',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:29092').split(','),
    logLevel: logLevel.WARN,
    retry: { retries: 3 }
});

const producer = kafka.producer();
const consumer = kafka.consumer({
    groupId: 'captain-location-group',
    minBytes: 2048,         // thoda data jama hone do...
    maxWaitTimeInMs: 2000   // ...par 2 sec se zyada wait nahi
});

let producerReady = false;


// ---------------- PRODUCER ----------------
// true  = Kafka mein chala gaya
// false = Kafka ready nahi / fail (controller direct DB write karega)
async function publishLocation({ captainId, ltd, lng }) {
    if (!producerReady) return false;

    try {
        await producer.send({
            topic: TOPIC,
            messages: [{
                key: String(captainId), // same captain -> same partition -> order safe
                value: JSON.stringify({ captainId: String(captainId), ltd, lng, ts: Date.now() })
            }]
        });
        return true;
    } catch (error) {
        console.error('Kafka publish failed:', error.message);
        return false;
    }
}


// ---------------- CONSUMER (BULK WRITE) ----------------
async function startConsumer() {
    await consumer.connect();
    await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

    await consumer.run({
        // eachBatch throw kare to batch dobara process hota hai (data loss nahi)
        eachBatch: async ({ batch, heartbeat }) => {

            // ek batch mein ek captain ke kai updates ho sakte hain -> sirf latest rakho
            const latest = new Map();

            for (const message of batch.messages) {
                try {
                    const d = JSON.parse(message.value.toString());
                    latest.set(d.captainId, d);
                } catch (e) {
                    // kharab message skip
                }
            }

            if (latest.size === 0) return;

            const ops = [...latest.values()].map((d) => ({
                updateOne: {
                    filter: { _id: d.captainId },
                    update: { $set: { 'location.ltd': d.ltd, 'location.lng': d.lng } }
                }
            }));

            await captainModel.bulkWrite(ops, { ordered: false });

            console.log(`Location bulk saved: ${ops.length} captains (${batch.messages.length} messages)`);

            await heartbeat();
        }
    });
}


// ---------------- INIT / SHUTDOWN ----------------
async function initLocationKafka() {
    try {
        // topic na ho to bana do (3 partitions)
        const admin = kafka.admin();
        await admin.connect();
        await admin.createTopics({
            topics: [{ topic: TOPIC, numPartitions: 3 }],
            waitForLeaders: true
        });
        await admin.disconnect();

        await producer.connect();
        producerReady = true;

        await startConsumer();

        console.log('Kafka location pipeline started');
    } catch (error) {
        // Kafka down ho to bhi service chalegi (direct DB write fallback)
        producerReady = false;
        console.error('Kafka init failed, using direct DB write:', error.message);
    }
}

async function shutdownLocationKafka() {
    try {
        producerReady = false;
        await producer.disconnect();
        await consumer.disconnect();
    } catch (e) {
        // ignore
    }
}

module.exports = { initLocationKafka, shutdownLocationKafka, publishLocation };
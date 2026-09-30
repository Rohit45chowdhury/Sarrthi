require('dotenv').config()

const http = require('http')
const app = require('./app')

const {
    initializeSocket
} = require('./socket')

const port = process.env.PORT || 3000

// Create HTTP server
const server = http.createServer(app)

// Initialize Socket.IO
initializeSocket(server)

// Start server
server.listen(port, () => {
    console.log(`Saarthi server is running on port ${port}`)
    console.log(`Socket.IO is running on port ${port}`)
})
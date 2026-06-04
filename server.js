require('dotenv').config()
const express = require('express')
const app = express()
const ejs = require('ejs')
const path = require('path')
const expressLayout = require('express-ejs-layouts')
const PORT = process.env.PORT || 3300
const mongoose = require('mongoose')
const session = require('express-session')
const flash = require('express-flash')
const MongoDbStore = require('connect-mongo')(session)
const passport = require('passport')
const Emitter = require('events')

// Database connection
mongoose.connect(process.env.MONGO_CONNECTION_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})

const connection = mongoose.connection

connection.once('open', () => {
    console.log('Database connected...')
})

connection.on('error', (err) => {
    console.error('MongoDB Error:', err)
})

// Session store
let mongoStore = new MongoDbStore({
    mongooseConnection: connection,
    collection: 'sessions'
})

// Event emitter
const eventEmitter = new Emitter()
app.set('eventEmitter', eventEmitter)

// Session config
app.use(session({
    secret: process.env.COOKIE_SECRET,
    resave: false,
    store: mongoStore,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24
    }
}))

// Passport config
const passportInit = require('./app/config/passport')
passportInit(passport)

app.use(passport.initialize())
app.use(passport.session())

app.use(flash())

// Assets
app.use(express.static('public'))
app.use(express.urlencoded({ extended: false }))
app.use(express.json())

// Global middleware
app.use((req, res, next) => {
    res.locals.session = req.session
    res.locals.user = req.user
    next()
})

// Template engine
app.use(expressLayout)
app.set('views', path.join(__dirname, '/resources/views'))
app.set('view engine', 'ejs')

// Routes
require('./routes/web')(app)

// 404 handler
app.use((req, res) => {
    res.status(404).render('errors/404')
})

// Server with port-retry and clear startup URL
const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3300
const { exec } = require('child_process')

function openInChromeOrDefault(url) {
    if (process.env.NO_BROWSER) return
    if (process.platform === 'win32') {
        // Try to open Chrome, fallback to default browser
        exec(`start "" chrome "${url}"`, (err) => {
            if (err) exec(`start "" "${url}"`)
        })
    } else if (process.platform === 'darwin') {
        exec(`open -a "Google Chrome" "${url}"`, (err) => {
            if (err) exec(`open "${url}"`)
        })
    } else {
        exec(`google-chrome "${url}"`, (err) => {
            if (err) exec(`xdg-open "${url}"`)
        })
    }
}

function startServer(port = DEFAULT_PORT, retries = 10) {
    const server = app.listen(port, () => {
        console.log(`Server running: http://localhost:${port}`)
    })

    server.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE' && retries > 0) {
            console.warn(`Port ${port} in use, trying ${port + 1}...`)
            setTimeout(() => startServer(port + 1, retries - 1), 200)
        } else {
            console.error('Server failed to start:', err)
            process.exit(1)
        }
    })

    server.on('listening', () => {
        // Initialize socket.io after server is bound
        const io = require('socket.io')(server)

        io.on('connection', (socket) => {
            socket.on('join', (orderId) => {
                socket.join(orderId)
            })
        })

        eventEmitter.on('orderUpdated', (data) => {
            io.to(`order_${data.id}`).emit('orderUpdated', data)
        })

        eventEmitter.on('orderPlaced', (data) => {
            io.to('adminRoom').emit('orderPlaced', data)
        })

        // Open the app in Chrome (or fallback) when server starts
        const url = `http://localhost:${port}`
        try {
            openInChromeOrDefault(url)
        } catch (err) {
            console.warn('Unable to open browser automatically:', err.message)
        }
    })

    return server
}

startServer()
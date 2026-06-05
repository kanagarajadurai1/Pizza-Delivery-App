require('dotenv').config()

const express = require('express')
const app = express()
const path = require('path')
const expressLayout = require('express-ejs-layouts')
const mongoose = require('mongoose')
const session = require('express-session')
const flash = require('express-flash')
const MongoDbStore = require('connect-mongo')(session)
const passport = require('passport')
const Emitter = require('events')
const socketio = require('socket.io')

const PORT = process.env.PORT || 3300

// Database Connection
mongoose.connect(process.env.MONGO_CONNECTION_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})

const connection = mongoose.connection

connection.once('open', () => {
    console.log('✅ MongoDB Connected Successfully')
})

connection.on('error', (err) => {
    console.error('❌ MongoDB Connection Failed')
    console.error(err)
})

// Session Store
let mongoStore = new MongoDbStore({
    mongooseConnection: connection,
    collection: 'sessions'
})

// Event Emitter
const eventEmitter = new Emitter()
app.set('eventEmitter', eventEmitter)

// Session Config
app.use(session({
    secret: process.env.COOKIE_SECRET,
    resave: false,
    saveUninitialized: false,
    store: mongoStore,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24
    }
}))

// Passport Config
const passportInit = require('./app/config/passport')
passportInit(passport)

app.use(passport.initialize())
app.use(passport.session())
app.use(flash())

// Middleware
app.use(express.urlencoded({ extended: false }))
app.use(express.json())
app.use(express.static('public'))

app.use((req, res, next) => {
    res.locals.session = req.session
    res.locals.user = req.user
    next()
})

// View Engine
app.use(expressLayout)
app.set('views', path.join(__dirname, '/resources/views'))
app.set('view engine', 'ejs')

// Routes
require('./routes/web')(app)

// 404 Page
app.use((req, res) => {
    res.status(404).render('errors/404')
})

// Start Server
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`)
})

// Socket.io
const io = socketio(server)

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
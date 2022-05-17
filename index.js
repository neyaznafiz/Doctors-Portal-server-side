const express = require('express')
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb')

const app = express()
const port = process.env.PORT || 5000

// middlewear
app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.shbsf.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


// jwt verify function
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorizd Access' })
    }
    const token = authHeader.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded
        next()
    });
}
// next()



async function run() {
    try {
        await client.connect()
        const serviceCollection = client.db('doctorst_portal').collection('services')
        const bookingCollection = client.db('doctorst_portal').collection('bookings')
        const usersCollection = client.db('doctorst_portal').collection('users')
        const doctorsCollection = client.db('doctorst_portal').collection('doctors')

        // verify admin function
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email
            const requesterAccount = await usersCollection.findOne({ email: requester })

            if (requesterAccount.role === 'admin') {
                next()
            }
            else {
                res.status(403).send({ message: 'Forbidden Access' })
            }
        }


        // app.get('/service', async (req, res) => {
        //     const query = {}
        //     const services = await serviceCollection.find(query).toArray()
        //     res.send(services)
        // })
        app.get('/service', async (req, res) => {
            const query = {}
            const services = await serviceCollection.find(query).project({ name: 1 }).toArray()
            res.send(services)
        })

        app.get('/allusers', verifyJWT, async (req, res) => {
            const users = await usersCollection.find().toArray()
            res.send(users)
        })

        // find admin by email api
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email
            const user = await usersCollection.findOne({ email: email })
            const isAdmin = user.role === 'admin'
            res.send({ admin: isAdmin })
        })

        // make admin api
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email
            // const requester = req.decoded.email
            // const requesterAccount = await usersCollection.findOne({ email: requester })

            // if (requesterAccount.role === 'admin') {
            const filter = { email: email }
            const updatedDoc = {
                $set: { role: 'admin' },
            }
            const result = await usersCollection.updateOne(filter, updatedDoc)
            res.send(result)
            // }
            // else {
            //     res.status(403).send({ message: 'Forbidden Access' })
            // }
        })


        // user put api 
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const filter = { email: email }
            const options = { upsert: true }
            const updatedDoc = {
                $set: user,
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options)
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET)
            res.send({ result, token })
        })

        // warning !!
        //  This is not the proper way to query.
        // After learning more about mongodb, use aggregate lookup, pipeline, match, group 
        app.get('/available', async (req, res) => {
            const date = req.query.date

            // step 1: get all services
            const services = await serviceCollection.find().toArray()

            // step 2: get the booking of that day. output: [{} {} {} {} ....]
            const query = { date: date }
            const bookings = await bookingCollection.find(query).toArray()

            // step 3: for each service, 
            services.forEach(service => {
                // step 4: find bookings for that service. output: [{} {} {} {}.....]
                const serviceBookings = bookings.filter(booking => booking.treatment === service.name)
                // step 5: select slots for the service bookings: ['', '', '', '', ]
                const bookedSlots = serviceBookings.map(book => book.slot)
                // step 6: select those slots that are not in boojedSlots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot))
                // step 7: set available to slots to make it eisier 
                service.slots = available
                // service.booked = booked
                // service.booked = serviceBookings.map(service => service.slot)

                // 
            })

            res.send(services)
        })

        /**
         * API Naving Convention
         * app.get('/booking') // get all bokking in this collection. or get more than one, or by filter
         * app.get('/booking/:id') // get a specific booking
         * app.post('/booking') // add a new booking
         * app.patch('/booking/:id') // update a specific booking
         * app.put('/booking/:id') upsert ==> update (if exist) or insert (if doesn't exist)
         * app.delete('/booking/:id') // 
        */

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient
            const decodedEmail = req.decoded.email
            if (patient === decodedEmail) {
                const query = { patient: patient }
                const bookings = await bookingCollection.find(query).toArray()
                return res.send(bookings)
            }
            else {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exist = await bookingCollection.findOne(query)
            if (exist) {
                return res.send({ success: false, booking: exist })
            }
            const result = await bookingCollection.insertOne(booking)
            return res.send({ success: true, result })
        })

        // get doctors api
        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorsCollection.find().toArray()
            res.send(doctors)
        })

        // add doctor api
        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body
            const result = await doctorsCollection.insertOne(doctor)
            res.send(result)
        })

        // delete doctor api
        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email
            const filter = {email: email}
            const result = await doctorsCollection.deleteOne(filter)
            res.send(result)
        })


    }
    finally { }
}
run().catch(console.dir)


app.get('/', (req, res) => {
    res.send('Hello From Doctors Portal!')
})

app.listen(port, () => {
    console.log(`Doctors Portal listening on port ${port}`)
})